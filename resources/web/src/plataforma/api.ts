import type { DatosGuardarDocumento, DocumentoDetalle, EstadoDocumento, Evidencias, VistaFirmante } from "../../../shared/plataforma";
import type { EstadoCuenta, IdPlan, PagoFila, Plan } from "../../../shared/planes";
import { prepararPdf } from "./prepararPdf";

export class ErrorApi extends Error {
  constructor(message: string, public status: number, public campos: Record<string, string> = {}) { super(message); }
}

async function pedir<T>(url: string, opciones: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      credentials: "same-origin",
      ...opciones,
      // La cabecera X-AutograFlow protege contra peticiones hechas desde otros sitios (CSRF).
      headers: { "X-AutograFlow": "1", ...(typeof opciones.body === "string" ? { "Content-Type": "application/json" } : {}), ...opciones.headers },
    });
  } catch {
    throw new ErrorApi("No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.", 0);
  }
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(cuerpo.error || `Error ${r.status}`, r.status, cuerpo.campos);
  return cuerpo as T;
}
const json = (metodo: string, datos?: unknown): RequestInit => ({ method: metodo, body: datos === undefined ? undefined : JSON.stringify(datos) });

/** invitado: entró «sin cuenta» (Gratis, 1 firmante); su email llega vacío. */
export interface Usuario { id: number; cuentaId: number; nombre: string; email: string; cuenta: string; plan: IdPlan; titular: boolean; invitado: boolean }
export interface Contacto { nombre: string; telefono: string; email: string; documentos: number; firmados: number; ultimo: string | null }
export interface Equipo {
  nombre: string; plazas: number; activo: boolean; soyTitular: boolean; codigo: string | null;
  miembros: { id: number; nombre: string; email: string; titular: boolean; yo: boolean; documentos: number }[];
}
export interface FilaDocumento {
  id: number; nombre: string; estado: EstadoDocumento; creadoEn: string; enviadoEn: string | null; completadoEn: string | null; firmantes: number; firmados: number; esPlantilla: boolean;
}

