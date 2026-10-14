import { z } from "zod";

z.setErrorMap((issue, ctx) => {
  if (issue.code === "invalid_type") return { message: issue.received === "undefined" ? "Campo obligatorio" : "Valor inválido" };
  if (issue.code === "too_small" && issue.type === "string") return { message: "Campo obligatorio" };
  return { message: ctx.defaultError };
});

/** Límites del formulario: la página 1 del PDF tiene 4 viajes y 2 gastos; el resto va al anexo. */
export const LIMITES = {
  meses: 3,
  viajesEnFormulario: 4,
  gastosEnFormulario: 2,
  viajes: 16,
  gastos: 20,
  texto: 120,
  firmaBytes: 400_000,
} as const;

const texto = (max: number = LIMITES.texto) => z.string().trim().max(max, `Máximo ${max} caracteres`);
const opcional = (max?: number) => texto(max).default("");
const numero = (max: number) =>
  z.number({ invalid_type_error: "Debe ser un número" }).finite().min(0, "No puede ser negativo").max(max, "Valor demasiado grande");
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const fechaOpcional = z.union([fecha, z.literal("")]).default("");

export const esquemaMes = z
  .object({
    mes: z.union([z.string().regex(/^\d{4}-\d{2}$/, "Mes inválido"), z.literal("")]).default(""),
    dias: z.array(z.number().int().min(1).max(31)).max(31).default([]),
  })
  .superRefine((m, ctx) => {
    if (m.dias.length && !m.mes) ctx.addIssue({ code: "custom", path: ["mes"], message: "Indica el mes de los días marcados" });
    if (m.mes) {
      const [a, mm] = m.mes.split("-").map(Number);
      const ultimo = new Date(a, mm, 0).getDate();
      const malo = m.dias.find((d) => d > ultimo);
      if (malo) ctx.addIssue({ code: "custom", path: ["dias"], message: `El mes elegido no tiene día ${malo}` });
    }
  });

export const esquemaViaje = z.object({
  origen: opcional(),
  destino: opcional(),
  proposito: opcional(),
  fecha: fechaOpcional,
  distancia: numero(100_000),
  peajes: numero(1_000_000),
});

export const esquemaGasto = z.object({
  vendedor: opcional(),
  descripcion: opcional(200),
  cuenta: opcional(40),
  monto: numero(10_000_000),
});

export const esquemaSolicitud = z
  .object({
    contacto: z.object({
      nombre: texto().min(3, "Escribe el nombre del beneficiario"),
      estaca: texto().min(2, "Escribe la estaca"),
      barrio: texto().min(2, "Escribe el barrio"),
      telefono: texto(30).regex(/^[+\d][\d\s()-]{6,}$/, "Teléfono inválido"),
      email: z.union([z.string().trim().email("Correo inválido"), z.literal("")]).default(""),
      fechaFactura: fecha,
      tasa: numero(1_000).default(0),
      direccion: opcional(200),
    }),
    reiterativo: z.object({
      origen: opcional(),
      destino: opcional(),
      proposito: opcional(),
      distancia: numero(100_000).default(0),
      peajes: numero(1_000_000).default(0),
      meses: z.array(esquemaMes).max(LIMITES.meses).default([]),
    }),
    viajes: z.array(esquemaViaje).max(LIMITES.viajes, `Máximo ${LIMITES.viajes} viajes`).default([]),
    gastos: z.array(esquemaGasto).max(LIMITES.gastos, `Máximo ${LIMITES.gastos} gastos`).default([]),
  })
  .superRefine((s, ctx) => {
    const dias = s.reiterativo.meses.reduce((n, m) => n + m.dias.length, 0);
    const hayViajes = dias > 0 || s.viajes.some((v) => v.distancia > 0);
    if (hayViajes && !(s.contacto.tasa > 0))
      ctx.addIssue({ code: "custom", path: ["contacto", "tasa"], message: "Indica el monto por milla/km para calcular los viajes" });
    if (dias > 0 && !(s.reiterativo.distancia > 0))
      ctx.addIssue({ code: "custom", path: ["reiterativo", "distancia"], message: "Indica las millas/km del viaje de ida y vuelta" });
    s.viajes.forEach((v, i) => {
      if (!(v.distancia > 0 || v.peajes > 0))
        ctx.addIssue({ code: "custom", path: ["viajes", i, "distancia"], message: "Indica la distancia o los peajes" });
      if (!v.fecha) ctx.addIssue({ code: "custom", path: ["viajes", i, "fecha"], message: "Indica la fecha del viaje" });
    });
    s.gastos.forEach((g, i) => {
      if (!(g.monto > 0)) ctx.addIssue({ code: "custom", path: ["gastos", i, "monto"], message: "Indica la cantidad" });
      if (!g.vendedor) ctx.addIssue({ code: "custom", path: ["gastos", i, "vendedor"], message: "Indica el vendedor" });
    });
    if (dias === 0 && s.viajes.length === 0 && s.gastos.length === 0)
      ctx.addIssue({ code: "custom", path: [], message: "Agrega al menos un viaje o un gasto" });
  });

const firmaPng = z
  .string()
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Firma inválida")
  .refine((s) => s.length < LIMITES.firmaBytes * 1.37, "La imagen de la firma es demasiado grande");

export const esquemaEnvio = z.object({ datos: esquemaSolicitud, firma: firmaPng });

export const esquemaDecision = z
  .object({
    decision: z.enum(["aprobada", "rechazada"]),
    nombre: texto().min(3, "Escribe tu nombre"),
    firma: firmaPng.optional(),
    motivo: opcional(500),
  })
  .superRefine((d, ctx) => {
    if (d.decision === "aprobada" && !d.firma) ctx.addIssue({ code: "custom", path: ["firma"], message: "Firma para aprobar" });
    if (d.decision === "rechazada" && !d.motivo) ctx.addIssue({ code: "custom", path: ["motivo"], message: "Indica el motivo del rechazo" });
  });

export type DatosSolicitud = z.infer<typeof esquemaSolicitud>;
export type EntradaSolicitud = z.input<typeof esquemaSolicitud>;
export type Viaje = z.infer<typeof esquemaViaje>;
export type Gasto = z.infer<typeof esquemaGasto>;
export type Decision = z.infer<typeof esquemaDecision>;
export type Estado = "pendiente" | "aprobada" | "rechazada";

/** Lo que devuelve la API al consultar una solicitud. */
export interface SolicitudPublica {
  rol: "solicitante" | "aprobador" | "admin";
  numeroFactura: string;
  estado: Estado;
  datos: DatosSolicitud;
  firmadoEn: string;
  aprobadorNombre: string | null;
  decididoEn: string | null;
  motivoRechazo: string | null;
  tokenAprobador?: string;
}

/** Convierte lo que escribe la persona («1.234,50», «0,30», «$ 12») en número; vacío → 0. */
export function aNumero(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let s = String(v ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const coma = s.lastIndexOf(","), punto = s.lastIndexOf(".");
  if (coma > -1 && punto > -1) s = coma > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (coma > -1) s = /,\d{1,2}$/.test(s) && s.split(",").length === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
