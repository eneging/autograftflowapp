/*
 * En el editor, en pantallas donde la vista previa queda debajo del menú: ir al documento y volver al punto exacto de
 * donde se vino. Lo usan el botón «Ver documento» de la barra superior y los botones que colocan un campo en el documento.
 */

const VISTA_PREVIA = ".previewCard .preview";
/** Hasta aquí la vista previa queda debajo del menú (.editorGrid a una columna). */
const UNA_COLUMNA = "(max-width: 900px)";

let origen: number | null = null;
const movimiento = (): ScrollBehavior => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/** ¿La vista previa está a la vista? (es lo que decide qué dice el botón, también si se desplaza a mano). */
export function enElDocumento() {
  const r = document.querySelector(VISTA_PREVIA)?.getBoundingClientRect();
  return !!r && r.top < innerHeight * 0.45 && r.bottom > 0;
}

/** Baja hasta el documento recordando de dónde se viene. Con una instrucción encima («Toca el documento…»), desde ella. */
export function irAlDocumento() {
  if (enElDocumento()) return;
  origen = window.scrollY;
  (document.querySelector(".previewCard .avisoColocar") ?? document.querySelector(VISTA_PREVIA))?.scrollIntoView({ block: "start", behavior: movimiento() });
}

/** Como irAlDocumento, pero solo si la vista previa queda debajo del menú: en una pantalla ancha ya está al lado. */
export function irAlDocumentoSiEstaDebajo() {
  if (matchMedia(UNA_COLUMNA).matches) irAlDocumento();
}

/** Vuelve a donde se estaba; si se llegó al documento deslizando a mano, al comienzo de la página. */
export function volverDelDocumento() {
  window.scrollTo({ top: origen ?? 0, behavior: movimiento() });
  origen = null;
}

export const olvidarOrigen = () => { origen = null; };
