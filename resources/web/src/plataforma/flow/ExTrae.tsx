import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  esComprobante, faltantes, leerComprobante, limpiarLineas, lineasDeTexto, ordenarLineas, type DatosComprobante, type LineaOcr,
} from "../../../../shared/exTrae";
import { CargaLogo } from "../../componentes/CargaLogo";
import { plataforma, type TextoExTrae } from "../api";
import { usarSesion } from "../sesion";
import { leerImagen } from "./ocr";
import { CamaraEscaner, type Captura } from "../pdf/EscanerCamara";
import "./ex-trae.css";

/*
 * EX-Trae (FlowApp): de una foto al texto. Lee cualquier imagen; si es una boleta o factura, además llena sus datos.
 * «Enviar texto al ordenador»: el texto llega a los demás dispositivos con la misma cuenta (la bandeja consulta cada
 * pocos segundos mientras la página está a la vista).
 */
const CADA_MS = 2500;
const esCelular = () => matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820;
/** Identifica este dispositivo (para no mostrarle sus propios envíos en «Recibidos»). */
const miDispositivo = (() => {
  try {
    let id = localStorage.getItem("autograflow_dispositivo");
    if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem("autograflow_dispositivo", id); }
    return id;
  } catch { return Math.random().toString(36).slice(2, 10); }
})();

const CAMPOS: { k: keyof DatosComprobante; etiqueta: string; ancho?: boolean; ayuda?: string }[] = [
  { k: "razonSocial", etiqueta: "Razón social / nombre del emisor", ancho: true },
  { k: "ruc", etiqueta: "RUC del emisor" }, { k: "fecha", etiqueta: "Fecha de emisión", ayuda: "DD/MM/AAAA" },
  { k: "serie", etiqueta: "Serie" }, { k: "numero", etiqueta: "Número" },
  { k: "total", etiqueta: "Importe total" }, { k: "igv", etiqueta: "IGV (si figura)" },
  { k: "documento", etiqueta: "DNI / RUC del cliente (si figura)" }, { k: "tipo", etiqueta: "Tipo de comprobante" },
];

async function copiar(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(texto); return true; }
    const ta = Object.assign(document.createElement("textarea"), { value: texto });
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

const datosComoTexto = (d: Record<string, string>) =>
  CAMPOS.filter((c) => d[c.k]).map((c) => `${c.etiqueta}: ${c.k === "total" || c.k === "igv" ? `${d.moneda === "USD" ? "US$" : "S/"} ` : ""}${d[c.k]}`).join("\n");

