import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as EventoPuntero } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  COLORES_FIRMANTE, DEDOS, ETIQUETA_TIPO, LIMITES_PLATAFORMA, PREPARADOR, TAMANO_CAMPO, TIPOS_CAMPO, TIPOS_DATO, etiquetaDedo, leerDedo,
  type CampoEditor, type Dedo, type DocumentoDetalle, type FirmanteEditor, type Mano, type TipoCampo,
} from "../../../shared/plataforma";
import { PLANES, type EstadoCuenta } from "../../../shared/planes";
import { ErrorApi, plataforma, urls, type Contacto } from "./api";
import { calcularPdf } from "./calculos";
import { usarSesion } from "./sesion";
import { PaginaPdf, posicion, usarPdf } from "./VisorPdf";

type CampoLocal = CampoEditor & { k: string };
type Arrastre = { k: string; modo: "mover" | "tamano"; px: number; py: number; x: number; y: number; w: number; h: number; escala: number };
const ICONO: Record<TipoCampo, string> = { firma: "✍️", texto: "🔤", fecha: "📅", casilla: "☑️", sello: "🖋️", huella: "👆", calculo: "ƒx" };
/** Rojo de los campos que llena quien prepara el documento (como en el prototipo). */
const COLOR_PREPARADOR = "#dc2626";
let siguienteClave = 1;
const nuevaClave = (p: string) => `${p}n${Date.now().toString(36)}${siguienteClave++}`;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];
const zoomGuardado = () => { try { const z = Number(localStorage.getItem("autograflow_zoom")); return z >= 0.5 && z <= 2.5 ? z : 1; } catch { return 1; } };
const WA_SVG = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="waIcono"><path d="M12 2.2A9.8 9.8 0 0 0 3.6 17l-1.3 4.8 4.9-1.3A9.8 9.8 0 1 0 12 2.2zm5.7 13.9c-.2.7-1.4 1.3-2 1.3-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.8-.1 1.5z" /></svg>;

/**
 * Editor de un documento en borrador (diseño del prototipo v43): panel «Preparar documento» y vista previa con zoom.
 * alCambiarPdf recibe el documento después de quitarle una página (el PDF cambió y el editor se vuelve a armar).
 */
