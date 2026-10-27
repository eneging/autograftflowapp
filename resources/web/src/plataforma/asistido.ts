import { useEffect, useState } from "react";

/*
 * Modo asistido pasivo: mientras preparas un documento, al terminar cada paso la vista baja al siguiente y este parpadea
 * una vez. (El modo asistido activo es la guía «Te acompaño», con su tarjeta y sus pasos.) Ambos se activan o desactivan
 * en «Cómo funciona». El pasivo se recuerda en este navegador y viene activado.
 */
const CLAVE_PASIVO = "autograflow_asistido_pasivo";
const EVENTO = "autograflow:asistido";

export const pasivoActivo = () => { try { return localStorage.getItem(CLAVE_PASIVO) !== "0"; } catch { return true; } };

export function cambiarPasivo(activo: boolean) {
  try { localStorage.setItem(CLAVE_PASIVO, activo ? "1" : "0"); } catch { /* sin almacenamiento: dura esta visita */ }
  window.dispatchEvent(new Event(EVENTO));
}

/** El modo pasivo, al día si se cambia desde «Cómo funciona» u otra pestaña. */
export function usarPasivo() {
  const [activo, setActivo] = useState(pasivoActivo);
  useEffect(() => {
    const leer = () => setActivo(pasivoActivo());
    window.addEventListener(EVENTO, leer);
    window.addEventListener("storage", leer);
    return () => { window.removeEventListener(EVENTO, leer); window.removeEventListener("storage", leer); };
  }, []);
  return activo;
}

const sinMovimiento = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** El anillo que parpadea es un ::after con position: absolute: el control necesita ser su referencia. */
function posicionar(el: HTMLElement) {
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
}

/** Resaltado de la guía (modo activo): el control parpadea hasta que se quita. Devuelve la función para quitarlo. */
export function resaltar(el: Element | null | undefined) {
  if (!(el instanceof HTMLElement)) return () => {};
  posicionar(el);
  el.classList.add("guiaResaltado");
  return () => el.classList.remove("guiaResaltado");
}

/**
 * Lleva la vista al elemento y lo hace parpadear «veces» veces (0: solo lleva la vista). Con «reducir movimiento» el
 * desplazamiento no se anima; el parpadeo se mantiene (es un cambio de opacidad, no un movimiento).
 */
export function enfatizar(el: Element | null | undefined, veces = 1) {
  if (!(el instanceof HTMLElement)) return;
  // Con una ventana abierta (p. ej. «¿Quién firma?») no se mueve lo de atrás: quien la abre lleva la vista al cerrarla.
  if (document.querySelector('[aria-modal="true"]')) return;
  // Un bloque alto (los firmantes y sus campos) se muestra desde su título; centrado se vería solo su mitad.
  const alto = el.getBoundingClientRect().height > window.innerHeight * 0.5;
  el.scrollIntoView({ block: alto ? "start" : "center", behavior: sinMovimiento() ? "auto" : "smooth" });
  if (veces < 1) return;
  posicionar(el);
  el.classList.remove("asistidoParpadeo");
  void el.offsetWidth; // reinicia la animación si ya estaba parpadeando
  el.style.setProperty("--parpadeos", String(veces));
  el.classList.add("asistidoParpadeo");
  // Solo su propia animación: las de sus hijos también llegan aquí (el evento sube).
  const quitar = (e: AnimationEvent) => {
    if (e.target !== el || e.animationName !== "asistidoParpadeo") return;
    el.classList.remove("asistidoParpadeo");
    el.removeEventListener("animationend", quitar);
  };
  el.addEventListener("animationend", quitar);
}