export default function ExTrae() {
  const { usuario } = usarSesion();
  const celular = useRef(esCelular()).current;
  const [imagen, setImagen] = useState<{ archivo: File; url: string } | null>(null);
  const [leyendo, setLeyendo] = useState<{ avance: number; etapa: string } | null>(null);
  const [texto, setTexto] = useState("");
  // Números que el lector no vio con seguridad: un número mal leído no se nota al leerlo, así que se avisa.
  const [dudas, setDudas] = useState<string[]>([]);
  const [datos, setDatos] = useState<DatosComprobante | null>(null);
  const [modo, setModo] = useState<"texto" | "comprobante">("texto");
  const [envio, setEnvio] = useState<"no" | "enviando" | "enviado">("no");
  const [aviso, setAviso] = useState<{ texto: string; tipo: "ok" | "error" } | null>(null);
  const [camara, setCamara] = useState(false);
  const galeria = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (imagen) URL.revokeObjectURL(imagen.url); }, [imagen]);
  const avisar = (t: string, tipo: "ok" | "error" = "ok") => { setAviso({ texto: t, tipo }); setTimeout(() => setAviso((a) => (a?.texto === t ? null : a)), 3500); };

  /** Interpreta las líneas: texto ordenado y, si parece comprobante, sus datos. */
  function interpretar(lineas: LineaOcr[]) {
    const limpias = limpiarLineas(lineas);
    const ordenado = ordenarLineas(limpias).join("\n");
    setTexto(ordenado);
    setDudas([...new Set(limpias.flatMap((l) => l.dudas ?? []))]);
    const comprobante = esComprobante(ordenado);
    setDatos(comprobante ? leerComprobante(limpias) : null);
    setModo(comprobante ? "comprobante" : "texto");
    return ordenado;
  }

  async function elegir(archivo?: File) {
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) return avisar("Elige una imagen (JPG, PNG, WEBP…).", "error");
    if (archivo.size > 15 * 1024 * 1024) return avisar("La imagen pesa más de 15 MB. Prueba con una más liviana.", "error");
    setImagen({ archivo, url: URL.createObjectURL(archivo) });
    setTexto(""); setDudas([]); setDatos(null); setEnvio("no");
    setLeyendo({ avance: 0, etapa: "Preparando…" });
    try {
      const ordenado = interpretar(await leerImagen(archivo, (avance, etapa) => setLeyendo({ avance, etapa })));
      if (!ordenado.trim()) avisar("No se encontró texto legible. Prueba con más luz, más cerca y sin que se mueva.", "error");
    } catch (e) {
      avisar((e as Error).message || "No se pudo leer la imagen.", "error");
    } finally {
      setLeyendo(null);
    }
  }

  function limpiar(abrirCamara = false) {
    setImagen(null); setTexto(""); setDudas([]); setDatos(null); setEnvio("no");
    if (abrirCamara) setCamara(true);
  }

  /** La foto de la cámara, recortada a lo que se veía en pantalla. */
  async function alCapturar(c: Captura) {
    setCamara(false);
    try {
      const blob = await (await fetch(c.url)).blob();
      elegir(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
    } catch { avisar("No se pudo usar la foto. Inténtalo de nuevo.", "error"); }
    finally {
      URL.revokeObjectURL(c.url);
      if (c.original !== c.url) URL.revokeObjectURL(c.original);
    }
  }

  async function enviar() {
    if (!texto.trim()) return;
    setEnvio("enviando");
    try {
      const d = modo === "comprobante" && datos ? Object.fromEntries(Object.entries(datos).filter(([, v]) => v)) : null;
      await plataforma.enviarTexto(texto, d, `${celular ? "Celular" : "Computadora"}|${miDispositivo}`);
      setEnvio("enviado");
    } catch (e) {
      setEnvio("no");
      avisar((e as Error).message || "No se pudo enviar.", "error");
    }
  }

  const hayResultado = !!texto.trim();
  const falta = datos ? faltantes(datos) : [];
  const entradas = <>
    <input ref={galeria} type="file" accept="image/*" hidden onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ""; }} />
    {camara && <CamaraEscaner unaFoto alCapturar={alCapturar} alGaleria={(fs) => { setCamara(false); elegir(fs[0]); }} alTerminar={() => setCamara(false)} />}
  </>;

  return (
    <div className={`etPagina ${celular ? "etCelular" : ""}`}>
      {usuario?.invitado && <p className="etNota">Estás sin cuenta: cada dispositivo es una sesión distinta, así que los textos no pasan de uno a otro. <Link to="/registro">Crea tu cuenta gratis</Link> y entra con ella en el celular y en el ordenador.</p>}
      {!celular && <Bandeja />}

      <div className="etTrabajo">
        <section className="etTarjeta etImagen" aria-labelledby="etImagenTitulo">
          <div className="etPaso"><span>1</span><h2 id="etImagenTitulo">Tu imagen</h2></div>
          {entradas}
          {!imagen ? (
            <div className="etZona" role="button" tabIndex={0} onClick={() => (celular ? setCamara(true) : galeria.current?.click())}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), galeria.current?.click())}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); elegir(e.dataTransfer.files[0]); }}>
              <span className="etZonaIcono" aria-hidden>📷</span>
              <strong>{celular ? "Toma una foto del texto" : "Arrastra una imagen o elígela"}</strong>
              <span>Boletas, facturas, documentos, carteles, notas… cualquier texto.</span>
            </div>
          ) : (
            <div className="etVista">
              <img src={imagen.url} alt="Imagen elegida" />
              {leyendo && <div className="etLeyendo"><CargaLogo tam={44} avance={leyendo.avance} texto={leyendo.etapa} /></div>}
            </div>
          )}
          <div className="etBotones">
            <button type="button" className={!imagen ? "primary" : ""} onClick={() => setCamara(true)} disabled={!!leyendo}>📷 Tomar foto</button>
            <button type="button" onClick={() => galeria.current?.click()} disabled={!!leyendo}>🖼️ Elegir imagen</button>
            {imagen && <button type="button" onClick={() => limpiar()} disabled={!!leyendo}>🧹 Limpiar</button>}
          </div>
          <p className="etPrivado">🔒 La foto se lee en tu dispositivo: no se sube. Solo viaja el texto cuando pulsas «Enviar».</p>
        </section>

        <section className="etTarjeta etResultado" aria-labelledby="etResultadoTitulo">
          <div className="etPaso"><span>2</span><h2 id="etResultadoTitulo">Texto detectado</h2>
            {hayResultado && <div className="etModo" role="tablist" aria-label="Cómo ver el resultado">
              <button type="button" role="tab" aria-selected={modo === "texto"} className={modo === "texto" ? "activa" : ""} onClick={() => setModo("texto")}>Texto</button>
              <button type="button" role="tab" aria-selected={modo === "comprobante"} className={modo === "comprobante" ? "activa" : ""}
                onClick={() => { setModo("comprobante"); setDatos((d) => d ?? leerComprobante(lineasDeTexto(texto))); }}>Datos de boleta / factura</button>
            </div>}
          </div>

          {/* Celular: apenas termina la lectura se pregunta si se envía al ordenador. */}
          {hayResultado && !leyendo && dudas.some((d) => texto.includes(d)) && (
            <p className="etRevisar" role="status">🔎 Revisa estos números con la imagen, no se leyeron con total seguridad: <strong>{dudas.filter((d) => texto.includes(d)).join(" · ")}</strong></p>
          )}
          {hayResultado && !leyendo && (
            <div className={`etEnviar ${envio === "enviado" ? "enviado" : ""}`}>
              {envio === "enviado" ? <>
                <strong>✓ Enviado. Ya aparece en tu {celular ? "ordenador" : "otro dispositivo"}.</strong>
                <button type="button" className="primary" onClick={() => limpiar(celular)}>🧹 Limpiar{celular ? " y tomar otra foto" : ""}</button>
              </> : <>
                <span>{celular ? "¿Enviar este texto a tu ordenador?" : "¿Lo necesitas en otro dispositivo?"}</span>
                <button type="button" className="primary etBotonEnviar" disabled={envio === "enviando"} onClick={enviar}>
                  {envio === "enviando" ? "Enviando…" : celular ? "📤 Enviar texto al ordenador" : "📤 Enviar a mis otros dispositivos"}
                </button>
              </>}
            </div>
          )}

          {modo === "comprobante" && datos ? (
            <>
              {falta.length > 0 && <p className="etRevisar">Revisa: {falta.join(", ")}. No se identificaron con seguridad.</p>}
              <div className="etCampos">
                {CAMPOS.map((c) => (
                  <label key={c.k} className={c.ancho ? "ancho" : ""}>{c.etiqueta}
                    <span className="etCampo">
                      <input value={datos[c.k]} placeholder={c.ayuda} onChange={(e) => { setDatos({ ...datos, [c.k]: e.target.value }); setEnvio("no"); }} />
                      <button type="button" aria-label={`Copiar ${c.etiqueta}`} disabled={!datos[c.k]} onClick={async () => avisar(await copiar(datos[c.k]) ? "Copiado." : "No se pudo copiar.", "ok")}>⧉</button>
                    </span>
                  </label>
                ))}
                <label>Moneda
                  <select value={datos.moneda} onChange={(e) => setDatos({ ...datos, moneda: e.target.value as "PEN" | "USD" })}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select>
                </label>
              </div>
              <div className="etBotones">
                <button type="button" onClick={async () => avisar(await copiar(datosComoTexto(datos as unknown as Record<string, string>)) ? "Datos copiados." : "No se pudo copiar.")}>⧉ Copiar datos</button>
              </div>
              <details className="etTodo"><summary>Ver el texto completo</summary><pre>{texto}</pre></details>
            </>
          ) : (
            <>
              <textarea className="etTexto" value={texto} spellCheck={false} placeholder={leyendo ? "Leyendo…" : "Aquí aparecerá el texto de tu imagen, línea por línea. También puedes pegar o escribir texto."}
                onChange={(e) => { setTexto(e.target.value); setEnvio("no"); }} aria-label="Texto detectado" />
              <div className="etBotones">
                <button type="button" disabled={!hayResultado} onClick={async () => avisar(await copiar(texto) ? "Texto copiado." : "No se pudo copiar.")}>⧉ Copiar texto</button>
                <span className="etContador">{hayResultado ? `${texto.split("\n").filter((l) => l.trim()).length} líneas` : ""}</span>
              </div>
            </>
          )}
        </section>
      </div>

      {celular && <Bandeja celular />}
      {aviso && <div className={`etAviso ${aviso.tipo}`} role="status">{aviso.texto}</div>}
    </div>
  );
}

