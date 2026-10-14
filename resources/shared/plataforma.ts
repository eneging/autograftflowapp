import { z } from "zod";
import "./esquema"; // mensajes de validación en español

/** Plataforma AutograFlow: firma de cualquier PDF con varios firmantes. */

export const TIPOS_CAMPO = ["firma", "texto", "fecha", "casilla", "sello", "huella"] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];
export const ETIQUETA_TIPO: Record<TipoCampo, string> = {
  firma: "Firma", texto: "Texto", fecha: "Fecha", casilla: "Casilla", sello: "Sello", huella: "Huella",
};
/** Tamaño inicial de cada tipo de campo, en puntos PDF (1/72 de pulgada). */
export const TAMANO_CAMPO: Record<TipoCampo, { w: number; h: number }> = {
  firma: { w: 150, h: 48 }, texto: { w: 160, h: 20 }, fecha: { w: 90, h: 20 }, casilla: { w: 14, h: 14 }, sello: { w: 150, h: 72 }, huella: { w: 48, h: 62 },
};
/** Tipos que se completan con una imagen (dibujada, subida o fotografiada). */
export const TIPOS_IMAGEN: TipoCampo[] = ["firma", "sello", "huella"];

export const COLORES_FIRMANTE = ["#4d148c", "#ff6200", "#0e9f6e", "#2563eb", "#c026d3", "#b45309", "#0891b2", "#be123c"];

export const LIMITES_PLATAFORMA = {
  pdfBytes: 20 * 1024 * 1024,
  paginas: 200,
  firmantes: 20,
  campos: 400,
  imagenBytes: 600_000,
  texto: 500,
};

export type EstadoDocumento = "borrador" | "en_firma" | "completado" | "rechazado" | "anulado";
export type EstadoFirmante = "pendiente" | "firmado" | "rechazado";
export const ETIQUETA_ESTADO: Record<EstadoDocumento, string> = {
  borrador: "Borrador", en_firma: "En firma", completado: "Completado", rechazado: "Rechazado", anulado: "Anulado",
};

export interface Pagina { ancho: number; alto: number }

const texto = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);

export const esquemaRegistro = z.object({
  nombre: texto(120).min(2, "Escribe tu nombre"),
  empresa: texto(120).default(""),
  email: z.string().trim().toLowerCase().email("Correo inválido").max(160),
  clave: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
});
export const esquemaIngreso = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  clave: z.string().min(1, "Escribe tu contraseña"),
});

export const esquemaFirmante = z.object({
  /** Identificador temporal del editor (para relacionar campos y firmantes antes de guardar). */
  clave: z.string().min(1).max(40),
  nombre: texto(120).min(2, "Escribe el nombre del firmante"),
  telefono: z.union([texto(30).regex(/^[+\d][\d\s()-]{6,}$/, "Teléfono inválido"), z.literal("")]).default(""),
  email: z.union([z.string().trim().email("Correo inválido"), z.literal("")]).default(""),
});

export const esquemaCampo = z.object({
  firmante: z.string().min(1).max(40),
  tipo: z.enum(TIPOS_CAMPO),
  pagina: z.number().int().min(1),
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
  w: z.number().finite().min(6).max(2000),
  h: z.number().finite().min(6).max(2000),
  etiqueta: texto(120).default(""),
  obligatorio: z.boolean().default(true),
});

export const esquemaGuardarDocumento = z.object({
  nombre: texto(160).min(1, "Escribe el nombre del documento"),
  orden: z.enum(["secuencial", "paralelo"]),
  mensaje: texto(500).default(""),
  firmantes: z.array(esquemaFirmante).max(LIMITES_PLATAFORMA.firmantes),
  campos: z.array(esquemaCampo).max(LIMITES_PLATAFORMA.campos),
  /** El firmante debe fotografiar o subir su firma hecha en papel (no puede dibujarla en la pantalla). */
  bloquearDibujo: z.boolean().default(false),
  /** El firmante debe fotografiar o subir su sello real (no puede confeccionarlo con texto). */
  bloquearSello: z.boolean().default(false),
});

const imagenPng = z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Imagen inválida")
  .refine((s) => s.length < LIMITES_PLATAFORMA.imagenBytes * 1.37, "La imagen es demasiado grande");

/** Lo que envía un firmante: el valor de cada uno de sus campos (texto, «AAAA-MM-DD», true/false o una imagen PNG). */
export const esquemaFirmar = z.object({
  valores: z.record(z.string(), z.union([texto(LIMITES_PLATAFORMA.texto), z.boolean(), imagenPng])),
});
export const esquemaRechazo = z.object({ motivo: texto(500).min(3, "Indica el motivo") });

export type DatosGuardarDocumento = z.infer<typeof esquemaGuardarDocumento>;
export type CampoEditor = z.infer<typeof esquemaCampo>;
export type FirmanteEditor = z.infer<typeof esquemaFirmante>;

/** Documento tal como lo ve su dueño. */
export interface DocumentoDetalle {
  id: number;
  nombre: string;
  estado: EstadoDocumento;
  esPlantilla: boolean;
  bloquearDibujo: boolean;
  bloquearSello: boolean;
  orden: "secuencial" | "paralelo";
  mensaje: string;
  paginas: Pagina[];
  sha256Original: string;
  sha256Final: string | null;
  creadoEn: string;
  enviadoEn: string | null;
  completadoEn: string | null;
  firmantes: (FirmanteEditor & {
    id: number; orden: number; color: string; token: string | null; estado: EstadoFirmante;
    abiertoEn: string | null; firmadoEn: string | null; motivoRechazo: string | null;
  })[];
  campos: (CampoEditor & { id: number; lleno: boolean })[];
  eventos: { tipo: string; detalle: string; firmante: string | null; creadoEn: string }[];
}

/** Lo que ve un firmante en su enlace. */
export interface VistaFirmante {
  documento: { nombre: string; estado: EstadoDocumento; mensaje: string; paginas: Pagina[]; remitente: string; empresa: string; logo: boolean; bloquearDibujo: boolean; bloquearSello: boolean };
  yo: { orden: number; nombre: string; estado: EstadoFirmante; color: string; total: number };
  /** Falso si en orden secuencial todavía no le toca. */
  turno: boolean;
  esperando: string | null;
  /** Mis campos para llenar y los ya llenados por otros (solo para mostrar). */
  campos: { id: number; tipo: TipoCampo; pagina: number; x: number; y: number; w: number; h: number; etiqueta: string; obligatorio: boolean; mio: boolean; valor: string | boolean | null; imagen: boolean; color: string }[];
  siguiente: { nombre: string; telefono: string; enlace: string } | null;
}

/** Huella pedida: de qué mano y qué dedo (se guarda como etiqueta del campo, p. ej. «Índice derecho»). */
export const DEDOS = { pulgar: "Pulgar", indice: "Índice", medio: "Medio", anular: "Anular", menique: "Meñique" } as const;
export type Dedo = keyof typeof DEDOS;
export type Mano = "derecha" | "izquierda";
export const etiquetaDedo = (mano: Mano, dedo: Dedo) => `${DEDOS[dedo]} ${mano === "derecha" ? "derecho" : "izquierdo"}`;
export function leerDedo(etiqueta: string): { mano: Mano; dedo: Dedo } | null {
  const m = etiqueta.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/(pulgar|indice|medio|anular|menique)\s+(derech|izquierd)/);
  return m ? { dedo: m[1] as Dedo, mano: m[2] === "derech" ? "derecha" : "izquierda" } : null;
}
