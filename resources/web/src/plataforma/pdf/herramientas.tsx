import type { ReactNode } from "react";

/*
 * Catálogo de «Organizar PDF»: lo usan el panel de la barra lateral y la cinta de la página de herramientas. Va aparte
 * (sin pdf-lib ni pdf.js) para que abrir el menú no cargue lo pesado.
 */
export type IdHerramienta = "unir" | "dividir" | "quitar" | "extraer" | "ordenar" | "escanear";

const t = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const hoja = (x: number, y: number) => <rect x={x} y={y} width="7" height="9" rx="1.3" {...t} />;
const ICONOS: Record<IdHerramienta, ReactNode> = {
  unir: <>{hoja(2, 3)}{hoja(11, 3)}<path d="M9.5 15.5h1M6 13v2.5h8V13" {...t} /></>,
  dividir: <><rect x="6.5" y="2" width="7" height="9" rx="1.3" {...t} /><path d="M10 13v5M10 18l-4-2.5M10 18l4-2.5" {...t} /></>,
  quitar: <><rect x="5" y="2.5" width="10" height="13" rx="1.5" {...t} /><path d="m7.8 6.6 4.4 4.4M12.2 6.6l-4.4 4.4" {...t} /></>,
  extraer: <><rect x="3" y="2.5" width="9" height="12" rx="1.5" {...t} /><path d="M10 11h7.5M14.8 8.3l2.7 2.7-2.7 2.7" {...t} /></>,
  ordenar: <>{hoja(2, 2.5)}<rect x="11" y="8.5" width="7" height="9" rx="1.3" {...t} /><path d="M9 6.5c3 0 5.5.5 5.5 2M4.5 13.5c0 2.5 2 3.5 6 3.5" {...t} /></>,
  escanear: <><path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M13 3h2.5A1.5 1.5 0 0 1 17 4.5V7M17 13v2.5a1.5 1.5 0 0 1-1.5 1.5H13M7 17H4.5A1.5 1.5 0 0 1 3 15.5V13" {...t} /><path d="M3 10h14" {...t} /></>,
};

export const HERRAMIENTAS: { id: IdHerramienta; nombre: string; resumen: string }[] = [
  { id: "unir", nombre: "Unir PDF", resumen: "Junta varios PDF en uno, en el orden que elijas." },
  { id: "dividir", nombre: "Dividir PDF", resumen: "Separa un PDF por rangos, cada cierto número de páginas o página por página." },
  { id: "quitar", nombre: "Quitar páginas", resumen: "Marca las páginas que sobran y descarga el PDF sin ellas." },
  { id: "extraer", nombre: "Extraer páginas", resumen: "Elige páginas y sácalas a un PDF nuevo (o una por archivo)." },
  { id: "ordenar", nombre: "Ordenar y girar", resumen: "Arrastra las páginas, gíralas, quítalas o súmales otro PDF." },
  { id: "escanear", nombre: "Escanear a PDF", resumen: "Convierte fotos de documentos en un PDF limpio, desde el celular." },
];

export const IconoHerramienta = ({ id, tam = 20 }: { id: IdHerramienta; tam?: number }) => (
  <svg viewBox="0 0 20 20" width={tam} height={tam} aria-hidden>{ICONOS[id]}</svg>
);
