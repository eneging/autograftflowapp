import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { leerRangoPaginas, textoRango } from "../../../../shared/rangoPaginas";
import { crearZip, gruposCada, leerGrupos, nombreSalida } from "../../../../shared/pdfHerramientas";
import { CargaLogoPantalla } from "../../componentes/CargaLogo";
import { BotonFavorito } from "../../componentes/favoritos";
import { plataforma } from "../api";
import { EtiquetaNueva, HERRAMIENTAS, IconoHerramienta, type IdHerramienta } from "./herramientas";
import {
  abrirPdf, armarPdf, descargar, fotosAPdf, hojasDe, nuevoId, MAX_BYTES,
  type ArchivoPdf, type Foto, type Hoja, type TamanoHoja, type VistaPdf,
} from "./operaciones";
import { aBlobUrl, cargarImagen, detectarBordes, distancia, enderezar, esToda, vistaPrevia, FILTROS, TODA, type Esquinas, type Filtro } from "./escaner";
import { CamaraEscaner, EditorPagina, type Captura } from "./EscanerCamara";
import "./herramientas-pdf.css";

/**
 * «Organizar PDF»: unir, dividir, quitar y extraer páginas, ordenar y girar, y escanear fotos a PDF. Todo se hace en el
 * navegador (no se sube nada) salvo «Preparar para firmar», que lleva el resultado al editor como cualquier PDF subido.
 */
export function HerramientasPdf() {
  const { herramienta } = useParams();
  const actual = HERRAMIENTAS.find((h) => h.id === herramienta) ?? HERRAMIENTAS[0];
  return (
    <div className="hpPagina">
      <header className="card hpCabecera">
        <div className="hpTitulo">
          <h1>Organizar PDF</h1>
          <p>Une, separa, ordena y limpia tus PDF antes de enviarlos a firmar.</p>
        </div>
        <nav className="hpCinta" aria-label="Herramientas de PDF">
          {HERRAMIENTAS.map((h) => (
            <div key={h.id} className="hpCintaCelda">
              <Link to={`/app/pdf/${h.id}`} className={`hpCintaBoton ${h.id === actual.id ? "activa" : ""} ${h.especial ? "especial" : ""}`} aria-current={h.id === actual.id ? "page" : undefined}>
                {h.especial && <span className="hpCintaNuevo"><EtiquetaNueva /></span>}
                <span className="hpIcono"><IconoHerramienta id={h.id} /></span><span className={h.especial ? "hrNombreEspecial" : undefined}>{h.nombre}</span>
              </Link>
              <BotonFavorito acceso={`pdf:${h.id}`} className="hpCintaFavorito" />
            </div>
          ))}
        </nav>
        <p className="hpPrivado">🔒 Tus archivos se procesan en este dispositivo: no se suben a ningún servidor. Solo si eliges «Preparar para firmar» el resultado se guarda en tus documentos.</p>
      </header>
      <section className="hpIntro">
        <h2 className={actual.especial ? "especial" : undefined}><span className="hpIcono"><IconoHerramienta id={actual.id} /></span><span className={actual.especial ? "hrNombreEspecial" : undefined}>{actual.nombre}</span>{actual.especial && <EtiquetaNueva />}<BotonFavorito acceso={`pdf:${actual.id}`} conTexto className="hpIntroFavorito" /></h2>
        <p>{actual.resumen}</p>
      </section>
      {/* key: al cambiar de herramienta se empieza de cero. */}
      <Herramienta key={actual.id} id={actual.id} />
    </div>
  );
}

function Herramienta({ id }: { id: IdHerramienta }) {
  switch (id) {
    case "unir": return <Unir />;
    case "dividir": return <Dividir />;
    case "quitar": return <Seleccionar modo="quitar" />;
    case "extraer": return <Seleccionar modo="extraer" />;
    case "ordenar": return <Ordenar />;
    case "escanear": return <Escanear />;
  }
}

// ================================================================ piezas compartidas

/** Archivos PDF abiertos en la herramienta (se liberan al salir). */
function usarArchivos() {
  const [archivos, setArchivos] = useState<ArchivoPdf[]>([]);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState("");
  const vivos = useRef<ArchivoPdf[]>([]);
  vivos.current = archivos;
  useEffect(() => () => vivos.current.forEach((a) => a.vista.destroy()), []);
  async function agregar(lista: File[]) {
    setError("");
    setAbriendo(true);
    const nuevos: ArchivoPdf[] = [], errores: string[] = [];
    for (const f of lista) {
      try { nuevos.push(await abrirPdf(f)); } catch (e) { errores.push((e as Error).message); }
    }
    setArchivos((as) => [...as, ...nuevos]);
    setError(errores.join(" "));
    setAbriendo(false);
    return nuevos;
  }
  function quitar(id: string) {
    vivos.current.find((a) => a.id === id)?.vista.destroy();
    setArchivos((as) => as.filter((a) => a.id !== id));
  }
  function reiniciar() {
    vivos.current.forEach((a) => a.vista.destroy());
    setArchivos([]);
    setError("");
  }
  return { archivos, setArchivos, agregar, quitar, reiniciar, abriendo, error };
}

