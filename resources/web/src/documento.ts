import RECTS from "../../shared/campos.json";
import { formatoMonto, formatoNumero, type Totales } from "../../shared/calculos";
import { LIMITES } from "../../shared/esquema";

/** Rectángulo [x1, y1, x2, y2] en puntos PDF (página carta 612 × 792, origen abajo a la izquierda). */
type Rect = [number, number, number, number];
const R = RECTS as unknown as Record<string, Rect>;
const ANCHO = 612, ALTO = 792;

/** Posición de un rectángulo del PDF sobre la imagen del documento, en porcentajes (se adapta a cualquier pantalla). */
export function posicion(r: Rect) {
  return {
    left: `${(r[0] / ANCHO) * 100}%`,
    top: `${((ALTO - r[3]) / ALTO) * 100}%`,
    width: `${((r[2] - r[0]) / ANCHO) * 100}%`,
    height: `${((r[3] - r[1]) / ALTO) * 100}%`,
  };
}
export const rect = (nombrePdf: string) => {
  const r = R[nombrePdf];
  if (!r) throw new Error(`Campo desconocido: ${nombrePdf}`);
  return r;
};
const union = (rs: Rect[]): Rect => [
  Math.min(...rs.map((r) => r[0])), Math.min(...rs.map((r) => r[1])), Math.max(...rs.map((r) => r[2])), Math.max(...rs.map((r) => r[3])),
];

export type TipoCampo = "texto" | "numero" | "monto" | "fecha" | "email" | "tel";
export interface DefCampo {
  /** Ruta dentro del formulario («contacto.nombre», «viajes.1.fecha»). */
  ruta: string;
  rect: Rect;
  etiqueta: string;
  tipo: TipoCampo;
  obligatorio?: boolean;
  ayuda?: string;
}

const c = (ruta: string, pdf: string, etiqueta: string, tipo: TipoCampo = "texto", extra: Partial<DefCampo> = {}): DefCampo => ({
  ruta, rect: rect(pdf), etiqueta, tipo, ...extra,
});

const viaje = (i: number) => {
  const p = `viajes.${i}`, n = `Viaje con diversas paradas ${i + 1}`;
  return [
    c(`${p}.origen`, `Starting point address if available_${i + 2}`, `${n}: punto de partida`),
    c(`${p}.destino`, `Destination address if available_${i + 2}`, `${n}: destino`),
    c(`${p}.proposito`, i === 0 ? "Purpose" : `Purpose_${i + 1}`, `${n}: propósito`),
    c(`${p}.fecha`, i === 0 ? "Date" : `Date_${i + 1}`, `${n}: fecha`, "fecha"),
    c(`${p}.distancia`, `VariedDist.${i + 1}`, `${n}: mi o km`, "numero"),
    c(`${p}.peajes`, `AMNT_VariedTolls.${i + 1}`, `${n}: peajes`, "monto"),
  ];
};
const gasto = (i: number) => {
  const p = `gastos.${i}`, s = i === 0 ? "" : `_${i + 1}`, n = `Otro gasto ${i + 1}`;
  return [
    c(`${p}.vendedor`, `Program name${s}`, `${n}: nombre del vendedor`),
    c(`${p}.descripcion`, `Additional explanation and account coding${s}`, `${n}: finalidad y descripción de la compra`),
    c(`${p}.cuenta`, `Account code${s}`, `${n}: código de cuenta`),
    c(`${p}.monto`, `AMNT_OtherAmount.${i + 1}`, `${n}: cantidad`, "monto"),
  ];
};

