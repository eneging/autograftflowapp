import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { plataforma, type EstadoGuia, type Usuario } from "./api";
import { usarSesion } from "./sesion";
import "./guia-proceso.css";

const INICIAL: EstadoGuia = { estado: "pendiente", paso: 1, documentoId: null };
const ContextoGuia = createContext<{ guia: EstadoGuia; cambiar: (g: EstadoGuia) => void; seguirDocumento: (id: number, paso: number, nuevo?: boolean) => void; aviso: string }>({ guia: INICIAL, cambiar: () => {}, seguirDocumento: () => {}, aviso: "" });

export function GuiaProveedor({ children }: { children: ReactNode }) {
  const { usuario } = usarSesion();
  return <GuiaSesion key={usuario?.id ?? "sin-sesion"} usuario={usuario}>{children}</GuiaSesion>;
}

function GuiaSesion({ usuario, children }: { usuario: Usuario | null | undefined; children: ReactNode }) {
  const clave = `autograflow_guia_${usuario?.id ?? "sin-sesion"}`;
  const [guia, setGuia] = useState<EstadoGuia>(() => {
    try {
      const cache = JSON.parse(localStorage.getItem(clave) ?? "null");
      if (cache && ["pendiente", "activa", "omitida", "completa"].includes(cache.estado)
        && Number.isInteger(cache.paso) && cache.paso >= 1 && cache.paso <= 6
        && (cache.documentoId === null || Number.isInteger(cache.documentoId))) return cache;
    } catch { /* La preferencia del servidor sigue disponible. */ }
    return usuario?.guia ?? INICIAL;
  });
  const [aviso, setAviso] = useState("");
  const estadoActual = useRef(guia);
  const cola = useRef(Promise.resolve());
  const revision = useRef(0);
  const montar = useRef(true);
  useEffect(() => { montar.current = true; return () => { montar.current = false; }; }, []);
  function cambiar(g: EstadoGuia) {
    if (!usuario) return;
    estadoActual.current = g;
    setGuia(g); setAviso("");
    try { localStorage.setItem(clave, JSON.stringify(g)); } catch { /* Se intenta guardar en la cuenta. */ }
    const actual = ++revision.current;
    // Las preferencias se guardan en orden para que «Saltar» no sea sobrescrito por un paso anterior.
    cola.current = cola.current.catch(() => {}).then(async () => {
      try {
        await plataforma.guardarGuia(g);
        if (actual === revision.current) {
          try { localStorage.removeItem(clave); } catch { /* Sin caché disponible. */ }
          if (montar.current) setAviso("");
        }
      } catch {
        if (actual === revision.current && montar.current) setAviso("No se pudo sincronizar la preferencia con tu cuenta. Se mantiene en este navegador si permite almacenamiento.");
      }
    });
  }
  function seguirDocumento(id: number, paso: number, nuevo = false) {
    const actual = estadoActual.current;
    if ((actual.estado === 'activa' || actual.estado === 'pendiente') && (nuevo || !actual.documentoId || actual.documentoId === id)) {
      cambiar({ estado: 'activa', paso, documentoId: id });
    }
  }
  return <ContextoGuia.Provider value={{ guia, cambiar, seguirDocumento, aviso }}>{children}</ContextoGuia.Provider>;
}

export const usarGuia = () => useContext(ContextoGuia);

/** Siempre disponible; reactivar no modifica ni envía el documento del usuario. */
export function BotonGuia() {
  const { guia, cambiar, aviso } = usarGuia();
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const id = /^\/app\/d\/(\d+)$/.exec(pathname)?.[1];
  const activa = guia.estado === "pendiente" || guia.estado === "activa";
  return <span className="guiaAcceso"><button type="button" className="botonChico" onClick={() => {
    if (activa) {
      const tarjeta = document.querySelector("[data-guia-tarjeta]");
      if (tarjeta) tarjeta.scrollIntoView({ block: "center", behavior: "auto" });
      else navegar(guia.documentoId ? `/app/d/${guia.documentoId}` : "/app");
      return;
    }
    cambiar({ estado: "activa", paso: id ? 2 : 1, documentoId: id ? Number(id) : null });
    if (pathname !== "/app" && !id) navegar("/app");
    else requestAnimationFrame(() => document.querySelector("[data-guia-tarjeta]")?.scrollIntoView({ block: "center", behavior: "auto" }));
  }}>{activa ? "Ver guía" : "Activar guía"}</button>{aviso && <span className="guiaError" role="status">{aviso}</span>}</span>;
}

