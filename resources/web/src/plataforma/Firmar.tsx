import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { formatoFecha } from "../../../shared/calculos";
import { ETIQUETA_TIPO, TIPOS_IMAGEN, leerDedo, type Evidencias, type Momento, type VistaFirmante } from "../../../shared/plataforma";
import { enlaceWhatsApp } from "../api";
import { EncuadrarDni } from "../componentes/Dni";
import { EncajarHuella } from "../componentes/Huella";
import { AvisoPrivacidad } from "../componentes/Marco";
import { PantallaFirma, type TipoImagen } from "../componentes/PantallaFirma";
import { ErrorApi, plataforma, urls, type TextoLibre } from "./api";
import { calcularPdf, type ValoresPdf } from "./calculos";
import { compartirArchivo } from "./Documento";
import { NavPaginas, PaginaPdf, posicion, usarPdf } from "./VisorPdf";

type Campo = VistaFirmante["campos"][number];
type Valores = Record<number, string | boolean>;
const hoyIso = () => new Date().toLocaleDateString("sv");
const TIPOS_DATO = ["texto", "fecha", "casilla"];

/** Ubicación para el certificado de evidencias: solo si el firmante la autoriza en su navegador. */
function pedirUbicacion(): Promise<NonNullable<Evidencias["ubicacion"]>> {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok({ estado: "no_disponible" });
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
      (e) => ok({ estado: e.code === e.PERMISSION_DENIED ? "denegada" : "no_disponible" }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  });
}

const aArchivo = async (dataUrl: string, nombre: string) => new File([await (await fetch(dataUrl)).blob()], nombre, { type: "image/jpeg" });

/** Página del firmante: abre su enlace, llena sus campos, firma y envía. */
export function Firmar() {
  const { token = "" } = useParams();
  const [v, setV] = useState<VistaFirmante | null>(null);
  const [error, setError] = useState("");
  const cargar = useCallback(() => plataforma.vista(token).then(setV).catch((e) => setError(e instanceof ErrorApi && e.status === 404 ? "Este enlace no es válido." : e.message)), [token]);
  useEffect(() => { cargar(); }, [cargar]);

  if (error) return <div className="card"><div className="afAlerta">{error}</div></div>;
  if (!v) return <div className="card"><p id="loading">Cargando documento...</p></div>;
  if (v.documento.estado === "rechazado") return <Aviso v={v} token={token} titulo="Documento rechazado" texto="Uno de los firmantes rechazó este documento, así que ya no se puede firmar." />;
  if (v.yo.estado === "firmado" || v.documento.estado === "completado") return <Terminado v={v} token={token} />;
  if (v.yo.estado === "rechazado") return <Aviso v={v} token={token} titulo="Rechazaste este documento" texto="Quien te lo envió ya fue notificado." />;
  if (!v.turno) return <Aviso v={v} token={token} titulo={`Todavía no es tu turno — Firmante ${v.yo.orden}`} texto={`Este documento se firma en orden. Falta que firme ${v.esperando}. Vuelve a abrir este enlace cuando te avisen.`} />;
  return <Llenar v={v} token={token} alTerminar={cargar} />;
}

function LogoEmpresa({ v, token }: { v: VistaFirmante; token: string }) {
  return v.documento.logo ? <div className="logoEmpresa"><img src={urls.logoFirmante(token)} alt={v.documento.empresa} /></div> : null;
}

function Aviso({ v, token, titulo, texto }: { v: VistaFirmante; token: string; titulo: string; texto: string }) {
  return (
    <div className="card">
      <LogoEmpresa v={v} token={token} />
      <h1>{titulo}</h1>
      <div className="notice"><strong>{v.documento.nombre}</strong><br />{texto}</div>
    </div>
  );
}

