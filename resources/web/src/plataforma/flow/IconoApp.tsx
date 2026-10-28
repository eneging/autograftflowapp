import type { ReactNode } from "react";
import { IconoDegradado } from "../pdf/herramientas";
import type { AppFlow } from "./apps";

const t = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Dibujos propios de las apps destacadas (20×20, con la esquina de arriba a la derecha libre para las estrellas). */
const DIBUJOS: Record<string, ReactNode> = {
  // EX-Trae: una boleta cuyo texto «sale» a la derecha, listo para copiar.
  "ex-trae": <>
    <path d="M2.8 3.6a1.3 1.3 0 0 1 1.3-1.3h5.6a1.3 1.3 0 0 1 1.3 1.3v13.9l-1.4-1-1.4 1-1.4-1-1.4 1-1.4-1-1.2 1Z" {...t} />
    <path d="M5 6.6h3.8M5 9.4h3.8M5 12.2h2.4" {...t} />
    <path d="M13.4 11.2h4.8M13.4 14.2h3.2M13.4 17.2h4.8" {...t} />
  </>,
};

/** Ícono de una app de Flow Tools: el dibujo en degradado si es destacada; si no, su emoji. */
export function IconoApp({ app, tam = 22, className = "" }: { app: AppFlow; tam?: number; className?: string }) {
  const dibujo = app.especial ? DIBUJOS[app.id] : undefined;
  if (dibujo) return <IconoDegradado tam={tam}>{dibujo}</IconoDegradado>;
  return <span className={className} aria-hidden>{app.icono}</span>;
}
