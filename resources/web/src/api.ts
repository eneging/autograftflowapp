import type { Decision, EntradaSolicitud, Estado, SolicitudPublica } from "../../shared/esquema";

export class ErrorApi extends Error {
  constructor(message: string, public status: number, public campos: Record<string, string> = {}) {
    super(message);
  }
}

async function pedir<T>(url: string, opciones: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { ...opciones, headers: { "Content-Type": "application/json", "X-AutograFlow": "1", ...opciones.headers } });
  } catch {
    throw new ErrorApi("No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.", 0);
  }
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(cuerpo.error || `Error ${r.status}`, r.status, cuerpo.campos);
  return cuerpo as T;
}

export const api = {
  crear: (datos: EntradaSolicitud, firma: string) =>
    pedir<{ numeroFactura: string; tokenSolicitante: string; tokenAprobador: string }>("/api/solicitudes", {
      method: "POST",
      body: JSON.stringify({ datos, firma }),
    }),
  ver: (token: string) => pedir<SolicitudPublica>(`/api/solicitudes/${encodeURIComponent(token)}`),
  decidir: (token: string, d: Decision) =>
    pedir<{ ok: true }>(`/api/solicitudes/${encodeURIComponent(token)}/decision`, { method: "POST", body: JSON.stringify(d) }),
  listar: (clave: string, filtro: { estado?: Estado | ""; buscar?: string }) =>
    pedir<FilaAdmin[]>(`/api/admin/solicitudes?${new URLSearchParams({ estado: filtro.estado ?? "", buscar: filtro.buscar ?? "" })}`, {
      headers: { "x-admin-password": clave },
    }),
};

export const urlPdf = (token: string, descargar = false) =>
  `/api/solicitudes/${encodeURIComponent(token)}/pdf${descargar ? "?descargar=1" : ""}`;

export interface FilaAdmin {
  numeroFactura: string;
  token: string;
  estado: Estado;
  nombre: string;
  estaca: string;
  barrio: string;
  totalCentavos: number;
  firmadoEn: string;
  decididoEn: string | null;
  aprobadorNombre: string | null;
}

/** Abre WhatsApp con un mensaje (y, si se da, directo al chat de ese número). */
export function enlaceWhatsApp(texto: string, telefono?: string) {
  const numero = (telefono ?? "").replace(/\D/g, "");
  return `https://wa.me/${numero.length >= 8 ? numero : ""}?text=${encodeURIComponent(texto)}`;
}
