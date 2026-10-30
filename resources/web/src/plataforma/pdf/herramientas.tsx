import { useId, type CSSProperties, type ReactNode } from "react";
import "./herramientas.css";

/*
 * Catálogo de «Organizar PDF»: lo usan el panel de la barra lateral y la cinta de la página de herramientas. Va aparte
 * (sin pdf-lib ni pdf.js) para que abrir el menú no cargue lo pesado.
 */
export type IdHerramienta = "unir" | "dividir" | "quitar" | "extraer" | "ordenar" | "escanear";

const t = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const hoja = (x: number, y: number) => <rect x={x} y={y} width="7" height="9" rx="1.3" {...t} />;
/** Estrella de 4 puntas (lados curvos hacia adentro), centrada en (x, y). */
const chispa = (x: number, y: number, r: number) => `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
const ICONOS: Record<IdHerramienta, ReactNode> = {
  unir: <>{hoja(2, 3)}{hoja(11, 3)}<path d="M9.5 15.5h1M6 13v2.5h8V13" {...t} /></>,
  dividir: <><rect x="6.5" y="2" width="7" height="9" rx="1.3" {...t} /><path d="M10 13v5M10 18l-4-2.5M10 18l4-2.5" {...t} /></>,
  quitar: <><rect x="5" y="2.5" width="10" height="13" rx="1.5" {...t} /><path d="m7.8 6.6 4.4 4.4M12.2 6.6l-4.4 4.4" {...t} /></>,
  extraer: <><rect x="3" y="2.5" width="9" height="12" rx="1.5" {...t} /><path d="M10 11h7.5M14.8 8.3l2.7 2.7-2.7 2.7" {...t} /></>,
  ordenar: <>{hoja(2, 2.5)}<rect x="11" y="8.5" width="7" height="9" rx="1.3" {...t} /><path d="M9 6.5c3 0 5.5.5 5.5 2M4.5 13.5c0 2.5 2 3.5 6 3.5" {...t} /></>,
  // Marco de escaneo sin la esquina de arriba a la derecha: ahí van las estrellas (ver IconoHerramienta).
  escanear: <><path d="M2.5 7V4.2a1.7 1.7 0 0 1 1.7-1.7H7M2.5 13v2.8a1.7 1.7 0 0 0 1.7 1.7H7M17.5 12v3.8a1.7 1.7 0 0 1-1.7 1.7H13M5.5 7h3.5M5.5 13h7M4.5 10h11" {...t} /></>,
};

export const HERRAMIENTAS: { id: IdHerramienta; nombre: string; resumen: string; especial?: boolean }[] = [
  { id: "unir", nombre: "Unir PDF", resumen: "Junta varios PDF en uno, en el orden que elijas." },
  { id: "dividir", nombre: "Dividir PDF", resumen: "Separa un PDF por rangos, cada cierto número de páginas o página por página." },
  { id: "quitar", nombre: "Quitar páginas", resumen: "Marca las páginas que sobran y descarga el PDF sin ellas." },
  { id: "extraer", nombre: "Extraer páginas", resumen: "Elige páginas y sácalas a un PDF nuevo (o una por archivo)." },
  { id: "ordenar", nombre: "Ordenar y girar", resumen: "Arrastra las páginas, gíralas, quítalas o súmales otro PDF." },
  { id: "escanear", nombre: "Escanear a PDF", resumen: "Escanea con la cámara: detecta la hoja, la endereza y la deja limpia como un escáner.", especial: true },
];

/** Las herramientas «especiales» se dibujan con el degradado y estrellas que titilan (herramientas.css). */
export function IconoHerramienta({ id, tam = 20 }: { id: IdHerramienta; tam?: number }) {
  if (!HERRAMIENTAS.find((h) => h.id === id)?.especial) return <svg viewBox="0 0 20 20" width={tam} height={tam} aria-hidden>{ICONOS[id]}</svg>;
  return <IconoDegradado tam={tam}>{ICONOS[id]}</IconoDegradado>;
}

/**
 * Ícono «especial»: los trazos (con stroke="currentColor", 20×20) pasan al degradado y arriba a la derecha titilan
 * tres estrellas, así que esa esquina del dibujo debe quedar libre. Lo usan Escanear a PDF y las apps destacadas.
 */
export function IconoDegradado({ tam = 20, children }: { tam?: number; children: ReactNode }) {
  const degradado = `hrDeg${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 20 20" width={tam} height={tam} aria-hidden className="hrIconoEspecial" style={{ "--hrTrazo": `url(#${degradado})` } as CSSProperties}>
      <defs>
        <linearGradient id={degradado} x1="2" y1="18" x2="18" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--hrDeg1)" }} /><stop offset=".55" style={{ stopColor: "var(--hrDeg2)" }} /><stop offset="1" style={{ stopColor: "var(--hrDeg3)" }} />
        </linearGradient>
      </defs>
      <g className="hrTrazo">{children}</g>
      <path className="hrChispa" d={chispa(15.2, 4.6, 3.4)} fill={`url(#${degradado})`} />
      <path className="hrChispa dos" d={chispa(10.6, 2, 1.5)} fill={`url(#${degradado})`} />
      <path className="hrChispa tres" d={chispa(18.6, 8.8, 1.3)} fill={`url(#${degradado})`} />
    </svg>
  );
}

/** Etiqueta «Nuevo» con el degradado, para las herramientas especiales. */
export const EtiquetaNueva = () => <span className="hrNuevo">✦ Nuevo</span>;
/** La misma etiqueta con otro texto. */
export const EtiquetaEspecial = ({ texto }: { texto: string }) => <span className="hrNuevo">✦ {texto}</span>;
