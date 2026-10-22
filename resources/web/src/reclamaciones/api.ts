export interface Proveedor { marca: string; razonSocial: string; ruc: string; domicilio: string; correo: string; configurado?: boolean }
export interface DatosReclamacion {
  nombre: string; documentoTipo: string; documento: string; domicilio: string; telefono: string; email: string;
  menor: boolean; representante: string; representanteDocumento: string; bien: string; descripcion: string;
  monto: string | null; moneda: string; tipo: string; detalle: string; pedido: string; canal: string;
}
export interface HojaReclamacion {
  id: number; numero: string; registradoEn: string; venceEl: string; datos: DatosReclamacion; proveedor: Proveedor;
  respuesta: string | null; responsable: string | null; respondidoEn: string | null; constanciaPostal: string | null;
  estado: string; token?: string; correos: { id: number; tipo: string; estado: string; intentos: number; enviado_en: string | null }[];
}
export class ErrorReclamacion extends Error { constructor(message: string, public campos: Record<string, string> = {}) { super(message); } }
export async function solicitar<T>(ruta: string, datos?: unknown, clave?: string): Promise<T> {
  let r: Response;
  try { r = await fetch(ruta, { method: datos === undefined ? "GET" : "POST", credentials: "same-origin", headers: { "X-AutograFlow": "1", "Accept": "application/json", "Content-Type": "application/json", ...(clave ? { "x-admin-password": clave } : {}) }, body: datos === undefined ? undefined : JSON.stringify(datos) }); }
  catch { throw new ErrorReclamacion("No se pudo conectar. Tus datos siguen en el formulario; vuelve a intentarlo."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorReclamacion(d.error || "No se pudo completar la solicitud. Inténtalo de nuevo.", d.campos || {});
  return d as T;
}