const PASOS = [
  { titulo: "Vamos con tu primer PDF", texto: "Selecciona tu archivo en el botón resaltado o arrástralo. Cuando termine de subir, te acompañaré dentro del editor.", objetivo: "subir" },
  { titulo: "Indica quién va a firmar", texto: "Elige la cantidad de personas y escribe sus nombres. Añade sus contactos para preparar el envío. Si firmas tú, puedes usar «Agregar mi firma».", objetivo: "firmantes" },
  { titulo: "Coloca los campos en el PDF", texto: "Selecciona un participante, pulsa «Marcar firma» y toca el PDF donde debe firmar. Repite para los demás. También puedes asignar campos que ya traiga el documento.", objetivo: "campos" },
  { titulo: "Revisa y envía tu documento", texto: "Comprueba los nombres, los campos y el orden de firma. Luego usa «Guardar y enviar». Esta acción es real: los campos dejarán de poder editarse y se usará el cupo de tu plan.", objetivo: "enviar" },
  { titulo: "Comparte el enlace personal", texto: "Usa «Enviar por WhatsApp» o «Copiar enlace» junto a cada firmante pendiente. Abrir WhatsApp prepara el mensaje; tú decides enviarlo. No compartas el enlace de una persona con otra.", objetivo: "compartir" },
  { titulo: "Aquí puedes seguir las firmas", texto: "Revisa quién abrió y quién firmó. Cuando todos terminen, aparecerá la descarga del PDF final. Puedes salir y volver a este documento desde Mis documentos.", objetivo: "seguimiento" },
] as const;

