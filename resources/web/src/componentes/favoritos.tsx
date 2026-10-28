import { useEffect, useState, type ReactNode } from "react";
import { usarSesion } from "../plataforma/sesion";
import { HERRAMIENTAS, IconoHerramienta } from "../plataforma/pdf/herramientas";
import { APPS_FLOW } from "../plataforma/flow/apps";
import { IconoApp } from "../plataforma/flow/IconoApp";
import "./favoritos.css";

/*
 * Favoritos: las herramientas de «Organizar PDF» y las apps de Flow Tools que el usuario marca con ☆ aparecen como
 * accesos directos en la barra lateral. Se guardan en este navegador, aparte para cada usuario.
 */
export interface Acceso { id: string; nombre: string; ruta: string; icono: ReactNode; grupo: string }

/** Todo lo que se puede marcar como favorito. Id: «pdf:<herramienta>» o «flow:<app>». */
export const ACCESOS: Acceso[] = [
  ...HERRAMIENTAS.map((h) => ({ id: `pdf:${h.id}`, nombre: h.nombre, ruta: `/app/pdf/${h.id}`, icono: <IconoHerramienta id={h.id} tam={18} />, grupo: "Organizar PDF" })),
  ...APPS_FLOW.map((a) => ({ id: `flow:${a.id}`, nombre: a.nombre, ruta: `/app/flow-tools/${a.id}`, icono: <IconoApp app={a} tam={18} className="navEmoji" />, grupo: "Flow Tools" })),
];

const EVENTO = "af-favoritos";
const clave = (usuario?: number) => `autograflow_favoritos_${usuario ?? "anonimo"}`;
function leer(usuario?: number): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(clave(usuario)) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

/** Los favoritos del usuario (en el orden en que los marcó), sincronizados entre componentes y pestañas. */
export function usarFavoritos() {
  const { usuario } = usarSesion();
  const id = usuario?.id;
  const [ids, setIds] = useState(() => leer(id));
  useEffect(() => {
    const actualizar = () => setIds(leer(id));
    actualizar();
    const otraPestana = (e: StorageEvent) => { if (e.key === clave(id)) actualizar(); };
    window.addEventListener(EVENTO, actualizar);
    window.addEventListener("storage", otraPestana);
    return () => { window.removeEventListener(EVENTO, actualizar); window.removeEventListener("storage", otraPestana); };
  }, [id]);
  function guardar(lista: string[]) {
    try { localStorage.setItem(clave(id), JSON.stringify(lista)); } catch { /* sin almacenamiento */ }
    window.dispatchEvent(new Event(EVENTO));
  }
  const es = (acceso: string) => ids.includes(acceso);
  const alternar = (acceso: string) => guardar(es(acceso) ? ids.filter((x) => x !== acceso) : [...ids, acceso]);
  /** Solo los que siguen existiendo (una app retirada desaparece sola). */
  const accesos = ids.map((x) => ACCESOS.find((a) => a.id === x)).filter((a): a is Acceso => !!a);
  return { accesos, es, alternar };
}

/** Estrella para marcar o quitar un favorito. «conTexto»: con la leyenda al lado (para barras con espacio). */
export function BotonFavorito({ acceso, conTexto = false, className = "" }: { acceso: string; conTexto?: boolean; className?: string }) {
  const { es, alternar } = usarFavoritos();
  const marcado = es(acceso);
  const nombre = ACCESOS.find((a) => a.id === acceso)?.nombre ?? "";
  const texto = marcado ? "Quitar de favoritos" : "Añadir a favoritos";
  return (
    <button type="button" className={`afFavorito ${marcado ? "marcado" : ""} ${conTexto ? "conTexto" : ""} ${className}`} aria-pressed={marcado}
      title={`${texto}: aparecerá en «Favoritos» de la barra lateral`} aria-label={`${texto}: ${nombre}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); alternar(acceso); }}>
      <span aria-hidden>{marcado ? "★" : "☆"}</span>{conTexto && <span>{marcado ? "En favoritos" : "Añadir a favoritos"}</span>}
    </button>
  );
}
