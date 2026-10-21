import { z } from "zod";
import "./esquema"; // mensajes de validación en español

/** Plataforma AutograFlow: firma de cualquier PDF con varios firmantes. */

/** «calculo»: campo que calcula el propio PDF con sus scripts (nadie lo llena; solo se detecta al subir el PDF). */
export const TIPOS_CAMPO = ["firma", "texto", "fecha", "casilla", "sello", "huella", "calculo"] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];
export const ETIQUETA_TIPO: Record<TipoCampo, string> = {
  firma: "Firma", texto: "Texto", fecha: "Fecha", casilla: "Casilla", sello: "Sello", huella: "Huella", calculo: "Cálculo",
};
/** Tamaño inicial de cada tipo de campo, en puntos PDF (1/72 de pulgada). */
export const TAMANO_CAMPO: Record<TipoCampo, { w: number; h: number }> = {
  firma: { w: 150, h: 48 }, texto: { w: 160, h: 20 }, fecha: { w: 90, h: 20 }, casilla: { w: 14, h: 14 }, sello: { w: 150, h: 72 }, huella: { w: 48, h: 62 }, calculo: { w: 110, h: 20 },
};
/** Tipos que se completan con una imagen (dibujada, subida o fotografiada). */
export const TIPOS_IMAGEN: TipoCampo[] = ["firma", "sello", "huella"];
/** Datos que puede llenar quien prepara el documento, en el editor, antes de enviarlo. */
export const TIPOS_DATO: TipoCampo[] = ["texto", "fecha", "casilla"];
/** «Firmante» de los campos que llena quien prepara el documento (y de los que calcula el PDF). */
export const PREPARADOR = "preparador";

/**
 * Campos y scripts del formulario del PDF (de pdf.js: getFieldObjects, getCalculationOrderIds y getJSActions).
 * Se guardan al subir el PDF para ejecutar sus cálculos en el navegador, en el entorno aislado de pdf.js.
 */
export interface FormularioPdf {
  objects: Record<string, { id: string; type?: string; value?: unknown; exportValues?: string | string[]; actions?: Record<string, string[]> }[]>;
  calculationOrder: string[];
  actions: Record<string, string[]> | null;
  numPages: number;
}

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
  /** Firma y huella con fotos del DNI: frente, firma en papel y reverso (la huella sale del reverso). */
  pedirDni: z.boolean().default(false),
  /** Texto del firmante: «solo» firma/sella/huella, «asignados» llena los campos que se le asignan, «libre» además agrega texto libre. */
  modoTexto: z.enum(["solo", "asignados", "libre"]).default("asignados"),
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
  /** Lo que escribió quien prepara el documento (solo en sus campos: firmante = PREPARADOR). */
  valor: z.union([z.string(), z.boolean()]).nullable().optional(),
  /** Nombre del campo en el formulario del PDF (para sus cálculos). */
  nombrePdf: z.string().max(200).default(""),
  /** Campo del PDF bloqueado: queda vacío y nadie lo puede llenar. */
  bloqueado: z.boolean().default(false),
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
  /** «Convertir en Flujo»: el firmante llena primero sus datos en un formulario guiado y después firma. */
  flujo: z.boolean().default(false),
  /** Certificado de evidencias: cronología de cada firmante con sus imágenes y, si la autoriza, su ubicación. */
  certificado: z.boolean().default(false),
});

const imagenPng = z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Imagen inválida")
  .refine((s) => s.length < LIMITES_PLATAFORMA.imagenBytes * 1.37, "La imagen es demasiado grande");

/** Lo que envía un firmante: el valor de cada uno de sus campos (texto, «AAAA-MM-DD», true/false o una imagen PNG). */
export const esquemaFirmar = z.object({
  valores: z.record(z.string(), z.union([texto(LIMITES_PLATAFORMA.texto), z.boolean(), imagenPng])),
});

/** Capturas que se registran en el certificado de evidencias (hora del dispositivo del firmante). */
export type Momento = "dniFrente" | "firma" | "sello" | "dniReverso" | "huella";
/** Lo que acompaña a la firma: fotos del DNI, momento de cada captura y ubicación (si la autorizó). */
export interface Evidencias {
  dni?: { frente: string; reverso: string };
  momentos?: Partial<Record<Momento, string>>;
  ubicacion?: { lat: number; lng: number; precision: number } | { estado: "denegada" | "no_disponible" };
}
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
  flujo: boolean;
  certificado: boolean;
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
  /** libre: texto que agregó el propio firmante al firmar. */
  campos: (CampoEditor & { id: number; lleno: boolean; valor: string | boolean | null; libre: boolean })[];
  eventos: { tipo: string; detalle: string; firmante: string | null; creadoEn: string }[];
  formulario: FormularioPdf | null;
}

/** Lo que ve un firmante en su enlace. */
export interface VistaFirmante {
  documento: {
    nombre: string; estado: EstadoDocumento; mensaje: string; paginas: Pagina[]; remitente: string; empresa: string; logo: boolean;
    bloquearDibujo: boolean; bloquearSello: boolean; flujo: boolean; certificado: boolean;
  };
  yo: { orden: number; nombre: string; estado: EstadoFirmante; color: string; total: number; pedirDni: boolean; modoTexto: "solo" | "asignados" | "libre" };
  /** Falso si en orden secuencial todavía no le toca. */
  turno: boolean;
  esperando: string | null;
  /** Mis campos para llenar y los ya llenados por otros (solo para mostrar). */
  campos: { id: number; tipo: TipoCampo; pagina: number; x: number; y: number; w: number; h: number; etiqueta: string; obligatorio: boolean; mio: boolean; valor: string | boolean | null; imagen: boolean; color: string; nombrePdf: string }[];
  siguiente: { nombre: string; telefono: string; enlace: string } | null;
  /** Scripts de cálculo del PDF (solo si tiene campos calculados). */
  formulario: FormularioPdf | null;
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
