import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { formatoFecha } from "../../../shared/calculos";
import { ETIQUETA_TIPO, TIPOS_IMAGEN, leerDedo, type Evidencias, type Idioma, type Momento, type VistaFirmante } from "../../../shared/plataforma";
import { enlaceWhatsApp } from "../api";
import { EncuadrarDni } from "../componentes/Dni";
import { EncajarHuella } from "../componentes/Huella";
import { AvisoPrivacidad } from "../componentes/Marco";
import { VentanaLegal, VERSION_LEGAL, type TipoLegal } from "../componentes/Legal";
import { MarcaCasilla } from "../componentes/MarcaCasilla";
import { IdiomaContexto, rotuloDedo, traducir, usarIdioma, usarT } from "../componentes/idioma";
import { PantallaFirma, type TipoImagen } from "../componentes/PantallaFirma";
import { ErrorApi, plataforma, urls, type TextoLibre } from "./api";
import { calcularPdf, type ValoresPdf } from "./calculos";
import { BotonesPdfFirmado } from "./Documento";
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
const CLAVE_IDIOMA = "autograflow_idioma_firmante";
function idiomaGuardado(): Idioma | null {
  try { const x = localStorage.getItem(CLAVE_IDIOMA); return x === "es" || x === "en" ? x : null; } catch { return null; }
}

export function Firmar() {
  const { token = "" } = useParams();
  const [v, setV] = useState<VistaFirmante | null>(null);
  const [error, setError] = useState("");
  // Idioma: el que eligió el firmante en este navegador; si no, el que configuró quien preparó el documento.
  const [elegido, setElegido] = useState<Idioma | null>(idiomaGuardado);
  const idioma: Idioma = elegido ?? v?.documento.idioma ?? (navigator.language?.toLowerCase().startsWith("en") ? "en" : "es");
  const cargar = useCallback(() => plataforma.vista(token).then(setV).catch((e) => setError(e instanceof ErrorApi && e.status === 404 ? "Este enlace no es válido." : e.message)), [token]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const antes = document.documentElement.lang;
    document.documentElement.lang = idioma;
    return () => { document.documentElement.lang = antes; };
  }, [idioma]);
  function cambiarIdioma(i: Idioma) {
    setElegido(i);
    try { localStorage.setItem(CLAVE_IDIOMA, i); } catch { /* sin almacenamiento: solo para esta visita */ }
  }
  const t = (es: string, x?: Record<string, string | number>) => traducir(idioma, es, x);

  let contenido;
  if (error) contenido = <div className="card"><div className="afAlerta">{t(error)}</div></div>;
  else if (!v) contenido = <div className="card"><p id="loading">{t("Cargando documento...")}</p></div>;
  else if (v.documento.estado === "rechazado") contenido = <Aviso v={v} token={token} titulo={t("Documento rechazado")} texto={t("Uno de los firmantes rechazó este documento, así que ya no se puede firmar.")} />;
  else if (v.yo.estado === "firmado" || v.documento.estado === "completado") contenido = <Terminado v={v} token={token} />;
  else if (v.yo.estado === "rechazado") contenido = <Aviso v={v} token={token} titulo={t("Rechazaste este documento")} texto={t("Quien te lo envió ya fue notificado.")} />;
  else if (!v.turno) contenido = <Aviso v={v} token={token} titulo={t("Todavía no es tu turno — Firmante {n}", { n: v.yo.orden })} texto={t("Este documento se firma en orden. Falta que firme {nombre}. Vuelve a abrir este enlace cuando te avisen.", { nombre: v.esperando ?? "" })} />;
  else contenido = <Llenar v={v} token={token} alTerminar={cargar} />;
  return (
    <IdiomaContexto.Provider value={idioma}>
      <div className="idiomaPagina">
        <label>
          <span aria-hidden="true">🌐</span>
          <select value={idioma} onChange={(e) => cambiarIdioma(e.target.value as Idioma)} aria-label="Idioma / Language">
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
      {contenido}
    </IdiomaContexto.Provider>
  );
}

