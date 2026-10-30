import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent as EventoPuntero, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  COLORES_FIRMANTE, DEDOS, ETIQUETA_TIPO, LIMITES_PLATAFORMA, PREPARADOR, TAMANO_CAMPO, TIPOS_DATO, etiquetaDedo, leerDedo,
  type CampoEditor, type Dedo, type DocumentoDetalle, type Idioma, type FirmanteEditor, type Mano, type Momento, type TipoCampo,
} from "../../../shared/plataforma";
import { MarcaCasilla } from "../componentes/MarcaCasilla";
import { EnviarAVarios, HistorialPlantilla } from "./PlantillaEnvios";
import { PantallaFirma } from "../componentes/PantallaFirma";
import { VERSION_LEGAL } from "../componentes/Legal";
import { PLANES, type EstadoCuenta } from "../../../shared/planes";
import { ErrorApi, plataforma, urls, type Contacto } from "./api";
import { calcularPdf } from "./calculos";
import { leerRangoPaginas, textoRango } from "../../../shared/rangoPaginas";
import { usarSesion } from "./sesion";
import { PaginaPdf, posicion, usarPdf } from "./VisorPdf";
import { GuiaProceso, usarGuia } from "./GuiaProceso";
import { irAlDocumentoSiEstaDebajo } from "../componentes/irAlDocumento";
import { enfatizar, usarPasivo } from "./asistido";

type CampoLocal = CampoEditor & { k: string };
type ImagenPropia = "firma" | "sello" | "huella";
type ModoTexto = FirmanteEditor["modoTexto"];
const ES_IMAGEN = (t: TipoCampo): t is ImagenPropia => t === "firma" || t === "sello" || t === "huella";
type Arrastre = { k: string; modo: "mover" | "tamano"; px: number; py: number; x: number; y: number; w: number; h: number; escala: number };
const ICONO: Record<TipoCampo, string> = { firma: "✍️", texto: "🔤", fecha: "📅", casilla: "☑️", sello: "🖋️", huella: "👆", calculo: "ƒx" };
/** Rojo de los campos que llena quien prepara el documento (como en el prototipo). */
const COLOR_PREPARADOR = "#dc2626";
let siguienteClave = 1;
const nuevaClave = (p: string) => `${p}n${Date.now().toString(36)}${siguienteClave++}`;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];
const zoomGuardado = () => { try { const z = Number(localStorage.getItem("autograflow_zoom")); return z >= 0.5 && z <= 2.5 ? z : 1; } catch { return 1; } };
/** Pasos del modo asistido pasivo, en orden (su elemento lleva data-paso). */
const PASOS_PASIVO = ["nombre", "firmantes", "orden", "enviar"] as const;
type PasoPasivo = (typeof PASOS_PASIVO)[number];
/** Quién firma el documento: solo tú, otras personas o tú y otras personas. Decide qué opciones muestra el editor. */
type Quien = "yo" | "otros" | "ambos";
const quienGuardado = (id: number): Quien | null => {
  try { const q = localStorage.getItem(`autograflow_quien_${id}`); return q === "yo" || q === "otros" || q === "ambos" ? q : null; } catch { return null; }
};
const guardarQuien = (id: number, q: Quien) => { try { localStorage.setItem(`autograflow_quien_${id}`, q); } catch { /* sin almacenamiento */ } };
const WA_SVG =<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="waIcono"><path d="M12 2.2A9.8 9.8 0 0 0 3.6 17l-1.3 4.8 4.9-1.3A9.8 9.8 0 1 0 12 2.2zm5.7 13.9c-.2.7-1.4 1.3-2 1.3-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.8-.1 1.5z" /></svg>;

/**
 * Editor de un documento en borrador (diseño del prototipo v43): panel «Preparar documento» y vista previa con zoom.
 * alCambiarPdf recibe el documento después de quitarle una página (el PDF cambió y el editor se vuelve a armar).
 */
/** Flechas y número para moverse entre las páginas. */
export function NavPaginas({ idCampo, pagina, total, alCambiar, children }: { idCampo: string; pagina: number; total: number; alCambiar: (n: number) => void; children?: ReactNode }) {
  return (
    <div className="pdfPageNav">
      <button type="button" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>←</button>
      <label htmlFor={idCampo}>Página</label>
      <input id={idCampo} type="number" min={1} max={total} value={pagina} onChange={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= total) alCambiar(n); }} />
      <span>/</span><strong>{total}</strong>
      <button type="button" aria-label="Página siguiente" disabled={pagina >= total} onClick={() => alCambiar(pagina + 1)}>→</button>
      {children}
    </div>
  );
}

