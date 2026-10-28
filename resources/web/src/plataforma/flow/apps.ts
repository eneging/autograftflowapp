/*
 * Flow Tools: las apps de la familia FlowApp dentro de AutograFlow. Dos formas de sumar una:
 *  - propia (sin url): una página React registrada en FlowTools.tsx (NATIVAS); usa la cuenta, el tema y la API;
 *  - estática (con url): una carpeta en public/flow-tools/<id>/ que se muestra embebida.
 * estado: «beta» mientras se desarrolla (se avisa que puede fallar); «completa» cuando ya está lista.
 */
export type EstadoApp = "beta" | "completa";
/** especial: se destaca con el degradado y su ícono propio (IconoApp); «icono» queda como respaldo. */
export interface AppFlow { id: string; nombre: string; estado: EstadoApp; resumen: string; detalle: string; url?: string; icono: string; etiquetas: string[]; especial?: boolean }

export const APPS_FLOW: AppFlow[] = [
  {
    id: "ex-trae",
    nombre: "EX-Trae",
    estado: "beta",
    resumen: "Toma una foto con tu celular y el texto llega al instante a tu ordenador, listo para copiar. Con boletas y facturas, además llena sus datos.",
    detalle: "Lee el texto de cualquier imagen (documentos, carteles, notas, boletas, facturas) en tu dispositivo, lo ordena línea por línea y lo envía a tus otros dispositivos con la misma cuenta.",
    icono: "🧾",
    etiquetas: ["Foto a texto", "Celular → ordenador", "Boletas y facturas"],
    especial: true,
  },
];

export const ETIQUETA_ESTADO: Record<EstadoApp, string> = { beta: "Beta", completa: "Completa" };
