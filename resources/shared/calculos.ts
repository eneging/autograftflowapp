import type { DatosSolicitud } from "./esquema";

/**
 * Cálculos del formulario «Solicitud de reembolso para no empleados», iguales a los scripts del PDF original:
 *   reiterativo = días × (mi o km × tarifa + peajes)
 *   viaje con paradas = mi o km × tarifa + peajes
 *   total = reiterativos + viajes con paradas + otros gastos
 * Todo se maneja en centavos enteros para que las sumas no arrastren errores de redondeo.
 */
export interface Totales {
  dias: number;
  /** Distancia total de los viajes reiterativos (días × ida y vuelta). */
  reiterativoDistancia: number;
  reiterativoPeajes: number;
  reiterativoReembolso: number;
  /** Reembolso de cada viaje con paradas, en el mismo orden que `datos.viajes`. */
  viajes: number[];
  gastos: number[];
  totalReiterativos: number;
  totalViajes: number;
  totalOtros: number;
  total: number;
}

/** Montos en centavos. */
export const aCentavos = (n: number) => Math.round((n + Number.EPSILON) * 100);

export function calcular(d: DatosSolicitud): Totales {
  const tasa = d.contacto.tasa || 0;
  const dias = d.reiterativo.meses.reduce((n, m) => n + new Set(m.dias).size, 0);
  const reiterativoDistancia = redondear(dias * (d.reiterativo.distancia || 0));
  const reiterativoPeajes = aCentavos(dias * (d.reiterativo.peajes || 0));
  const reiterativoReembolso = aCentavos(reiterativoDistancia * tasa) + reiterativoPeajes;
  const viajes = d.viajes.map((v) => aCentavos(v.distancia * tasa) + aCentavos(v.peajes));
  const gastos = d.gastos.map((g) => aCentavos(g.monto));
  const totalViajes = suma(viajes);
  const totalOtros = suma(gastos);
  return {
    dias,
    reiterativoDistancia,
    reiterativoPeajes,
    reiterativoReembolso,
    viajes,
    gastos,
    totalReiterativos: reiterativoReembolso,
    totalViajes,
    totalOtros,
    total: reiterativoReembolso + totalViajes + totalOtros,
  };
}

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** 123456 centavos → «1,234.56» (mismo formato que el PDF: AFNumber_Format(2, 0, …)). */
export function formatoMonto(centavos: number): string {
  const neg = centavos < 0;
  const abs = Math.abs(centavos);
  const entero = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + entero + "." + String(abs % 100).padStart(2, "0");
}

/** Distancias: sin ceros de más («30», «12.5»). */
export function formatoNumero(n: number): string {
  return String(redondear(n));
}

/** «2026-10-06» → «06/10/2026». */
export function formatoFecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** «2026-10» → «Octubre 2026». */
export function formatoMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes || "");
  return m ? `${MESES[Number(m[2]) - 1]} ${m[1]}` : "";
}