function Terminado({ v, token }: { v: VistaFirmante; token: string }) {
  const completo = v.documento.estado === "completado";
  const sig = v.siguiente;
  return (
    <div className="card">
      <LogoEmpresa v={v} token={token} />
      <h1>{completo ? "✓ Documento firmado por todos" : `✓ Firmaste el documento — Firmante ${v.yo.orden}`}</h1>
      <div className="okNotice">
        <strong>{v.documento.nombre}</strong><br />
        {completo ? "Todos los firmantes completaron el documento. Ya puedes descargarlo con su certificado de firmas."
          : sig ? `Ahora le toca a ${sig.nombre} (Firmante ${v.yo.orden + 1}).` : "Tu firma quedó registrada. Cuando firmen los demás, el documento estará listo."}
      </div>
      {completo && (
        <div className="readyBar">
          <button type="button" className="success" onClick={() => compartirArchivo(urls.finalFirmante(token), `${v.documento.nombre}_firmado`.replace(/\s+/g, "_"), `Documento firmado: ${v.documento.nombre}`)}>
            💬 Enviar PDF firmado por WhatsApp
          </button>
          <a className="boton" href={urls.finalFirmante(token, true)}>⬇️ Descargar PDF firmado</a>
        </div>
      )}
      {!completo && sig && (
        <div className="siguiente">
          <strong>Firmante {v.yo.orden + 1} · {sig.nombre}</strong>
          <p>Avísale que ya puede firmar.</p>
          <a className="boton primary ancho" target="_blank" rel="noopener noreferrer"
            href={enlaceWhatsApp(`Hola ${sig.nombre}, ya firmé «${v.documento.nombre}». Ahora te toca a ti: ${urls.enlaceFirmante(sig.enlace)}`, sig.telefono)}>
            💬 Enviar al Firmante {v.yo.orden + 1} por WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}

function Llenar({ v, token, alTerminar }: { v: VistaFirmante; token: string; alTerminar: () => void }) {
  const { doc, error: errorPdf } = usarPdf(urls.originalFirmante(token));
  const mios = useMemo(() => v.campos.filter((c) => c.mio), [v]);
  const [valores, setValores] = useState<Valores>(() => {
    // Las fechas empiezan con el día de hoy (se pueden cambiar).
    const inicial: Valores = {};
    for (const c of mios) if (c.tipo === "fecha") inicial[c.id] = hoyIso();
    return inicial;
  });
  const [pagina, setPagina] = useState(() => mios[0]?.pagina ?? 1);
  const [editando, setEditando] = useState<Campo | null>(null);
  const [imagenDe, setImagenDe] = useState<Campo | null>(null);
  const [errores, setErrores] = useState<Record<number, string>>({});
  // Texto libre: solo si quien preparó el documento lo permitió («Completar campos y agregar texto libre»).
  const textoLibre = v.yo.modoTexto === "libre";
  const [libres, setLibres] = useState<TextoLibre[]>([]);
  const [colocandoLibre, setColocandoLibre] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Certificado de evidencias: hora (del dispositivo) en que se hizo cada captura.
  const momentos = useRef<Partial<Record<Momento, string>>>({});
  const marcar = (m: Momento) => { momentos.current[m] = new Date().toISOString(); };
  // Con DNI: fotos del frente y del reverso, la foto que se está encuadrando y el reverso del que se saca la huella.
  const pedirDni = v.yo.pedirDni;
  const [dni, setDni] = useState<{ frente?: string; reverso?: string }>({});
  const [encuadre, setEncuadre] = useState<{ archivo: File; lado: "frente" | "reverso" } | null>(null);
  const [huellaDni, setHuellaDni] = useState<File | null>(null);
  const ladoFoto = useRef<"frente" | "reverso">("frente");
  const fotoCamara = useRef<HTMLInputElement>(null);
  const fotoSubir = useRef<HTMLInputElement>(null);
  const datos = mios.filter((c) => TIPOS_DATO.includes(c.tipo));
  // «Convertir en Flujo» (como el prototipo): primero ve el documento, luego llena sus datos en un formulario guiado y al
  // final firma. Mientras no termine el formulario no aparecen los botones de firma ni los pasos del DNI.
  const [etapa, setEtapa] = useState<"inicio" | "formulario" | "documento">(v.documento.flujo && datos.length ? "inicio" : "documento");

  // Campos ƒx: los scripts del PDF se ejecutan con lo llenado por todos hasta ahora (lo mío, lo de los demás y lo del preparador).
  const calculados = useMemo(() => v.campos.filter((c) => c.tipo === "calculo" && c.nombrePdf), [v]);
  const [calculo, setCalculo] = useState<Record<number, string>>({});
  const valoresPdf = useCallback((): ValoresPdf => {
    const salida: ValoresPdf = {};
    for (const c of v.campos) if (c.nombrePdf && c.tipo !== "calculo") salida[c.nombrePdf] = c.mio ? (valores[c.id] ?? (c.tipo === "casilla" ? false : "")) as string | boolean : c.valor;
    return salida;
  }, [v, valores]);
  const calcular = useCallback(async () => {
    if (!v.formulario || !calculados.length) return {};
    const res = await calcularPdf(v.formulario, valoresPdf(), calculados.map((c) => c.nombrePdf));
    const porCampo = Object.fromEntries(calculados.filter((c) => c.nombrePdf in res).map((c) => [c.id, res[c.nombrePdf]]));
    setCalculo(porCampo);
    return porCampo;
  }, [v, calculados, valoresPdf]);
  useEffect(() => {
    const t = setTimeout(() => { calcular().catch(() => {}); }, 500);
    return () => clearTimeout(t);
  }, [calcular]);

  const p = v.documento.paginas[pagina - 1];
  const lleno = (c: Campo) => { const x = valores[c.id]; return c.tipo === "casilla" ? x === true : Boolean(x && String(x).trim()); };
  const faltantes = mios.filter((c) => c.obligatorio && !lleno(c));
  const textos = mios.filter((c) => c.tipo === "texto" || c.tipo === "fecha");
  const imagenes = mios.filter((c) => TIPOS_IMAGEN.includes(c.tipo));

  /** La misma imagen se usa en todos los campos del mismo tipo que sigan vacíos (las huellas, solo las del mismo dedo). */
  function ponerImagen(origen: Campo, png: string) {
    marcar(origen.tipo as Momento);
    setValores((x) => {
      const n = { ...x, [origen.id]: png };
      for (const c of imagenes) if (c.tipo === origen.tipo && !n[c.id] && (c.tipo !== "huella" || c.etiqueta === origen.etiqueta)) n[c.id] = png;
      return n;
    });
  }
  const firmaDni = imagenes.find((c) => c.tipo === "firma");
  const huellasDni = imagenes.filter((c) => c.tipo === "huella");
  const dniCompleto = !pedirDni || (!!dni.frente && !!dni.reverso && huellasDni.every(lleno) && (!firmaDni || lleno(firmaDni)));
  function elegirFoto(lado: "frente" | "reverso", camara: boolean) {
    ladoFoto.current = lado;
    (camara ? fotoCamara : fotoSubir).current?.click();
  }
  const irA = (c: Campo) => { setPagina(c.pagina); setTimeout(() => document.querySelector(`[data-campo="${c.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 120); };
  const abrir = (c: Campo) => {
    irA(c);
    if (c.tipo === "casilla") setValores((x) => ({ ...x, [c.id]: !(x[c.id] === true) }));
    // Con DNI, la huella sale del reverso: se ajusta desde sus pasos.
    else if (pedirDni && c.tipo === "huella") {
      if (dni.reverso) aArchivo(dni.reverso, "dni-reverso.jpg").then(setHuellaDni);
      else document.querySelector(".dniCaptureSteps")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    else if (TIPOS_IMAGEN.includes(c.tipo)) setImagenDe(c);
    else setEditando(c);
  };

  function revisar() {
    if (!dniCompleto) {
      const falta = !dni.frente ? "el frente del DNI" : firmaDni && !lleno(firmaDni) ? "la foto de tu firma" : !dni.reverso ? "el reverso del DNI" : "el ajuste de la huella";
      alert(`Completa los pasos del DNI: falta ${falta}.`);
      document.querySelector(".dniCaptureSteps")?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (faltantes.length) {
      setErrores(Object.fromEntries(faltantes.map((c) => [c.id, "Falta"])));
      alert(`Completa: ${faltantes.slice(0, 5).map((c) => c.etiqueta || ETIQUETA_TIPO[c.tipo]).join(", ")}${faltantes.length > 5 ? "…" : ""}.`);
      // Con Flujo, los datos que faltan se completan en el formulario.
      if (v.documento.flujo && TIPOS_DATO.includes(faltantes[0].tipo)) { setEtapa("formulario"); window.scrollTo({ top: 0 }); }
      else abrir(faltantes[0]);
      return;
    }
    setErrores({});
    setRevisando(true);
    window.scrollTo({ top: 0 });
  }

  async function enviar() {
    setEnviando(true);
    try {
      const evidencias: Evidencias = { momentos: momentos.current };
      if (pedirDni && dni.frente && dni.reverso) evidencias.dni = { frente: dni.frente, reverso: dni.reverso };
      if (v.documento.certificado) evidencias.ubicacion = await pedirUbicacion();
      // Último cálculo con los datos definitivos (si el entorno del PDF no carga, se envía sin cálculos).
      const calculos = await calcular().catch(() => calculo);
      await plataforma.firmar(token, Object.fromEntries(mios.map((c) => [String(c.id), valores[c.id] ?? (c.tipo === "casilla" ? false : "")])), evidencias, calculos, libres);
      alTerminar();
    } catch (e) {
      if (e instanceof ErrorApi && e.campos) setErrores(Object.fromEntries(Object.entries(e.campos).map(([k, m]) => [Number(k), m])));
      alert("No se pudo enviar: " + (e as Error).message);
      setRevisando(false);
    } finally {
      setEnviando(false);
    }
  }

  async function rechazar() {
    if (motivo.trim().length < 3) return alert("Escribe el motivo del rechazo.");
    try { await plataforma.rechazar(token, motivo); alTerminar(); }
    catch (e) { alert((e as Error).message); }
  }

  const contenidoCampo = (c: Campo) => {
    if (c.tipo === "calculo") { const t = calculo[c.id] ?? c.valor; return <span className="afTextShown campoCalculo">{t || "ƒx"}</span>; }
    const x = c.mio ? valores[c.id] : c.valor;
    if (TIPOS_IMAGEN.includes(c.tipo)) {
      const src = c.mio ? (typeof x === "string" && x ? x : null) : c.imagen ? urls.imagenFirmante(token, c.id) : null;
      return src ? <img src={src} alt={ETIQUETA_TIPO[c.tipo]} /> : null;
    }
    if (c.tipo === "casilla") return x === true ? <span className="marcaCasilla">✓</span> : null;
    const t = typeof x === "string" ? (c.tipo === "fecha" ? formatoFecha(x) : x) : "";
    return t ? <span className="afTextShown">{t}</span> : null;
  };

  /** Toca el documento donde va el texto libre y escríbelo. */
  function ponerLibre(punto: { x: number; y: number }) {
    setColocandoLibre(false);
    const texto = prompt("Escribe el texto que quieres agregar en ese lugar:")?.trim();
    if (!texto) return;
    const h = 16, w = Math.min(p.ancho, Math.max(60, texto.length * 5.6 + 10));
    setLibres((ls) => [...ls, { pagina, texto: texto.slice(0, 500), w, h, x: Math.min(Math.max(0, punto.x - 4), p.ancho - w), y: Math.min(Math.max(0, punto.y - h / 2), p.alto - h) }]);
  }
  function editarLibre(i: number) {
    const t = prompt("Cambia tu texto (déjalo vacío para quitarlo):", libres[i].texto);
    if (t === null) return;
    setLibres((ls) => (t.trim() ? ls.map((l, j) => (j === i ? { ...l, texto: t.trim().slice(0, 500), w: Math.min(p.ancho - l.x, Math.max(60, t.trim().length * 5.6 + 10)) } : l)) : ls.filter((_, j) => j !== i)));
  }

  const vistaPagina = (interactivo: boolean) => (
    <PaginaPdf doc={doc} numero={pagina} pagina={p} alTocar={interactivo && colocandoLibre ? ponerLibre : undefined} cursor={interactivo && colocandoLibre ? "crosshair" : undefined}>
      {libres.map((l, i) => l.pagina !== pagina ? null : interactivo ? (
        <button type="button" key={`l${i}`} className="campoFirma tipo-texto mio filled afLibre" style={{ ...posicion(l, p), "--c": v.yo.color } as CSSProperties}
          title="Tu texto adicional: tócalo para cambiarlo o quitarlo" onClick={() => editarLibre(i)}><span className="afTextShown">{l.texto}</span></button>
      ) : (
        <div key={`l${i}`} className="campoFirma tipo-texto mio filled afLibre" style={{ ...posicion(l, p), "--c": v.yo.color } as CSSProperties}><span className="afTextShown">{l.texto}</span></div>
      ))}
      {v.campos.filter((c) => c.pagina === pagina).map((c) => {
        const contenido = contenidoCampo(c);
        const clase = `campoFirma tipo-${c.tipo} ${c.mio ? "mio" : "otro"} ${contenido ? "filled" : ""} ${errores[c.id] ? "invalido" : ""}`;
        const estilo = { ...posicion(c, p), "--c": v.yo.color } as CSSProperties;
        // Con Flujo, los datos ya se llenaron en el formulario: en el documento quedan solo para ver.
        return c.mio && interactivo && !(v.documento.flujo && TIPOS_DATO.includes(c.tipo)) ? (
          <button type="button" key={c.id} data-campo={c.id} className={clase} style={estilo} onClick={() => abrir(c)} title={c.etiqueta || ETIQUETA_TIPO[c.tipo]}
            aria-label={c.etiqueta || ETIQUETA_TIPO[c.tipo]}
            data-vacio={TIPOS_IMAGEN.includes(c.tipo) ? (c.tipo === "firma" ? "FIRMA AQUÍ" : c.tipo === "sello" ? "SELLO" : "HUELLA") : undefined}>
            {contenido}
          </button>
        ) : (
          <div key={c.id} className={clase} style={estilo}>{contenido}</div>
        );
      })}
    </PaginaPdf>
  );

  if (revisando)
    return (
      <div className="card">
        <h2 id="finishTitle">Previsualización del documento firmado</h2>
        <p>Revisa tus datos y tu firma. Al enviar, quedarán registrados con la fecha, la hora y tu dispositivo.</p>
        {v.documento.certificado && (
          <p className="small afCertificatePrivacyNote">📜 Este documento lleva certificado de evidencias: al enviar, tu navegador puede pedirte permiso para incluir tu ubicación aproximada. Es opcional; si no la autorizas, el certificado lo indicará.</p>
        )}
        <NavPaginas actual={pagina} total={v.documento.paginas.length} alCambiar={setPagina} />
        <div className="signed">{vistaPagina(false)}</div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" onClick={() => setRevisando(false)} disabled={enviando}>Volver a firmar</button>
          <button type="button" className="success" onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "✓ Firmar y enviar"}</button>
        </div>
      </div>
    );

  if (etapa === "formulario") {
    const continuar = () => {
      const faltan = datos.filter((c) => c.obligatorio && !lleno(c));
      if (faltan.length) {
        setErrores(Object.fromEntries(faltan.map((c) => [c.id, c.tipo === "casilla" ? "Debes marcarla" : "Completa este dato"])));
        document.querySelector(`[data-dato="${faltan[0].id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      setErrores({});
      setEtapa("documento");
      setPagina(imagenes[0]?.pagina ?? pagina);
      window.scrollTo({ top: 0 });
    };
    const porPagina = [...new Set(datos.map((c) => c.pagina))];
    return (
      <div className="card">
        <LogoEmpresa v={v} token={token} />
        <h1>Completa tus datos — Firmante {v.yo.orden}</h1>
        <div className="notice">
          <strong>{v.documento.nombre}</strong><br />
          {v.documento.remitente} te envió este documento. Llena los datos solicitados; al terminar podrás revisar el documento y firmarlo.
          {v.documento.mensaje && <><br /><em>«{v.documento.mensaje}»</em></>}
        </div>
        <div className="flujoFormulario">
          {porPagina.map((n) => (
            <section key={n} className="flujoSeccion">
              <h3>{porPagina.length > 1 ? `Página ${n}` : "Tus datos"}</h3>
              {datos.filter((c) => c.pagina === n).map((c) => {
                const nombre = c.etiqueta || ETIQUETA_TIPO[c.tipo];
                return c.tipo === "casilla" ? (
                  <label key={c.id} data-dato={c.id} className={`checkrow ${errores[c.id] ? "invalido" : ""}`}>
                    <input type="checkbox" checked={valores[c.id] === true} onChange={(e) => setValores((x) => ({ ...x, [c.id]: e.target.checked }))} />
                    <strong>{nombre}{c.obligatorio ? " *" : ""}</strong>
                  </label>
                ) : (
                  <label key={c.id} data-dato={c.id} className="field">
                    <span className="fieldLabel">{nombre}{c.obligatorio ? " *" : ""}</span>
                    <input type={c.tipo === "fecha" ? "date" : "text"} maxLength={500} autoComplete="on" className={errores[c.id] ? "invalido" : ""}
                      value={typeof valores[c.id] === "string" ? (valores[c.id] as string) : ""} placeholder={c.tipo === "texto" ? "Escribe aquí" : undefined}
                      onChange={(e) => { const t = e.target.value; setValores((x) => ({ ...x, [c.id]: t })); }} />
                    {errores[c.id] && <small className="afAlerta">{errores[c.id]}</small>}
                  </label>
                );
              })}
            </section>
          ))}
        </div>
        <div className="readyBar">
          <button type="button" className="primary" onClick={continuar}>{imagenes.length ? "Continuar a la firma →" : "Continuar a la revisión →"}</button>
        </div>
      </div>
    );
  }

  // El botón abre primero las firmas, luego el sello y al final la huella (y su texto dice cuál). Con DNI, la firma y la
  // huella se hacen en los pasos del DNI y aquí solo queda el sello.
  const tiposPendientes = new Set(imagenes.filter((c) => !lleno(c) && !(pedirDni && (c.tipo === "firma" || c.tipo === "huella"))).map((c) => c.tipo));
  const tipoPendiente = (["firma", "sello", "huella"] as const).find((t) => tiposPendientes.has(t));
  const imagenPendiente = imagenes.find((c) => c.tipo === tipoPendiente && !lleno(c));
  return (
    <>
      <div className="card">
        <h1>Documento listo para firmar — Firmante {v.yo.orden}</h1>
        <LogoEmpresa v={v} token={token} />
        <div className="notice">
          <strong>Firmante {v.yo.orden} · {v.yo.nombre}</strong>
          <br />{v.documento.remitente}{v.documento.empresa && v.documento.empresa !== v.documento.remitente ? ` (${v.documento.empresa})` : ""} te envió este documento. Revísalo y completa los campos marcados.
          {v.documento.mensaje && <><br /><em>«{v.documento.mensaje}»</em></>}
        </div>
        <h3>{v.documento.nombre}</h3>
        <AvisoPrivacidad />

        {etapa === "inicio" && (
          <>
            <div className="notice">Revisa el documento. Después completarás tus datos en un formulario guiado y, al terminar, {pedirDni ? "capturarás tu DNI y firmarás" : "firmarás"}.</div>
            <div className="readyBar">
              <button type="button" className="primary" onClick={() => { setEtapa("formulario"); window.scrollTo({ top: 0 }); }}>✍️ Empezar a llenar el documento</button>
            </div>
          </>
        )}

        {etapa === "documento" && pedirDni && (
          <section className="dniCaptureSteps">
            <div className="notice dniAviso"><strong>🪪 Firma manuscrita y evidencia del DNI</strong><br />
              Captura el frente de tu DNI, fotografía o sube tu firma hecha en papel, captura el reverso y ajusta la huella. Las fotos no validan tu identidad ante RENIEC ni son una firma digital certificada.</div>
            <PasoDni n={1} titulo="Captura el frente del DNI" texto="Encuadra la tarjeta completa: esta foto va a la hoja de evidencias del PDF." listo={dni.frente}>
              <button type="button" className="primary" onClick={() => elegirFoto("frente", true)}>📷 Capturar frente</button>
              <button type="button" onClick={() => elegirFoto("frente", false)}>🖼️ Subir frente</button>
            </PasoDni>
            {firmaDni && (
              <PasoDni n={2} titulo="Sube o toma una foto de tu firma" texto="Firma en una hoja blanca y tómale una foto, o sube una foto de tu firma. Se recorta y se le quita el fondo." listo={lleno(firmaDni) ? (valores[firmaDni.id] as string) : undefined} bloqueado={!dni.frente}>
                <button type="button" className="primary" disabled={!dni.frente} onClick={() => abrir(firmaDni)}>✍️ Fotografiar o subir mi firma</button>
              </PasoDni>
            )}
            <PasoDni n={firmaDni ? 3 : 2} titulo="Captura el reverso del DNI" texto="Encuadra la tarjeta completa; después ajustarás el área de la huella." listo={dni.reverso} bloqueado={!dni.frente || (!!firmaDni && !lleno(firmaDni))}>
              <button type="button" className="primary" disabled={!dni.frente || (!!firmaDni && !lleno(firmaDni))} onClick={() => elegirFoto("reverso", true)}>📷 Capturar reverso</button>
              <button type="button" disabled={!dni.frente || (!!firmaDni && !lleno(firmaDni))} onClick={() => elegirFoto("reverso", false)}>🖼️ Subir reverso</button>
            </PasoDni>
            {huellasDni.length > 0 && (
              <PasoDni n={firmaDni ? 4 : 3} titulo="Ajusta la huella del DNI" texto="Encuadra la huella impresa en el reverso: amplía, mueve y gira poco a poco." listo={lleno(huellasDni[0]) ? (valores[huellasDni[0].id] as string) : undefined} bloqueado={!dni.reverso}>
                <button type="button" className="primary" disabled={!dni.reverso} onClick={async () => setHuellaDni(await aArchivo(dni.reverso!, "dni-reverso.jpg"))}>🔍 Ajustar huella del reverso</button>
              </PasoDni>
            )}
            <input ref={fotoCamara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setEncuadre({ archivo: f, lado: ladoFoto.current }); e.target.value = ""; }} />
            <input ref={fotoSubir} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setEncuadre({ archivo: f, lado: ladoFoto.current }); e.target.value = ""; }} />
          </section>
        )}

        {etapa === "documento" && <><div className="readyBar">
          {v.documento.flujo && datos.length > 0
            ? <button type="button" onClick={() => { setEtapa("formulario"); window.scrollTo({ top: 0 }); }}>✏️ Volver al formulario de datos</button>
            : textos.length > 0 && <button type="button" className="primary" onClick={() => abrir(textos.find((c) => !lleno(c)) ?? textos[0])}>✍️ Empezar a llenar mis datos</button>}
          {imagenPendiente && (
            <button type="button" className="primary" onClick={() => abrir(imagenPendiente)}>
              {tiposPendientes.has("firma") ? "✍️ Listo para firmar" : tiposPendientes.has("sello") ? "🖋️ Listo para sellar" : "👆 Listo para colocar huella"}
            </button>
          )}
        </div>
        <div className="readyBar">
          <button type="button" className="success" onClick={revisar}>✓ Revisar y continuar</button>
          {faltantes.length > 0 && <small className="afExtraHint">Faltan {faltantes.length} campo(s) obligatorio(s).</small>}
        </div></>}

        <NavPaginas actual={pagina} total={v.documento.paginas.length} alCambiar={setPagina} />
        {errorPdf && <div className="afAlerta">{errorPdf}</div>}
        {colocandoLibre && <div className="avisoColocar">👆 Toca el documento donde quieres agregar tu texto. <button type="button" className="enlace" onClick={() => setColocandoLibre(false)}>Cancelar</button></div>}
        <div className="preview">{vistaPagina(etapa === "documento")}</div>
        {textoLibre && etapa === "documento" && (
          <div className="afExtraTextRow">
            <button type="button" className={colocandoLibre ? "primary" : ""} onClick={() => setColocandoLibre(!colocandoLibre)}>➕ Agregar texto adicional</button>
            <p className="afExtraHint">Úsalo solo para agregar algo extra que no tenga un campo en el documento.{libres.length ? ` Agregaste ${libres.length}: tócalos para cambiarlos o quitarlos.` : ""}</p>
          </div>
        )}
        <div className="afExtraTextRow">
          <button type="button" className="danger" onClick={() => setRechazando(true)}>✕ No estoy de acuerdo, rechazar</button>
        </div>
      </div>

      {editando && (
        <HojaTexto campos={textos} actual={editando} valores={valores} setValores={setValores}
          alMover={(c) => { setEditando(c); irA(c); }} alCerrar={() => setEditando(null)} />
      )}
      {imagenDe && (
        <PantallaFirma
          tipo={imagenDe.tipo as TipoImagen}
          titulo={`${imagenDe.tipo === "firma" ? "Firma manuscrita" : imagenDe.tipo === "sello" ? "Sello" : "Huella"} — Firmante ${v.yo.orden}`}
          inicial={typeof valores[imagenDe.id] === "string" ? (valores[imagenDe.id] as string) : null}
          bloquearDibujo={v.documento.bloquearDibujo} bloquearSello={v.documento.bloquearSello}
          dedo={imagenDe.tipo === "huella" ? leerDedo(imagenDe.etiqueta) : null}
          alTerminar={(png) => {
            if (png) ponerImagen(imagenDe, png);
            setImagenDe(null);
          }}
          alCerrar={() => setImagenDe(null)}
        />
      )}
      {encuadre && (
        <EncuadrarDni archivo={encuadre.archivo} lado={encuadre.lado} alCancelar={() => setEncuadre(null)}
          alUsar={(jpg) => {
            const lado = encuadre.lado;
            marcar(lado === "frente" ? "dniFrente" : "dniReverso");
            setDni((d) => ({ ...d, [lado]: jpg }));
            // Si cambia el reverso, hay que volver a ajustar la huella.
            if (lado === "reverso") setValores((x) => { const n = { ...x }; for (const c of huellasDni) delete n[c.id]; return n; });
            setEncuadre(null);
          }} />
      )}
      {huellaDni && (
        <EncajarHuella archivo={huellaDni} deDni alCancelar={() => setHuellaDni(null)}
          alUsar={(png) => {
            marcar("huella");
            setValores((x) => { const n = { ...x }; for (const c of huellasDni) n[c.id] = png; return n; });
            setHuellaDni(null);
          }} />
      )}
      {rechazando && (
        <div className="afSheet" onClick={(e) => e.target === e.currentTarget && setRechazando(false)}>
          <div className="afSheetCard" role="dialog" aria-label="Rechazar documento">
            <div className="afSheetHead"><div className="afSheetTitles"><strong>Rechazar documento</strong><small>Quien te lo envió verá este motivo</small></div></div>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Motivo del rechazo" aria-label="Motivo del rechazo" />
            <div className="afSheetActions">
              <button type="button" onClick={() => setRechazando(false)}>Cancelar</button>
              <button type="button" className="danger" onClick={rechazar}>Rechazar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Un paso de la captura con DNI: su estado y la vista previa de lo ya capturado. */
function PasoDni({ n, titulo, texto, listo, bloqueado = false, children }: { n: number; titulo: string; texto: string; listo?: string; bloqueado?: boolean; children: ReactNode }) {
  return (
    <div className={`dniCaptureStep ${bloqueado ? "bloqueado" : ""}`}>
      <strong>{n}. {titulo}</strong>
      <p>{texto}</p>
      <div className="dniCaptureActions">{children}</div>
      <span aria-live="polite">{listo ? "✓ Listo (puedes reemplazarlo)" : bloqueado ? "Primero completa el paso anterior" : "Pendiente"}</span>
      {listo && <img className="dniCapturePreview" src={listo} alt={titulo} />}
    </div>
  );
}

/** Panel inferior para escribir un texto o una fecha, con «Siguiente» entre los campos del firmante. */
function HojaTexto({ campos, actual, valores, setValores, alMover, alCerrar }: {
  campos: Campo[]; actual: Campo; valores: Valores; setValores: (fn: (v: Valores) => Valores) => void; alMover: (c: Campo) => void; alCerrar: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const i = campos.findIndex((c) => c.id === actual.id);
  const anterior = campos[i - 1], siguiente = campos[i + 1];
  useEffect(() => { entrada.current?.focus({ preventScroll: true }); }, [actual]);
  const valor = typeof valores[actual.id] === "string" ? (valores[actual.id] as string) : "";
  return (
    <div className="afSheet" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="afSheetCard" role="dialog" aria-label={actual.etiqueta || ETIQUETA_TIPO[actual.tipo]}>
        <div className="afSheetHead">
          <div className="afSheetTitles">
            <strong>{actual.etiqueta || ETIQUETA_TIPO[actual.tipo]}{actual.obligatorio ? " *" : ""}</strong>
            <small>Página {actual.pagina}</small>
          </div>
          <div className="afSheetNav">
            <button type="button" disabled={!anterior} onClick={() => anterior && alMover(anterior)} aria-label="Anterior">‹</button>
            <span>{i + 1} / {campos.length}</span>
            <button type="button" disabled={!siguiente} onClick={() => siguiente && alMover(siguiente)} aria-label="Siguiente">›</button>
          </div>
        </div>
        <input
          ref={entrada} value={valor} type={actual.tipo === "fecha" ? "date" : "text"} maxLength={500} aria-label={actual.etiqueta || ETIQUETA_TIPO[actual.tipo]}
          onChange={(e) => { const t = e.target.value; setValores((v) => ({ ...v, [actual.id]: t })); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); siguiente ? alMover(siguiente) : alCerrar(); } }}
        />
        <div className="afSheetActions">
          <button type="button" className="danger" onClick={() => setValores((v) => ({ ...v, [actual.id]: "" }))}>Borrar</button>
          {siguiente && <button type="button" className="primary" onClick={() => alMover(siguiente)}>Siguiente</button>}
          <button type="button" className="success" onClick={alCerrar}>✓ Listo</button>
        </div>
      </div>
    </div>
  );
}
