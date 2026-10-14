import type { Estado } from "../../../shared/esquema";

const ETIQUETA: Record<Estado, string> = { pendiente: "Pendiente de aprobación", aprobada: "Aprobada", rechazada: "Rechazada" };

export const EstadoInsignia = ({ estado }: { estado: Estado }) => <span className={`insignia ${estado}`}>{ETIQUETA[estado]}</span>;

export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