export const plataforma = {
  yo: () => pedir<Usuario>("/api/auth/yo"),
  registrar: (d: { nombre: string; empresa: string; email: string; clave: string; acepto: boolean; codigoEquipo: string }) => pedir("/api/auth/registro", json("POST", d)),
  ingresar: (d: { email: string; clave: string }) => pedir("/api/auth/ingresar", json("POST", d)),
  invitado: (acepto: boolean) => pedir("/api/auth/invitado", json("POST", { acepto })),
  salir: () => pedir("/api/auth/salir", json("POST", {})),
  olvide: (email: string) => pedir("/api/auth/olvide", json("POST", { email })),
  restablecer: (d: { email: string; token: string; clave: string }) => pedir("/api/auth/restablecer", json("POST", d)),
  recordar: (id: number, firmante: number) => pedir(`/api/documentos/${id}/recordar/${firmante}`, json("POST", {})),

  documentos: () => pedir<FilaDocumento[]>("/api/documentos"),
  subir: async (archivo: File) => {
    const { preparado, campos, formulario } = await prepararPdf(archivo);
    const datos = new FormData();
    datos.append("original", archivo);
    datos.append("preparado", preparado, "preparado.pdf");
    datos.append("campos", JSON.stringify(campos));
    if (formulario) datos.append("formulario", JSON.stringify(formulario));
    datos.append("nombre", archivo.name);
    return pedir<{ id: number; camposDetectados: number }>("/api/documentos", { method: "POST", body: datos });
  },
  documento: (id: number) => pedir<DocumentoDetalle>(`/api/documentos/${id}`),
  guardar: (id: number, d: DatosGuardarDocumento) => pedir(`/api/documentos/${id}`, json("PUT", d)),
  enviar: (id: number) => pedir<DocumentoDetalle>(`/api/documentos/${id}/enviar`, json("POST", {})),
  plantilla: (id: number, es: boolean) => pedir(`/api/documentos/${id}/plantilla`, json("POST", { es })),
  duplicar: (id: number) => pedir<{ id: number }>(`/api/documentos/${id}/duplicar`, json("POST", {})),
  eliminarPagina: (id: number, pagina: number) => pedir<DocumentoDetalle>(`/api/documentos/${id}/paginas/${pagina}`, { method: "DELETE" }),
  subirLogo: (archivo: File) => pedir("/api/cuenta/logo", { method: "PUT", body: archivo, headers: { "Content-Type": archivo.type } }),
  quitarLogo: () => pedir("/api/cuenta/logo", { method: "DELETE" }),
  verificar: (sha: string) => pedir<Verificacion>(`/api/verificar/${sha}`),
  eliminar: (id: number) => pedir<{ resultado: "eliminado" | "anulado" }>(`/api/documentos/${id}`, { method: "DELETE" }),

  planes: () => pedir<Catalogo>("/api/planes"),
  equipo: () => pedir<Equipo>("/api/cuenta/equipo"),
  nuevoCodigoEquipo: () => pedir<{ codigo: string }>("/api/cuenta/equipo/codigo", json("POST", {})),
  quitarMiembro: (id: number) => pedir(`/api/cuenta/equipo/${id}`, { method: "DELETE" }),
  contactos: () => pedir<Contacto[]>("/api/contactos"),
  cuenta: () => pedir<{ estado: EstadoCuenta; pagos: PagoFila[] }>("/api/cuenta"),
  comprar: (producto: string) => pedir<{ pagoId: number; url: string }>("/api/pagos", json("POST", { producto })),
  verificarPago: (id: number) => pedir<PagoFila>(`/api/pagos/${id}/verificar`, json("POST", {})),

  vista: (token: string) => pedir<VistaFirmante>(`/api/firmar/${encodeURIComponent(token)}`),
  firmar: (token: string, valores: Record<string, string | boolean>, evidencias: Evidencias = {}, calculos: Record<string, string> = {}, libres: TextoLibre[] = []) =>
    pedir<{ completo: boolean }>(`/api/firmar/${encodeURIComponent(token)}`, json("POST", { valores, evidencias, calculos, libres })),
  rechazar: (token: string, motivo: string) => pedir(`/api/firmar/${encodeURIComponent(token)}/rechazar`, json("POST", { motivo })),
};

/** Texto libre que agrega el firmante (en puntos PDF, como los campos). */
export interface TextoLibre { pagina: number; x: number; y: number; w: number; h: number; texto: string }

export interface Catalogo { planes: Plan[]; notaIlimitado: string; moneda: string; pagosActivos: boolean }

export type Verificacion =
  | { encontrado: false }
  | {
      encontrado: true; tipo: "firmado" | "original";
      documento: { nombre: string; estado: EstadoDocumento; empresa: string; enviadoEn: string | null; completadoEn: string | null };
      firmantes: { nombre: string; estado: string; firmadoEn: string | null }[];
    };

export const urls = {
  logo: () => "/api/cuenta/logo",
  logoFirmante: (t: string) => `/api/firmar/${encodeURIComponent(t)}/logo`,
  original: (id: number) => `/api/documentos/${id}/archivo`,
  final: (id: number, descargar = false) => `/api/documentos/${id}/final${descargar ? "?descargar=1" : ""}`,
  imagenDueno: (id: number, campo: number) => `/api/documentos/${id}/campos/${campo}/imagen`,
  originalFirmante: (t: string) => `/api/firmar/${encodeURIComponent(t)}/archivo`,
  finalFirmante: (t: string, descargar = false) => `/api/firmar/${encodeURIComponent(t)}/final${descargar ? "?descargar=1" : ""}`,
  imagenFirmante: (t: string, campo: number) => `/api/firmar/${encodeURIComponent(t)}/campos/${campo}/imagen`,
  enlaceFirmante: (t: string) => `${location.origin}/f/${t}`,
};