/** Descargar o «Preparar para firmar», con el logo y su porcentaje mientras tanto. */
function usarEntrega() {
  const navegar = useNavigate();
  const [proceso, setProceso] = useState<{ texto: string; avance: number } | null>(null);
  const [error, setError] = useState("");
  async function hacer<T>(texto: string, tarea: (alAvance: (f: number) => void) => Promise<T>): Promise<T | undefined> {
    setError("");
    setProceso({ texto, avance: 0 });
    try { return await tarea((avance) => setProceso({ texto, avance })); }
    catch (e) { setError(e instanceof Error && e.message ? e.message : "No se pudo completar. Inténtalo de nuevo."); return undefined; }
    finally { setProceso(null); }
  }
  /** Lo lleva al editor como un PDF subido (con las mismas reglas: tamaño, páginas y cupo de tu plan). */
  async function firmar(bytes: Uint8Array, nombre: string) {
    const r = await hacer("Preparando el documento para firmar…", (av) => plataforma.subir(new File([bytes as BlobPart], nombre, { type: "application/pdf" }), av));
    if (r) navegar(`/app/d/${r.id}`, { state: { detectados: r.camposDetectados, preguntarQuien: true } });
  }
  return { proceso, error, hacer, firmar };
}

const mover = <T,>(lista: T[], desde: number, hasta: number) => {
  const copia = [...lista];
  const [x] = copia.splice(desde, 1);
  copia.splice(hasta, 0, x);
  return copia;
};

/** Arrastrar y soltar para ordenar: devuelve las propiedades de cada elemento y cuál está debajo del que se arrastra. */
function usarArrastre(alMover?: (desde: number, hasta: number) => void) {
  const desde = useRef<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const fin = () => { desde.current = null; setSobre(null); };
  const props = (i: number) => !alMover ? {} : {
    draggable: true,
    onDragStart: (e: DragEvent) => { desde.current = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); },
    onDragOver: (e: DragEvent) => { if (desde.current === null) return; e.preventDefault(); if (sobre !== i) setSobre(i); },
    onDrop: (e: DragEvent) => { if (desde.current === null) return; e.preventDefault(); if (desde.current !== i) alMover(desde.current, i); fin(); },
    onDragEnd: fin,
  };
  return { props, sobre };
}

function ZonaCarga({ texto, ayuda, multiple = false, abriendo, alElegir, aceptar = "application/pdf,.pdf" }: {
  texto: string; ayuda: string; multiple?: boolean; abriendo: boolean; alElegir: (f: File[]) => void; aceptar?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  return (
    <div role="button" tabIndex={0} className={`card hpZona ${encima ? "encima" : ""}`}
      onClick={() => !abriendo && entrada.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), entrada.current?.click())}
      onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)}
      onDrop={(e) => { e.preventDefault(); setEncima(false); alElegir([...e.dataTransfer.files]); }}>
      <span className="hpZonaIcono" aria-hidden>📄</span>
      <strong>{abriendo ? "Abriendo…" : texto}</strong>
      <span className="small">{ayuda}</span>
      <span className="boton primary">{multiple ? "Seleccionar PDF" : "Seleccionar PDF"}</span>
      <input ref={entrada} type="file" accept={aceptar} multiple={multiple} hidden onChange={(e) => { alElegir([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </div>
  );
}

function BotonAgregar({ texto, alElegir }: { texto: string; alElegir: (f: File[]) => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  return <>
    <button type="button" onClick={() => entrada.current?.click()}>➕ {texto}</button>
    <input ref={entrada} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { alElegir([...(e.target.files ?? [])]); e.target.value = ""; }} />
  </>;
}

/** Miniatura de una página: se dibuja cuando aparece en pantalla (un PDF de 200 páginas no se dibuja entero). */
function Miniatura({ vista, pagina, giro = 0 }: { vista: VistaPdf; pagina: number; giro?: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [lista, setLista] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { rootMargin: "400px" });
    obs.observe(caja.current!);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelado = false;
    let tarea: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      try {
        const p = await vista.getPage(pagina + 1);
        if (cancelado) return;
        const base = p.getViewport({ scale: 1 });
        const vp = p.getViewport({ scale: (150 / Math.max(base.width, base.height)) * Math.min(window.devicePixelRatio || 1, 2) });
        const c = lienzo.current!;
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        tarea = p.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp });
        await tarea.promise;
        if (!cancelado) setLista(true);
      } catch { /* cancelado o documento cerrado */ }
    })();
    return () => { cancelado = true; tarea?.cancel(); };
  }, [visible, vista, pagina]);
  return (
    <div ref={caja} className="hpMini">
      <canvas ref={lienzo} className={lista ? "lista" : ""} style={{ transform: giro ? `rotate(${giro}deg)` : undefined }} />
      {!lista && <span className="hpMiniCargando" aria-hidden />}
    </div>
  );
}

type Marca = "quitar" | "elegida" | "fuera" | null;