export function GuiaProceso({ etapa, documentoId, firmantesListos = false, camposListos = false, completo = false, plantilla = false, cargando = false, documentoDisponible = true }: {
  etapa: "panel" | "editor" | "seguimiento"; documentoId?: number; firmantesListos?: boolean; camposListos?: boolean;
  completo?: boolean; plantilla?: boolean; cargando?: boolean; documentoDisponible?: boolean;
}) {
  const { guia, cambiar, aviso } = usarGuia();
  const activa = guia.estado === "pendiente" || guia.estado === "activa";
  const mismo = etapa === 'panel' || !guia.documentoId || guia.documentoId === documentoId;
  const paso = etapa === "panel" ? 1 : etapa === "editor" ? Math.max(2, Math.min(4, guia.paso)) : completo ? 6 : Math.max(5, guia.paso);
  const continuarDocumento = etapa === "panel" && guia.documentoId && documentoDisponible;
  const seleccionado = PASOS[paso - 1];
  const objetivo = completo && etapa === 'seguimiento' ? 'descarga' : seleccionado.objetivo;
  const visible = activa && !cargando;
  useEffect(() => {
    if (visible && etapa !== "panel" && mismo && documentoId && (!guia.documentoId || guia.paso < 2 || (etapa === 'seguimiento' && guia.paso !== paso))) {
      cambiar({ estado: "activa", paso, documentoId });
    }
  }, [visible, etapa, mismo, documentoId, guia.documentoId, guia.paso, paso]);
  useEffect(() => {
    if (!visible || !mismo || continuarDocumento || plantilla) return;
    const elemento = document.querySelector<HTMLElement>(`[data-guia="${objetivo}"]`);
    elemento?.classList.add("guiaResaltado");
    return () => { elemento?.classList.remove("guiaResaltado"); };
  }, [visible, mismo, continuarDocumento, plantilla, objetivo]);
  if (!visible) return null;
  function mostrar() {
    const elemento = document.querySelector<HTMLElement>(`[data-guia="${objetivo}"]`);
    elemento?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const control = elemento?.matches("button,a,input,[tabindex]") ? elemento : elemento?.querySelector<HTMLElement>("input,button,a,select,[tabindex]");
    control?.focus({ preventScroll: true });
  }
  const avanzar = (p: number) => cambiar({ estado: "activa", paso: p, documentoId: documentoId ?? null });
  return <aside className="guiaProceso" data-guia-tarjeta aria-labelledby="guiaProcesoTitulo">
    <div className="guiaProcesoCabecera"><span>TE ACOMPAÑO · {continuarDocumento ? "CONTINUAR" : `${paso} DE 6`}</span><button type="button" onClick={() => cambiar({ ...guia, estado: "omitida", documentoId: null })}>Saltar guía ×</button></div>
    <div className="guiaProcesoProgreso" role="progressbar" aria-label="Progreso de la introducción" aria-valuemin={1} aria-valuemax={6} aria-valuenow={continuarDocumento ? guia.paso : paso}><span style={{ width: `${(continuarDocumento ? guia.paso : paso) / 6 * 100}%` }} /></div>
    <h2 id="guiaProcesoTitulo" aria-live="polite" aria-atomic="true">{continuarDocumento ? "Tu guía continúa en el documento" : !mismo ? "¿Seguimos con este documento?" : plantilla ? "Primero crea un documento desde tu plantilla" : seleccionado.titulo}</h2>
    <p>{continuarDocumento ? "Tu avance está guardado. Abre el documento para continuar con sus firmantes, campos y enlaces." : !mismo ? "Puedes continuar la introducción con este documento o volver al que estabas preparando." : plantilla ? "Usa «Usar esta plantilla» para crear una copia en borrador. Después puedes reiniciar la guía y preparar esa copia." : completo && etapa === "seguimiento" ? "Tu documento ya está completado. Puedes descargar el PDF firmado y su certificado con el botón resaltado." : seleccionado.texto}</p>
    <div className="guiaProcesoAcciones">
      {continuarDocumento ? <><Link className="boton primary" to={`/app/d/${guia.documentoId}`}>Continuar en mi documento →</Link><button type="button" onClick={() => cambiar({ estado: "activa", paso: 1, documentoId: null })}>Guiarme con otro PDF</button></>
        : !mismo ? <><button type="button" className="primary" onClick={() => cambiar({ estado: "activa", paso: etapa === 'editor' ? 2 : 5, documentoId: documentoId! })}>Guiarme aquí</button><Link to={`/app/d/${guia.documentoId}`}>Volver al documento anterior</Link></>
        : !plantilla && <>
          <button type="button" onClick={mostrar}>Mostrar dónde ↗</button>
          {etapa === "editor" && paso > 2 && <button type="button" onClick={() => avanzar(paso - 1)}>← Anterior</button>}
          {etapa === "editor" && paso < 4 && <button type="button" className="primary" disabled={paso === 2 ? !firmantesListos : !camposListos} onClick={() => avanzar(paso + 1)}>{paso === 2 ? "Ya están los firmantes →" : "Revisar envío →"}</button>}
          {etapa === "seguimiento" && paso === 5 && <button type="button" className="primary" onClick={() => avanzar(6)}>Ya compartí los enlaces →</button>}
          {etapa === "seguimiento" && paso === 6 && <button type="button" className="primary" onClick={() => cambiar({ ...guia, estado: "completa", paso: 6, documentoId: documentoId! })}>Terminar introducción ✓</button>}
        </>}
    </div>
    {etapa === "editor" && mismo && paso === 2 && !firmantesListos && <p className="guiaProcesoPista">Para continuar la guía, añade al menos un firmante con su nombre.</p>}
    {etapa === "editor" && mismo && paso === 3 && !camposListos && <p className="guiaProcesoPista">Asigna al menos un campo a cada firmante para continuar. La validación final se hace al enviar.</p>}
    {aviso && <p className="guiaError" role="status">{aviso}</p>}
    <small>Puedes saltarla ahora y volver a activarla desde «Activar guía».</small>
  </aside>;
}
