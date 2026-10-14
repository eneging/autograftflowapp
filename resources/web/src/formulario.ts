import { aNumero, LIMITES, type DatosSolicitud, type EntradaSolicitud } from "../../shared/esquema";

/**
 * Estado del formulario en pantalla: los números se guardan como texto tal cual los escribe la persona.
 * Las filas de viajes y gastos del documento siempre existen (4 y 2); las que se dejan vacías no se envían.
 */
export interface Formulario {
  contacto: { nombre: string; estaca: string; barrio: string; telefono: string; email: string; fechaFactura: string; tasa: string; direccion: string };
  reiterativo: { origen: string; destino: string; proposito: string; distancia: string; peajes: string; meses: { mes: string; dias: number[] }[] };
  viajes: FilaViaje[];
  gastos: FilaGasto[];
}
export type FilaViaje = { origen: string; destino: string; proposito: string; fecha: string; distancia: string; peajes: string };
export type FilaGasto = { vendedor: string; descripcion: string; cuenta: string; monto: string };

export const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const viajeVacio = (): FilaViaje => ({ origen: "", destino: "", proposito: "", fecha: "", distancia: "", peajes: "" });
export const gastoVacio = (): FilaGasto => ({ vendedor: "", descripcion: "", cuenta: "", monto: "" });
const vacia = (fila: object) => Object.values(fila).every((v) => !String(v).trim());

export const formularioVacio = (): Formulario => ({
  contacto: { nombre: "", estaca: "", barrio: "", telefono: "", email: "", fechaFactura: hoy(), tasa: "", direccion: "" },
  reiterativo: {
    origen: "", destino: "", proposito: "", distancia: "", peajes: "",
    meses: Array.from({ length: LIMITES.meses }, () => ({ mes: "", dias: [] })),
  },
  viajes: Array.from({ length: LIMITES.viajesEnFormulario }, viajeVacio),
  gastos: Array.from({ length: LIMITES.gastosEnFormulario }, gastoVacio),
});

/** Datos ya guardados → formulario, para mostrarlos sobre el documento. */
export function desdeDatos(d: DatosSolicitud): Formulario {
  const t = (n: number) => (n ? String(n) : "");
  const base = formularioVacio();
  const completar = <T,>(filas: T[], minimo: T[]) => [...filas, ...minimo.slice(filas.length)];
  return {
    contacto: { ...d.contacto, tasa: t(d.contacto.tasa) },
    reiterativo: {
      ...d.reiterativo,
      distancia: t(d.reiterativo.distancia),
      peajes: d.reiterativo.peajes ? d.reiterativo.peajes.toFixed(2) : "",
      meses: base.reiterativo.meses.map((m, i) => d.reiterativo.meses[i] ?? m),
    },
    viajes: completar(d.viajes.map((v) => ({ ...v, distancia: t(v.distancia), peajes: v.peajes ? v.peajes.toFixed(2) : "" })), base.viajes),
    gastos: completar(d.gastos.map((g) => ({ ...g, monto: g.monto.toFixed(2) })), base.gastos),
  };
}

/** Lee o escribe un valor del formulario por su ruta («contacto.nombre», «viajes.2.fecha»). */
export function leer(f: Formulario, ruta: string): string {
  return ruta.split(".").reduce<any>((o, k) => (o == null ? o : o[k]), f) ?? "";
}
export function escribir(f: Formulario, ruta: string, valor: string): Formulario {
  const partes = ruta.split(".");
  const copiar = (o: any, i: number): any => {
    const k = partes[i];
    const nuevo = Array.isArray(o) ? [...o] : { ...o };
    nuevo[k] = i === partes.length - 1 ? valor : copiar(o[k], i + 1);
    return nuevo;
  };
  return copiar(f, 0);
}

/** Índices (en el formulario) de las filas que sí se envían. */
const usadas = <T extends object>(filas: T[], usada: (x: T) => boolean) =>
  filas.map((x, i) => (usada(x) ? i : -1)).filter((i) => i >= 0);
const mesUsado = (m: { mes: string; dias: number[] }) => Boolean(m.mes || m.dias.length);

/**
 * Convierte el formulario en los datos que valida el esquema compartido.
 * Con `paraCalcular`, los números inválidos cuentan como 0 para poder mostrar totales mientras se escribe.
 */
export function aDatos(f: Formulario, paraCalcular = false): EntradaSolicitud {
  const n = (s: string) => {
    const v = aNumero(s);
    return paraCalcular && !Number.isFinite(v) ? 0 : v;
  };
  return {
    contacto: { ...f.contacto, tasa: n(f.contacto.tasa) },
    reiterativo: {
      ...f.reiterativo,
      distancia: n(f.reiterativo.distancia),
      peajes: n(f.reiterativo.peajes),
      meses: f.reiterativo.meses.filter(mesUsado).map((m) => ({ ...m, dias: [...m.dias].sort((a, b) => a - b) })),
    },
    viajes: f.viajes.filter((v) => !vacia(v)).map((v) => ({ ...v, distancia: n(v.distancia), peajes: n(v.peajes) })),
    gastos: f.gastos.filter((g) => !vacia(g)).map((g) => ({ ...g, monto: n(g.monto) })),
  };
}

/** Versión normalizada para calcular totales en vivo (sin validar). */
export const paraTotales = (f: Formulario) => aDatos(f, true) as DatosSolicitud;

/** Reembolso de cada fila del formulario (las vacías dan 0), alineado con `f.viajes`. */
export function reembolsoPorFila(f: Formulario, porEnviado: number[]) {
  const idx = usadas(f.viajes, (v) => !vacia(v));
  return f.viajes.map((_, i) => (idx.includes(i) ? porEnviado[idx.indexOf(i)] : 0));
}

/**
 * Traduce la ruta de un error del esquema (la de los datos enviados) a la ruta del formulario,
 * porque las filas vacías se omiten al enviar.
 */
export function rutaEnFormulario(f: Formulario, ruta: string) {
  const m = /^(reiterativo\.meses|viajes|gastos)\.(\d+)(.*)$/.exec(ruta);
  if (!m) return ruta;
  const indices =
    m[1] === "viajes" ? usadas(f.viajes, (v) => !vacia(v))
    : m[1] === "gastos" ? usadas(f.gastos, (g) => !vacia(g))
    : usadas(f.reiterativo.meses, mesUsado);
  return `${m[1]}.${indices[Number(m[2])] ?? m[2]}${m[3]}`;
}

const CLAVE = "autograflow-reembolso-borrador-v2";

export function leerBorrador(): Formulario | null {
  try {
    const s = localStorage.getItem(CLAVE);
    if (!s) return null;
    const f = JSON.parse(s) as Formulario;
    const base = formularioVacio();
    const filas = <T,>(guardadas: T[] | undefined, minimo: T[], max: number) =>
      [...(Array.isArray(guardadas) ? guardadas : []), ...minimo].slice(0, Math.max(minimo.length, Math.min(max, guardadas?.length ?? 0)));
    return {
      contacto: { ...base.contacto, ...f.contacto },
      reiterativo: { ...base.reiterativo, ...f.reiterativo, meses: base.reiterativo.meses.map((m, i) => f.reiterativo?.meses?.[i] ?? m) },
      viajes: filas(f.viajes, base.viajes, LIMITES.viajes),
      gastos: filas(f.gastos, base.gastos, LIMITES.gastos),
    };
  } catch {
    return null;
  }
}

export function guardarBorrador(f: Formulario | null) {
  try {
    if (f) localStorage.setItem(CLAVE, JSON.stringify(f));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* modo privado o almacenamiento lleno: el borrador es solo una comodidad */
  }
}