/** Cuadrícula de páginas: tocar (con Mayús para un tramo), arrastrar para ordenar y botones por página. */
function CuadriculaHojas({ hojas, archivos, marca, alTocar, alMover, acciones, etiqueta }: {
  hojas: Hoja[]; archivos: ArchivoPdf[]; marca?: (h: Hoja, i: number) => Marca;
  alTocar?: (i: number, tramo: boolean) => void; alMover?: (desde: number, hasta: number) => void;
  acciones?: (h: Hoja, i: number) => ReactNode; etiqueta?: (h: Hoja, i: number) => ReactNode;
}) {
  const { props, sobre } = usarArrastre(alMover);
  const vistas = useMemo(() => new Map(archivos.map((a) => [a.id, a])), [archivos]);
  return (
    <ol className="hpCuadricula">
      {hojas.map((h, i) => {
        const a = vistas.get(h.archivo);
        if (!a) return null;
        const m = marca?.(h, i) ?? null;
        const contenido = <>
          <Miniatura vista={a.vista} pagina={h.pagina} giro={h.giro} />
          {m === "quitar" && <span className="hpSello quitar" aria-hidden>✕</span>}
          {m === "elegida" && <span className="hpSello elegida" aria-hidden>✓</span>}
        </>;
        const nombre = `Página ${h.pagina + 1}${archivos.length > 1 ? ` de ${a.nombre}` : ""}`;
        return (
          <li key={h.id} className={`hpHoja ${m ? `hp-${m}` : ""} ${sobre === i ? "hpSobre" : ""} ${alMover ? "movible" : ""}`} {...props(i)}>
            {alTocar
              ? <button type="button" className="hpHojaVista" aria-pressed={m === "quitar" || m === "elegida"} aria-label={nombre} onClick={(e) => alTocar(i, e.shiftKey)}>{contenido}</button>
              : <div className="hpHojaVista" aria-label={nombre}>{contenido}</div>}
            <div className="hpHojaPie">
              <span className="hpNumero">{etiqueta ? etiqueta(h, i) : i + 1}</span>
              {acciones?.(h, i)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Acciones({ listo, motivo, textoDescargar, alDescargar, alFirmar, extra }: {
  listo: boolean; motivo?: string; textoDescargar: string; alDescargar: () => void; alFirmar?: () => void; extra?: ReactNode;
}) {
  return (
    <div className="hpAcciones">
      <span className="hpAccionesNota">{motivo}</span>
      {extra}
      {alFirmar && <button type="button" disabled={!listo} onClick={alFirmar} title="Lo abre en el editor para marcar dónde firma cada persona">✍️ Preparar para firmar</button>}
      <button type="button" className="primary" disabled={!listo} onClick={alDescargar}>⬇️ {textoDescargar}</button>
    </div>
  );
}

const Avisos = ({ errores, proceso }: { errores: string[]; proceso: { texto: string; avance: number } | null }) => <>
  {errores.filter(Boolean).map((e) => <div key={e} className="afAlerta" role="alert">{e}</div>)}
  {proceso && <CargaLogoPantalla avance={proceso.avance} texto={proceso.texto} />}
</>;

/** Selección con Mayús: marca o desmarca el tramo desde el último toque hasta este. */
function usarSeleccion() {
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const ultimo = useRef<number | null>(null);
  function tocar(hojas: Hoja[], i: number, tramo: boolean) {
    setElegidas((s) => {
      const n = new Set(s), valor = !s.has(hojas[i].id);
      const [a, b] = tramo && ultimo.current !== null ? [Math.min(ultimo.current, i), Math.max(ultimo.current, i)] : [i, i];
      for (let k = a; k <= b; k++) { if (valor) n.add(hojas[k].id); else n.delete(hojas[k].id); }
      return n;
    });
    ultimo.current = i;
  }
  return { elegidas, setElegidas, tocar };
}

const peso = (bytes: number) => bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// ================================================================ Unir

function Unir() {
  const { archivos, setArchivos, agregar, quitar, reiniciar, abriendo, error } = usarArchivos();
  const e = usarEntrega();
  const { props, sobre } = usarArrastre((d, h) => setArchivos((as) => mover(as, d, h)));
  const paginas = archivos.reduce((s, a) => s + a.paginas, 0);
  const nombre = archivos[0] ? nombreSalida(archivos[0].nombre, "unido") : "unido.pdf";
  const armar = () => e.hacer("Uniendo los PDF…", (av) => armarPdf(archivos.flatMap(hojasDe), archivos, av));
  if (!archivos.length) return <>
    <ZonaCarga multiple texto="Selecciona los PDF que quieres unir" ayuda="Elige varios a la vez o arrástralos aquí. Después podrás ordenarlos." abriendo={abriendo} alElegir={agregar} />
    <Avisos errores={[error]} proceso={null} />
  </>;
  return (
    <section className="card hpTrabajo">
      <div className="hpBarra">
        <strong>{archivos.length} PDF · {paginas} páginas</strong>
        <span className="small">Arrastra las tarjetas o usa ← → para elegir el orden en que se unen.</span>
        <span className="hpBarraBotones"><BotonAgregar texto="Agregar más PDF" alElegir={agregar} /><button type="button" onClick={reiniciar}>Empezar de nuevo</button></span>
      </div>
      <ol className="hpCuadricula hpArchivos">
        {archivos.map((a, i) => (
          <li key={a.id} className={`hpHoja movible ${sobre === i ? "hpSobre" : ""}`} {...props(i)}>
            <div className="hpHojaVista"><Miniatura vista={a.vista} pagina={0} /><span className="hpOrden">{i + 1}</span></div>
            <div className="hpArchivoNombre" title={a.nombre}>{a.nombre}</div>
            <div className="hpHojaPie">
              <span className="small">{a.paginas} pág. · {peso(a.bytes.length)}</span>
              <span className="hpMiniBotones">
                <button type="button" aria-label="Mover antes" disabled={i === 0} onClick={() => setArchivos((as) => mover(as, i, i - 1))}>←</button>
                <button type="button" aria-label="Mover después" disabled={i === archivos.length - 1} onClick={() => setArchivos((as) => mover(as, i, i + 1))}>→</button>
                <button type="button" aria-label={`Quitar ${a.nombre}`} onClick={() => quitar(a.id)}>✕</button>
              </span>
            </div>
          </li>
        ))}
      </ol>
      <Avisos errores={[error, e.error]} proceso={e.proceso} />
      <Acciones listo={archivos.length >= 2} motivo={archivos.length < 2 ? "Agrega al menos otro PDF para unirlos." : `Resultado: un PDF de ${paginas} páginas.`}
        textoDescargar="Unir y descargar" alDescargar={async () => { const b = await armar(); if (b) descargar(b, nombre); }}
        alFirmar={async () => { const b = await armar(); if (b) e.firmar(b, nombre); }} />
    </section>
  );
}

// ================================================================ Dividir

type ModoDividir = "rangos" | "cada" | "una";

function Dividir() {
  const { archivos, agregar, reiniciar, abriendo, error } = usarArchivos();
  const e = usarEntrega();
  const a = archivos[0];
  const total = a?.paginas ?? 0;
  const [modo, setModo] = useState<ModoDividir>("rangos");
  const [texto, setTexto] = useState("");
  const [cada, setCada] = useState(2);
  const hojas = useMemo(() => (a ? hojasDe(a) : []), [a]);
  useEffect(() => { if (total) setTexto(total > 1 ? `1-${Math.ceil(total / 2)}, ${Math.ceil(total / 2) + 1}-${total}` : "1"); }, [total]);
  const r = modo === "rangos" ? leerGrupos(texto, total) : { grupos: modo === "cada" ? gruposCada(Math.max(1, cada), total) : gruposCada(1, total) };
  const grupos = "grupos" in r ? r.grupos : [];
  const grupoDe = useMemo(() => { const m = new Map<number, number>(); grupos.forEach((g, gi) => g.forEach((p) => { if (!m.has(p)) m.set(p, gi); })); return m; }, [grupos]);

  if (!a) return <>
    <ZonaCarga texto="Selecciona el PDF que quieres dividir" ayuda="O arrástralo aquí." abriendo={abriendo} alElegir={(fs) => agregar(fs.slice(0, 1))} />
    <Avisos errores={[error]} proceso={null} />
  </>;
  async function generar(firmar: boolean) {
    if (!grupos.length) return;
    if (grupos.length === 1) {
      const b = await e.hacer("Dividiendo…", (av) => armarPdf(grupos[0].map((p) => hojas[p - 1]), archivos, av));
      if (b) firmar ? e.firmar(b, nombreSalida(a.nombre, `pags-${textoRango(grupos[0])}`)) : descargar(b, nombreSalida(a.nombre, `pags-${textoRango(grupos[0])}`));
      return;
    }
    const zip = await e.hacer(`Creando ${grupos.length} PDF…`, async (av) => {
      const partes = [];
      for (const [gi, g] of grupos.entries()) {
        partes.push({ nombre: nombreSalida(a.nombre, `parte-${gi + 1} (pags ${textoRango(g)})`), datos: await armarPdf(g.map((p) => hojas[p - 1]), archivos) });
        av((gi + 1) / grupos.length);
      }
      return crearZip(partes);
    });
    if (zip) descargar(zip, nombreSalida(a.nombre, "dividido", "zip"));
  }
  return (
    <section className="card hpTrabajo">
      <div className="hpBarra">
        <strong title={a.nombre}>{a.nombre} · {total} páginas</strong>
        <span className="hpBarraBotones"><button type="button" onClick={reiniciar}>Usar otro PDF</button></span>
      </div>
      <div className="hpOpciones" role="radiogroup" aria-label="Cómo dividir">
        <label className={modo === "rangos" ? "elegida" : ""}><input type="radio" checked={modo === "rangos"} onChange={() => setModo("rangos")} /><span><strong>Por rangos</strong><small>Cada rango, separado por coma, es un PDF.</small></span></label>
        <label className={modo === "cada" ? "elegida" : ""}><input type="radio" checked={modo === "cada"} onChange={() => setModo("cada")} /><span><strong>Cada cierto número de páginas</strong><small>Ej.: cada 2 páginas, un PDF.</small></span></label>
        <label className={modo === "una" ? "elegida" : ""}><input type="radio" checked={modo === "una"} onChange={() => setModo("una")} /><span><strong>Página por página</strong><small>Un PDF por cada página.</small></span></label>
      </div>
      {modo === "rangos" && <label className="hpCampo">Rangos<input value={texto} onChange={(ev) => setTexto(ev.target.value)} placeholder="Ej.: 1-3, 4-8, 9" autoComplete="off" />
        <small className={"error" in r ? "hpError" : ""}>{"error" in r ? r.error : "«1-3, 4-8» crea dos PDF: uno con las páginas 1 a 3 y otro con las 4 a 8."}</small></label>}
      {modo === "cada" && <label className="hpCampo">Páginas por PDF<input type="number" min={1} max={total} value={cada} onChange={(ev) => setCada(Math.min(total, Math.max(1, Math.round(Number(ev.target.value)) || 1)))} /></label>}
      {grupos.length > 0 && <ul className="hpGrupos" aria-label="PDF que se crearán">
        {grupos.slice(0, 40).map((g, gi) => <li key={gi} style={{ "--g": (gi * 67) % 360 } as CSSProperties}>PDF {gi + 1}: págs. {textoRango(g)}</li>)}
        {grupos.length > 40 && <li>… y {grupos.length - 40} más</li>}
      </ul>}
      <CuadriculaHojas hojas={hojas} archivos={archivos}
        marca={(h) => (grupoDe.has(h.pagina + 1) ? null : "fuera")}
        etiqueta={(h) => { const g = grupoDe.get(h.pagina + 1); return <>{h.pagina + 1}{g !== undefined && <span className="hpGrupo" style={{ "--g": (g * 67) % 360 } as CSSProperties}>PDF {g + 1}</span>}</>; }} />
      <Avisos errores={[error, e.error]} proceso={e.proceso} />
      <Acciones listo={grupos.length > 0}
        motivo={grupos.length ? `Se crearán ${grupos.length} PDF${grupos.length > 1 ? " (se descargan juntos en un .zip)" : ""}.` : "Revisa los rangos."}
        textoDescargar={grupos.length > 1 ? `Dividir y descargar (.zip)` : "Dividir y descargar"} alDescargar={() => generar(false)}
        alFirmar={grupos.length === 1 ? () => generar(true) : undefined} />
    </section>
  );
}

// ================================================================ Quitar y Extraer páginas

function Seleccionar({ modo }: { modo: "quitar" | "extraer" }) {
  const { archivos, agregar, reiniciar, abriendo, error } = usarArchivos();
  const e = usarEntrega();
  const a = archivos[0];
  const hojas = useMemo(() => (a ? hojasDe(a) : []), [a]);
  const { elegidas, setElegidas, tocar } = usarSeleccion();
  const [rango, setRango] = useState("");
  const [errorRango, setErrorRango] = useState("");
  const [separadas, setSeparadas] = useState(false);
  const quitar = modo === "quitar";
  if (!a) return <>
    <ZonaCarga texto={quitar ? "Selecciona el PDF del que quieres quitar páginas" : "Selecciona el PDF del que quieres sacar páginas"} ayuda="O arrástralo aquí." abriendo={abriendo} alElegir={(fs) => agregar(fs.slice(0, 1))} />
    <Avisos errores={[error]} proceso={null} />
  </>;
  const n = elegidas.size, total = hojas.length;
  const resultado = quitar ? hojas.filter((h) => !elegidas.has(h.id)) : hojas.filter((h) => elegidas.has(h.id));
  function marcarRango() {
    const r = quitar ? leerRangoPaginas(rango, total) : leerGrupos(rango, total);
    if ("error" in r) { setErrorRango(r.error); return; }
    const paginas = "paginas" in r ? r.paginas : r.grupos.flat();
    setElegidas((s) => new Set([...s, ...paginas.map((p) => hojas[p - 1].id)]));
    setRango("");
  }
  async function generar(firmar: boolean) {
    if (!quitar && separadas && resultado.length > 1) {
      const zip = await e.hacer(`Creando ${resultado.length} PDF…`, async (av) => {
        const partes = [];
        for (const [i, h] of resultado.entries()) { partes.push({ nombre: nombreSalida(a.nombre, `pagina-${h.pagina + 1}`), datos: await armarPdf([h], archivos) }); av((i + 1) / resultado.length); }
        return crearZip(partes);
      });
      if (zip) descargar(zip, nombreSalida(a.nombre, "paginas", "zip"));
      return;
    }
    const nombre = nombreSalida(a.nombre, quitar ? "sin-paginas" : `pags-${textoRango(resultado.map((h) => h.pagina + 1))}`);
    const b = await e.hacer(quitar ? "Quitando páginas…" : "Extrayendo páginas…", (av) => armarPdf(resultado, archivos, av));
    if (b) firmar ? e.firmar(b, nombre) : descargar(b, nombre);
  }
  const listo = quitar ? n > 0 && n < total : n > 0;
  return (
    <section className="card hpTrabajo">
      <div className="hpBarra">
        <strong title={a.nombre}>{a.nombre} · {total} páginas</strong>
        <span className="small">{quitar ? "Toca las páginas que sobran (se marcan con ✕)." : "Toca las páginas que quieres sacar (se marcan con ✓)."} Con <kbd>Mayús</kbd> marcas un tramo.</span>
        <span className="hpBarraBotones"><button type="button" onClick={reiniciar}>Usar otro PDF</button></span>
      </div>
      <form className="hpRango" onSubmit={(ev) => { ev.preventDefault(); marcarRango(); }}>
        <label htmlFor="hpRango">{quitar ? "Marcar para quitar" : "Elegir páginas"}</label>
        <input id="hpRango" value={rango} onChange={(ev) => { setRango(ev.target.value); setErrorRango(""); }} placeholder="Ej.: 2-5 o 2,5" autoComplete="off" />
        <button type="submit" disabled={!rango.trim()}>Marcar</button>
        {!quitar && <button type="button" onClick={() => setElegidas(new Set(hojas.map((h) => h.id)))}>Todas</button>}
        <button type="button" disabled={!n} onClick={() => setElegidas(new Set())}>{quitar ? "Desmarcar todas" : "Ninguna"}</button>
        {errorRango && <small className="hpError" role="alert">{errorRango}</small>}
      </form>
      {!quitar && <label className="hpCheck"><input type="checkbox" checked={separadas} onChange={(ev) => setSeparadas(ev.target.checked)} /> Un PDF por cada página (se descargan juntos en un .zip)</label>}
      <CuadriculaHojas hojas={hojas} archivos={archivos} alTocar={(i, tramo) => tocar(hojas, i, tramo)}
        marca={(h) => (elegidas.has(h.id) ? (quitar ? "quitar" : "elegida") : null)} etiqueta={(h) => h.pagina + 1} />
      <Avisos errores={[error, e.error]} proceso={e.proceso} />
      <Acciones listo={listo}
        motivo={quitar
          ? (n === 0 ? "Marca al menos una página." : n >= total ? "No puedes quitar todas las páginas." : `Se quitarán ${n} (${textoRango(hojas.filter((h) => elegidas.has(h.id)).map((h) => h.pagina + 1))}); quedan ${total - n}.`)
          : (n === 0 ? "Elige al menos una página." : `Se sacarán ${n} página${n === 1 ? "" : "s"}${separadas && n > 1 ? `, en ${n} PDF` : " en un PDF"}.`)}
        textoDescargar={!quitar && separadas && n > 1 ? "Extraer y descargar (.zip)" : quitar ? "Quitar y descargar" : "Extraer y descargar"}
        alDescargar={() => generar(false)} alFirmar={!quitar && separadas && n > 1 ? undefined : () => generar(true)} />
    </section>
  );
}

// ================================================================ Ordenar y girar

function Ordenar() {
  const { archivos, agregar, reiniciar, abriendo, error } = usarArchivos();
  const e = usarEntrega();
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const sumar = async (fs: File[]) => { const nuevos = await agregar(fs); setHojas((hs) => [...hs, ...nuevos.flatMap(hojasDe)]); };
  if (!archivos.length) return <>
    <ZonaCarga multiple texto="Selecciona el PDF que quieres ordenar" ayuda="Puedes elegir varios: sus páginas se juntan y las ordenas como quieras." abriendo={abriendo} alElegir={sumar} />
    <Avisos errores={[error]} proceso={null} />
  </>;
  const girar = (i: number, g: number) => setHojas((hs) => hs.map((h, k) => (k === i ? { ...h, giro: (h.giro + g + 360) % 360 } : h)));
  const nombre = nombreSalida(archivos[0].nombre, "ordenado");
  const armar = () => e.hacer("Armando tu PDF…", (av) => armarPdf(hojas, archivos, av));
  const original = archivos.flatMap(hojasDe).map((h) => `${h.archivo}:${h.pagina}`).join();
  const cambiado = hojas.map((h) => `${h.archivo}:${h.pagina}`).join() !== original || hojas.some((h) => h.giro);
  return (
    <section className="card hpTrabajo">
      <div className="hpBarra">
        <strong>{hojas.length} páginas{archivos.length > 1 ? ` de ${archivos.length} PDF` : ""}</strong>
        <span className="small">Arrastra las páginas para ordenarlas. Gíralas con ⟲ ⟳ y quítalas con ✕.</span>
        <span className="hpBarraBotones">
          <button type="button" onClick={() => setHojas((hs) => [...hs].reverse())}>⇅ Invertir orden</button>
          <button type="button" onClick={() => setHojas((hs) => hs.map((h) => ({ ...h, giro: (h.giro + 90) % 360 })))}>⟳ Girar todas</button>
          <button type="button" disabled={!cambiado} onClick={() => setHojas(archivos.flatMap(hojasDe))}>↺ Restablecer</button>
          <BotonAgregar texto="Agregar otro PDF" alElegir={sumar} />
          <button type="button" onClick={() => { reiniciar(); setHojas([]); }}>Empezar de nuevo</button>
        </span>
      </div>
      <CuadriculaHojas hojas={hojas} archivos={archivos} alMover={(d, h) => setHojas((hs) => mover(hs, d, h))}
        etiqueta={(h, i) => <>{i + 1}{(h.pagina !== i || archivos.length > 1) && <small className="hpOrigen" title="Página en el PDF original">({archivos.length > 1 ? `${archivos.findIndex((x) => x.id === h.archivo) + 1}·` : ""}{h.pagina + 1})</small>}</>}
        acciones={(_, i) => (
          <span className="hpMiniBotones">
            <button type="button" aria-label="Mover antes" disabled={i === 0} onClick={() => setHojas((hs) => mover(hs, i, i - 1))}>←</button>
            <button type="button" aria-label="Girar a la izquierda" onClick={() => girar(i, -90)}>⟲</button>
            <button type="button" aria-label="Girar a la derecha" onClick={() => girar(i, 90)}>⟳</button>
            <button type="button" aria-label="Mover después" disabled={i === hojas.length - 1} onClick={() => setHojas((hs) => mover(hs, i, i + 1))}>→</button>
            <button type="button" aria-label="Quitar página" onClick={() => setHojas((hs) => hs.filter((_, k) => k !== i))}>✕</button>
          </span>
        )} />
      <Avisos errores={[error, e.error]} proceso={e.proceso} />
      <Acciones listo={hojas.length > 0} motivo={!hojas.length ? "Quitaste todas las páginas: usa «Restablecer»." : cambiado ? `Resultado: ${hojas.length} páginas con tus cambios.` : "Aún no hiciste cambios."}
        textoDescargar="Descargar PDF" alDescargar={async () => { const b = await armar(); if (b) descargar(b, nombre); }}
        alFirmar={async () => { const b = await armar(); if (b) e.firmar(b, nombre); }} />
    </section>
  );
}

// ================================================================ Escanear a PDF

const liberar = (f: Foto) => { URL.revokeObjectURL(f.url); if (f.original !== f.url) URL.revokeObjectURL(f.original); };

/** Miniatura de una página escaneada con su filtro ya aplicado (es lo que saldrá en el PDF). */
function MiniFoto({ foto, alt }: { foto: Foto; alt: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [lista, setLista] = useState(false);
  useEffect(() => {
    let vivo = true;
    setLista(false);
    vistaPrevia(foto.url, foto.filtro).then((c) => {
      const d = lienzo.current;
      if (!vivo || !d) return;
      d.width = c.width;
      d.height = c.height;
      d.getContext("2d")!.drawImage(c, 0, 0);
      setLista(true);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [foto.url, foto.filtro]);
  return (
    <div className="hpMini">
      <canvas ref={lienzo} role="img" aria-label={alt} className={lista ? "lista" : ""} style={{ transform: foto.giro ? `rotate(${foto.giro}deg)` : undefined }} />
      {!lista && <span className="hpMiniCargando" aria-hidden />}
    </div>
  );
}

function Escanear() {
  const e = usarEntrega();
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("color");
  const [tamano, setTamano] = useState<TamanoHoja>("a4");
  const [margen, setMargen] = useState(true);
  const [error, setError] = useState("");
  const [camara, setCamara] = useState(false);
  const [editando, setEditando] = useState<Foto | null>(null);
  const [procesando, setProcesando] = useState(0);
  const galeria = useRef<HTMLInputElement>(null);
  const vivas = useRef<Foto[]>([]);
  vivas.current = fotos;
  useEffect(() => () => vivas.current.forEach(liberar), []);
  const { props, sobre } = usarArrastre((d, h) => setFotos((fs) => mover(fs, d, h)));

  const agregar = (c: Captura, nombre = `pagina-${vivas.current.length + 1}.jpg`) =>
    setFotos((fs) => [...fs, { id: nuevoId("f"), nombre, giro: 0, filtro, ...c }]);
  /** Imágenes de la galería: también se busca la hoja en cada una y se endereza (se puede corregir después). */
  async function sumar(lista: File[]) {
    const validas = lista.filter((f) => f.type.startsWith("image/") && f.size <= MAX_BYTES);
    setError(validas.length < lista.length ? "Algunos archivos no son imágenes o pesan demasiado y no se agregaron." : "");
    setProcesando((n) => n + validas.length);
    for (const f of validas) {
      const original = URL.createObjectURL(f);
      try {
        const img = await cargarImagen(original);
        const esquinas = detectarBordes(img, img.naturalWidth, img.naturalHeight) ?? TODA;
        agregar({ original, esquinas, url: esToda(esquinas) ? original : await aBlobUrl(enderezar(img, esquinas)) }, f.name);
      } catch {
        URL.revokeObjectURL(original);
        setError(`No se pudo leer «${f.name}».`);
      } finally {
        setProcesando((n) => n - 1);
      }
    }
  }
  async function aplicarEdicion(f: Foto, esquinas: Esquinas, nuevo: Filtro) {
    setEditando(null);
    if (distancia(esquinas, f.esquinas) < 1e-4) { setFotos((fs) => fs.map((x) => (x.id === f.id ? { ...x, filtro: nuevo } : x))); return; }
    setProcesando((n) => n + 1);
    try {
      const url = esToda(esquinas) ? f.original : await aBlobUrl(enderezar(await cargarImagen(f.original), esquinas));
      if (f.url !== f.original) URL.revokeObjectURL(f.url);
      setFotos((fs) => fs.map((x) => (x.id === f.id ? { ...x, esquinas, url, filtro: nuevo } : x)));
    } catch { setError("No se pudo recortar la página."); }
    finally { setProcesando((n) => n - 1); }
  }
  const quitarFoto = (i: number) => { liberar(fotos[i]); setFotos((fs) => fs.filter((_, k) => k !== i)); };
  const filtroTodas = (f: Filtro) => { setFiltro(f); setFotos((fs) => fs.map((x) => ({ ...x, filtro: f }))); };
  const fecha = new Date().toISOString().slice(0, 10);
  const nombre = `escaneo-${fecha}.pdf`;
  const armar = () => e.hacer("Creando el PDF…", (av) => fotosAPdf(fotos, { tamano, margen }, av));

  const capas = <>
    <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={(ev) => { sumar([...(ev.target.files ?? [])]); ev.target.value = ""; }} />
    {camara && <CamaraEscaner paginas={fotos.length} ultima={fotos.at(-1)?.url} alCapturar={(c) => agregar(c)} alGaleria={sumar} alTerminar={() => setCamara(false)} />}
    {editando && <EditorPagina original={editando.original} esquinas={editando.esquinas} filtro={editando.filtro} carnet={editando.carnet}
      alAplicar={(esq, f) => aplicarEdicion(editando, esq, f)} alCancelar={() => setEditando(null)} />}
  </>;
  if (!fotos.length) return <>
    <div className="card hpZona hpZonaEscaner" onDragOver={(ev) => ev.preventDefault()} onDrop={(ev) => { ev.preventDefault(); sumar([...ev.dataTransfer.files]); }}>
      <span className="hpZonaIcono" aria-hidden>📷</span>
      <strong>{procesando ? "Procesando imágenes…" : "Escanea tus documentos con la cámara o elige imágenes"}</strong>
      <span className="small">La hoja se detecta y se endereza sola. Para mejores resultados apóyala sobre una superficie oscura y con buena luz. Cada foto será una página.</span>
      <span className="hpBarraBotones">
        <button type="button" className="primary" onClick={() => setCamara(true)}>📷 Escanear con la cámara</button>
        <button type="button" onClick={() => galeria.current?.click()}>🖼️ Elegir imágenes</button>
      </span>
    </div>
    <Avisos errores={[error]} proceso={null} />
    {capas}
  </>;
  const todasIguales = fotos.every((f) => f.filtro === fotos[0].filtro) ? fotos[0].filtro : null;
  return (
    <section className="card hpTrabajo">
      <div className="hpBarra">
        <strong>{fotos.length} página{fotos.length === 1 ? "" : "s"}{procesando ? " · procesando…" : ""}</strong>
        <span className="small">Toca una página para recortarla o cambiar su filtro. Arrastra para ordenar.</span>
        <span className="hpBarraBotones">
          <button type="button" className="primary" onClick={() => setCamara(true)}>📷 Escanear más</button>
          <button type="button" onClick={() => galeria.current?.click()}>🖼️ Agregar imágenes</button>
          <button type="button" onClick={() => { fotos.forEach(liberar); setFotos([]); }}>Empezar de nuevo</button>
        </span>
      </div>
      <div className="hpOpcionesFila">
        <span className="hpFiltros" role="radiogroup" aria-label="Filtro para todas las páginas">
          <span className="small">Filtro:</span>
          {FILTROS.map((f) => <button key={f.id} type="button" role="radio" aria-checked={todasIguales === f.id} className={todasIguales === f.id ? "activo" : ""} onClick={() => filtroTodas(f.id)}>{f.nombre}</button>)}
        </span>
        <label className="hpCampoCorto">Tamaño de hoja
          <select value={tamano} onChange={(ev) => setTamano(ev.target.value as TamanoHoja)}><option value="a4">A4</option><option value="carta">Carta</option><option value="imagen">Igual a la foto</option></select>
        </label>
        {tamano !== "imagen" && <label className="hpCheck"><input type="checkbox" checked={margen} onChange={(ev) => setMargen(ev.target.checked)} /> Margen</label>}
      </div>
      <ol className="hpCuadricula">
        {fotos.map((f, i) => (
          <li key={f.id} className={`hpHoja movible ${sobre === i ? "hpSobre" : ""}`} {...props(i)}>
            <button type="button" className="hpHojaVista" onClick={() => setEditando(f)} aria-label={`Editar página ${i + 1}`}>
              <MiniFoto foto={f} alt={`Página ${i + 1}`} />
              {f.carnet && <span className="hpEtiqueta">Carnet</span>}
            </button>
            <div className="hpHojaPie">
              <span className="hpNumero">{i + 1}</span>
              <span className="hpMiniBotones">
                <button type="button" aria-label="Mover antes" disabled={i === 0} onClick={() => setFotos((fs) => mover(fs, i, i - 1))}>←</button>
                <button type="button" aria-label="Girar a la izquierda" onClick={() => setFotos((fs) => fs.map((x, k) => (k === i ? { ...x, giro: (x.giro + 270) % 360 } : x)))}>⟲</button>
                <button type="button" aria-label="Girar a la derecha" onClick={() => setFotos((fs) => fs.map((x, k) => (k === i ? { ...x, giro: (x.giro + 90) % 360 } : x)))}>⟳</button>
                <button type="button" aria-label="Mover después" disabled={i === fotos.length - 1} onClick={() => setFotos((fs) => mover(fs, i, i + 1))}>→</button>
                <button type="button" aria-label="Quitar" onClick={() => quitarFoto(i)}>✕</button>
              </span>
            </div>
          </li>
        ))}
      </ol>
      <Avisos errores={[error, e.error]} proceso={e.proceso} />
      <Acciones listo={fotos.length > 0 && !procesando} motivo={procesando ? "Procesando páginas…" : `Resultado: un PDF de ${fotos.length} página${fotos.length === 1 ? "" : "s"}.`}
        textoDescargar="Crear PDF y descargar" alDescargar={async () => { const b = await armar(); if (b) descargar(b, nombre); }}
        alFirmar={async () => { const b = await armar(); if (b) e.firmar(b, nombre); }} />
      {capas}
    </section>
  );
}