/** Nombre que ve el firmante para un campo: su rótulo (el del documento) o el tipo; las huellas, con el dedo en su idioma. */
function usarNombreCampo() {
  const idioma = usarIdioma(), t = usarT();
  return (c: Campo) => {
    const d = c.tipo === "huella" ? leerDedo(c.etiqueta) : null;
    return d ? rotuloDedo(idioma, d) : c.etiqueta || t(ETIQUETA_TIPO[c.tipo]);
  };
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
  const t = usarT();
  const completo = v.documento.estado === "completado";
  const sig = v.siguiente;
  return (
    <div className="card">
      <LogoEmpresa v={v} token={token} />
      <h1>{completo ? t("✓ Documento firmado por todos") : t("✓ Firmaste el documento — Firmante {n}", { n: v.yo.orden })}</h1>
      <div className="okNotice">
        <strong>{v.documento.nombre}</strong><br />
        {completo ? t("Todos los firmantes completaron el documento. Ya puedes descargarlo con su certificado de firmas.")
          : sig ? t("Ahora le toca a {nombre} (Firmante {n}).", { nombre: sig.nombre, n: v.yo.orden + 1 }) : t("Tu firma quedó registrada. Cuando firmen los demás, el documento estará listo.")}
      </div>
      <CopiaFirmante v={v} token={token} completo={completo} />
      {!completo && sig && (
        <div className="siguiente">
          <strong>{t("Firmante {n}", { n: v.yo.orden + 1 })} · {sig.nombre}</strong>
          <p>{t("Avísale que ya puede firmar.")}</p>
          <a className="boton primary ancho" target="_blank" rel="noopener noreferrer"
            href={enlaceWhatsApp(t("Hola {nombre}, ya firmé «{doc}». Ahora te toca a ti: {url}", { nombre: sig.nombre, doc: v.documento.nombre, url: urls.enlaceFirmante(sig.enlace) }), sig.telefono)}>
            {t("💬 Enviar al Firmante {n} por WhatsApp", { n: v.yo.orden + 1 })}
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * «Descargar una copia»: el PDF con su firma (el final si ya firmaron todos) durante unos días después de firmar.
 * Cuando el plazo vence, ya no se puede: hay que pedirle una copia a quien envió el documento.
 */
function CopiaFirmante({ v, token, completo }: { v: VistaFirmante; token: string; completo: boolean }) {
  const t = usarT(), idioma = usarIdioma();
  const hasta = v.yo.copiaHasta ? new Date(v.yo.copiaHasta) : null;
  if (!hasta) return null;
  const fecha = hasta.toLocaleDateString(idioma === "en" ? "en-GB" : "es", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (hasta.getTime() < Date.now())
    return <div className="notice copiaVencida">{t("⏳ La copia se podía descargar hasta el {fecha}. Si la necesitas, pídele una copia a {remitente}, quien te envió el documento.", { fecha, remitente: v.documento.remitente })}</div>;
  const nombre = `${v.documento.nombre}_${t(completo ? "firmado" : "copia")}`.replace(/\s+/g, "_");
  return (
    <div className="copiaFirmante">
      <h2>{t("Tu copia")}</h2>
      <p className="small">{completo
        ? t("Descarga el PDF firmado por todos, con su certificado de firmas.")
        : t("Descarga una copia del documento con tu firma. Las firmas que faltan aparecerán como pendientes.")}{" "}
        {t("Disponible hasta el")} <strong>{fecha}</strong>{t("; después tendrás que pedírsela a {remitente}.", { remitente: v.documento.remitente })}</p>
      <BotonesPdfFirmado url={urls.copiaFirmante(token)} urlDescarga={urls.copiaFirmante(token, true)} nombre={nombre}
        texto={t(completo ? "Documento firmado: {doc}" : "Documento con mi firma: {doc}", { doc: v.documento.nombre })} />
    </div>
  );
}

function Llenar({ v, token, alTerminar }: { v: VistaFirmante; token: string; alTerminar: () => void }) {
  const t = usarT(), nombreCampo = usarNombreCampo(), idioma = usarIdioma();
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
  // Consentimiento del firmante antes de enviar (se registra con la versión de los textos aceptados).
  const [acepto, setAcepto] = useState(false);
  const [legal, setLegal] = useState<TipoLegal | null>(null);
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
      alert(t("Completa los pasos del DNI: falta {falta}.", { falta: t(falta) }));
      document.querySelector(".dniCaptureSteps")?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (faltantes.length) {
      setErrores(Object.fromEntries(faltantes.map((c) => [c.id, t("Falta")])));
      alert(t("Completa: {lista}.", { lista: faltantes.slice(0, 5).map(nombreCampo).join(", ") + (faltantes.length > 5 ? "…" : "") }));
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
      await plataforma.firmar(token, Object.fromEntries(mios.map((c) => [String(c.id), valores[c.id] ?? (c.tipo === "casilla" ? false : "")])), evidencias, calculos, libres, idioma === "en" ? `${VERSION_LEGAL}-en` : VERSION_LEGAL);
      alTerminar();
    } catch (e) {
      if (e instanceof ErrorApi && e.campos) setErrores(Object.fromEntries(Object.entries(e.campos).map(([k, m]) => [Number(k), m])));
      alert(t("No se pudo enviar: {error}", { error: (e as Error).message }));
      setRevisando(false);
    } finally {
      setEnviando(false);
    }
  }

  async function rechazar() {
    if (motivo.trim().length < 3) return alert(t("Escribe el motivo del rechazo."));
    try { await plataforma.rechazar(token, motivo); alTerminar(); }
    catch (e) { alert((e as Error).message); }
  }

  const contenidoCampo = (c: Campo) => {
    if (c.tipo === "calculo") { const r = calculo[c.id] ?? c.valor; return <span className="afTextShown campoCalculo">{r || "ƒx"}</span>; }
    const x = c.mio ? valores[c.id] : c.valor;
    if (TIPOS_IMAGEN.includes(c.tipo)) {
      const src = c.mio ? (typeof x === "string" && x ? x : null) : c.imagen ? urls.imagenFirmante(token, c.id) : null;
      return src ? <img src={src} alt={t(ETIQUETA_TIPO[c.tipo])} /> : null;
    }
    if (c.tipo === "casilla") return x === true ? <MarcaCasilla /> : null;
    const s = typeof x === "string" ? (c.tipo === "fecha" ? formatoFecha(x) : x) : "";
    return s ? <span className="afTextShown">{s}</span> : null;
  };

  /** Toca el documento donde va el texto libre y escríbelo. */
  function ponerLibre(punto: { x: number; y: number }) {
    setColocandoLibre(false);
    const texto = prompt(t("Escribe el texto que quieres agregar en ese lugar:"))?.trim();
    if (!texto) return;
    const h = 16, w = Math.min(p.ancho, Math.max(60, texto.length * 5.6 + 10));
    setLibres((ls) => [...ls, { pagina, texto: texto.slice(0, 500), w, h, x: Math.min(Math.max(0, punto.x - 4), p.ancho - w), y: Math.min(Math.max(0, punto.y - h / 2), p.alto - h) }]);
  }
  function editarLibre(i: number) {
    const nuevo = prompt(t("Cambia tu texto (déjalo vacío para quitarlo):"), libres[i].texto);
    if (nuevo === null) return;
    const n = nuevo.trim();
    setLibres((ls) => (n ? ls.map((l, j) => (j === i ? { ...l, texto: n.slice(0, 500), w: Math.min(p.ancho - l.x, Math.max(60, n.length * 5.6 + 10)) } : l)) : ls.filter((_, j) => j !== i)));
  }

  const vistaPagina = (interactivo: boolean) => (
    <PaginaPdf doc={doc} numero={pagina} pagina={p} alTocar={interactivo && colocandoLibre ? ponerLibre : undefined} cursor={interactivo && colocandoLibre ? "crosshair" : undefined}>
      {libres.map((l, i) => l.pagina !== pagina ? null : interactivo ? (
        <button type="button" key={`l${i}`} className="campoFirma tipo-texto mio filled afLibre" style={{ ...posicion(l, p), "--c": v.yo.color } as CSSProperties}
          title={t("Tu texto adicional: tócalo para cambiarlo o quitarlo")} onClick={() => editarLibre(i)}><span className="afTextShown">{l.texto}</span></button>
      ) : (
        <div key={`l${i}`} className="campoFirma tipo-texto mio filled afLibre" style={{ ...posicion(l, p), "--c": v.yo.color } as CSSProperties}><span className="afTextShown">{l.texto}</span></div>
      ))}
      {v.campos.filter((c) => c.pagina === pagina).map((c) => {
        const contenido = contenidoCampo(c);
        const clase = `campoFirma tipo-${c.tipo} ${c.mio ? "mio" : "otro"} ${contenido ? "filled" : ""} ${errores[c.id] ? "invalido" : ""}`;
        const estilo = { ...posicion(c, p), "--c": v.yo.color } as CSSProperties;
        // Con Flujo, los datos ya se llenaron en el formulario: en el documento quedan solo para ver.
        return c.mio && interactivo && !(v.documento.flujo && TIPOS_DATO.includes(c.tipo)) ? (
          <button type="button" key={c.id} data-campo={c.id} className={clase} style={estilo} onClick={() => abrir(c)} title={nombreCampo(c)}
            aria-label={nombreCampo(c)}
            data-vacio={TIPOS_IMAGEN.includes(c.tipo) ? t(c.tipo === "firma" ? "FIRMA AQUÍ" : c.tipo === "sello" ? "SELLO" : "HUELLA") : undefined}>
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
        <h2 id="finishTitle">{t("Previsualización del documento firmado")}</h2>
        <p>{t("Revisa tus datos y tu firma. Al enviar, quedarán registrados con la fecha, la hora y tu dispositivo.")}</p>
        {v.documento.certificado && (
          <p className="small afCertificatePrivacyNote">{t("📜 Este documento lleva certificado de evidencias: al enviar, tu navegador puede pedirte permiso para incluir tu ubicación aproximada. Es opcional; si no la autorizas, el certificado lo indicará.")}</p>
        )}
        <NavPaginas actual={pagina} total={v.documento.paginas.length} alCambiar={setPagina} />
        <div className="signed">{vistaPagina(false)}</div>
        <label className="checkrow termsCheck consentimientoFirmante">
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
          <div>
            <strong>{t("He leído y acepto los Términos para firmantes y la Política de Privacidad")}</strong>
            <p className="termsDeclare">
              {t("Declaro que soy la persona indicada como firmante, que leí el documento y que firmo de forma libre y voluntaria.")}{" "}
              {t("Autorizo el tratamiento de mis datos para firmar este documento: {datos}, que verán quien me envió el documento y los demás firmantes en el PDF y su certificado.", {
                datos: [t("mi firma"), imagenes.some((c) => c.tipo === "sello") && t("mi sello"), t("los datos que llené"), t("la fecha y hora"), t("mi IP y mi dispositivo")].filter(Boolean).join(", ")
                  + (v.documento.certificado ? `,${t(" y mi ubicación solo si la autorizo en mi navegador")}` : ""),
              })}
              {(pedirDni || imagenes.some((c) => c.tipo === "huella")) && <> {t("Doy mi")} <b>{t("consentimiento expreso")}</b> {t("para el tratamiento de mis datos sensibles: {datos}, solo como imagen dentro de este documento.", {
                datos: [imagenes.some((c) => c.tipo === "huella") && t("mi huella dactilar"), pedirDni && t("las fotos de mi documento de identidad")].filter(Boolean).join(t(" y ")),
              })}</>}
            </p>
            <div className="small">{t("Léelos aquí:")} <a href="#" onClick={(e) => { e.preventDefault(); setLegal("firmantes"); }}>{t("Términos para firmantes")}</a> · <a href="#" onClick={(e) => { e.preventDefault(); setLegal("privacidad"); }}>{t("Política de Privacidad")}</a></div>
          </div>
        </label>
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" onClick={() => setRevisando(false)} disabled={enviando}>{t("Volver a firmar")}</button>
          <button type="button" className="success" onClick={enviar} disabled={enviando || !acepto} title={acepto ? undefined : t("Primero acepta los términos")}>{enviando ? t("Enviando…") : t("✓ Firmar y enviar")}</button>
        </div>
        {!acepto && <p className="small centro">{t("Para enviar tu firma, marca la casilla de aceptación.")}</p>}
        {legal && <VentanaLegal tipo={legal} alCerrar={() => setLegal(null)} />}
      </div>
    );

  if (etapa === "formulario") {
    const continuar = () => {
      const faltan = datos.filter((c) => c.obligatorio && !lleno(c));
      if (faltan.length) {
        setErrores(Object.fromEntries(faltan.map((c) => [c.id, t(c.tipo === "casilla" ? "Debes marcarla" : "Completa este dato")])));
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
        <h1>{t("Completa tus datos — Firmante {n}", { n: v.yo.orden })}</h1>
        <div className="notice">
          <strong>{v.documento.nombre}</strong><br />
          {t("{remitente} te envió este documento. Llena los datos solicitados; al terminar podrás revisar el documento y firmarlo.", { remitente: v.documento.remitente })}
          {v.documento.mensaje && <><br /><em>«{v.documento.mensaje}»</em></>}
        </div>
        <div className="flujoFormulario">
          {porPagina.map((n) => (
            <section key={n} className="flujoSeccion">
              <h3>{porPagina.length > 1 ? t("Página {n}", { n }) : t("Tus datos")}</h3>
              {datos.filter((c) => c.pagina === n).map((c) => {
                const nombre = nombreCampo(c);
                return c.tipo === "casilla" ? (
                  <label key={c.id} data-dato={c.id} className={`checkrow ${errores[c.id] ? "invalido" : ""}`}>
                    <input type="checkbox" checked={valores[c.id] === true} onChange={(e) => setValores((x) => ({ ...x, [c.id]: e.target.checked }))} />
                    <strong>{nombre}{c.obligatorio ? " *" : ""}</strong>
                  </label>
                ) : (
                  <label key={c.id} data-dato={c.id} className="field">
                    <span className="fieldLabel">{nombre}{c.obligatorio ? " *" : ""}</span>
                    <input type={c.tipo === "fecha" ? "date" : "text"} maxLength={500} autoComplete="on" className={errores[c.id] ? "invalido" : ""}
                      value={typeof valores[c.id] === "string" ? (valores[c.id] as string) : ""} placeholder={c.tipo === "texto" ? t("Escribe aquí") : undefined}
                      onChange={(e) => { const t = e.target.value; setValores((x) => ({ ...x, [c.id]: t })); }} />
                    {errores[c.id] && <small className="afAlerta">{errores[c.id]}</small>}
                  </label>
                );
              })}
            </section>
          ))}
        </div>
        <div className="readyBar">
          <button type="button" className="primary" onClick={continuar}>{t(imagenes.length ? "Continuar a la firma →" : "Continuar a la revisión →")}</button>
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
        <h1>{t("Documento listo para firmar — Firmante {n}", { n: v.yo.orden })}</h1>
        <LogoEmpresa v={v} token={token} />
        <div className="notice">
          <strong>{t("Firmante {n}", { n: v.yo.orden })} · {v.yo.nombre}</strong>
          <br />{t("{remitente} te envió este documento. Revísalo y completa los campos marcados.", { remitente: v.documento.remitente + (v.documento.empresa && v.documento.empresa !== v.documento.remitente ? ` (${v.documento.empresa})` : "") })}
          {v.documento.mensaje && <><br /><em>«{v.documento.mensaje}»</em></>}
        </div>
        <h3>{v.documento.nombre}</h3>
        <AvisoPrivacidad />

        {etapa === "inicio" && (
          <>
            <div className="notice">{t(pedirDni ? "Revisa el documento. Después completarás tus datos en un formulario guiado y, al terminar, capturarás tu DNI y firmarás." : "Revisa el documento. Después completarás tus datos en un formulario guiado y, al terminar, firmarás.")}</div>
            <div className="readyBar">
              <button type="button" className="primary" onClick={() => { setEtapa("formulario"); window.scrollTo({ top: 0 }); }}>{t("✍️ Empezar a llenar el documento")}</button>
            </div>
          </>
        )}

        {etapa === "documento" && pedirDni && (
          <section className="dniCaptureSteps">
            <div className="notice dniAviso"><strong>{t("🪪 Firma manuscrita y evidencia del DNI")}</strong><br />
              {t("Captura el frente de tu DNI, fotografía o sube tu firma hecha en papel, captura el reverso y ajusta la huella. Las fotos no validan tu identidad ante RENIEC ni son una firma digital certificada.")}</div>
            <PasoDni n={1} titulo={t("Captura el frente del DNI")} texto={t("Encuadra la tarjeta completa: esta foto va a la hoja de evidencias del PDF.")} listo={dni.frente}>
              <button type="button" className="primary" onClick={() => elegirFoto("frente", true)}>{t("📷 Capturar frente")}</button>
              <button type="button" onClick={() => elegirFoto("frente", false)}>{t("🖼️ Subir frente")}</button>
            </PasoDni>
            {firmaDni && (
              <PasoDni n={2} titulo={t("Sube o toma una foto de tu firma")} texto={t("Firma en una hoja blanca y tómale una foto, o sube una foto de tu firma. Se recorta y se le quita el fondo.")} listo={lleno(firmaDni) ? (valores[firmaDni.id] as string) : undefined} bloqueado={!dni.frente}>
                <button type="button" className="primary" disabled={!dni.frente} onClick={() => abrir(firmaDni)}>{t("✍️ Fotografiar o subir mi firma")}</button>
              </PasoDni>
            )}
            <PasoDni n={firmaDni ? 3 : 2} titulo={t("Captura el reverso del DNI")} texto={t("Encuadra la tarjeta completa; después ajustarás el área de la huella.")} listo={dni.reverso} bloqueado={!dni.frente || (!!firmaDni && !lleno(firmaDni))}>
              <button type="button" className="primary" disabled={!dni.frente || (!!firmaDni && !lleno(firmaDni))} onClick={() => elegirFoto("reverso", true)}>{t("📷 Capturar reverso")}</button>
              <button type="button" disabled={!dni.frente || (!!firmaDni && !lleno(firmaDni))} onClick={() => elegirFoto("reverso", false)}>{t("🖼️ Subir reverso")}</button>
            </PasoDni>
            {huellasDni.length > 0 && (
              <PasoDni n={firmaDni ? 4 : 3} titulo={t("Ajusta la huella del DNI")} texto={t("Encuadra la huella impresa en el reverso: amplía, mueve y gira poco a poco.")} listo={lleno(huellasDni[0]) ? (valores[huellasDni[0].id] as string) : undefined} bloqueado={!dni.reverso}>
                <button type="button" className="primary" disabled={!dni.reverso} onClick={async () => setHuellaDni(await aArchivo(dni.reverso!, "dni-reverso.jpg"))}>{t("🔍 Ajustar huella del reverso")}</button>
              </PasoDni>
            )}
            <input ref={fotoCamara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setEncuadre({ archivo: f, lado: ladoFoto.current }); e.target.value = ""; }} />
            <input ref={fotoSubir} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setEncuadre({ archivo: f, lado: ladoFoto.current }); e.target.value = ""; }} />
          </section>
        )}

        {etapa === "documento" && <><div className="readyBar">
          {v.documento.flujo && datos.length > 0
            ? <button type="button" onClick={() => { setEtapa("formulario"); window.scrollTo({ top: 0 }); }}>{t("✏️ Volver al formulario de datos")}</button>
            : textos.length > 0 && <button type="button" className="primary" onClick={() => abrir(textos.find((c) => !lleno(c)) ?? textos[0])}>{t("✍️ Empezar a llenar mis datos")}</button>}
          {imagenPendiente && (
            <button type="button" className="primary" onClick={() => abrir(imagenPendiente)}>
              {t(tiposPendientes.has("firma") ? "✍️ Listo para firmar" : tiposPendientes.has("sello") ? "🖋️ Listo para sellar" : "👆 Listo para colocar huella")}
            </button>
          )}
        </div>
        <div className="readyBar">
          <button type="button" className="success" onClick={revisar}>{t("✓ Revisar y continuar")}</button>
          {faltantes.length > 0 && <small className="afExtraHint">{t("Faltan {n} campo(s) obligatorio(s).", { n: faltantes.length })}</small>}
        </div></>}

        <NavPaginas actual={pagina} total={v.documento.paginas.length} alCambiar={setPagina} />
        {errorPdf && <div className="afAlerta">{t(errorPdf)}</div>}
        {colocandoLibre && <div className="avisoColocar">{t("👆 Toca el documento donde quieres agregar tu texto.")} <button type="button" className="enlace" onClick={() => setColocandoLibre(false)}>{t("Cancelar")}</button></div>}
        <div className="preview">{vistaPagina(etapa === "documento")}</div>
        {textoLibre && etapa === "documento" && (
          <div className="afExtraTextRow">
            <button type="button" className={colocandoLibre ? "primary" : ""} onClick={() => setColocandoLibre(!colocandoLibre)}>{t("➕ Agregar texto adicional")}</button>
            <p className="afExtraHint">{t("Úsalo solo para agregar algo extra que no tenga un campo en el documento.")}{libres.length ? t(" Agregaste {n}: tócalos para cambiarlos o quitarlos.", { n: libres.length }) : ""}</p>
          </div>
        )}
        <div className="afExtraTextRow">
          <button type="button" className="danger" onClick={() => setRechazando(true)}>{t("✕ No estoy de acuerdo, rechazar")}</button>
        </div>
      </div>

      {editando && (
        <HojaTexto campos={textos} actual={editando} valores={valores} setValores={setValores}
          alMover={(c) => { setEditando(c); irA(c); }} alCerrar={() => setEditando(null)} />
      )}
      {imagenDe && (
        <PantallaFirma
          tipo={imagenDe.tipo as TipoImagen}
          titulo={t("{tipo} — Firmante {n}", { tipo: t(imagenDe.tipo === "firma" ? "Firma manuscrita" : imagenDe.tipo === "sello" ? "Sello" : "Huella"), n: v.yo.orden })}
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
          <div className="afSheetCard" role="dialog" aria-label={t("Rechazar documento")}>
            <div className="afSheetHead"><div className="afSheetTitles"><strong>{t("Rechazar documento")}</strong><small>{t("Quien te lo envió verá este motivo")}</small></div></div>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder={t("Motivo del rechazo")} aria-label={t("Motivo del rechazo")} />
            <div className="afSheetActions">
              <button type="button" onClick={() => setRechazando(false)}>{t("Cancelar")}</button>
              <button type="button" className="danger" onClick={rechazar}>{t("Rechazar")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Un paso de la captura con DNI: su estado y la vista previa de lo ya capturado. */
function PasoDni({ n, titulo, texto, listo, bloqueado = false, children }: { n: number; titulo: string; texto: string; listo?: string; bloqueado?: boolean; children: ReactNode }) {
  const t = usarT();
  return (
    <div className={`dniCaptureStep ${bloqueado ? "bloqueado" : ""}`}>
      <strong>{n}. {titulo}</strong>
      <p>{texto}</p>
      <div className="dniCaptureActions">{children}</div>
      <span aria-live="polite">{t(listo ? "✓ Listo (puedes reemplazarlo)" : bloqueado ? "Primero completa el paso anterior" : "Pendiente")}</span>
      {listo && <img className="dniCapturePreview" src={listo} alt={titulo} />}
    </div>
  );
}

/** Panel inferior para escribir un texto o una fecha, con «Siguiente» entre los campos del firmante. */
function HojaTexto({ campos, actual, valores, setValores, alMover, alCerrar }: {
  campos: Campo[]; actual: Campo; valores: Valores; setValores: (fn: (v: Valores) => Valores) => void; alMover: (c: Campo) => void; alCerrar: () => void;
}) {
  const t = usarT(), nombreCampo = usarNombreCampo();
  const entrada = useRef<HTMLInputElement>(null);
  const i = campos.findIndex((c) => c.id === actual.id);
  const anterior = campos[i - 1], siguiente = campos[i + 1];
  useEffect(() => { entrada.current?.focus({ preventScroll: true }); }, [actual]);
  const valor = typeof valores[actual.id] === "string" ? (valores[actual.id] as string) : "";
  return (
    <div className="afSheet" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="afSheetCard" role="dialog" aria-label={nombreCampo(actual)}>
        <div className="afSheetHead">
          <div className="afSheetTitles">
            <strong>{nombreCampo(actual)}{actual.obligatorio ? " *" : ""}</strong>
            <small>{t("Página {n}", { n: actual.pagina })}</small>
          </div>
          <div className="afSheetNav">
            <button type="button" disabled={!anterior} onClick={() => anterior && alMover(anterior)} aria-label={t("Anterior")}>‹</button>
            <span>{i + 1} / {campos.length}</span>
            <button type="button" disabled={!siguiente} onClick={() => siguiente && alMover(siguiente)} aria-label={t("Siguiente")}>›</button>
          </div>
        </div>
        <input
          ref={entrada} value={valor} type={actual.tipo === "fecha" ? "date" : "text"} maxLength={500} aria-label={nombreCampo(actual)}
          onChange={(e) => { const t = e.target.value; setValores((v) => ({ ...v, [actual.id]: t })); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); siguiente ? alMover(siguiente) : alCerrar(); } }}
        />
        <div className="afSheetActions">
          <button type="button" className="danger" onClick={() => setValores((v) => ({ ...v, [actual.id]: "" }))}>{t("Borrar")}</button>
          {siguiente && <button type="button" className="primary" onClick={() => alMover(siguiente)}>{t("Siguiente")}</button>}
          <button type="button" className="success" onClick={alCerrar}>{t("✓ Listo")}</button>
        </div>
      </div>
    </div>
  );
}