export function Editor({ inicial, alEnviar, alCambiarPdf, avisoInicial = "" }: {
  inicial: DocumentoDetalle; alEnviar: (d: DocumentoDetalle) => void; alCambiarPdf: (d: DocumentoDetalle, aviso: string) => void; avisoInicial?: string;
}) {
  const navegar = useNavigate();
  const { guia, seguirDocumento } = usarGuia();
  const pasivo = usarPasivo();
  const pasoPasivo = useRef<PasoPasivo | null>(null);
  const { usuario } = usarSesion();
  const estadoNav = useLocation().state as { detectados?: number; preguntarQuien?: boolean } | null;
  const detectados = estadoNav?.detectados ?? 0;
  const { doc, error: errorPdf, avance: avancePdf } = usarPdf(urls.original(inicial.id));
  // Sin respuesta guardada (borradores anteriores) se muestra todo, como antes.
  const [quien, setQuien] = useState<Quien>(() => quienGuardado(inicial.id) ?? "ambos");
  // Recién subido: se pregunta quién firma. Cualquier respuesta (también «Decidir después») se guarda y no se vuelve a preguntar.
  const [preguntarQuien, setPreguntarQuien] = useState(() => !!estadoNav?.preguntarQuien && !inicial.esPlantilla && !quienGuardado(inicial.id));
  const soloYo = quien === "yo";
  const [nombre, setNombre] = useState(inicial.nombre);
  const [orden, setOrden] = useState(inicial.orden);
  const [mensaje, setMensaje] = useState(inicial.mensaje);
  const [bloquearDibujo, setBloquearDibujo] = useState(inicial.bloquearDibujo);
  const [bloquearSello, setBloquearSello] = useState(inicial.bloquearSello);
  const [flujo, setFlujo] = useState(inicial.flujo);
  const [certificado, setCertificado] = useState(inicial.certificado);
  // Idioma de la página del firmante: se detecta del texto del PDF al subirlo; el firmante también puede cambiarlo.
  const [idioma, setIdioma] = useState<Idioma>(inicial.idioma ?? "es");
  const [firmantes, setFirmantes] = useState<FirmanteEditor[]>(() =>
    inicial.firmantes.map((f) => ({ clave: f.clave, nombre: f.nombre, telefono: f.telefono, email: f.email, pedirDni: f.pedirDni, modoTexto: f.modoTexto ?? "asignados" })));
  const [campos, setCampos] = useState<CampoLocal[]>(() => inicial.campos.map((c) => ({ ...c, k: `c${c.id}` })));
  const [pagina, setPagina] = useState(1);
  const [activo, setActivo] = useState(firmantes[0]?.clave ?? "");
  const [herramienta, setHerramienta] = useState<TipoCampo | null>(null);
  // El campo que se va a colocar lo llena quien prepara el documento (no el firmante activo).
  const [paraMi, setParaMi] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<"listo" | "pendiente" | "guardando" | "error">("listo");
  const [aviso, setAviso] = useState(avisoInicial || (detectados
    ? `Se detectaron ${detectados} campos del PDF. Escribe en los recuadros rojos lo que llenas tú, o asígnalos a un firmante en «Campos del PDF». Marca tú dónde firma cada persona; los campos ƒx los calcula el PDF.`
    : ""));
  // Resultado de los campos calculados por el PDF (por su nombre en el PDF), con lo escrito hasta ahora.
  const [calculo, setCalculo] = useState<Record<string, string>>({});
  // «Agregar mi firma»: firmante que es quien prepara el documento. Al enviar se abre su enlace de firma si ya es su turno.
  // Si un firmante ya tiene el correo de la cuenta, se reconoce solo al volver a abrir el borrador.
  const [miClave, setMiClave] = useState<string | null>(() => quien !== "otros" && usuario && !usuario.invitado && usuario.email
    ? firmantes.find((f) => f.email && f.email.toLowerCase() === usuario.email.toLowerCase())?.clave ?? null : null);
  // Tu firma, sello y huella hechos aquí mismo (como en el prototipo): se ven en el documento y se aplican al enviar.
  const [misImagenes, setMisImagenes] = useState<Partial<Record<ImagenPropia, string>>>({});
  const [capturando, setCapturando] = useState<ImagenPropia | null>(null);
  const misMomentos = useRef<Partial<Record<Momento, string>>>({});
  // Si falta marcar dónde va tu firma (o sello/huella), al colocarlo se abre la pantalla para hacerla.
  const abrirTrasColocar = useRef(false);
  // «🔒 Bloquear campos»: al tocar un campo del PDF en el documento se bloquea o desbloquea.
  const [modoBloqueo, setModoBloqueo] = useState(false);
  // «✱ Marcar campos obligatorios»: los campos de los firmantes son opcionales salvo los que se marquen aquí.
  const [modoObligatorio, setModoObligatorio] = useState(false);
  // «Campos del PDF»: los cálculos y cada campo de texto van minimizados («Mostrar contenido»).
  const [verContenidoPdf, setVerContenidoPdf] = useState(false);
  // Quién llenaba cada campo antes de bloquearlo, para devolvérselo al desbloquear.
  const antesDeBloquear = useRef<Record<string, string>>({});
  // «Funciones avanzadas» (bloqueos, DNI, certificado y Flujo): se pueden minimizar; se recuerda la última elección.
  const [avanzadas, setAvanzadas] = useState(() => { try { return localStorage.getItem("autograflow_avanzadas") === "1"; } catch { return false; } });
  const [enviando, setEnviando] = useState(false);
  // «Navegar por páginas / Eliminar páginas»: minimizado salvo que la última vez se dejara abierto.
  const [verPaginas, setVerPaginas] = useState(() => { try { return localStorage.getItem("autograflow_ver_paginas") === "1"; } catch { return false; } });
  const [rangoQuitar, setRangoQuitar] = useState("");
  const [errorRango, setErrorRango] = useState("");
  const [quitandoRango, setQuitandoRango] = useState(false);
  const [limitePlan, setLimitePlan] = useState(false);
  const [esPlantilla, setEsPlantilla] = useState(inicial.esPlantilla);
  const [estado, setEstado] = useState<EstadoCuenta | null>(null);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [zoom, setZoom] = useState(zoomGuardado);
  const [editandoContacto, setEditandoContacto] = useState(false);
  const senalados = useRef(new Set<string>());
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
  // Hay un campo por colocar, y se coloca tocando el documento: en el celular, que queda abajo, la vista va hasta él.
  useEffect(() => { if (herramienta) irAlDocumentoSiEstaDebajo(); }, [herramienta]);
  useEffect(() => { try { localStorage.setItem("autograflow_avanzadas", avanzadas ? "1" : "0"); } catch { /* sin almacenamiento */ } }, [avanzadas]);
  useEffect(() => { try { localStorage.setItem("autograflow_ver_paginas", verPaginas ? "1" : "0"); } catch { /* sin almacenamiento */ } }, [verPaginas]);
  // Sin firma, sello ni huella en el documento no hay nada que certificar: la opción se desmarca (prototipo).
  const sinEvidencias = !campos.some((c) => ES_IMAGEN(c.tipo));
  useEffect(() => { if (sinEvidencias) setCertificado(false); }, [sinEvidencias]);

  const p = inicial.paginas[pagina - 1];
  const maxFirmantes = Math.min(LIMITES_PLATAFORMA.firmantes, estado?.firmantesPorDocumento ?? LIMITES_PLATAFORMA.firmantes);
  const selloPermitido = estado?.selloHuella ?? true;
  const color = useCallback((clave: string) => clave === PREPARADOR ? COLOR_PREPARADOR
    : COLORES_FIRMANTE[Math.max(0, firmantes.findIndex((f) => f.clave === clave)) % COLORES_FIRMANTE.length], [firmantes]);
  const datos = useMemo(() => ({
    nombre: nombre.trim() || "Documento", orden, mensaje, firmantes, bloquearDibujo, bloquearSello, flujo, certificado, idioma, campos: campos.map(({ k: _k, ...c }) => c),
  }), [nombre, orden, mensaje, firmantes, campos, bloquearDibujo, bloquearSello, flujo, certificado, idioma]);

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
    // La firma y el sello repiten el nombre que ya tengan los otros campos del mismo tipo de este firmante.
    const nombreIgual = herramienta === "firma" || herramienta === "sello" ? campos.find((c) => c.firmante === activo && c.tipo === herramienta)?.etiqueta ?? "" : "";
    const nuevo: CampoLocal = {
      k: nuevaClave("c"), firmante: mio ? PREPARADOR : activo, tipo: herramienta, pagina, obligatorio: !mio && ES_IMAGEN(herramienta),
      etiqueta: herramienta === "huella" ? etiquetaDedo(dedoDe(activo).mano, dedoDe(activo).dedo) : nombreIgual, nombrePdf: "", bloqueado: false,
      w: t.w, h: t.h, x: Math.min(Math.max(0, punto.x - t.w / 2), p.ancho - t.w), y: Math.min(Math.max(0, punto.y - t.h / 2), p.alto - t.h),
    };
    setCampos((cs) => [...cs, nuevo]);
    setSel(nuevo.k);
    setHerramienta(null);
    setParaMi(false);
    // «Agregar mi firma» esperaba este campo: se abre de inmediato para hacer la firma, el sello o la huella.
    if (abrirTrasColocar.current && nuevo.firmante === miClave && ES_IMAGEN(nuevo.tipo) && !misImagenes[nuevo.tipo]) {
      abrirTrasColocar.current = false;
      setCapturando(nuevo.tipo);
    }
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
    if (n > maxFirmantes) { setLimitePlan(true); setAviso(`Tu plan permite hasta ${maxFirmantes} firmante${maxFirmantes === 1 ? "" : "s"} por documento. Elige un plan para agregar más.`); }
    const final = Math.min(n, maxFirmantes);
    if (final > firmantes.length) {
      const nuevos = Array.from({ length: final - firmantes.length }, (_, i) => ({ clave: nuevaClave("f"), nombre: `Firmante ${firmantes.length + i + 1}`, telefono: "", email: "", pedirDni: false, modoTexto: "solo" as ModoTexto }));
      setFirmantes((fs) => [...fs, ...nuevos]);
      setActivo(nuevos[0].clave);
      senalarSiguiente(nuevos[0]);
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
    if (!valor && tipo === "huella" && fActivo?.pedirDni) {
      setAviso("La huella es obligatoria mientras esté activo «Requerir firma y huella capturando DNI» (en Funciones avanzadas). Desactívalo primero.");
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
    if (!valor) return setAviso(`La captura del DNI ya no será obligatoria para el Firmante ${iActivo + 1}.`);
    // La firma tiene que ser real (foto) y la huella sale del reverso del DNI. Solo para este firmante: el servidor ya le
    // bloquea la firma dibujada, sin afectar a los demás (por eso no se activa el bloqueo general).
    setPide((x) => ({ ...x, [activo]: { ...(x[activo] ?? { sello: false, huella: false }), huella: true } }));
    const falta = !camposDe(activo, "firma") ? "firma" : !camposDe(activo, "huella") ? "huella" : null;
    setHerramienta(falta);
    setParaMi(false);
    setAviso(`Marca un espacio para la firma y otro para la huella del Firmante ${iActivo + 1}${falta ? ` (ahora: ${ETIQUETA_TIPO[falta].toLowerCase()})` : ""}. Capturará el frente de su DNI, su firma en papel y el reverso, y ajustará la huella.`);
  }

  /**
   * «Agregar mi firma»: el firmante activo pasa a ser quien prepara el documento (o el que ya tiene su correo).
   * Al pulsar «Guardar y enviar» se abre su enlace de firma en ese momento si es su turno. Pulsarlo otra vez lo deshace.
   * Se identifica por posición en la lista (no por correo): así funciona también sin cuenta, donde no hay correo.
   */
  function agregarMiFirma() {
    if (!usuario || !fActivo) return;
    // Ya eres un firmante: el botón sirve para rehacer tu firma (y tu sello o huella).
    if (miClave && firmantes.some((f) => f.clave === miClave)) {
      setMisImagenes({});
      continuarCaptura(miClave, {});
      return;
    }
    const ya = miFirmante();
    const clave = ya?.clave ?? activo;
    if (!ya) {
      const generico = /^Firmante \d+$/.test(fActivo.nombre);
      if (!usuario.invitado && (!generico || fActivo.email || fActivo.telefono) && !confirm(`¿El Firmante ${iActivo + 1} eres tú? Se reemplazarán su nombre y su correo por los tuyos.`)) return;
      const nombreYo = miNombre(fActivo);
      if (nombreYo === null) return;
      setFirmantes((fs) => fs.map((f) => (f.clave === clave ? { ...f, nombre: nombreYo, email: usuario.invitado ? f.email : usuario.email } : f)));
    }
    setActivo(clave);
    setMiClave(clave);
    setMisImagenes({});
    continuarCaptura(clave, {});
  }

  /** El firmante que ya tiene el correo de tu cuenta (sin cuenta no hay correo con qué reconocerte). */
  const miFirmante = () => usuario && !usuario.invitado && usuario.email
    ? firmantes.find((f) => f.email && f.email.toLowerCase() === usuario.email.toLowerCase()) : undefined;

  /** Tu nombre para firmar: el de tu cuenta o, sin cuenta, se pide (aparece junto a tu firma y en el certificado). null: no se dio. */
  function miNombre(f: FirmanteEditor): string | null {
    if (!usuario) return null;
    if (!usuario.invitado) return usuario.nombre;
    const n = prompt("¿Cómo te llamas? Tu nombre aparecerá junto a tu firma y en el certificado.", /^Firmante \d+$/.test(f.nombre) ? "" : f.nombre);
    if (n === null) return null;
    if (n.trim().length < 2) { setAviso("Escribe tu nombre (al menos 2 letras) para agregar tu firma."); return null; }
    return n.trim().slice(0, 120);
  }

  /**
   * Respuesta a «¿Quién firma este documento?». Solo tú: quedas como único firmante y se abre tu firma. Otras personas:
   * no firmas tú (se oculta «Agregar mi firma»). Tú y otras personas: eres el Firmante 1 y se agrega otro si hace falta.
   */
  function elegirQuien(q: Quien) {
    if (preguntarQuien) empezarPasivo();
    else if (q !== "yo" && fActivo) senalarSiguiente(fActivo);
    setPreguntarQuien(false);
    setQuien(q);
    guardarQuien(inicial.id, q);
    if (q === "otros") {
      setMiClave(null);
      setMisImagenes({});
      setCapturando(null);
      abrirTrasColocar.current = false;
      setAviso("Marca dónde firma cada persona y, en «Apodo y envío», su WhatsApp o correo para enviarle su enlace.");
      return;
    }
    const ya = (miClave ? firmantes.find((f) => f.clave === miClave) : undefined) ?? miFirmante();
    const yo = ya ?? firmantes[0];
    if (!usuario || !yo) return;
    let lista = firmantes;
    if (q === "yo" && firmantes.length > 1) {
      const otros = firmantes.filter((f) => f.clave !== yo.clave), conCampos = campos.filter((c) => otros.some((f) => f.clave === c.firmante)).length;
      if (conCampos && !confirm(`Solo firmarás tú: se quitarán ${otros.length} firmante(s) y sus ${conCampos} campo(s). ¿Continuar?`)) {
        setQuien("ambos");
        guardarQuien(inicial.id, "ambos");
        return;
      }
      lista = [yo];
      setCampos((cs) => cs.filter((c) => !otros.some((f) => f.clave === c.firmante)));
    }
    if (q === "yo") {
      // Opciones para los firmantes que ya no se muestran: bloquear la firma dibujada te impediría hacer la tuya.
      setBloquearDibujo(false);
      setBloquearSello(false);
      setFlujo(false);
    }
    if (q === "ambos" && lista.length < 2 && maxFirmantes >= 2)
      lista = [...lista, { clave: nuevaClave("f"), nombre: `Firmante ${lista.length + 1}`, telefono: "", email: "", pedirDni: false, modoTexto: "solo" }];
    // Sin cuenta, si no da su nombre, queda «Firmante 1» y lo escribe después en «Tu nombre».
    const nombreYo = ya ? ya.nombre : miNombre(yo) ?? yo.nombre;
    lista = lista.map((f) => (f.clave === yo.clave ? { ...f, nombre: nombreYo, email: usuario.invitado ? f.email : usuario.email } : f));
    setFirmantes(lista);
    setActivo(yo.clave);
    setMiClave(yo.clave);
    setMisImagenes({});
    if (q === "yo") continuarCaptura(yo.clave, {});
    else setAviso(`Eres el Firmante ${lista.findIndex((f) => f.clave === yo.clave) + 1}. Configura a las demás personas y pulsa «Hacer mi firma» cuando quieras firmar.`);
  }

  function quitarMiFirma() {
    const n = firmantes.findIndex((f) => f.clave === miClave) + 1;
    setMiClave(null);
    setMisImagenes({});
    setCapturando(null);
    abrirTrasColocar.current = false;
    setAviso(n > 0 ? `Ya no firmarás como Firmante ${n}: al enviar, recibirá su enlace como los demás.` : "");
  }

  /**
   * Abre la pantalla de firma (dibujar, subir o fotografiar) para lo que te falta: firma y, si se pidieron, sello y huella.
   * Si aún no está marcado dónde va, primero pide tocar el documento y se abre al colocarlo.
   */
  function continuarCaptura(clave: string, imgs: Partial<Record<ImagenPropia, string>>) {
    const yo = firmantes.find((f) => f.clave === clave), n = firmantes.findIndex((f) => f.clave === clave) + 1;
    if (!yo) return;
    // Si firmas solo tú, no hace falta decir qué número de firmante eres.
    const eres = firmantes.length > 1 ? `El Firmante ${n} eres tú. ` : "";
    if (yo.pedirDni) {
      setAviso(`${eres}Tu firma se toma con el DNI: al pulsar «${firmantes.length > 1 ? "Guardar y enviar" : "Firmar documento"}» se abrirá tu enlace para capturarlo.`);
      return;
    }
    const pedidos: ImagenPropia[] = ["firma", ...(pide[clave]?.sello ? ["sello" as const] : []), ...(pide[clave]?.huella ? ["huella" as const] : [])];
    for (const t of pedidos) {
      if (imgs[t]) continue;
      if (!campos.some((c) => c.firmante === clave && c.tipo === t)) {
        setActivo(clave);
        setHerramienta(t);
        setParaMi(false);
        abrirTrasColocar.current = true;
        setAviso(`${eres}Toca el documento donde va tu ${t}; después se abrirá para que ${t === "firma" ? "firmes" : t === "sello" ? "pongas tu sello" : "pongas tu huella"}.`);
        return;
      }
      setCapturando(t);
      return;
    }
    setAviso(firmantes.length > 1
      ? `✓ Listo, Firmante ${n}: tu ${pedidos.join(", ")} ya está en el documento. Al pulsar «Guardar y enviar» quedará firmado por ti y se enviará a los demás.`
      : `✓ Listo: tu ${pedidos.join(", ")} ya está en el documento. Pulsa «Firmar documento» para terminar y descargar el PDF firmado.`);
  }

  function terminarCaptura(t: ImagenPropia, png: string | null) {
    setCapturando(null);
    if (!png || !miClave) return;
    misMomentos.current[t] = new Date().toISOString();
    const imgs = { ...misImagenes, [t]: png };
    setMisImagenes(imgs);
    continuarCaptura(miClave, imgs);
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

  /** «Quitar varias páginas»: escribe «2-5» (de la 2 a la 5), «2,5» (la 2 y la 5) o ambas cosas, «1-3, 8». */
  async function quitarRango() {
    const total = inicial.paginas.length, r = leerRangoPaginas(rangoQuitar, total);
    if ("error" in r) { setErrorRango(r.error); return; }
    const enEsas = campos.filter((c) => r.paginas.includes(c.pagina)).length;
    if (!confirm(`¿Quitar ${r.paginas.length === 1 ? "la página" : `${r.paginas.length} páginas`} (${textoRango(r.paginas)}) de ${total}? No se enviarán a los firmantes${enEsas ? ` y se borrarán sus ${enEsas} campo(s)` : ""}. El archivo que subiste no cambia.`)) return;
    setQuitandoRango(true);
    try {
      await plataforma.guardar(inicial.id, datos);
      alCambiarPdf(await plataforma.eliminarPaginas(inicial.id, r.paginas),
        `Se quitaron ${r.paginas.length === 1 ? "la página" : "las páginas"} ${textoRango(r.paginas)}. El documento ahora tiene ${total - r.paginas.length} página(s).`);
    } catch (e) {
      setErrorRango(e instanceof ErrorApi ? e.message : "No se pudieron quitar las páginas.");
      setQuitandoRango(false);
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
    if (soloYo && firmantes.some((f) => /^Firmante \d+$/.test(f.nombre.trim()))) problemas.push("Escribe tu nombre en «Tu nombre»: aparecerá junto a tu firma y en el certificado.");
    if (problemas.length) { setAviso(problemas.join(" ")); setLimitePlan(false); return; }
    const sinFirma = firmantes.filter((f) => !campos.some((c) => c.firmante === f.clave && c.tipo === "firma"));
    if (sinFirma.length && !confirm(`Falta configurar la firma de: ${sinFirma.map((f) => f.nombre).join(", ")}. Solo deberán completar sus otros campos. ¿Continuar?`)) return;
    if (!confirm(firmoSoloYo
      ? `¿Firmar «${datos.nombre}»? Después ya no podrás cambiar los campos.`
      : `¿Enviar «${datos.nombre}» a firmar a ${firmantes.length} persona${firmantes.length === 1 ? "" : "s"}? Después ya no podrás cambiar los campos.`)) return;
    setEnviando(true);
    try {
      // Con tu firma ya hecha y el envío en orden, tienes que firmar primero para que quede aplicada ahora.
      let lista = firmantes;
      const idx = firmantes.findIndex((f) => f.clave === miClave);
      if (idx > 0 && orden === "secuencial" && misImagenes.firma
        && confirm("Para que tu firma quede aplicada ahora, debes ser el primero en firmar. ¿Pasarte al primer lugar? (Si eliges «Cancelar», firmarás cuando te toque.)")) {
        lista = [firmantes[idx], ...firmantes.filter((_, i) => i !== idx)];
        setFirmantes(lista);
      }
      await plataforma.guardar(inicial.id, { ...datos, firmantes: lista });
      const det = await plataforma.enviar(inicial.id);
      seguirDocumento(inicial.id, 5);
      // Al guardar, el servidor da claves nuevas a los firmantes: el tuyo se reconoce por su posición.
      const iYo = lista.findIndex((f) => f.clave === miClave);
      const yo = iYo >= 0 ? det.firmantes.find((f) => f.orden === iYo + 1) : undefined;
      const miTurno = !!yo?.token && (det.orden === "paralelo" || yo.orden === 1);
      if (!yo?.token || !miTurno) { alEnviar(det); return; }
      // Lo que hiciste aquí (firma, sello, huella) se envía como tu firma; si te falta llenar algo, se abre tu enlace.
      const mios = det.campos.filter((c) => c.firmante === yo.clave);
      const completo = !yo.pedirDni && mios.every((c) => (ES_IMAGEN(c.tipo) ? !!misImagenes[c.tipo] : !c.obligatorio));
      if (!completo) { navegar(`/f/${yo.token}`); return; }
      try {
        const valores = Object.fromEntries(mios.map((c) => [String(c.id), ES_IMAGEN(c.tipo) ? misImagenes[c.tipo]! : c.tipo === "casilla" ? false : ""]));
        await plataforma.firmar(yo.token, valores, { momentos: misMomentos.current }, calculo, [], VERSION_LEGAL);
        alEnviar(await plataforma.documento(inicial.id));
      } catch {
        // Si no se pudo aplicar (p. ej. una imagen inválida), se firma desde el enlace como cualquier firmante.
        navegar(`/f/${yo.token}`);
      }
    } catch (e) {
      setAviso(e instanceof ErrorApi ? e.message : "No se pudo enviar.");
      setLimitePlan(e instanceof ErrorApi && e.status === 402);
    } finally {
      setEnviando(false);
    }
  }

  // «Enviar a varios» y el historial de envíos de la plantilla (se recarga después de enviar).
  const [enviandoVarios, setEnviandoVarios] = useState(false);
  const [recargaHistorial, setRecargaHistorial] = useState(0);

  async function eliminar() {
    if (!confirm(esPlantilla ? "¿Eliminar esta plantilla? Ya no aparecerá en «Plantillas». Los documentos que creaste con ella no cambian. No se puede deshacer." : "¿Eliminar este borrador? No se puede deshacer.")) return;
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
  const camposMios = campos.filter((c) => c.firmante === PREPARADOR && c.tipo !== "calculo" && !c.bloqueado);
  const camposCalculo = campos.filter((c) => c.tipo === "calculo");
  const llenaCampo = (c: CampoLocal) => c.firmante === PREPARADOR && TIPOS_DATO.includes(c.tipo) && !c.bloqueado;
  // Cuadros de texto nuevos y texto libre: solo con un plan de pago (en Gratis se llenan los campos que ya trae el PDF).
  const textoPermitido = estado?.selloHuella ?? true;
  const destino = paraMi ? "que llenas tú" : `del Firmante ${iActivo + 1}`;
  const iYo = firmantes.findIndex((f) => f.clave === miClave);
  // Eres el único firmante: no hay nada que enviar, el botón final firma el documento.
  const firmoSoloYo = firmantes.length === 1 && iYo === 0;

  /** Rótulo del campo sobre el documento, como en el prototipo: «APODO / Firma aquí» o «FIRMANTE 2», «SELLO 2», «HUELLA 2». */
  const rotulo = (c: CampoLocal) => {
    const i = firmantes.findIndex((f) => f.clave === c.firmante), f = firmantes[i];
    const apodo = f && !/^Firmante \d+$/.test(f.nombre) ? f.nombre : "";
    if (c.tipo === "huella") return `${apodo || `HUELLA ${i + 1}`}\n${c.etiqueta || "Huella aquí"}`;
    const nombreCampo = c.etiqueta || apodo;
    return nombreCampo ? `${nombreCampo}\n${c.tipo === "sello" ? "Sella aquí" : "Firma aquí"}` : `${c.tipo === "sello" ? "SELLO" : "FIRMANTE"} ${i + 1}`;
  };
  /** Del firmante que se configura: firma en su color, sello dorado y huella roja (prototipo). Los demás, en su color. */
  const colorCampo = (c: CampoLocal) => c.firmante === activo && c.tipo === "sello" ? "#c99400" : c.firmante === activo && c.tipo === "huella" ? "#b3261e" : color(c.firmante);
  /** «✏️ Nombre»: el mismo nombre para todos los campos de firma o de sello del firmante activo. */
  function renombrar(tipo: "firma" | "sello") {
    const suyos = campos.filter((c) => c.firmante === activo && c.tipo === tipo);
    if (!suyos.length) { setAviso(`Primero marca el campo de ${tipo} del Firmante ${iActivo + 1}; después podrás ponerle nombre.`); return; }
    const v = prompt(`Nombre para el campo de ${tipo} del Firmante ${iActivo + 1}. Déjalo vacío para usar el nombre del firmante.`, suyos[0].etiqueta);
    if (v === null) return;
    setCampos((cs) => cs.map((c) => (c.firmante === activo && c.tipo === tipo ? { ...c, etiqueta: v.trim().slice(0, 120) } : c)));
  }
  // «Campos del PDF»: los que ya traía el formulario. Las casillas se asignan juntas, como en el prototipo.
  const camposPdf = campos.filter((c) => c.nombrePdf && TIPOS_DATO.includes(c.tipo));
  const textosPdf = camposPdf.filter((c) => c.tipo !== "casilla");
  const casillasPdf = camposPdf.filter((c) => c.tipo === "casilla");
  const asignar = (ks: string[], firmante: string) => {
    setCampos((cs) => cs.map((c) => (ks.includes(c.k)
      ? { ...c, firmante, valor: null, obligatorio: false } : c)));
    // Un firmante que «solo firma» pasa a completar los campos que se le asignan (como en el prototipo).
    if (firmante !== PREPARADOR) setFirmantes((fs) => fs.map((f) => (f.clave === firmante && f.modoTexto === "solo" ? { ...f, modoTexto: "asignados" } : f)));
  };
  const casillasLibres = casillasPdf.filter((c) => !c.bloqueado);
  const bloqueados = camposPdf.filter((c) => c.bloqueado).length;
  // Campos de texto, fecha y casilla que llena un firmante: opcionales salvo los marcados como obligatorios.
  const datosFirmantes = campos.filter((c) => TIPOS_DATO.includes(c.tipo) && c.firmante !== PREPARADOR && !c.bloqueado);
  const datosDelActivo = datosFirmantes.filter((c) => c.firmante === activo);
  const pdfVacios = camposPdf.filter((c) => !c.bloqueado && c.firmante === PREPARADOR
    && (c.valor == null || c.valor === false || (typeof c.valor === "string" && !c.valor.trim())));
  const obligatorios = datosFirmantes.filter((c) => c.obligatorio).length;
  const esRequerido = (c: CampoLocal) => TIPOS_DATO.includes(c.tipo) && c.firmante !== PREPARADOR && !c.bloqueado && c.obligatorio;
  /**
   * Hace obligatorio (u opcional) un campo de texto, fecha o casilla. Si lo llenabas tú, pasa al firmante que estás
   * configurando, ya obligatorio: así el firmante tiene que llenarlo sí o sí.
   */
  function alternarObligatorio(c: CampoLocal) {
    if (c.firmante !== PREPARADOR) { cambiarCampo(c.k, { obligatorio: !c.obligatorio }); return; }
    if (!fActivo) { setAviso("Primero agrega un firmante."); return; }
    setCampos((cs) => cs.map((x) => (x.k === c.k ? { ...x, firmante: fActivo.clave, valor: null, obligatorio: true } : x)));
    setFirmantes((fs) => fs.map((f) => (f.clave === fActivo.clave && f.modoTexto === "solo" ? { ...f, modoTexto: "asignados" } : f)));
  }
  const quitarObligatorios = () => setCampos((cs) => cs.map((c) => (TIPOS_DATO.includes(c.tipo) && c.firmante !== PREPARADOR ? { ...c, obligatorio: false } : c)));
  const barraObligatorios = !soloYo && campos.some((c) => TIPOS_DATO.includes(c.tipo) && !c.bloqueado) && (
    <>
      <div className="afLockBar">
        <button type="button" className={modoObligatorio ? "primary" : ""} onClick={() => { setModoObligatorio(!modoObligatorio); setModoBloqueo(false); setHerramienta(null); }}>
          {modoObligatorio ? "✓ Terminar de marcar" : "✱ Marcar campos obligatorios"}
        </button>
        {obligatorios > 0 && <button type="button" onClick={quitarObligatorios}>Quitar obligatorios ({obligatorios})</button>}
      </div>
      {modoObligatorio
        ? <p className="small afLockHint">👆 Toca en el documento los campos y casillas que el firmante debe llenar sí o sí (se marcan con ✱). Vuelve a tocarlos para que sean opcionales. Los que llenabas tú pasan al Firmante {iActivo + 1}.</p>
        : <p className="small">Los campos de los firmantes son opcionales{obligatorios ? `, salvo ${obligatorios} marcado${obligatorios === 1 ? "" : "s"} como obligatorio${obligatorios === 1 ? "" : "s"} (✱)` : ""}. La firma, el sello y la huella siempre se piden.</p>}
    </>
  );
  /** Bloquea (queda vacío y nadie lo llena) o desbloquea un campo del PDF; al desbloquear vuelve a quien lo llenaba. */
  function alternarBloqueo(c: CampoLocal) {
    if (c.bloqueado) {
      const antes = antesDeBloquear.current[c.k];
      const firmante = antes && (antes === PREPARADOR || firmantes.some((f) => f.clave === antes)) ? antes : PREPARADOR;
      cambiarCampo(c.k, { bloqueado: false, firmante, obligatorio: false });
    } else {
      antesDeBloquear.current[c.k] = c.firmante;
      cambiarCampo(c.k, { bloqueado: true, firmante: PREPARADOR, valor: null, obligatorio: false });
      if (sel === c.k) setSel(null);
    }
  }
  function desbloquearTodos() {
    setCampos((cs) => cs.map((c) => {
      if (!c.bloqueado) return c;
      const antes = antesDeBloquear.current[c.k];
      const firmante = antes && (antes === PREPARADOR || firmantes.some((f) => f.clave === antes)) ? antes : PREPARADOR;
      return { ...c, bloqueado: false, firmante, obligatorio: false };
    }));
  }
  /** Texto del firmante: solo firma, completa los campos que se le asignan o, además, agrega texto libre. */
  function cambiarModo(modo: ModoTexto) {
    if (!fActivo) return;
    if (modo === "libre" && !textoPermitido) {
      setLimitePlan(true);
      setAviso("Permitir texto libre requiere un plan. En la prueba Gratis puedes llenar los campos que ya trae el PDF.");
      return;
    }
    const suyos = campos.filter((c) => c.firmante === fActivo.clave && TIPOS_DATO.includes(c.tipo));
    if (modo === "solo" && suyos.length) {
      if (!confirm(`El Firmante ${iActivo + 1} tiene ${suyos.length} campo(s) de texto. Si solo firma, esos campos los llenarás tú. ¿Continuar?`)) return;
      setCampos((cs) => cs.map((c) => (c.firmante === fActivo.clave && TIPOS_DATO.includes(c.tipo) ? { ...c, firmante: PREPARADOR, valor: null, obligatorio: false } : c)));
    }
    setFirmantes((fs) => fs.map((f) => (f.clave === fActivo.clave ? { ...f, modoTexto: modo } : f)));
    if (modo === "solo" && herramienta === "texto" && !paraMi) setHerramienta(null);
  }
  /** «🔤 Marcar campo de texto» (del firmante) o «🔤 Agregar cuadro de texto» (tuyo): cuadros nuevos solo con un plan de pago. */
  function marcarTexto(mio: boolean) {
    if (!textoPermitido) {
      setLimitePlan(true);
      setAviso("Agregar cuadros de texto nuevos requiere un plan. En la prueba Gratis puedes llenar los campos que ya trae el PDF.");
      return;
    }
    const activa = herramienta === "texto" && paraMi === mio;
    setModoBloqueo(false);
    setHerramienta(activa ? null : "texto");
    setParaMi(mio);
  }
  const irACampo = (c: CampoLocal) => { setPagina(c.pagina); setSel(c.k); };
  const opcionesQuien = (yo: string, otro: string) => <>
    <option value={PREPARADOR}>{yo}</option>
    {/* Si firmas solo tú, todo lo llenas tú: no hay a quién asignarlo. */}
    {!soloYo && firmantes.map((f, i) => <option key={f.clave} value={f.clave}>{otro}{i + 1}{/^Firmante \d+$/.test(f.nombre) ? "" : ` · ${f.nombre}`}</option>)}
  </>;
  // Si firmas solo tú, los bloqueos de la firma y del sello y el Flujo (opciones para los firmantes) no se muestran.
  const activasAvanzadas = (soloYo ? [!!fActivo?.pedirDni, certificado] : [bloquearDibujo, bloquearSello, !!fActivo?.pedirDni, certificado, flujo]).filter(Boolean).length;
  // El certificado necesita algo que certificar (firma, sello o huella), como en el prototipo.
  const hayEvidencias = campos.some((c) => ES_IMAGEN(c.tipo));
  const conDni = firmantes.flatMap((f, i) => (f.pedirDni ? [i] : []));
  const hayDatosFirmantes = campos.some((c) => c.firmante !== PREPARADOR && TIPOS_DATO.includes(c.tipo));
  // ------------------------------------------------ modo asistido pasivo
  // Al terminar un paso, la vista baja al siguiente y este parpadea una vez. Empieza al subir un PDF (tras «¿Quién firma?»)
  // y solo avanza. No se usa si la guía (modo activo) acompaña este documento: ella ya lleva la vista a cada paso.
  const guiaAqui = (guia.estado === "activa" || guia.estado === "pendiente") && (!guia.documentoId || guia.documentoId === inicial.id);
  const asistir = pasivo && !guiaAqui && !esPlantilla;
  // Solo tú: listo cuando tu firma está hecha (con DNI se hace al firmar, basta con marcar dónde va). Con otros: cuando
  // cada firmante tiene sus campos.
  const firmantesCompletos = soloYo ? (fActivo?.pedirDni ? camposDe(fActivo.clave, "firma") > 0 : !!misImagenes.firma)
    : firmantes.length > 0 && firmantes.every(listo);
  useEffect(() => { if (firmantesCompletos) pasarA("orden"); }, [firmantesCompletos]);

  /**
   * Señala con un parpadeo el siguiente paso de quien prepara el documento: primero «Apodo y envío» y, ya con sus datos,
   * «Marcar dónde irá la firma». Cada botón, una vez por firmante, y solo si falta hacerlo. Devuelve si señaló algo.
   * Respeta el modo asistido apagado en «Cómo funciona» (salvo que la guía esté acompañando este documento).
   */
  function senalarSiguiente(f: Pick<FirmanteEditor, "clave" | "nombre" | "telefono" | "email">, espera = 250) {
    if ((!pasivo && !guiaAqui) || camposDe(f.clave, "firma")) return false;
    const sinDatos = /^Firmante \d+$/.test(f.nombre) && !f.telefono && !f.email;
    const [boton, clave] = sinDatos ? [".botonApodo", `apodo:${f.clave}`] : [".placeFirma", `firma:${f.clave}`];
    if (senalados.current.has(clave)) return false;
    senalados.current.add(clave);
    // Se busca al final: «Apodo y envío» no existe si firmas solo tú, y mientras tanto pudo cerrarse una ventana.
    setTimeout(() => enfatizar(document.querySelector(boton), 3), espera);
    return true;
  }
  /** Avanza al paso p (nunca hacia atrás). Con parpadeo baja la vista hasta él; sin él solo recuerda dónde vas. */
  function pasarA(p: PasoPasivo, conParpadeo = true) {
    if (p === "orden" && soloYo) p = "enviar"; // si firmas solo tú no hay paso de orden y mensaje
    const actual = pasoPasivo.current;
    if (!asistir || !actual || PASOS_PASIVO.indexOf(p) <= PASOS_PASIVO.indexOf(actual)) return;
    pasoPasivo.current = p;
    if (!conParpadeo) return;
    if (p === "firmantes" && !soloYo && fActivo && senalarSiguiente(fActivo, 150)) return;
    setTimeout(() => enfatizar(document.querySelector(`[data-paso="${p}"]`)), 150);
  }
  /** Al salir de un paso: si vas a otro paso, avanza en silencio (no mueve la vista bajo tu clic); si no, va al siguiente. */
  const alSalirDe = (p: PasoPasivo) => (e: FocusEvent<HTMLElement>) => {
    const destino = e.relatedTarget as HTMLElement | null;
    if (destino && e.currentTarget.contains(destino)) return;
    const otro = destino?.closest?.("[data-paso]")?.getAttribute("data-paso") as PasoPasivo | null | undefined;
    if (otro && otro !== p) pasarA(otro, false);
    else pasarA(PASOS_PASIVO[PASOS_PASIVO.indexOf(p) + 1] ?? p);
  };
  /** Primer paso del modo pasivo: el nombre del documento, recién subido y respondido «¿Quién firma?». */
  function empezarPasivo() {
    // Con la guía, su paso es el de los firmantes: se muestra desde su título (mientras «¿Quién firma?» estuvo abierta,
    // la guía no movió la vista).
    if (guiaAqui) {
      setTimeout(() => enfatizar(document.querySelector('[data-paso="firmantes"]'), 0), 300);
      if (fActivo) senalarSiguiente(fActivo, 1000);
      return;
    }
    if (!asistir || pasoPasivo.current) return;
    pasoPasivo.current = "nombre";
    setTimeout(() => enfatizar(document.querySelector('[data-paso="nombre"]')), 300);
  }

  const botonMiFirma = !esPlantilla && usuario && (
    <div className="afMiFirma">
      <button type="button" className={`afReceiveSignBtn ${iYo >= 0 && misImagenes.firma ? "success" : "primary"}`} onClick={agregarMiFirma} disabled={!fActivo}
        title={iYo >= 0 ? "Vuelve a hacer tu firma" : "Serás el firmante que estás configurando y firmarás ahora mismo"}>
        {iYo < 0 ? "✍️ Agregar mi firma"
          : misImagenes.firma ? `✓ Tu firma está lista${firmoSoloYo ? "" : ` (Firmante ${iYo + 1})`} · cambiar`
          : `✍️ Hacer mi firma${firmoSoloYo ? "" : ` (Firmante ${iYo + 1})`}`}
      </button>
      {iYo >= 0 && !soloYo && <button type="button" className="enlace" onClick={quitarMiFirma}>Quitar mi firma</button>}
    </div>
  );

  return (
    <>
    <GuiaProceso etapa="editor" documentoId={inicial.id} plantilla={esPlantilla}
      firmantesListos={firmantes.length > 0 && firmantes.every(f => f.nombre.trim().length >= 2 && !/^Firmante \d+$/.test(f.nombre.trim()))}
      camposListos={firmantes.length > 0 && firmantes.every(f => campos.some(c => c.firmante === f.clave))} />
    <div className="grid editorGrid">
      <section className="card prepPanel">
        <h1>{esPlantilla ? "Editar plantilla" : "Preparar documento"}</h1>
        {esPlantilla ? (
          <div className="avisoPlantilla">
            <p>📋 <strong>Estás editando una plantilla.</strong> Cambia el PDF, los firmantes y los campos: los cambios se guardan solos. Para enviarla a una o varias personas, pulsa «Enviar a varios»: se crea un documento para cada una. Con «Usar esta plantilla» creas uno solo y lo terminas de preparar.</p>
            <div className="row">
              <button type="button" className="primary" onClick={() => setEnviandoVarios(true)}>📨 Enviar a varios</button>
              <button type="button" onClick={async () => { await plataforma.guardar(inicial.id, datos); navegar(`/app/d/${(await plataforma.duplicar(inicial.id)).id}`); }}>📋 Usar esta plantilla</button>
              <button type="button" className="danger" onClick={eliminar}>🗑️ Eliminar plantilla</button>
            </div>
            <HistorialPlantilla plantilla={inicial.id} recarga={recargaHistorial} />
          </div>
        ) : <p>Configura el PDF y los campos que necesitará cada participante para firmar, sellar o colocar su huella.</p>}
        {enviandoVarios && (
          <EnviarAVarios plantilla={inicial.id} nombrePlantilla={nombre.trim() || "Documento"} firmantes={firmantes}
            guardar={() => plataforma.guardar(inicial.id, datos)}
            alCerrar={(hubo) => { setEnviandoVarios(false); if (hubo) setRecargaHistorial((n) => n + 1); }} />
        )}

        <div className="step">
          <div className="stepTitle"><span className="stepNumber">1</span>Documento PDF</div>
          <div className="docCargado">
            <span>📄 <strong>PDF cargado</strong> · {inicial.paginas.length} página{inicial.paginas.length === 1 ? "" : "s"}{camposPdf.length ? ` · ${camposPdf.length} campo(s) del PDF` : ""}</span>
            <Link className="boton botonChico" to="/app" title="Vuelve a «Mis documentos» para subir otro PDF; este borrador queda guardado">Usar otro PDF</Link>
          </div>
        </div>

        <div className="step" data-paso="nombre" onBlur={alSalirDe("nombre")}>
          <div className="stepTitle"><span className="stepNumber">2</span>Aplica nombre al documento</div>
          <input className="tituloDoc" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del documento" maxLength={160}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
          <span className={`estadoGuardado ${guardado}`}>
            {guardado === "guardando" ? "Guardando…" : guardado === "pendiente" ? "Cambios sin guardar" : guardado === "error" ? "No se pudo guardar" : "✓ Guardado automáticamente"}
          </span>
        </div>

        <div className="step" data-paso="firmantes" onFocus={() => pasarA("firmantes", false)}>
          <div className="stepTitle"><span className="stepNumber">3</span>{soloYo ? "Tu firma" : "Cantidad de firmantes"}</div>
          {!esPlantilla && (
            <div className="quienFirmaBarra" role="group" aria-label="¿Quién firma?">
              {([["yo", "✍️ Solo yo"], ["otros", "👥 Otras personas"], ["ambos", "✍️👥 Yo y otras"]] as const).map(([q, texto]) => (
                <button type="button" key={q} className={quien === q ? "activa" : ""} aria-pressed={quien === q}
                  disabled={q === "ambos" && maxFirmantes < 2 && quien !== "ambos"} onClick={() => quien !== q && elegirQuien(q)}>{texto}</button>
              ))}
            </div>
          )}
          <div className="participantSetup" data-guia="firmantes">
            {soloYo && fActivo && (
              <label className="participantSelectLabel">Tu nombre (aparece junto a tu firma y en el certificado)
                <input value={/^Firmante \d+$/.test(fActivo.nombre) ? "" : fActivo.nombre} maxLength={120} placeholder="Ej. Juan Pérez"
                  onChange={(e) => setFirmantes((fs) => fs.map((f) => (f.clave === fActivo.clave ? { ...f, nombre: e.target.value } : f)))}
                  onBlur={(e) => { if (e.target.value.trim() && !(e.relatedTarget as HTMLElement | null)?.closest?.(".placeFirma")) senalarSiguiente({ ...fActivo, nombre: e.target.value.trim() }); }} />
              </label>
            )}
            {!soloYo && <>
            <div className="participantCountRow">
              <label htmlFor="cantidadFirmantes">Personas que deben firmar</label>
              <input id="cantidadFirmantes" type="number" min={1} max={maxFirmantes} value={firmantes.length} inputMode="numeric" onChange={(e) => cantidad(Number(e.target.value))} />
              <span>{maxFirmantes < LIMITES_PLATAFORMA.firmantes ? `de 1 a ${maxFirmantes} (Gratis)` : `de 1 a ${maxFirmantes}`}</span>
            </div>
            <p className="small">Usa 1 para un solo firmante o aumenta el número para agregar participantes en orden.</p>
            {maxFirmantes < LIMITES_PLATAFORMA.firmantes && (
              <div className="signerLimitNote">
                <span>{estado?.invitado
                  ? `Sin cuenta puedes usar ${maxFirmantes} solo firmante. Crea tu cuenta gratis para usar hasta ${PLANES.gratis.firmantesPorDocumento}, o adquiere un plan para más.`
                  : `Gratis con cuenta permite hasta ${maxFirmantes} firmantes (solo firma). Para más firmantes, sellos y huellas, adquiere un plan.`}</span>
                <Link className="boton primary botonChico" to={estado?.invitado ? "/registro" : "/planes"}>{estado?.invitado ? "Crear cuenta" : "Ver planes"}</Link>
              </div>
            )}
            <label htmlFor="participanteActivo" className="participantSelectLabel">Configurar participante</label>
            <select id="participanteActivo" value={activo} onChange={(e) => { setActivo(e.target.value); setHerramienta(null); const elegido = firmantes.find((x) => x.clave === e.target.value); if (elegido) senalarSiguiente(elegido); }}>
              {firmantes.map((f, i) => <option key={f.clave} value={f.clave}>Firmante {i + 1}{f.nombre && !/^Firmante \d+$/.test(f.nombre) ? ` · ${f.nombre}` : ""}{f.clave === miClave ? " (tú)" : ""}{listo(f) ? " · ✓" : ""}</option>)}
            </select>
            </>}
            {fActivo && (
              <>
                {!soloYo && <div className="activeParticipantTitle" style={{ "--c": color(fActivo.clave) } as CSSProperties}><span className="punto" /> Firmante {iActivo + 1} · {fActivo.nombre}</div>}
                <div className="participantProgress">
                  {camposDe(fActivo.clave) ? `${camposDe(fActivo.clave)} campo(s) configurado(s)` : "Aún no configurado"}
                  {!soloYo && (fActivo.telefono || fActivo.email) && ` · ${[fActivo.telefono, fActivo.email].filter(Boolean).join(" · ")}`}
                </div>
                {!soloYo && <div className="filaBotones">
                  <button type="button" className="crece botonApodo" onClick={() => setEditandoContacto(true)}>✉️ Apodo y envío para el Firmante {iActivo + 1}</button>
                  {firmantes.length > 1 && <>
                    <button type="button" title="Firma antes" disabled={iActivo === 0} onClick={() => moverFirmante(-1)}>↑</button>
                    <button type="button" title="Firma después" disabled={iActivo === firmantes.length - 1} onClick={() => moverFirmante(1)}>↓</button>
                  </>}
                </div>}

                <div className="participantFieldsHeading">Delimite los campos:</div>
                <div className="participantTools" data-guia="campos">
                  <div className="participantTool">
                    <div className="participantToolHead"><strong>Firma</strong><button type="button" className="renameFieldBtn" title="Cambiar el nombre del campo de firma" onClick={() => renombrar("firma")}>✏️ Nombre</button></div>
                    <div className="participantToolActions">
                      {herramientaBoton("firma", camposDe(fActivo.clave, "firma") ? "✍️ Marcar otro lugar de firma" : "✍️ Marcar dónde irá la firma", "placeFirma")}
                      <button type="button" className="danger" disabled={!camposDe(fActivo.clave, "firma")} onClick={() => borrarTipo("firma")}>Borrar</button>
                    </div>
                    {/* Se puede firmar en varios lugares (p. ej. al pie de cada página): el firmante firma una vez y su firma va en todos. */}
                    <p className="small afFirmaVarias">{camposDe(fActivo.clave, "firma")
                      ? <>✓ <strong>{camposDe(fActivo.clave, "firma")} lugar{camposDe(fActivo.clave, "firma") === 1 ? "" : "es"}</strong> de firma marcado{camposDe(fActivo.clave, "firma") === 1 ? "" : "s"}. ¿Debe firmar en otra parte (por ejemplo, en cada página)? Pulsa otra vez y toca ese lugar.</>
                      : <>💡 Puedes marcar <strong>más de un lugar</strong>: {soloYo ? "firmas" : "el firmante firma"} una sola vez y la firma se coloca en todos.</>}</p>
                  </div>
                  <div className="participantTool">
                    <label className="checkrow"><input type="checkbox" checked={!!pide[activo]?.sello} onChange={(e) => pedir("sello", e.target.checked)} /><strong>Solicitar sello</strong>{!selloPermitido && <span className="afPaidBadge">🔒 Plan de pago</span>}</label>
                    {pide[activo]?.sello && (
                      <div className="participantToolActions">
                        {herramientaBoton("sello", "📍 Marcar sello", "placeCian")}
                        <button type="button" className="renameFieldBtn" title="Cambiar el nombre del campo de sello" onClick={() => renombrar("sello")}>✏️ Nombre</button>
                        <button type="button" className="danger" disabled={!camposDe(fActivo.clave, "sello")} onClick={() => borrarTipo("sello")}>Borrar</button>
                      </div>
                    )}
                  </div>
                  <div className="participantTool">
                    <label className="checkrow"><input type="checkbox" checked={!!pide[activo]?.huella} onChange={(e) => pedir("huella", e.target.checked)} /><strong>Solicitar huella</strong>{!selloPermitido && <span className="afPaidBadge">🔒 Plan de pago</span>}</label>
                    {pide[activo]?.huella && d && (
                      <>
                        <div className="fpFingerFields" title="De qué mano y qué dedo se pide la huella">
                          <select aria-label="Mano" value={d.mano} onChange={(e) => cambiarDedo({ mano: e.target.value as Mano })}><option value="derecha">✋ Mano derecha</option><option value="izquierda">🤚 Mano izquierda</option></select>
                          <select aria-label="Dedo" value={d.dedo} onChange={(e) => cambiarDedo({ dedo: e.target.value as Dedo })}>{Object.entries(DEDOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                        </div>
                        <div className="participantToolActions">
                          {herramientaBoton("huella", "📍 Marcar huella", "placeCian")}
                          <button type="button" className="danger" disabled={!camposDe(fActivo.clave, "huella")} onClick={() => borrarTipo("huella")}>Borrar</button>
                        </div>
                      </>
                    )}
                    {fActivo.pedirDni && <div className="small afDniNota">🪪 Firma y huella se tomarán del DNI (ver Funciones avanzadas).</div>}
                  </div>
                  <button type="button" className="danger participantClearAll" disabled={!campos.some((c) => c.firmante !== PREPARADOR && c.tipo !== "calculo")} onClick={() => {
                    // Solo los campos de los firmantes: lo que llenas tú y los cálculos del PDF se conservan.
                    if (confirm("¿Borrar las posiciones de firma, sello, huella y texto de todos los firmantes? Lo que llenas tú y los campos ƒx del PDF se conservan.")) {
                      setCampos((cs) => cs.filter((c) => c.firmante === PREPARADOR || c.tipo === "calculo")); setSel(null);
                    }
                  }}>Limpiar todos los campos</button>
                  {soloYo && botonMiFirma}
                  <div className="participantTool">
                    {/* Si firmas solo tú no hay «texto del firmante»: lo que haya que escribir lo llenas tú. */}
                    {!soloYo && <>
                    <div className="participantToolHead"><strong>Texto del firmante</strong></div>
                    <select className="afTextModeSelect" aria-label={`Texto del Firmante ${iActivo + 1}`} value={fActivo.modoTexto} onChange={(e) => cambiarModo(e.target.value as ModoTexto)}>
                      <option value="solo">🔒 Solo firmar, sellar o poner huella</option>
                      <option value="asignados">✏️ Completar los campos de texto que le asigne</option>
                      {/* Sin «disabled»: en Gratis se puede elegir y cambiarModo explica que requiere un plan (con «Ver planes»). */}
                      <option value="libre">📝 Completar campos y agregar texto libre{!textoPermitido ? " · Plan de pago" : ""}</option>
                    </select>
                    {fActivo.modoTexto !== "solo" && (
                      <>
                        <p className="small" role="status">{datosDelActivo.length
                          ? `El Firmante ${iActivo + 1} podrá llenar ${datosDelActivo.length} campo(s) de texto, fecha o casilla en su enlace.`
                          : "Aún no tiene campos para llenar. Asígnale los campos del PDF o marca un campo de texto."}</p>
                        <div className="participantToolActions">
                          {pdfVacios.length > 0 && <button type="button" className="crece" onClick={() => asignar(pdfVacios.map((c) => c.k), fActivo.clave)}>Asignarle los campos vacíos del PDF ({pdfVacios.length})</button>}
                          <button type="button" className={`crece ${herramienta === "texto" && !paraMi ? "activa" : ""}`} onClick={() => marcarTexto(false)}>🔤 Marcar campo de texto</button>
                        </div>
                        <p className="small">Para elegir quién llena cada campo, usa «Campos del PDF» → «Mostrar contenido».</p>
                      </>
                    )}
                    {!textoPermitido && <p className="small">Agregar texto libre requiere un <Link to="/planes">plan de pago</Link>. Puedes asignarle los campos que ya trae el PDF con tu plan actual.</p>}
                    {fActivo.modoTexto === "libre" && <p className="small afHerramientaAyuda">Al firmar podrá agregar texto adicional donde el documento no tenga un campo.</p>}
                    </>}
                    {/* Ajustes del campo de texto, fecha o casilla tocado en el documento. */}
                    {seleccionado && TIPOS_DATO.includes(seleccionado.tipo) && !seleccionado.bloqueado && (
                      <div className="afCampoSel">
                        <div className="afCampoSelHead">
                          <span>{ICONO[seleccionado.tipo]} Campo seleccionado{seleccionado.nombrePdf ? <small> · del PDF</small> : null}</span>
                          <button type="button" className="botonChico" aria-label="Cerrar" onClick={() => setSel(null)}>✕</button>
                        </div>
                        <div className="afCampoSelFila">
                          <select aria-label="Tipo de campo" value={seleccionado.tipo} onChange={(e) => cambiarCampo(seleccionado.k, { tipo: e.target.value as TipoCampo, valor: null })}>
                            {TIPOS_DATO.map((t) => <option key={t} value={t}>{ICONO[t]} {ETIQUETA_TIPO[t]}</option>)}
                          </select>
                          <select aria-label="Quién lo llena" value={seleccionado.firmante} onChange={(e) => asignar([seleccionado.k], e.target.value)}>
                            {opcionesQuien("Lo lleno yo", "Firmante ")}
                          </select>
                        </div>
                        {llenaCampo(seleccionado) ? (
                          seleccionado.tipo !== "casilla" && (
                            <input type={seleccionado.tipo === "fecha" ? "date" : "text"} maxLength={500} aria-label="Valor" placeholder="Valor (también puedes escribirlo en el documento)"
                              value={typeof seleccionado.valor === "string" ? seleccionado.valor : ""} onChange={(e) => cambiarCampo(seleccionado.k, { valor: e.target.value })} />
                          )
                        ) : (
                          <>
                            <input aria-label="Nombre del campo" value={seleccionado.etiqueta} maxLength={120} placeholder={`Lo que verá el firmante. Ej. ${seleccionado.tipo === "texto" ? "DNI" : seleccionado.tipo === "fecha" ? "Fecha de nacimiento" : "Acepto"}`}
                              onChange={(e) => cambiarCampo(seleccionado.k, { etiqueta: e.target.value })} />
                            <label className="afCampoSelCheck">
                              <input type="checkbox" checked={seleccionado.obligatorio} onChange={(e) => cambiarCampo(seleccionado.k, { obligatorio: e.target.checked })} />
                              {seleccionado.tipo === "casilla" ? "Debe marcarla" : "Obligatorio"}
                            </label>
                          </>
                        )}
                        <div className="participantToolActions">
                          <button type="button" onClick={() => {
                            const copia = { ...seleccionado, k: nuevaClave("c"), nombrePdf: "", y: Math.min(seleccionado.y + seleccionado.h + 6, p.alto - seleccionado.h) };
                            setCampos((cs) => [...cs, copia]);
                            setSel(copia.k);
                          }}>Duplicar</button>
                          {seleccionado.nombrePdf && <button type="button" onClick={() => alternarBloqueo(seleccionado)}>🔒 Bloquear</button>}
                          <button type="button" className="danger" onClick={() => quitarCampo(seleccionado.k)}>Eliminar campo</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="afPrepTextPanel">
              <div className="participantFieldsHeading">Texto del preparador</div>
              <p className="small">Lo que escribas queda impreso en el documento antes de enviarlo; el firmante no puede cambiarlo. No se modifica el texto que el PDF ya trae.</p>
              <button type="button" className={`placeCian anchoCompleto ${herramienta === "texto" && paraMi ? "activa" : ""}`} onClick={() => marcarTexto(true)}>🔤 Agregar cuadro de texto</button>
              {!textoPermitido && (
                <div className="signerLimitNote">
                  <span>En la prueba Gratis puedes llenar los campos que ya trae el PDF. Para agregar cuadros de texto nuevos o permitir texto libre, adquiere un plan.</span>
                  <Link className="boton primary botonChico" to={estado?.invitado ? "/registro" : "/planes"}>{estado?.invitado ? "Crear cuenta" : "Ver planes"}</Link>
                </div>
              )}
              {camposMios.length > 0 && <small className="participantProgress">{camposMios.filter((c) => c.valor === true || (typeof c.valor === "string" && c.valor.trim())).length} de {camposMios.length} llenados · escribe en los recuadros rojos del documento</small>}

              <div className="participantFieldsHeading">Campos del PDF</div>
              {!camposPdf.length && !camposCalculo.length ? <><p className="small">Este PDF no trae campos para llenar. Puedes agregar cuadros de texto.</p>{barraObligatorios}</> : (
                <>
                  <p className="small">Campos que ya trae este PDF: llénalos o deja que los llene un firmante.</p>
                  {camposPdf.length > 0 && (
                    <div className="afLockBar">
                      <button type="button" className={modoBloqueo ? "primary" : ""} onClick={() => { setModoBloqueo(!modoBloqueo); setModoObligatorio(false); setHerramienta(null); }}>
                        {modoBloqueo ? "✓ Terminar de bloquear" : "🔒 Bloquear campos"}
                      </button>
                      {bloqueados > 0 && <button type="button" onClick={desbloquearTodos}>🔓 Desbloquear todos ({bloqueados})</button>}
                    </div>
                  )}
                  {modoBloqueo
                    ? <p className="small afLockHint">👆 Toca en el documento los campos y casillas que nadie debe llenar. Vuelve a tocarlos para desbloquearlos.</p>
                    : bloqueados === 0 && camposPdf.length > 0 && <p className="small">Los campos bloqueados quedan vacíos y nadie los puede llenar.</p>}
                  {barraObligatorios}
                  {casillasPdf.length > 0 && (
                      <div className="afPdfFieldRow">
                        <div className="afPdfFieldName">☑️ Casillas y opciones <span>· {casillasPdf.length}{casillasPdf.some((c) => c.bloqueado) ? ` · 🔒 ${casillasPdf.filter((c) => c.bloqueado).length}` : ""}{casillasLibres.length && casillasLibres.every((c) => c.firmante === PREPARADOR) ? ` · ${casillasLibres.filter((c) => c.valor === true).length} marcadas` : ""}</span></div>
                        {casillasLibres.length > 0 && (
                          <select aria-label="Quién marca las casillas" value={casillasLibres.every((c) => c.firmante === casillasLibres[0].firmante) ? casillasLibres[0].firmante : ""}
                            onChange={(e) => e.target.value && asignar(casillasLibres.map((c) => c.k), e.target.value)}>
                            {!casillasLibres.every((c) => c.firmante === casillasLibres[0].firmante) && <option value="">Varios (elige para asignar todas)</option>}
                            {opcionesQuien("Las marco yo (clic sobre el documento)", "Las marca el Firmante ")}
                          </select>
                        )}
                      </div>
                    )}
                  {/* El resto (cálculos y cada campo de texto) va minimizado: solo se abre si hace falta. */}
                  {(camposCalculo.length > 0 || textosPdf.length > 0) && (
                    <button type="button" className="afMostrarContenido" aria-expanded={verContenidoPdf} onClick={() => setVerContenidoPdf(!verContenidoPdf)}>
                      {verContenidoPdf ? "▲ Ocultar contenido" : `▼ Mostrar contenido (${textosPdf.length} campo${textosPdf.length === 1 ? "" : "s"}${camposCalculo.length ? ` · ${camposCalculo.length} ƒx` : ""})`}
                    </button>
                  )}
                  {verContenidoPdf && <div className="afPdfFieldList">
                    {camposCalculo.length > 0 && (
                      <div className="afPdfFieldRow afCalcRow">
                        <div className="afPdfFieldName">ƒx Calculados por el PDF <span>· {camposCalculo.length}</span></div>
                        {camposCalculo.map((c) => <div className="afCalcLine" key={c.k}><span>{c.etiqueta || c.nombrePdf}</span><span className="afCalcVal">{calculo[c.nombrePdf] || "—"}</span></div>)}
                      </div>
                    )}
                    {textosPdf.map((c, i) => (
                      <div className={`afPdfFieldRow ${sel === c.k ? "sel" : ""} ${c.bloqueado ? "locked" : ""}`} key={c.k}>
                        <div className="afPdfFieldTop">
                          <button type="button" className="afPdfFieldName" title="Ir al campo" onClick={() => irACampo(c)}>{i + 1}. {c.etiqueta || c.nombrePdf} <span>· pág. {c.pagina}{esRequerido(c) ? " · ✱ obligatorio" : ""}</span></button>
                          <button type="button" className="afRowLock" title={c.bloqueado ? "Desbloquear" : "Bloquear: nadie lo llena"} onClick={() => alternarBloqueo(c)}>{c.bloqueado ? "🔒" : "🔓"}</button>
                        </div>
                        {c.bloqueado ? <div className="small afLockedNote">🔒 Bloqueado: queda vacío y nadie lo puede llenar.</div> : (
                          <>
                            <select aria-label="Quién llena este campo" value={c.firmante} onChange={(e) => asignar([c.k], e.target.value)}>
                              {opcionesQuien("Lo lleno yo ahora", "Lo llena el Firmante ")}
                            </select>
                            {c.firmante === PREPARADOR && (
                              <input type={c.tipo === "fecha" ? "date" : "text"} maxLength={500} placeholder="Valor" aria-label={`Valor de ${c.etiqueta || c.nombrePdf}`}
                                value={typeof c.valor === "string" ? c.valor : ""} onChange={(e) => cambiarCampo(c.k, { valor: e.target.value })} />
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="privNote">🔒 <strong>Tus documentos y firmas se guardan de forma privada.</strong> Solo los ven tú y las personas a las que envíes su enlace.</div>

        {/* Orden, mensaje e idioma son para los firmantes: si firmas solo tú no hacen falta. */}
        {!soloYo && <div className="step" data-paso="orden" onBlur={alSalirDe("orden")}>
          <div className="stepTitle"><span className="stepNumber">4</span>Orden, mensaje e idioma</div>
          {firmantes.length > 1 && <>
            <label className="checkrow"><input type="radio" name="orden" checked={orden === "secuencial"} onChange={() => setOrden("secuencial")} /><div><strong>En orden</strong><div className="small">Cada firmante recibe su enlace cuando firma el anterior. Cambia el orden con ↑ ↓.</div></div></label>
            <label className="checkrow"><input type="radio" name="orden" checked={orden === "paralelo"} onChange={() => setOrden("paralelo")} /><div><strong>Todos a la vez</strong><div className="small">Todos pueden firmar desde que se envía.</div></div></label>
          </>}
          <textarea className="mensajeDoc" value={mensaje} maxLength={500} rows={2} onChange={(e) => setMensaje(e.target.value)} placeholder="Mensaje para los firmantes (opcional). Ej. Por favor firma antes del viernes." aria-label="Mensaje para los firmantes" />
          <label className="idiomaFirmante">
            <span>🌐 Idioma de la página para firmar</span>
            <select value={idioma} onChange={(e) => setIdioma(e.target.value as Idioma)}>
              <option value="es">Español</option>
              <option value="en">English (inglés)</option>
            </select>
            <small className="small">Los botones e instrucciones que verán los firmantes. Se eligió según el idioma del PDF; cada firmante también puede cambiarlo en su página. Los nombres de los campos son los del documento.</small>
          </label>
        </div>}

        <div className="step" data-paso="enviar">
          <div className="stepTitle"><span className="stepNumber">{soloYo ? 4 : 5}</span>{firmoSoloYo ? "Firmar" : "Guardar configuración"}</div>
          <div className="actions">
            {esPlantilla ? (
              <button type="button" className="success" onClick={async () => { await plataforma.guardar(inicial.id, datos); navegar(`/app/d/${(await plataforma.duplicar(inicial.id)).id}`); }}>📋 Usar esta plantilla</button>
            ) : (
              <button type="button" data-guia="enviar" className={conWhatsApp ? "green" : "primary"} disabled={enviando} onClick={enviar}>
                {firmoSoloYo ? (enviando ? "Firmando…" : "✍️ Firmar documento")
                  : <>{conWhatsApp && WA_SVG}{enviando ? "Enviando…" : conWhatsApp ? "Guardar y enviar" : "💾 Guardar y enviar"}</>}
              </button>
            )}
            <button type="button" onClick={async () => {
              await plataforma.plantilla(inicial.id, !esPlantilla);
              setEsPlantilla(!esPlantilla);
              setAviso(!esPlantilla ? "Guardado como plantilla: aparecerá en «Plantillas» para usarlo cuantas veces quieras." : "Ya no es una plantilla.");
            }}>{esPlantilla ? "Quitar de plantillas" : "📋 Guardar como plantilla"}</button>
            <button type="button" className="danger" onClick={eliminar}>{esPlantilla ? "🗑️ Eliminar plantilla" : "Eliminar borrador"}</button>
          </div>
          <p className="small">{firmoSoloYo
            ? "Tu firma se aplica al documento y podrás descargar el PDF firmado con su certificado."
            : "Al enviar, cada firmante recibe su enlace por WhatsApp o correo. Puedes seguir el avance y descargar el PDF firmado con su certificado."}</p>
        </div>

        {/* Si firmas solo tú, el botón va junto a tus campos (paso 3); si solo firman otros, no se muestra. */}
        {quien === "ambos" && botonMiFirma}

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
        {/* Funciones avanzadas: todas las opciones adicionales juntas; se minimizan y maximizan con su botón. */}
        <div className={`afAvanzadas ${avanzadas ? "abierto" : ""}`}>
          <button type="button" className="afAvanzadasBoton" aria-expanded={avanzadas} aria-controls="afAvanzadasCuerpo" onClick={() => setAvanzadas(!avanzadas)}>
            <span>⚙️ Funciones avanzadas</span>
            {activasAvanzadas > 0 && <span className="afAvanzadasCuenta">{activasAvanzadas} activa{activasAvanzadas === 1 ? "" : "s"}</span>}
            <span className="afAvanzadasFlecha" aria-hidden>{avanzadas ? "▲ Minimizar" : "▼ Maximizar"}</span>
          </button>
          {avanzadas && (
            <div id="afAvanzadasCuerpo" className="afSecurityRow">
              {!soloYo && <>
              <label className="checkrow"><input type="checkbox" checked={bloquearDibujo} onChange={(e) => setBloquearDibujo(e.target.checked)} />
                <div><strong>🔒 Bloquear firma con el dedo o en pantalla</strong><div className="small">Los firmantes deberán fotografiar o subir su firma hecha en papel.</div></div></label>
              <label className={`checkrow ${pide[activo]?.sello || campos.some((c) => c.tipo === "sello") ? "" : "afInactiva"}`}>
                <input type="checkbox" checked={bloquearSello} onChange={(e) => setBloquearSello(e.target.checked)} />
                <div><strong>🔒 Bloquear confección del sello</strong><div className="small">El firmante deberá fotografiar o subir su sello real.{!campos.some((c) => c.tipo === "sello") && " Se aplica cuando pidas un sello."}</div></div></label>
              </>}
              <label className="checkrow"><input type="checkbox" checked={!!fActivo?.pedirDni} disabled={!fActivo} onChange={(e) => pedirDni(e.target.checked)} />
                <div><div className="afTituloOpcion"><strong>🪪 Requerir firma y huella capturando DNI</strong>{!selloPermitido && <span className="afPaidBadge">🔒 Plan de pago</span>}</div>
                  <div className="small">Para el Firmante {iActivo + 1}{conDni.length > (fActivo?.pedirDni ? 1 : 0) ? ` (también: ${conDni.filter((i) => i !== iActivo).map((i) => `Firmante ${i + 1}`).join(", ")})` : ""}: foto frontal del DNI, su firma en papel y el reverso, de donde sale la huella. Las fotos del DNI van en una hoja de evidencias del PDF{certificado ? ", junto a su cronología" : ""}. No valida identidad ante RENIEC.</div></div></label>
              <label className={`checkrow ${hayEvidencias ? "" : "afInactiva"}`}><input type="checkbox" checked={certificado} disabled={!hayEvidencias} onChange={(e) => setCertificado(e.target.checked)} />
                <div><strong>📜 Generar certificado de evidencias</strong><div className="small">{hayEvidencias
                  ? `Añade al PDF una hoja por firmante con la cronología de su firma, sello y huella${conDni.length ? ", las fotos de su DNI" : ""}, sus imágenes y su ubicación si la autoriza.`
                  : "Disponible cuando marques una firma, un sello o una huella."}</div></div></label>
              {!soloYo && <label className="checkrow"><input type="checkbox" checked={flujo} onChange={(e) => setFlujo(e.target.checked)} />
                <div><strong>✨ Convertir en Flujo</strong><div className="small">El firmante verá primero el documento, luego completará en un formulario guiado los campos de texto, fecha y casillas que le asignaste{conDni.length ? " (después, los pasos del DNI)" : ""} y al final firmará. Los campos bloqueados quedan fuera del formulario.{flujo && !hayDatosFirmantes ? " Ahora ningún firmante tiene campos de texto: firmarán directamente." : ""}</div></div></label>}
            </div>
          )}
        </div>
        {/* «Navegar por páginas / Eliminar páginas»: se minimiza para que no ocupe espacio; se recuerda la última elección. */}
        {inicial.paginas.length > 1 && (
          <div className={`afAvanzadas afPaginas ${verPaginas ? "abierto" : ""}`}>
          <button type="button" className="afAvanzadasBoton" aria-expanded={verPaginas} aria-controls="afPaginasCuerpo" onClick={() => setVerPaginas(!verPaginas)}>
            <span>📑 Navegar por páginas / Eliminar páginas</span>
            <span className="afAvanzadasCuenta">Página {pagina} de {inicial.paginas.length}</span>
            <span className="afAvanzadasFlecha" aria-hidden>{verPaginas ? "▲ Minimizar" : "▼ Maximizar"}</span>
          </button>
          {verPaginas && <div id="afPaginasCuerpo">
          <NavPaginas idCampo="numPagina" pagina={pagina} total={inicial.paginas.length} alCambiar={(n) => { setPagina(n); setSel(null); }}>
            <button type="button" className="danger" title="Quitar esta página del documento que se enviará" onClick={quitarPagina}>🗑️ Eliminar esta página</button>
          </NavPaginas>
        {inicial.paginas.length > 2 && (
          <form className="pdfQuitarRango" onSubmit={(e) => { e.preventDefault(); quitarRango(); }}>
            <label htmlFor="rangoQuitar">🗑️ Quitar varias páginas</label>
            <input id="rangoQuitar" value={rangoQuitar} placeholder="Ej.: 2-5 o 2,5" autoComplete="off" inputMode="text" maxLength={300}
              aria-describedby="rangoQuitarAyuda" aria-invalid={!!errorRango} onChange={(e) => { setRangoQuitar(e.target.value); setErrorRango(""); }} />
            <button type="submit" className="danger" disabled={quitandoRango || !rangoQuitar.trim()}>{quitandoRango ? "Quitando…" : "Quitar"}</button>
            <small id="rangoQuitarAyuda" className={errorRango ? "pdfQuitarError" : ""} role={errorRango ? "alert" : undefined}>
              {errorRango || "«2-5» quita de la 2 a la 5 · «2,5» quita solo la 2 y la 5 · puedes combinarlas: «1-3, 8»."}
            </small>
          </form>
        )}
          </div>}
          </div>
        )}
        {herramienta && <div className="avisoColocar">👆 Toca el documento donde va el campo «{ETIQUETA_TIPO[herramienta]}» {destino}. <button type="button" className="enlace" onClick={() => setHerramienta(null)}>Cancelar</button></div>}
        {errorPdf && <div className="afAlerta">{errorPdf}</div>}
        <div className="preview">
          <div className="zoomCaja" style={{ width: `calc(min(100%, 1000px) * ${zoom})` }}>
            <PaginaPdf doc={doc} avance={avancePdf} numero={pagina} pagina={p} alTocar={colocar} cursor={herramienta ? "crosshair" : undefined} refContenedor={(el) => { contenedor.current = el; }}>
              {campos.filter((c) => c.pagina === pagina).map((c) => {
                const mio = llenaCampo(c), lleno = c.valor === true || (typeof c.valor === "string" && c.valor.trim() !== "");
                const quien = c.tipo === "calculo" ? "lo calcula el PDF" : c.firmante === PREPARADOR ? "lo llenas tú" : nombreDe(c.firmante);
                return (
                <div
                  key={c.k} role="button" tabIndex={0}
                  className={`campoEditor tipo-${c.tipo} ${sel === c.k ? "sel" : ""} ${c.firmante !== activo && c.firmante !== PREPARADOR ? "otroFirmante" : ""} ${mio ? "preparador" : ""} ${mio && lleno ? "lleno" : ""} ${c.bloqueado ? "bloqueado" : ""} ${modoBloqueo && c.nombrePdf && TIPOS_DATO.includes(c.tipo) && !c.bloqueado ? "bloqueable" : ""} ${modoObligatorio && TIPOS_DATO.includes(c.tipo) && !c.bloqueado ? "marcable" : ""} ${esRequerido(c) ? "requerido" : ""}`}
                  style={{ ...posicion(c, p), "--c": colorCampo(c) } as CSSProperties}
                  onPointerDown={(e) => {
                    // «Bloquear campos»: tocar un campo del PDF lo bloquea o desbloquea.
                    if (modoBloqueo && c.nombrePdf && TIPOS_DATO.includes(c.tipo)) { e.stopPropagation(); e.preventDefault(); alternarBloqueo(c); return; }
                    // «Marcar campos obligatorios»: tocar un campo de un firmante lo hace obligatorio u opcional.
                    if (modoObligatorio && TIPOS_DATO.includes(c.tipo) && !c.bloqueado) { e.stopPropagation(); e.preventDefault(); alternarObligatorio(c); return; }
                    if (modoObligatorio && ES_IMAGEN(c.tipo)) { e.stopPropagation(); e.preventDefault(); setAviso("La firma, el sello y la huella siempre son obligatorios."); return; }
                    // Las casillas que llenas tú se marcan con un toque (como en el prototipo).
                    if (mio && c.tipo === "casilla") { e.stopPropagation(); setSel(c.k); cambiarCampo(c.k, { valor: !(c.valor === true) }); return; }
                    empezarArrastre(e, c, "mover");
                  }}
                  onPointerMove={moverArrastre} onPointerUp={terminarArrastre} onPointerCancel={terminarArrastre}
                  title={`${c.etiqueta || ETIQUETA_TIPO[c.tipo]} — ${quien}`}
                >
                  {/* Como el prototipo: los datos (texto, fecha, casilla) son solo un recuadro; su nombre está en el título y en «Texto del firmante».
                      Los que llenas tú se escriben aquí mismo; los ƒx muestran el resultado del cálculo del PDF. */}
                  {/* En «Bloquear campos» no se escribe: el recuadro de texto se quitaría el toque y el campo no se bloquearía. */}
                  {mio && c.tipo !== "casilla" && !(modoBloqueo && c.nombrePdf) && !modoObligatorio && (
                    <input className="campoEntrada" type={c.tipo === "fecha" ? "date" : "text"} maxLength={500} aria-label={c.etiqueta || ETIQUETA_TIPO[c.tipo]}
                      value={typeof c.valor === "string" ? c.valor : ""} onPointerDown={(e) => e.stopPropagation()} onFocus={() => setSel(c.k)}
                      onChange={(e) => cambiarCampo(c.k, { valor: e.target.value })} />
                  )}
                  {mio && c.tipo === "casilla" && c.valor === true && <MarcaCasilla />}
                  {mio && c.tipo !== "casilla" && ((modoBloqueo && c.nombrePdf) || modoObligatorio) && typeof c.valor === "string" && c.valor && <span className="campoEditorTexto valorLleno">{c.valor}</span>}
                  {esRequerido(c) && <span className="marcaObligatorio" aria-label="Obligatorio">✱</span>}
                  {c.bloqueado && <span className="campoBloqueado">{c.tipo === "casilla" ? "🔒" : "🔒 Bloqueado"}</span>}
                  {c.tipo === "calculo" && <span className="campoCalculo">ƒx {calculo[c.nombrePdf] ?? ""}</span>}
                  {ES_IMAGEN(c.tipo) && c.firmante === miClave && misImagenes[c.tipo]
                    ? <img src={misImagenes[c.tipo]} alt={`Tu ${c.tipo}`} draggable={false} />
                    : ES_IMAGEN(c.tipo) && <span className="campoRotulo">{rotulo(c)}</span>}
                  {sel === c.k && (
                    <span className="asaTamano" onPointerDown={(e) => empezarArrastre(e, c, "tamano")} onPointerMove={moverArrastre} onPointerUp={terminarArrastre} aria-label="Cambiar tamaño" />
                  )}
                </div>
                );
              })}
            </PaginaPdf>
          </div>
        </div>
        {/* Las mismas flechas debajo del documento (sin «Eliminar»): para no tener que volver arriba a cambiar de página. */}
        {verPaginas && inicial.paginas.length > 1 && (
          <NavPaginas idCampo="numPaginaAbajo" pagina={pagina} total={inicial.paginas.length} alCambiar={(n) => { setPagina(n); setSel(null); }} />
        )}
        <div className="legend">
          {camposMios.length > 0 && <span><i className="dot" style={{ background: COLOR_PREPARADOR }} /> Lo llenas tú</span>}
          {firmantes.map((f, i) => <span key={f.clave}><i className="dot" style={{ background: color(f.clave) }} /> Firmante {i + 1}{f.clave === miClave ? " (tú)" : ""}</span>)}
          {campos.some((c) => c.firmante === activo && c.tipo === "sello") && <span><i className="dot" style={{ background: "#c99400" }} /> Sello {iActivo + 1}</span>}
          {campos.some((c) => c.firmante === activo && c.tipo === "huella") && <span><i className="dot" style={{ background: "#b3261e" }} /> Huella {iActivo + 1}</span>}
          {camposCalculo.length > 0 && <span><i className="dot" style={{ background: "#0e9f6e" }} /> ƒx Calculado por el PDF</span>}
        </div>
        <p className="small">Arrastra un campo para moverlo y usa la esquina para cambiar su tamaño. Con el teclado: flechas para mover, Supr para borrar.</p>
      </section>

      {capturando && miClave && (
        <PantallaFirma
          titulo={`${capturando === "firma" ? "Tu firma" : capturando === "sello" ? "Tu sello" : "Tu huella"} — ${nombreDe(miClave)}`}
          tipo={capturando} inicial={misImagenes[capturando] ?? null}
          bloquearDibujo={bloquearDibujo} bloquearSello={bloquearSello} dedo={capturando === "huella" ? dedoDe(miClave) : null}
          alTerminar={(png) => terminarCaptura(capturando, png)} alCerrar={() => setCapturando(null)}
        />
      )}

      {preguntarQuien && <QuienFirma puedeVarios={maxFirmantes >= 2} alElegir={elegirQuien}
        alDespues={() => { setPreguntarQuien(false); guardarQuien(inicial.id, "ambos"); empezarPasivo(); }} />}

      {editandoContacto && fActivo && (
        <EditorContacto
          numero={iActivo + 1} firmante={fActivo} contactos={contactos}
          alGuardar={(c) => { setFirmantes((fs) => fs.map((f) => (f.clave === fActivo.clave ? { ...f, ...c } : f))); setEditandoContacto(false); senalarSiguiente({ clave: fActivo.clave, ...c }); }}
          alCerrar={() => setEditandoContacto(false)}
        />
      )}
    </div>
    </>
  );
}

/**
 * Emergente al subir un PDF: «¿Quién firma este documento?». Según la respuesta el editor muestra solo lo necesario.
 * «Decidir después» (o Esc) deja todas las opciones, como «Yo y otras personas», sin agregar firmantes.
 */
function QuienFirma({ puedeVarios, alElegir, alDespues }: { puedeVarios: boolean; alElegir: (q: Quien) => void; alDespues: () => void }) {
  const despues = alDespues;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && despues();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [despues]);
  const opcion = (q: Quien, icono: string, titulo: string, detalle: string, disabled = false) => (
    <button type="button" className="quienFirmaOpcion" disabled={disabled} onClick={() => alElegir(q)}>
      <span className="quienIcono" aria-hidden>{icono}</span>
      <span><strong>{titulo}</strong><small>{detalle}</small></span>
    </button>
  );
  return (
    <div className="nicknameEditor">
      <section className="nicknameEditorCard" role="dialog" aria-modal="true" aria-labelledby="quienFirmaTitulo">
        <h2 id="quienFirmaTitulo">¿Quién firma este documento?</h2>
        <p>Así te mostramos solo las opciones que necesitas. Puedes cambiarlo después en el paso 3.</p>
        <div className="quienFirmaOpciones">
          {opcion("yo", "✍️", "Solo yo", "Lo firmo yo mismo ahora y descargo el PDF firmado.")}
          {opcion("otros", "👥", "Otras personas", "Marco dónde firma cada una y les envío su enlace por WhatsApp o correo.")}
          {opcion("ambos", "✍️👥", "Yo y otras personas", puedeVarios
            ? "Firmo yo y también envío el documento a otras personas."
            : "Tu plan actual permite un solo firmante por documento.", !puedeVarios)}
        </div>
        <div className="quienFirmaDespues"><button type="button" className="enlace" onClick={despues}>Decidir después</button></div>
      </section>
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