/** «Recibidos»: los textos enviados desde los otros dispositivos de la cuenta, al instante (consulta cada 2,5 s). */
function Bandeja({ celular = false }: { celular?: boolean }) {
  const [textos, setTextos] = useState<TextoExTrae[]>([]);
  const [nuevo, setNuevo] = useState<number | null>(null);
  const [cargado, setCargado] = useState(false);
  const [abierta, setAbierta] = useState(!celular);
  const [copiado, setCopiado] = useState<number | null>(null);
  const ultimo = useRef(0);

  useEffect(() => {
    let vivo = true, t: ReturnType<typeof setTimeout>;
    const titulo = document.title;
    async function consultar() {
      if (document.visibilityState === "visible") {
        try {
          const llegados = (await plataforma.textosRecibidos(ultimo.current)).filter((x) => !x.origen.endsWith(`|${miDispositivo}`));
          if (!vivo) return;
          if (llegados.length) {
            if (ultimo.current) { setNuevo(llegados[0].id); document.title = `📥 Texto nuevo · ${titulo}`; }
            setTextos((ts) => [...llegados, ...ts].slice(0, 50));
          }
          // El último id visto, aunque sea propio: así no se vuelve a pedir.
          ultimo.current = Math.max(ultimo.current, ...llegados.map((x) => x.id), 0);
          setCargado(true);
        } catch { /* sin conexión: se reintenta */ }
      }
      if (vivo) t = setTimeout(consultar, CADA_MS);
    }
    // Primero los últimos (sin «nuevo»), después solo los que lleguen.
    plataforma.textosRecibidos(0).then((ts) => {
      if (!vivo) return;
      ultimo.current = Math.max(0, ...ts.map((x) => x.id));
      setTextos(ts.filter((x) => !x.origen.endsWith(`|${miDispositivo}`)));
      setCargado(true);
    }).catch(() => setCargado(true)).finally(() => { if (vivo) t = setTimeout(consultar, CADA_MS); });
    const volver = () => { if (document.visibilityState === "visible") document.title = titulo; };
    document.addEventListener("visibilitychange", volver);
    return () => { vivo = false; clearTimeout(t); document.title = titulo; document.removeEventListener("visibilitychange", volver); };
  }, []);

  async function copiarTexto(x: TextoExTrae) {
    if (await copiar(x.texto)) { setCopiado(x.id); setTimeout(() => setCopiado((c) => (c === x.id ? null : c)), 2000); }
  }
  async function borrar(id: number) {
    setTextos((ts) => ts.filter((x) => x.id !== id));
    plataforma.borrarTexto(id).catch(() => {});
  }
  async function vaciar() {
    if (!confirm("¿Borrar todos los textos recibidos?")) return;
    setTextos([]);
    plataforma.limpiarTextos().catch(() => {});
  }
  const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : "");

  return (
    <section className={`etTarjeta etBandeja ${nuevo ? "conNuevo" : ""}`} aria-labelledby="etBandejaTitulo" aria-live="polite">
      <div className="etBandejaCabecera">
        <h2 id="etBandejaTitulo">📥 Recibidos de tus otros dispositivos {textos.length > 0 && <span className="etCuenta">{textos.length}</span>}</h2>
        <span className="etEnVivo"><i aria-hidden /> Esperando textos</span>
        {celular && <button type="button" className="botonChico" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>{abierta ? "Ocultar" : "Ver"}</button>}
        {textos.length > 0 && abierta && <button type="button" className="botonChico" onClick={vaciar}>Vaciar</button>}
      </div>
      {abierta && (!cargado ? <p className="small">Cargando…</p> : textos.length === 0 ? (
        <div className="etComo">
          <strong>Así pasas el texto de una foto a este ordenador:</strong>
          <ol>
            <li>En tu celular, entra a AutograFlow con <b>esta misma cuenta</b>.</li>
            <li>Ve a <b>Herramientas → Flow Tools → EX-Trae Texto</b> y toma la foto.</li>
            <li>Pulsa <b>«📤 Enviar texto al ordenador»</b>: aparecerá aquí al instante, listo para copiar.</li>
          </ol>
        </div>
      ) : (
        <ul className="etRecibidos">
          {textos.map((x) => (
            <li key={x.id} className={x.id === nuevo ? "nuevo" : ""} onMouseEnter={() => x.id === nuevo && setNuevo(null)}>
              <div className="etRecibidoCabecera">
                <span>{x.origen.startsWith("Celular") ? "📱 Celular" : "💻 Computadora"} · {hora(x.creadoEn)}{x.id === nuevo && <b className="etNuevo">Nuevo</b>}</span>
                <span className="etBotones">
                  <button type="button" className={x.id === nuevo ? "primary" : ""} onClick={() => copiarTexto(x)}>{copiado === x.id ? "✓ Copiado" : "⧉ Copiar"}</button>
                  {x.datos && <button type="button" onClick={async () => { if (await copiar(datosComoTexto(x.datos!))) { setCopiado(-x.id); setTimeout(() => setCopiado(null), 2000); } }}>{copiado === -x.id ? "✓ Copiado" : "⧉ Copiar datos"}</button>}
                  <button type="button" aria-label="Borrar" onClick={() => borrar(x.id)}>🗑️</button>
                </span>
              </div>
              {x.datos && <dl className="etDatos">{CAMPOS.filter((c) => x.datos![c.k]).map((c) => <div key={c.k}><dt>{c.etiqueta}</dt><dd>{x.datos![c.k]}</dd></div>)}</dl>}
              <pre className="etRecibidoTexto">{x.texto}</pre>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}