/** Campos que llena el Firmante 1, en el orden en que se recorren con «Siguiente». */
export const CAMPOS: DefCampo[] = [
  c("contacto.nombre", "Payee name", "Nombre del beneficiario", "texto", { obligatorio: true }),
  c("contacto.estaca", "Stake", "Estaca", "texto", { obligatorio: true }),
  c("contacto.barrio", "Ward", "Barrio", "texto", { obligatorio: true }),
  c("contacto.telefono", "Telephone with area code", "Teléfono (con el código de área)", "tel", { obligatorio: true }),
  c("contacto.email", "Email address", "Dirección de correo electrónico", "email"),
  c("contacto.fechaFactura", "Invoice date", "Fecha de la factura", "fecha", { obligatorio: true }),
  c("contacto.tasa", "Reimbursement rate", "Porcentaje del reembolso", "numero", { ayuda: "Monto por cada milla o kilómetro, p. ej. 0.30" }),
  c("contacto.direccion", "Payee address", "Dirección del beneficiario"),
  c("reiterativo.origen", "Starting point address if available", "Viaje reiterativo: punto de partida"),
  c("reiterativo.destino", "Destination address if available", "Viaje reiterativo: destino"),
  c("reiterativo.distancia", "Roundtrip mi or km", "Viaje reiterativo: mi o km del viaje de ida y vuelta", "numero"),
  c("reiterativo.proposito", "RecurringPurpose", "Viaje reiterativo: propósito"),
  c("reiterativo.peajes", "AMNT_Roundtrip fares or tolls", "Viaje reiterativo: peajes del viaje de ida y vuelta", "monto"),
  ...Array.from({ length: LIMITES.viajesEnFormulario }, (_, i) => viaje(i)).flat(),
  ...Array.from({ length: LIMITES.gastosEnFormulario }, (_, i) => gasto(i)).flat(),
];

/** Zona de cada fila de meses (nombre del mes + las 31 casillas) y la casilla de cada día. */
export const MESES = Array.from({ length: LIMITES.meses }, (_, i) => {
  const dias = Array.from({ length: 31 }, (_, d) => rect(`M${i + 1}D${d + 1}`));
  return { zona: union([rect(`MonthRow${i + 1}`), ...dias]), mes: rect(`MonthRow${i + 1}`), dias };
});

/** Pasos de «Empezar a llenar mis datos»: los campos, con las filas de meses después de los datos del viaje reiterativo. */
export type Paso = { tipo: "campo"; ruta: string } | { tipo: "mes"; indice: number };
const despues = CAMPOS.findIndex((x) => x.ruta === "reiterativo.peajes") + 1;
export const PASOS: Paso[] = [
  ...CAMPOS.slice(0, despues).map((x) => ({ tipo: "campo" as const, ruta: x.ruta })),
  ...MESES.map((_, indice) => ({ tipo: "mes" as const, indice })),
  ...CAMPOS.slice(despues).map((x) => ({ tipo: "campo" as const, ruta: x.ruta })),
];

/** Campos calculados del documento y de dónde sale su valor. */
export const CALCULADOS: { rect: Rect; valor: (t: Totales, viajes: number[]) => string }[] = [
  { rect: rect("RecurringDist"), valor: (t) => (t.dias ? formatoNumero(t.reiterativoDistancia) : "") },
  { rect: rect("AMNT_RecurringTolls"), valor: (t) => (t.dias ? formatoMonto(t.reiterativoPeajes) : "") },
  { rect: rect("AMNT_RecurringReimbursement"), valor: (t) => (t.dias ? formatoMonto(t.reiterativoReembolso) : "") },
  ...Array.from({ length: LIMITES.viajesEnFormulario }, (_, i) => ({
    rect: rect(`AMNT_VariedReimbursement.${i + 1}`), valor: (_t: Totales, v: number[]) => (v[i] ? formatoMonto(v[i]) : ""),
  })),
  { rect: rect("AMNT_RecurringExpenses"), valor: (t) => formatoMonto(t.totalReiterativos) },
  { rect: rect("AMNT_VariedExpenses"), valor: (t) => formatoMonto(t.totalViajes) },
  { rect: rect("AMNT_OtherExpenses"), valor: (t) => formatoMonto(t.totalOtros) },
  { rect: rect("AMNT_TotalExpenses"), valor: (t) => formatoMonto(t.total) },
];

export const FIRMAS = {
  solicitante: { firma: rect("Requesters signature"), fecha: rect("Date_5") },
  aprobador: { firma: rect("Approvers signature if applicable"), fecha: rect("Date_6") },
  factura: rect("Invoice number"),
};