export function Editor({ inicial, alEnviar, alCambiarPdf, avisoInicial = "" }: {
  inicial: DocumentoDetalle; alEnviar: (d: DocumentoDetalle) => void; alCambiarPdf: (d: DocumentoDetalle, aviso: string) => void; avisoInicial?: string;
}) {
  const navegar = useNavigate();
  const { usuario } = usarSesion();
  const detectados = (useLocation().state as { detectados?: number } | null)?.detectados ?? 0;
  const { doc, error: errorPdf } = usarPdf(urls.original(inicial.id));
  const [nombre, setNombre] = useState(inicial.nombre);
  const [orden, setOrden] = useState(inicial.orden);
  const [mensaje, setMensaje] = useState(inicial.mensaje);
  const [bloquearDibujo, setBloquearDibujo] = useState(inicial.bloquearDibujo);
  const [bloquearSello, setBloquearSello] = useState(inicial.bloquearSello);
  const [flujo, setFlujo] = useState(inicial.flujo);
  const [certificado, setCertificado] = useState(inicial.certificado);
  const [firmantes, setFirmantes] = useState<FirmanteEditor[]>(() =>
    inicial.firmantes.map((f) => ({ clave: f.clave, nombre: f.nombre, telefono: f.telefono, email: f.email, pedirDni: f.pedirDni })));
  const [campos, setCampos] = useState<CampoLocal[]>(() => inicial.campos.map((c) => ({ ...c, k: `c${c.id}` })));
  const [pagina, setPagina] = useState(1);
  const [activo, setActivo] = useState(firmantes[0]?.clave ?? "");
  const [herramienta, setHerramienta] = useState<TipoCampo | null>(null);
  // El campo que se va a colocar lo llena quien prepara el documento (no el firmante activo).
  const [paraMi, setParaMi] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<"listo" | "pendiente" | "guardando" | "error">("listo");
  const [aviso, setAviso] = useState(avisoInicial || (detectados
    ? `Se detectaron ${detectados} campos del PDF. Escribe en los recuadros rojos lo que llenas tú, o asígnalos a un firmante en «Campo seleccionado». Las firmas quedaron para el Firmante 1 y los campos ƒx los calcula el PDF.`
    : ""));
  // Resultado de los campos calculados por el PDF (por su nombre en el PDF), con lo escrito hasta ahora.
  const [calculo, setCalculo] = useState<Record<string, string>>({});
  // «Agregar mi firma»: al enviar se abre directamente el enlace de firma de quien prepara el documento.
  const firmarYo = useRef(false);
  const [enviando, setEnviando] = useState(false);
  const [limitePlan, setLimitePlan] = useState(false);
  const [esPlantilla, setEsPlantilla] = useState(inicial.esPlantilla);
  const [estado, setEstado] = useState<EstadoCuenta | null>(null);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [zoom, setZoom] = useState(zoomGuardado);
  const [editandoContacto, setEditandoContacto] = useState(false);
  // Sello y huella pedidos por firmante (se marcan aunque todavía no tengan su campo en el documento).
  const [pide, setPide] = useState<Record<string, { sello: boolean; huella: boolean }>>(() => Object.fromEntries(
    inicial.firmantes.map((f) => [f.clave, { sello: inicial.campos.some((c) => c.firmante === f.clave && c.tipo === "sello"), huella: inicial.campos.some((c) => c.firmante === f.clave && c.tipo === "huella") }])));
  const arrastre = useRef<Arrastre | null>(null);
  const contenedor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    plataforma.cuenta().then((d) => setEstado(d.estado)).catch(() => {});
    plataforma.contactos().then(setContactos).catch(() => {});
  }, []);
  useEffect(() => { try { localStorage.setItem("autograflow_zoom", String(zoom)); } catch { /* sin almacenamiento */ } }, [zoom]);

  const p = inicial.paginas[pagina - 1];
  const maxFirmantes = Math.min(LIMITES_PLATAFORMA.firmantes, estado?.firmantesPorDocumento ?? LIMITES_PLATAFORMA.firmantes);
  const selloPermitido = estado?.selloHuella ?? true;
  const color = useCallback((clave: string) => clave === PREPARADOR ? COLOR_PREPARADOR
    : COLORES_FIRMANTE[Math.max(0, firmantes.findIndex((f) => f.clave === clave)) % COLORES_FIRMANTE.length], [firmantes]);
  const datos = useMemo(() => ({
    nombre: nombre.trim() || "Documento", orden, mensaje, firmantes, bloquearDibujo, bloquearSello, flujo, certificado, campos: campos.map(({ k: _k, ...c }) => c),
  }), [nombre, orden, mensaje, firmantes, campos, bloquearDibujo, bloquearSello, flujo, certificado]);

  // Guardado automático un momento después de cada cambio.
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    setGuardado("pendiente");
    const t = setTimeout(async () => {
      setGuardado("guardando");
      try { await plataforma.guardar(inicial.id, datos); setGuardado("listo"); }
      catch (e) { setGuardado("error"); setAviso((e as Error).message); }
    }, 700);
    return () => clearTimeout(t);
  }, [datos, inicial.id]);

  // Cálculos del PDF con lo que escribe quien prepara (lo de los firmantes aún no existe): se repiten al dejar de escribir.
  const formulario = inicial.formulario;
  const llaveCalculo = useMemo(() => JSON.stringify(campos.filter((c) => c.firmante === PREPARADOR && c.nombrePdf && c.tipo !== "calculo").map((c) => [c.nombrePdf, c.valor ?? null])), [campos]);
  const nombresCalculados = useMemo(() => campos.filter((c) => c.tipo === "calculo" && c.nombrePdf).map((c) => c.nombrePdf), [campos]);
  useEffect(() => {
    if (!formulario || !nombresCalculados.length) return;
    const t = setTimeout(() => {
      calcularPdf(formulario, Object.fromEntries(JSON.parse(llaveCalculo)), nombresCalculados).then(setCalculo).catch(() => setCalculo({}));
    }, 500);
    return () => clearTimeout(t);
  }, [formulario, llaveCalculo, nombresCalculados]);

  const seleccionado = campos.find((c) => c.k === sel) ?? null;
  const cambiarCampo = (k: string, cambio: Partial<CampoLocal>) => setCampos((cs) => cs.map((c) => (c.k === k ? { ...c, ...cambio } : c)));
  const quitarCampo = (k: string) => { setCampos((cs) => cs.filter((c) => c.k !== k)); setSel(null); };

  // Teclado: Supr borra, flechas mueven el campo seleccionado.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!sel || (e.target as HTMLElement).closest("input, textarea, select")) return;
      const d = e.shiftKey ? 10 : 1;
      const mov: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); quitarCampo(sel); }
      else if (mov[e.key]) {
        e.preventDefault();
        setCampos((cs) => cs.map((c) => (c.k === sel ? { ...c, x: Math.max(0, c.x + mov[e.key][0]), y: Math.max(0, c.y + mov[e.key][1]) } : c)));
      } else if (e.key === "Escape") { setSel(null); setHerramienta(null); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [sel]);

  const dedoDe = (clave: string) => leerDedo(campos.find((c) => c.firmante === clave && c.tipo === "huella")?.etiqueta ?? "") ?? { mano: "derecha" as Mano, dedo: "indice" as Dedo };

  function colocar(punto: { x: number; y: number }) {
    if (!herramienta) { setSel(null); return; }
    const mio = paraMi && TIPOS_DATO.includes(herramienta);
    if (!activo && !mio) { setAviso("Primero agrega un firmante."); return; }
    if (campos.length >= LIMITES_PLATAFORMA.campos) { setAviso("Llegaste al máximo de campos."); return; }
    const t = TAMANO_CAMPO[herramienta];
    const nuevo: CampoLocal = {
      k: nuevaClave("c"), firmante: mio ? PREPARADOR : activo, tipo: herramienta, pagina, obligatorio: !mio && herramienta !== "casilla",
      etiqueta: herramienta === "huella" ? etiquetaDedo(dedoDe(activo).mano, dedoDe(activo).dedo) : "", nombrePdf: "",
      w: t.w, h: t.h, x: Math.min(Math.max(0, punto.x - t.w / 2), p.ancho - t.w), y: Math.min(Math.max(0, punto.y - t.h / 2), p.alto - t.h),
    };
    setCampos((cs) => [...cs, nuevo]);
    setSel(nuevo.k);
    setHerramienta(null);
    setParaMi(false);
  }

  function empezarArrastre(e: EventoPuntero<HTMLElement>, c: CampoLocal, modo: Arrastre["modo"]) {
    e.stopPropagation();
    e.preventDefault();
    setSel(c.k);
    const r = contenedor.current!.getBoundingClientRect();
    arrastre.current = { k: c.k, modo, px: e.clientX, py: e.clientY, x: c.x, y: c.y, w: c.w, h: c.h, escala: p.ancho / r.width };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function moverArrastre(e: EventoPuntero<HTMLElement>) {
    const a = arrastre.current;
    if (!a) return;
    const dx = (e.clientX - a.px) * a.escala, dy = (e.clientY - a.py) * a.escala;
    if (a.modo === "mover")
      cambiarCampo(a.k, { x: Math.min(Math.max(0, a.x + dx), p.ancho - a.w), y: Math.min(Math.max(0, a.y + dy), p.alto - a.h) });
    else
      cambiarCampo(a.k, { w: Math.min(Math.max(10, a.w + dx), p.ancho - a.x), h: Math.min(Math.max(8, a.h + dy), p.alto - a.y) });
  }
  const terminarArrastre = () => { arrastre.current = null; };

  // ------------------------------------------------ firmantes
  function cantidad(valor: number) {
    const n = Math.min(Math.max(1, Math.round(valor) || 1), LIMITES_PLATAFORMA.firmantes);
    if (n > maxFirmantes) {
      setLimitePlan(true);
      setAviso(estado?.invitado ? `Sin cuenta puedes usar 1 solo firmante. Crea tu cuenta gratis para usar hasta ${PLANES.gratis.firmantesPorDocumento} firmantes, o adquiere un plan para más.`
        : `Tu plan permite hasta ${maxFirmantes} firmante${maxFirmantes === 1 ? "" : "s"} por documento. Elige un plan para agregar más.`);
    }
    const final = Math.min(n, maxFirmantes);
    if (final > firmantes.length) {
      const nuevos = Array.from({ length: final - firmantes.length }, (_, i) => ({ clave: nuevaClave("f"), nombre: `Firmante ${firmantes.length + i + 1}`, telefono: "", email: "", pedirDni: false }));
      setFirmantes((fs) => [...fs, ...nuevos]);
      setActivo(nuevos[0].clave);
    } else if (final < firmantes.length) {
      const sobran = firmantes.slice(final), conCampos = campos.filter((c) => sobran.some((f) => f.clave === c.firmante)).length;
      if (conCampos && !confirm(`Se quitarán ${sobran.length} firmante(s) y sus ${conCampos} campo(s). ¿Continuar?`)) return;
      setFirmantes((fs) => fs.slice(0, final));
      setCampos((cs) => cs.filter((c) => !sobran.some((f) => f.clave === c.firmante)));
      if (sobran.some((f) => f.clave === activo)) setActivo(firmantes[final - 1].clave);
    }
  }
  const moverFirmante = (d: -1 | 1) => setFirmantes((fs) => {
    const i = fs.findIndex((f) => f.clave === activo), j = i + d;
    if (i < 0 || j < 0 || j >= fs.length) return fs;
    const copia = [...fs];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  });
  const borrarTipo = (tipo: TipoCampo) => { setCampos((cs) => cs.filter((c) => !(c.firmante === activo && c.tipo === tipo))); setSel(null); };
  function pedir(tipo: "sello" | "huella", valor: boolean) {
    if (valor && !selloPermitido) {
      setLimitePlan(true);
      setAviso("El sello y la huella están disponibles en los planes de pago. La versión gratuita permite solo firmas.");
      return;
    }
    if (!valor && campos.some((c) => c.firmante === activo && c.tipo === tipo) && !confirm(`¿Quitar los campos de ${tipo} de este firmante?`)) return;
    setPide((x) => ({ ...x, [activo]: { ...(x[activo] ?? { sello: false, huella: false }), [tipo]: valor } }));
    if (valor) setHerramienta(tipo);
    else borrarTipo(tipo);
  }
  /** Firma y huella con DNI: el firmante fotografía el frente, su firma en papel y el reverso (de ahí sale la huella). */
  function pedirDni(valor: boolean) {
    if (valor && !selloPermitido) {
      setLimitePlan(true);
      setAviso("La firma y huella con DNI está disponible en los planes de pago. La versión gratuita permite solo firmas.");
      return;
    }
    setFirmantes((fs) => fs.map((f) => (f.clave === activo ? { ...f, pedirDni: valor } : f)));
    if (!valor) return setAviso("La captura del DNI ya no será obligatoria para este firmante.");
    // La firma tiene que ser real (foto) y la huella sale del reverso del DNI.
    setBloquearDibujo(true);
    setPide((x) => ({ ...x, [activo]: { ...(x[activo] ?? { sello: false, huella: false }), huella: true } }));
    const falta = !camposDe(activo, "firma") ? "firma" : !camposDe(activo, "huella") ? "huella" : null;
    setHerramienta(falta);
    setAviso(`Marca un espacio para la firma y otro para la huella${falta ? ` (ahora: ${ETIQUETA_TIPO[falta].toLowerCase()})` : ""}. El firmante capturará el frente de su DNI, su firma en papel y el reverso, y ajustará la huella.`);
  }

  /** «Agregar mi firma»: el firmante activo pasa a ser quien prepara el documento y, al enviar, firma en ese momento. */
  function agregarMiFirma() {
    if (!usuario || !fActivo) return;
    const ya = firmantes.find((f) => f.email && f.email.toLowerCase() === usuario.email.toLowerCase());
    const clave = ya?.clave ?? activo;
    if (!ya) {
      const tieneDatos = !/^Firmante \d+$/.test(fActivo.nombre) || fActivo.email || fActivo.telefono;
      if (tieneDatos && !confirm(`¿El Firmante ${iActivo + 1} eres tú? Se reemplazarán su nombre y su correo por los tuyos.`)) return;
      setFirmantes((fs) => fs.map((f) => (f.clave === clave ? { ...f, nombre: usuario.nombre, email: usuario.email } : f)));
    }
    setActivo(clave);
    firmarYo.current = true;
    const n = firmantes.findIndex((f) => f.clave === clave) + 1;
    if (!camposDe(clave, "firma")) setHerramienta("firma");
    setAviso(`El Firmante ${n} eres tú. ${camposDe(clave, "firma") ? "" : "Toca el documento donde va tu firma. "}Al pulsar «Guardar y enviar» se abrirá el documento para que firmes${orden === "secuencial" && n > 1 ? " cuando te toque" : ""}.`);
  }

  async function quitarPagina() {
    const total = inicial.paginas.length, enEsa = campos.filter((c) => c.pagina === pagina).length;
    if (total <= 1) return;
    if (!confirm(`¿Quitar la página ${pagina} de ${total}? No se enviará a los firmantes${enEsa ? ` y se borrarán sus ${enEsa} campo(s)` : ""}. El archivo que subiste no cambia.`)) return;
    try {
      await plataforma.guardar(inicial.id, datos);
      alCambiarPdf(await plataforma.eliminarPagina(inicial.id, pagina), `Se quitó la página ${pagina}. El documento ahora tiene ${total - 1} página(s).`);
    } catch (e) {
      setAviso(e instanceof ErrorApi ? e.message : "No se pudo quitar la página.");
    }
  }

  function cambiarDedo(cambio: Partial<{ mano: Mano; dedo: Dedo }>) {
    const d = { ...dedoDe(activo), ...cambio };
    setCampos((cs) => cs.map((c) => (c.firmante === activo && c.tipo === "huella" ? { ...c, etiqueta: etiquetaDedo(d.mano, d.dedo) } : c)));
    if (!campos.some((c) => c.firmante === activo && c.tipo === "huella")) setAviso(`Huella pedida: ${etiquetaDedo(d.mano, d.dedo)}. Ahora toca el documento donde va.`);
  }

  async function enviar() {
    const problemas: string[] = [];
    if (!firmantes.length) problemas.push("Agrega al menos un firmante.");
    for (const [i, f] of firmantes.entries()) {
      if (f.nombre.trim().length < 2) problemas.push(`El Firmante ${i + 1} no tiene nombre.`);
      if (!campos.some((c) => c.firmante === f.clave)) problemas.push(`El Firmante ${i + 1} (${f.nombre}) no tiene ningún campo: agrega su firma, sello o huella.`);
      if (pide[f.clave]?.sello && !campos.some((c) => c.firmante === f.clave && c.tipo === "sello")) problemas.push(`Marca dónde va el sello del Firmante ${i + 1}.`);
      if (pide[f.clave]?.huella && !campos.some((c) => c.firmante === f.clave && c.tipo === "huella")) problemas.push(`Marca dónde va la huella del Firmante ${i + 1}.`);
      if (f.pedirDni && !campos.some((c) => c.firmante === f.clave && c.tipo === "firma")) problemas.push(`Marca dónde va la firma del Firmante ${i + 1} (se tomará con su DNI).`);
    }
    if (problemas.length) { setAviso(problemas.join(" ")); setLimitePlan(false); return; }
    const sinFirma = firmantes.filter((f) => !campos.some((c) => c.firmante === f.clave && c.tipo === "firma"));
    if (sinFirma.length && !confirm(`Falta configurar la firma de: ${sinFirma.map((f) => f.nombre).join(", ")}. Solo deberán completar sus otros campos. ¿Continuar?`)) return;
    if (!confirm(`¿Enviar «${datos.nombre}» a firmar a ${firmantes.length} persona${firmantes.length === 1 ? "" : "s"}? Después ya no podrás cambiar los campos.`)) return;
    setEnviando(true);
    try {
      await plataforma.guardar(inicial.id, datos);
      const det = await plataforma.enviar(inicial.id);
      const yo = usuario && det.firmantes.find((f) => f.email.toLowerCase() === usuario.email.toLowerCase());
      // Con «Agregar mi firma» se abre la firma de inmediato si ya es tu turno (si no, queda en el seguimiento).
      if (firmarYo.current && yo?.token && (det.orden === "paralelo" || yo.orden === 1)) navegar(`/f/${yo.token}`);
      else alEnviar(det);
    } catch (e) {
      setAviso(e instanceof ErrorApi ? e.message : "No se pudo enviar.");
      setLimitePlan(e instanceof ErrorApi && e.status === 402);
    } finally {
      setEnviando(false);
    }
  }

  async function eliminar() {
    if (!confirm("¿Eliminar este borrador? No se puede deshacer.")) return;
    await plataforma.eliminar(inicial.id);
    navegar("/app");
  }

  const iActivo = Math.max(0, firmantes.findIndex((f) => f.clave === activo));
  const fActivo = firmantes[iActivo];
  const camposDe = (clave: string, tipo?: TipoCampo) => campos.filter((c) => c.firmante === clave && (!tipo || c.tipo === tipo)).length;
  const nombreDe = (clave: string) => firmantes.find((f) => f.clave === clave)?.nombre || "Sin firmante";
  const listo = (f: FirmanteEditor) => camposDe(f.clave) > 0 && (!pide[f.clave]?.sello || camposDe(f.clave, "sello") > 0) && (!pide[f.clave]?.huella || camposDe(f.clave, "huella") > 0);
  const conWhatsApp = firmantes.some((f) => f.telefono.trim());
  const d = fActivo ? dedoDe(fActivo.clave) : null;
  const herramientaBoton = (t: TipoCampo, texto: string, clase = "", mio = false) => {
    const activa = herramienta === t && paraMi === mio;
    return <button type="button" className={`${clase} ${activa ? "activa" : ""}`} onClick={() => { setHerramienta(activa ? null : t); setParaMi(mio); }} disabled={!mio && !fActivo}>{texto}</button>;
  };
  const camposMios = campos.filter((c) => c.firmante === PREPARADOR && c.tipo !== "calculo");
  const camposCalculo = campos.filter((c) => c.tipo === "calculo");
  const llenaCampo = (c: CampoLocal) => c.firmante === PREPARADOR && TIPOS_DATO.includes(c.tipo);
  const destino = paraMi ? "que llenas tú" : `del Firmante ${iActivo + 1}`;

  return (
    <div className="grid editorGrid">
      <section className="card prepPanel">
        <h1>Preparar documento</h1>
        <p>Configura el PDF y los campos que necesitará cada participante para firmar, sellar o colocar su huella.</p>

        <div className="step">
          <div className="stepTitle"><span className="stepNumber">1</span>Aplica nombre al documento</div>
          <input className="tituloDoc" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del documento" maxLength={160} />
          <span className={`estadoGuardado ${guardado}`}>
            {guardado === "guardando" ? "Guardando…" : guardado === "pendiente" ? "Cambios sin guardar" : guardado === "error" ? "No se pudo guardar" : "✓ Guardado automáticamente"}
          </span>
        </div>

        <div className="step">
          <div className="stepTitle"><span className="stepNumber">2</span>Cantidad de firmantes</div>
          <div className="participantSetup">
            <div className="participantCountRow">
              <label htmlFor="cantidadFirmantes">Personas que deben firmar</label>
              <input id="cantidadFirmantes" type="number" min={1} max={maxFirmantes} value={firmantes.length} inputMode="numeric" onChange={(e) => cantidad(Number(e.target.value))} />
              <span>{estado?.invitado ? "1 (sin cuenta)" : maxFirmantes < LIMITES_PLATAFORMA.firmantes ? `de 1 a ${maxFirmantes} (Gratis)` : `de 1 a ${maxFirmantes}`}</span>
            </div>
            <p className="small">Usa 1 para un solo firmante o aumenta el número para agregar participantes en orden.</p>
            {maxFirmantes < LIMITES_PLATAFORMA.firmantes && (
              estado?.invitado ? (
                <div className="signerLimitNote"><span>Sin cuenta puedes usar 1 solo firmante (solo firma). Crea tu cuenta gratis para usar hasta {PLANES.gratis.firmantesPorDocumento} firmantes, o adquiere un plan para más.</span> <Link className="boton primary botonChico" to="/registro">Crear cuenta</Link></div>
              ) : (
                <div className="signerLimitNote"><span>El plan Gratis permite hasta {maxFirmantes} firmantes (solo firma). Para más firmantes, sellos y huellas, adquiere un plan.</span> <Link className="boton primary botonChico" to="/planes">Ver planes</Link></div>
              )
            )}
            <label htmlFor="participanteActivo" className="participantSelectLabel">Configurar participante</label>
            <select id="participanteActivo" value={activo} onChange={(e) => { setActivo(e.target.value); setHerramienta(null); }}>
              {firmantes.map((f, i) => <option key={f.clave} value={f.clave}>Firmante {i + 1}{f.nombre && !/^Firmante \d+$/.test(f.nombre) ? ` · ${f.nombre}` : ""}{listo(f) ? " · ✓" : ""}</option>)}
            </select>
            {fActivo && (
              <>
                <div className="activeParticipantTitle" style={{ "--c": color(fActivo.clave) } as CSSProperties}><span className="punto" /> Firmante {iActivo + 1} · {fActivo.nombre}</div>
                <div className="participantProgress">
                  {camposDe(fActivo.clave) ? `${camposDe(fActivo.clave)} campo(s) configurado(s)` : "Aún no configurado"}
                  {(fActivo.telefono || fActivo.email) && ` · ${[fActivo.telefono, fActivo.email].filter(Boolean).join(" · ")}`}
                </div>
                <div className="filaBotones">
                  <button type="button" className="crece" onClick={() => setEditandoContacto(true)}>✉️ Apodo y envío para el Firmante {iActivo + 1}</button>
                  {firmantes.length > 1 && <>
                    <button type="button" title="Firma antes" disabled={iActivo === 0} onClick={() => moverFirmante(-1)}>↑</button>
                    <button type="button" title="Firma después" disabled={iActivo === firmantes.length - 1} onClick={() => moverFirmante(1)}>↓</button>
                  </>}
                </div>

                <div className="participantFieldsHeading">Delimite los campos:</div>
                <div className="participantTools">
                  <div className="participantTool">
                    <div className="participantToolHead"><strong>Firma</strong><small>{camposDe(fActivo.clave, "firma") || ""}</small></div>
                    <div className="participantToolActions">
                      {herramientaBoton("firma", "✍️ Marcar firma", "placeFirma")}
                      <button type="button" className="danger" disabled={!camposDe(fActivo.clave, "firma")} onClick={() => borrarTipo("firma")}>Borrar</button>
                    </div>
                  </div>
                  <div className="participantTool">
                    <label className="checkrow"><input type="checkbox" checked={!!pide[activo]?.sello} onChange={(e) => pedir("sello", e.target.checked)} /><strong>Solicitar sello</strong>{!selloPermitido && <span className="afPaidBadge">🔒 Plan de pago</span>}</label>
                    {pide[activo]?.sello && (
                      <div className="participantToolActions">
                        {herramientaBoton("sello", "📍 Marcar sello", "placeCian")}
                        <button type="button" className="danger" disabled={!camposDe(fActivo.clave, "sello")} onClick={() => borrarTipo("sello")}>Borrar</button>
                      </div>
                    )}
                  </div>
                  <div className="participantTool">
                    <label className="checkrow"><input type="checkbox" checked={!!pide[activo]?.huella} onChange={(e) => pedir("huella", e.target.checked)} /><strong>Solicitar huella</strong>{!selloPermitido && <span className="afPaidBadge">🔒 Plan de pago</span>}</label>
                    {pide[activo]?.huella && d && (
                      <>
                        <div className="fpFingerFields">
                          <select aria-label="Mano" value={d.mano} onChange={(e) => cambiarDedo({ mano: e.target.value as Mano })}><option value="derecha">Mano derecha</option><option value="izquierda">Mano izquierda</option></select>
                          <select aria-label="Dedo" value={d.dedo} onChange={(e) => cambiarDedo({ dedo: e.target.value as Dedo })}>{Object.entries(DEDOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                        </div>
                        <div className="participantToolActions">
                          {herramientaBoton("huella", "📍 Marcar huella", "placeCian")}
                          <button type="button" className="danger" disabled={!camposDe(fActivo.clave, "huella")} onClick={() => borrarTipo("huella")}>Borrar</button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="participantTool">
                    <label className="checkrow"><input type="checkbox" checked={!!fActivo.pedirDni} onChange={(e) => pedirDni(e.target.checked)} />
                      <div><strong>🪪 Requerir firma y huella capturando DNI</strong>{!selloPermitido && <span className="afPaidBadge">🔒 Plan de pago</span>}
                        <div className="small">Fotografía el frente del DNI, su firma en papel y el reverso; la huella se ajusta desde el reverso. Las fotos van a la hoja de evidencias del PDF. No valida identidad ante RENIEC.</div></div></label>
                  </div>
                  <div className="participantTool">
                    <div className="participantToolHead"><strong>Texto del firmante</strong></div>
                    <div className="participantToolActions">
                      {herramientaBoton("texto", "🔤 Texto")}
                      {herramientaBoton("fecha", "📅 Fecha")}
                      {herramientaBoton("casilla", "☑️ Casilla")}
                    </div>
                  </div>
                  <button type="button" className="danger participantClearAll" disabled={!campos.length} onClick={() => {
                    if (confirm("¿Borrar las posiciones de firma, sello, huella y texto de todos los firmantes?")) { setCampos([]); setSel(null); }
                  }}>Limpiar todos los campos</button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="step">
          <div className="stepTitle"><span className="stepNumber">✎</span>Datos que llenas tú</div>
          <p className="small">Escribe directamente en los recuadros rojos del documento (en las casillas, tócalas para marcarlas). Lo que escribas queda impreso al enviarlo y los firmantes no pueden cambiarlo.
            {camposCalculo.length > 0 && <> Los {camposCalculo.length} campos <b>ƒx</b> los calcula el propio PDF con lo que se llene.</>}</p>
          <div className="participantToolActions">
            {herramientaBoton("texto", "🔤 Agregar texto", "", true)}
            {herramientaBoton("fecha", "📅 Fecha", "", true)}
            {herramientaBoton("casilla", "☑️ Casilla", "", true)}
          </div>
          {camposMios.length > 0 && <small className="participantProgress">{camposMios.filter((c) => c.valor === true || (typeof c.valor === "string" && c.valor.trim())).length} de {camposMios.length} llenados</small>}
        </div>

        {seleccionado && (
          <div className="participantTool panelCampo">
            <div className="participantToolHead"><strong>{ICONO[seleccionado.tipo]} Campo seleccionado</strong><button type="button" className="botonChico" onClick={() => setSel(null)}>✕</button></div>
            <label className="field"><span className="fieldLabel">Tipo</span>
              {seleccionado.tipo === "calculo" ? <span className="small">ƒx Calculado por el PDF{seleccionado.nombrePdf ? ` («${seleccionado.nombrePdf}»)` : ""}</span> : (
                <select value={seleccionado.tipo} onChange={(e) => {
                  const tipo = e.target.value as TipoCampo;
                  // La firma, el sello y la huella siempre son de un firmante.
                  cambiarCampo(seleccionado.k, seleccionado.firmante === PREPARADOR && !TIPOS_DATO.includes(tipo) ? { tipo, firmante: activo, valor: null, obligatorio: true } : { tipo, valor: null });
                }}>
                  {TIPOS_CAMPO.filter((t) => t !== "calculo").map((t) => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
                </select>
              )}
            </label>
            {seleccionado.tipo !== "calculo" && (
              <label className="field"><span className="fieldLabel">Lo llena</span>
                <select value={seleccionado.firmante} onChange={(e) => {
                  const mio = e.target.value === PREPARADOR;
                  cambiarCampo(seleccionado.k, { firmante: e.target.value, valor: null, obligatorio: !mio && seleccionado.tipo !== "casilla" });
                }}>
                  {TIPOS_DATO.includes(seleccionado.tipo) && <option value={PREPARADOR}>Yo (lo lleno ahora)</option>}
                  {firmantes.map((f, i) => <option key={f.clave} value={f.clave}>Firmante {i + 1} · {f.nombre}</option>)}
                </select>
              </label>
            )}
            {llenaCampo(seleccionado) && seleccionado.tipo !== "casilla" && (
              <label className="field"><span className="fieldLabel">Valor</span>
                <input type={seleccionado.tipo === "fecha" ? "date" : "text"} maxLength={500} value={typeof seleccionado.valor === "string" ? seleccionado.valor : ""}
                  onChange={(e) => cambiarCampo(seleccionado.k, { valor: e.target.value })} />
              </label>
            )}
            <label className="field"><span className="fieldLabel">Nombre del campo{llenaCampo(seleccionado) ? "" : " (lo que verá el firmante)"}</span>
              <input value={seleccionado.etiqueta} maxLength={120} placeholder={`Ej. ${seleccionado.tipo === "texto" ? "DNI" : ETIQUETA_TIPO[seleccionado.tipo]}`} onChange={(e) => cambiarCampo(seleccionado.k, { etiqueta: e.target.value })} />
            </label>
            {seleccionado.firmante !== PREPARADOR && (
              <label className="checkrow">
                <input type="checkbox" checked={seleccionado.obligatorio} onChange={(e) => cambiarCampo(seleccionado.k, { obligatorio: e.target.checked })} />
                <strong>{seleccionado.tipo === "casilla" ? "Debe marcarla" : "Obligatorio"}</strong>
              </label>
            )}
            <div className="participantToolActions">
              <button type="button" onClick={() => {
                const copia = { ...seleccionado, k: nuevaClave("c"), y: Math.min(seleccionado.y + seleccionado.h + 6, p.alto - seleccionado.h) };
                setCampos((cs) => [...cs, copia]);
                setSel(copia.k);
              }}>Duplicar</button>
              <button type="button" className="danger" onClick={() => quitarCampo(seleccionado.k)}>Eliminar campo</button>
            </div>
          </div>
        )}

        <div className="step">
          <div className="stepTitle"><span className="stepNumber">3</span>Orden y mensaje</div>
          <label className="checkrow"><input type="radio" name="orden" checked={orden === "secuencial"} onChange={() => setOrden("secuencial")} /><div><strong>En orden</strong><div className="small">Cada firmante recibe su enlace cuando firma el anterior.</div></div></label>
          <label className="checkrow"><input type="radio" name="orden" checked={orden === "paralelo"} onChange={() => setOrden("paralelo")} /><div><strong>Todos a la vez</strong><div className="small">Todos pueden firmar desde que se envía.</div></div></label>
          <textarea className="mensajeDoc" value={mensaje} maxLength={500} rows={2} onChange={(e) => setMensaje(e.target.value)} placeholder="Mensaje para los firmantes (opcional). Ej. Por favor firma antes del viernes." aria-label="Mensaje para los firmantes" />
          <label className="checkrow"><input type="checkbox" checked={flujo} onChange={(e) => setFlujo(e.target.checked)} />
            <div><strong>✨ Convertir en Flujo</strong><div className="small">El firmante verá primero un formulario guiado con los campos de texto, fecha y casillas que le asignaste, y después firmará.</div></div></label>
        </div>

        <div className="privNote">🔒 <strong>Tus documentos y firmas se guardan de forma privada.</strong> Solo los ven tú y las personas a las que envíes su enlace.</div>

        <div className="step">
          <div className="stepTitle"><span className="stepNumber">4</span>Guardar configuración</div>
          <div className="actions">
            {esPlantilla ? (
              <button type="button" className="success" onClick={async () => { await plataforma.guardar(inicial.id, datos); navegar(`/app/d/${(await plataforma.duplicar(inicial.id)).id}`); }}>📋 Usar esta plantilla</button>
            ) : (
              <button type="button" className={conWhatsApp ? "green" : "primary"} disabled={enviando} onClick={enviar}>
                {conWhatsApp && WA_SVG}{enviando ? "Enviando…" : conWhatsApp ? "Guardar y enviar" : "💾 Guardar y enviar"}
              </button>
            )}
            {!esPlantilla && usuario && <button type="button" onClick={agregarMiFirma} disabled={!fActivo}>✍️ Agregar mi firma</button>}
            <button type="button" onClick={async () => {
              await plataforma.plantilla(inicial.id, !esPlantilla);
              setEsPlantilla(!esPlantilla);
              setAviso(!esPlantilla ? "Guardado como plantilla: aparecerá en «Plantillas» para usarlo cuantas veces quieras." : "Ya no es una plantilla.");
            }}>{esPlantilla ? "Quitar de plantillas" : "📋 Guardar como plantilla"}</button>
            <button type="button" className="danger" onClick={eliminar}>Eliminar borrador</button>
          </div>
          <p className="small">Al enviar, cada firmante recibe su enlace por WhatsApp o correo. Puedes seguir el avance y descargar el PDF firmado con su certificado.</p>
        </div>

        <div className="field">
          <span className="fieldLabel">Estado</span>
          <div className={`status ${limitePlan ? "error" : ""}`} role="status">
            {aviso || (herramienta ? `Toca el documento donde va el campo «${ETIQUETA_TIPO[herramienta]}» ${destino}.` : `${inicial.paginas.length} página(s) · ${campos.length} campo(s) · ${firmantes.length} firmante(s).`)}
            {limitePlan && <> <Link className="boton primary botonChico" to="/planes">Ver planes</Link></>}
            {aviso && <> <button type="button" className="enlace" onClick={() => { setAviso(""); setLimitePlan(false); }}>Cerrar</button></>}
          </div>
        </div>
      </section>

      <section className="card previewCard">
        <div className="previewHead">
          <h2>Vista previa</h2>
          <div className="previewZoomBar" role="group" aria-label="Zoom">
            <button type="button" title="Alejar" onClick={() => setZoom([...ZOOMS].reverse().find((z) => z < zoom - 0.001) ?? 0.5)}>−</button>
            <span className="zoomVal">{Math.round(zoom * 100)}%</span>
            <button type="button" title="Acercar" onClick={() => setZoom(ZOOMS.find((z) => z > zoom + 0.001) ?? 2.5)}>+</button>
            <button type="button" title="Ajustar al ancho disponible" onClick={() => setZoom(1)}>↔ Ajustar</button>
          </div>
        </div>
        <div className="afSecurityRow">
          <label className="checkrow"><input type="checkbox" checked={bloquearDibujo} onChange={(e) => setBloquearDibujo(e.target.checked)} />
            <div><strong>🔒 Bloquear firma con el dedo o en pantalla</strong><div className="small">El firmante deberá fotografiar o subir su firma hecha en papel.</div></div></label>
          <label className="checkrow"><input type="checkbox" checked={bloquearSello} onChange={(e) => setBloquearSello(e.target.checked)} />
            <div><strong>🔒 Bloquear confección del sello</strong><div className="small">El firmante deberá fotografiar o subir su sello real.</div></div></label>
          <label className="checkrow"><input type="checkbox" checked={certificado} onChange={(e) => setCertificado(e.target.checked)} />
            <div><strong>📜 Generar certificado de evidencias</strong><div className="small">Añade al PDF una hoja por firmante con la cronología de su firma, sello y huella, sus imágenes y su ubicación si la autoriza.</div></div></label>
        </div>
        {inicial.paginas.length > 1 && (
          <div className="pdfPageNav">
            <button type="button" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => { setPagina(pagina - 1); setSel(null); }}>←</button>
            <label htmlFor="numPagina">Página</label>
            <input id="numPagina" type="number" min={1} max={inicial.paginas.length} value={pagina} onChange={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= inicial.paginas.length) { setPagina(n); setSel(null); } }} />
            <span>/</span><strong>{inicial.paginas.length}</strong>
            <button type="button" aria-label="Página siguiente" disabled={pagina >= inicial.paginas.length} onClick={() => { setPagina(pagina + 1); setSel(null); }}>→</button>
            <button type="button" className="danger" title="Quitar esta página del documento que se enviará" onClick={quitarPagina}>🗑️ Eliminar esta página</button>
          </div>
        )}
        {herramienta && <div className="avisoColocar">👆 Toca el documento donde va el campo «{ETIQUETA_TIPO[herramienta]}» {destino}. <button type="button" className="enlace" onClick={() => setHerramienta(null)}>Cancelar</button></div>}
        {errorPdf && <div className="afAlerta">{errorPdf}</div>}
        <div className="preview">
          <div className="zoomCaja" style={{ width: `calc(min(100%, 1000px) * ${zoom})` }}>
            <PaginaPdf doc={doc} numero={pagina} pagina={p} alTocar={colocar} cursor={herramienta ? "crosshair" : undefined} refContenedor={(el) => { contenedor.current = el; }}>
              {campos.filter((c) => c.pagina === pagina).map((c) => {
                const mio = llenaCampo(c), lleno = c.valor === true || (typeof c.valor === "string" && c.valor.trim() !== "");
                const quien = c.tipo === "calculo" ? "lo calcula el PDF" : c.firmante === PREPARADOR ? "lo llenas tú" : nombreDe(c.firmante);
                return (
                <div
                  key={c.k} role="button" tabIndex={0}
                  className={`campoEditor tipo-${c.tipo} ${sel === c.k ? "sel" : ""} ${c.firmante !== activo && c.firmante !== PREPARADOR ? "otroFirmante" : ""} ${mio ? "preparador" : ""} ${mio && lleno ? "lleno" : ""}`}
                  style={{ ...posicion(c, p), "--c": color(c.firmante) } as CSSProperties}
                  onPointerDown={(e) => {
                    // Las casillas que llenas tú se marcan con un toque (como en el prototipo).
                    if (mio && c.tipo === "casilla") { e.stopPropagation(); setSel(c.k); cambiarCampo(c.k, { valor: !(c.valor === true) }); return; }
                    empezarArrastre(e, c, "mover");
                  }}
                  onPointerMove={moverArrastre} onPointerUp={terminarArrastre} onPointerCancel={terminarArrastre}
                  title={`${c.etiqueta || ETIQUETA_TIPO[c.tipo]} — ${quien}`}
                >
                  {/* Como el prototipo: los datos (texto, fecha, casilla) son solo un recuadro; su nombre está en el título y en «Campo seleccionado».
                      Los que llenas tú se escriben aquí mismo; los ƒx muestran el resultado del cálculo del PDF. */}
                  {mio && c.tipo !== "casilla" && (
                    <input className="campoEntrada" type={c.tipo === "fecha" ? "date" : "text"} maxLength={500} aria-label={c.etiqueta || ETIQUETA_TIPO[c.tipo]}
                      value={typeof c.valor === "string" ? c.valor : ""} onPointerDown={(e) => e.stopPropagation()} onFocus={() => setSel(c.k)}
                      onChange={(e) => cambiarCampo(c.k, { valor: e.target.value })} />
                  )}
                  {mio && c.tipo === "casilla" && c.valor === true && <span className="marcaCasilla">✓</span>}
                  {c.tipo === "calculo" && <span className="campoCalculo">ƒx {calculo[c.nombrePdf] ?? ""}</span>}
                  {!TIPOS_DATO.includes(c.tipo) && c.tipo !== "calculo" && <span className="campoEditorTexto">{`${ICONO[c.tipo]} ${c.etiqueta || ETIQUETA_TIPO[c.tipo]}`}</span>}
                  {sel === c.k && (
                    <span className="asaTamano" onPointerDown={(e) => empezarArrastre(e, c, "tamano")} onPointerMove={moverArrastre} onPointerUp={terminarArrastre} aria-label="Cambiar tamaño" />
                  )}
                </div>
                );
              })}
            </PaginaPdf>
          </div>
        </div>
        <div className="legend">
          {camposMios.length > 0 && <span><i className="dot" style={{ background: COLOR_PREPARADOR }} /> Lo llenas tú</span>}
          {firmantes.map((f, i) => <span key={f.clave}><i className="dot" style={{ background: color(f.clave) }} /> Firmante {i + 1}</span>)}
          {camposCalculo.length > 0 && <span><i className="dot" style={{ background: "#0e9f6e" }} /> ƒx Calculado por el PDF</span>}
        </div>
        <p className="small">Arrastra un campo para moverlo y usa la esquina para cambiar su tamaño. Con el teclado: flechas para mover, Supr para borrar.</p>
      </section>

      {editandoContacto && fActivo && (
        <EditorContacto
          numero={iActivo + 1} firmante={fActivo} contactos={contactos}
          alGuardar={(c) => { setFirmantes((fs) => fs.map((f) => (f.clave === fActivo.clave ? { ...f, ...c } : f))); setEditandoContacto(false); }}
          alCerrar={() => setEditandoContacto(false)}
        />
      )}
    </div>
  );
}

/** «Apodo y envío»: nombre, WhatsApp y correo del firmante; al escribir un nombre del Directorio se completan sus datos. */
function EditorContacto({ numero, firmante, contactos, alGuardar, alCerrar }: {
  numero: number; firmante: FirmanteEditor; contactos: Contacto[];
  alGuardar: (c: Pick<FirmanteEditor, "nombre" | "telefono" | "email">) => void; alCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(/^Firmante \d+$/.test(firmante.nombre) ? "" : firmante.nombre);
  const [telefono, setTelefono] = useState(firmante.telefono);
  const [email, setEmail] = useState(firmante.email);
  const [desdeDirectorio, setDesdeDirectorio] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [alCerrar]);
  function cambiarNombre(v: string) {
    setNombre(v);
    const c = contactos.find((x) => x.nombre.toLowerCase() === v.trim().toLowerCase());
    if (c) { setTelefono(c.telefono); setEmail(c.email); }
    setDesdeDirectorio(!!c);
  }
  function guardar() {
    const t = telefono.trim(), m = email.trim();
    if (t && !/^[+\d][\d\s()-]{6,}$/.test(t)) return setError("El número de WhatsApp no parece válido. Escríbelo con al menos 7 dígitos; si no es de Perú, incluye el código de país.");
    if (m && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)) return setError("El correo electrónico no parece válido.");
    alGuardar({ nombre: nombre.trim().length >= 2 ? nombre.trim() : `Firmante ${numero}`, telefono: t, email: m });
  }
  return (
    <div className="nicknameEditor" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <section className="nicknameEditorCard" role="dialog" aria-modal="true" aria-label={`Apodo y envío — Firmante ${numero}`}>
        <h2>Apodo del participante — Firmante {numero}</h2>
        <p>El nombre aparece en sus campos y en el certificado de firmas. Con WhatsApp o correo podrás enviarle su enlace directamente.</p>
        <div className="nicknameEditorFields">
          <label>Nombre o apodo
            <input value={nombre} maxLength={120} list="afContactos" autoFocus autoComplete="off" placeholder="Ej. Juan Pérez" onChange={(e) => cambiarNombre(e.target.value)} />
            <datalist id="afContactos">{contactos.map((c) => <option key={c.nombre} value={c.nombre} label={[c.telefono, c.email].filter(Boolean).join(" · ")} />)}</datalist>
            {desdeDirectorio && <small className="contactoElegido">✓ Datos completados desde tu Directorio</small>}
          </label>
          <div className="nicknameContactWrap">
            <label>WhatsApp (opcional)<input inputMode="tel" maxLength={30} value={telefono} placeholder="Ej. 987 654 321 o +51 987 654 321" onChange={(e) => setTelefono(e.target.value)} /></label>
            <label>Correo electrónico (opcional)<input type="email" maxLength={160} value={email} placeholder="nombre@correo.com" onChange={(e) => setEmail(e.target.value)} /></label>
            <small className="nicknameContactHint">Si escribes un WhatsApp o correo, al enviar podrás mandarle el documento directamente.</small>
          </div>
        </div>
        {error && <div className="afAlerta">{error}</div>}
        <div className="nicknameEditorActions">
          <button type="button" onClick={alCerrar}>Cancelar</button>
          <button type="button" className="primary" onClick={guardar}>Guardar datos</button>
        </div>
      </section>
    </div>
  );
}
