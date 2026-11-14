import CATALOGO from "./planes.json";

/**
 * Catálogo de planes de AutograFlow.
 * ⚠️ Los precios y límites están en planes.json (los usa también Laravel); la moneda, en MONEDA del .env.
 */

/** «ocasional» ya no se vende: queda para las cuentas que todavía tienen esos créditos. */
export type IdPlan = "gratis" | "basico" | "ocasional" | "profesional" | "empresarial";
export interface Plan {
  id: IdPlan;
  nombre: string;
  icono: string;
  /** Precio al comprarlo; 0 = gratis. */
  precio: number;
  /** Días que dura al comprarlo; null = no vence. */
  dias: number | null;
  /** Documentos que suma al comprarlo (no vencen). */
  creditos: number;
  /** Cupo de documentos por periodo; null = ilimitado. */
  documentos: number | null;
  periodo: "dia" | "mes";
  /** Cupo mensual que se suma al del periodo (Básico: 2 por día + 10 por mes). */
  documentosMes?: number;
  /** Se cobra cada mes con Mercado Pago; la primera vez, con pruebaDias de prueba gratuita. */
  suscripcion?: boolean;
  pruebaDias?: number;
  /** Ya no se vende (no aparece en la página de planes). */
  oculto?: boolean;
  firmantesPorDocumento: number;
  /** Firmantes por documento al entrar sin cuenta (solo Gratis). */
  firmantesSinCuenta?: number;
  /** Campos de sello y huella. */
  selloHuella: boolean;
  /** Lleva la marca «Firmado con AutograFlow» en cada página del PDF final. */
  marcaAgua: boolean;
  usuarios: number;
  resumen: string;
  nota: string;
  insignia?: string;
  destacada?: string;
  ventajas: string[];
}

export const PLANES = CATALOGO.planes as Record<IdPlan, Plan>;
export const ORDEN_PLANES: IdPlan[] = ["gratis", "basico", "profesional", "empresarial"];
export const NOTA_ILIMITADO = CATALOGO.notaIlimitado;

/** Estado de la cuenta que ve el cliente. */
export interface EstadoCuenta {
  /** Bonos promocionales con vencimiento, separados de los documentos comprados. */
  creditosReferidos: number;
  plan: IdPlan;
  /** Plan contratado aunque ya haya vencido (para ofrecer renovarlo). */
  planContratado: IdPlan;
  vence: string | null;
  /** Documentos usados del cupo del periodo (hoy o este mes). */
  usados: number;
  /** Cupo del periodo; null = ilimitado. */
  limite: number | null;
  /** Cupo mensual adicional (Básico): usados y total; limiteMes null = el plan no tiene. */
  usadosMes: number;
  limiteMes: number | null;
  /** Suscripción mensual activa (Básico), o null. */
  suscripcion: Suscripcion | null;
  /** Todavía no usó la prueba gratuita del Básico. */
  pruebaDisponible: boolean;
  periodo: "dia" | "mes";
  creditos: number;
  firmantesPorDocumento: number;
  /** Entró sin cuenta (invitado): 1 firmante y no puede comprar planes. */
  invitado: boolean;
  selloHuella: boolean;
  /** Documentos que todavía puede enviar (cupo restante + créditos); null = ilimitado. */
  disponibles: number | null;
  usuarios: number;
  moneda: string;
  pagosActivos: boolean;
}

export interface PagoFila {
  id: number; producto: string; titulo: string; monto: number; moneda: string;
  estado: "pendiente" | "aprobado" | "rechazado" | "cancelado"; creadoEn: string; aplicadoEn: string | null;
}

export interface Suscripcion {
  id: number; producto: IdPlan; monto: number; moneda: string;
  /** rechazada: por ejemplo, la cuenta de Mercado Pago ya había usado la prueba (motivo «prueba_usada»). */
  estado: "pendiente" | "activa" | "cancelada" | "rechazada"; motivo: string | null;
  conPrueba: boolean; enPrueba: boolean; pruebaHasta: string | null; proximoCobro: string | null;
  canceladaEn: string | null; creadoEn: string;
}

/** Formato de precio para mostrar: «S/ 19.90», «$ 19.90»… */
export function formatoPrecio(monto: number, moneda: string) {
  const simbolo: Record<string, string> = { PEN: "S/", ARS: "$", MXN: "$", CLP: "$", COP: "$", UYU: "$U", BRL: "R$", USD: "US$" };
  return `${simbolo[moneda] ?? moneda} ${monto.toFixed(moneda === "CLP" || moneda === "COP" ? 0 : 2)}`;
}
