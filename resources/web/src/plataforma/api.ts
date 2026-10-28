import type { DatosGuardarDocumento, DocumentoDetalle, EstadoDocumento, EstadoFirmante, Evidencias, VistaFirmante } from "../../../shared/plataforma";
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
/** Como pedir, pero con XMLHttpRequest: fetch no informa cuánto se lleva subido. alAvance recibe de 0 a 1. */
function subirConAvance<T>(url: string, datos: FormData, alAvance: (fraccion: number) => void): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    x.setRequestHeader("X-AutograFlow", "1");
    x.upload.onprogress = (e) => { if (e.lengthComputable) alAvance(e.loaded / e.total); };
    x.onerror = () => rechazar(new ErrorApi("No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.", 0));
    x.onload = () => {
      let cuerpo: { error?: string; campos?: Record<string, string> } = {};
      try { cuerpo = JSON.parse(x.responseText); } catch { /* respuesta sin JSON */ }
      if (x.status >= 200 && x.status < 300) resolver(cuerpo as T);
      else rechazar(new ErrorApi(cuerpo.error || `Error ${x.status}`, x.status, cuerpo.campos));
    };
    x.send(datos);
  });
}
const json = (metodo: string, datos?: unknown): RequestInit => ({ method: metodo, body: datos === undefined ? undefined : JSON.stringify(datos) });

/** invitado: entró «sin cuenta» (Gratis, 1 firmante); su email llega vacío. */
export interface EstadoGuia { estado: "pendiente" | "activa" | "omitida" | "completa"; paso: number; documentoId: number | null }
export interface Usuario { id: number; cuentaId: number; nombre: string; email: string; cuenta: string; plan: IdPlan; titular: boolean; invitado: boolean; avatar?: string | null; guia?: EstadoGuia }
/** Datos para la boleta (DNI, CE o pasaporte) o la factura (RUC, razón social y dirección fiscal). */
export interface Facturacion { tipo: "boleta" | "factura"; documentoTipo: "DNI" | "CE" | "PASAPORTE" | "RUC"; documento: string; nombre: string; direccion: string; correo: string }
export interface Perfil {
  nombre: string; email: string; avatar: string | null; cuenta: string; facturacion: Facturacion | null;
  /** Pagos aprobados; «comprobante»: su número si ya se emitió. */
  pagos: (PagoFila & { comprobante: string | null })[];
}
/** Destinatario de «Enviar a varios» y su resultado (token: su enlace; error: por qué no se envió). */
export interface Destinatario { nombre: string; telefono: string; email: string }
export interface ResultadoEnvio extends Destinatario { documentoId: number | null; token: string | null; esperaTurno: boolean; error: string | null }
/** Un documento creado desde una plantilla (historial de la plantilla). */
export interface EnvioPlantilla {
  id: number; nombre: string; estado: EstadoDocumento; creadoEn: string; enviadoEn: string | null; completadoEn: string | null; pdfListo: boolean;
  firmantes: { nombre: string; estado: EstadoFirmante; firmadoEn: string | null }[];
}
export interface Contacto { id: number | null; nombre: string; telefono: string; email: string; categoria: string; documentos: number; firmados: number; ultimo: string | null }
export interface Equipo {
  nombre: string; plazas: number; activo: boolean; soyTitular: boolean; codigo: string | null;
  miembros: { id: number; nombre: string; email: string; titular: boolean; yo: boolean; documentos: number }[];
}
export interface FilaDocumento {
  id: number; nombre: string; estado: EstadoDocumento; creadoEn: string; enviadoEn: string | null; completadoEn: string | null; firmantes: number; firmados: number; esPlantilla: boolean;
}

export const plataforma = {
  guardarGuia: (guia: EstadoGuia) => pedir<EstadoGuia>("/api/cuenta/guia", json("PUT", guia)),
  yo: () => pedir<Usuario>("/api/auth/yo"),
  registrar: (d: { nombre: string; empresa: string; email: string; clave: string; acepto: boolean; codigoEquipo: string; codigoReferido?: string }) => pedir("/api/auth/registro", json("POST", d)),
  ingresar: (d: { email: string; clave: string }) => pedir("/api/auth/ingresar", json("POST", d)),
  invitado: (acepto: boolean) => pedir("/api/auth/invitado", json("POST", { acepto })),
  salir: () => pedir("/api/auth/salir", json("POST", {})),
  olvide: (email: string) => pedir("/api/auth/olvide", json("POST", { email })),
  restablecer: (d: { email: string; token: string; clave: string }) => pedir("/api/auth/restablecer", json("POST", d)),
  recordar: (id: number, firmante: number) => pedir(`/api/documentos/${id}/recordar/${firmante}`, json("POST", {})),

  documentos: () => pedir<FilaDocumento[]>("/api/documentos"),
  /** alAvance (de 0 a 1): hasta 0,4 se prepara el PDF en el navegador; el resto es la subida. */
  subir: async (archivo: File, alAvance: (fraccion: number) => void = () => {}) => {
    const { preparado, campos, formulario, idioma } = await prepararPdf(archivo, (f) => alAvance(f * 0.4));
    const datos = new FormData();
    datos.append("original", archivo);
    datos.append("preparado", preparado, "preparado.pdf");
    datos.append("campos", JSON.stringify(campos));
    if (formulario) datos.append("formulario", JSON.stringify(formulario));
    datos.append("nombre", archivo.name);
    datos.append("idioma", idioma);
    // Lo que queda (0,95 → 1) es el servidor guardando el documento.
    const r = await subirConAvance<{ id: number; camposDetectados: number }>("/api/documentos", datos, (f) => alAvance(0.4 + f * 0.55));
    alAvance(1);
    return r;
  },
  documento: (id: number) => pedir<DocumentoDetalle>(`/api/documentos/${id}`),
  guardar: (id: number, d: DatosGuardarDocumento) => pedir(`/api/documentos/${id}`, json("PUT", d)),
  enviar: (id: number) => pedir<DocumentoDetalle>(`/api/documentos/${id}/enviar`, json("POST", {})),
  /** Crea un documento del editor a partir de la plantilla incluida «Solicitud de reembolso». */
  desdePlantillaReembolso: async (alAvance?: (fraccion: number) => void) => {
    const r = await fetch("/api/plantillas/reembolso.pdf", { credentials: "same-origin", headers: { "X-AutograFlow": "1" } });
    if (!r.ok) throw new ErrorApi("No se pudo abrir la plantilla.", r.status);
    return plataforma.subir(new File([await r.blob()], "Solicitud de reembolso.pdf", { type: "application/pdf" }), alAvance);
  },
  plantilla: (id: number, es: boolean) => pedir(`/api/documentos/${id}/plantilla`, json("POST", { es })),
  duplicar: (id: number) => pedir<{ id: number }>(`/api/documentos/${id}/duplicar`, json("POST", {})),
  eliminarPagina: (id: number, pagina: number) => pedir<DocumentoDetalle>(`/api/documentos/${id}/paginas/${pagina}`, { method: "DELETE" }),
  eliminarPaginas: (id: number, paginas: number[]) => pedir<DocumentoDetalle>(`/api/documentos/${id}/paginas/eliminar`, json("POST", { paginas })),
  subirLogo: (archivo: File) => pedir("/api/cuenta/logo", { method: "PUT", body: archivo, headers: { "Content-Type": archivo.type } }),
  quitarLogo: () => pedir("/api/cuenta/logo", { method: "DELETE" }),
  verificar: (sha: string) => pedir<Verificacion>(`/api/verificar/${sha}`),
  eliminar: (id: number) => pedir<{ resultado: "eliminado" | "anulado" }>(`/api/documentos/${id}`, { method: "DELETE" }),

  planes: () => pedir<Catalogo>("/api/planes"),
  equipo: () => pedir<Equipo>("/api/cuenta/equipo"),
  nuevoCodigoEquipo: () => pedir<{ codigo: string }>("/api/cuenta/equipo/codigo", json("POST", {})),
  quitarMiembro: (id: number) => pedir(`/api/cuenta/equipo/${id}`, { method: "DELETE" }),
  contactos: () => pedir<Contacto[]>("/api/contactos"),
  guardarContacto: (c: { id: number | null; nombre: string; telefono: string; email: string; categoria: string }) =>
    pedir<{ id: number }>(c.id ? `/api/contactos/${c.id}` : "/api/contactos", json(c.id ? "PUT" : "POST", { nombre: c.nombre, telefono: c.telefono, email: c.email, categoria: c.categoria })),
  enviarAVarios: (plantilla: number, firmante: number, destinatarios: Destinatario[]) =>
    pedir<ResultadoEnvio[]>(`/api/documentos/${plantilla}/enviar-a-varios`, json("POST", { firmante, destinatarios })),
  envios: (plantilla: number) => pedir<EnvioPlantilla[]>(`/api/documentos/${plantilla}/envios`),
  eliminarContacto: (id: number) => pedir<void>(`/api/contactos/${id}`, { method: "DELETE" }),
  cuenta: () => pedir<{ estado: EstadoCuenta; pagos: PagoFila[] }>("/api/cuenta"),
  comprar: (producto: string) => pedir<{ pagoId: number; url: string }>("/api/pagos", json("POST", { producto })),
  verificarPago: (id: number) => pedir<PagoFila>(`/api/pagos/${id}/verificar`, json("POST", {})),

  // «Mi perfil»: avatar, nombre, datos de facturación y comprobantes de pago.
  perfil: () => pedir<Perfil>("/api/perfil"),
  guardarPerfil: (d: { nombre: string; avatar: string | null; facturacion: Facturacion | null }) => pedir<Perfil>("/api/perfil", json("PUT", d)),
  /** El PDF del comprobante (la primera vez se emite con los datos de facturación actuales). */
  comprobante: async (pagoId: number) => {
    let r: Response;
    try { r = await fetch(`/api/pagos/${pagoId}/comprobante`, { credentials: "same-origin", headers: { "X-AutograFlow": "1" } }); }
    catch { throw new ErrorApi("No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.", 0); }
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new ErrorApi(e.error || `Error ${r.status}`, r.status, e.campos); }
    return r.blob();
  },

  // EX-Trae (Flow Tools): textos que van de un dispositivo a los demás con la misma cuenta.
  textosRecibidos: (despues: number) => pedir<TextoExTrae[]>(`/api/flow/ex-trae/textos?despues=${despues}`),
  enviarTexto: (texto: string, datos: Record<string, string> | null, origen: string) =>
    pedir<{ id: number }>("/api/flow/ex-trae/textos", json("POST", { texto, datos, origen })),
  borrarTexto: (id: number) => pedir(`/api/flow/ex-trae/textos/${id}`, { method: "DELETE" }),
  limpiarTextos: () => pedir("/api/flow/ex-trae/textos", { method: "DELETE" }),

  vista: (token: string) =>pedir<VistaFirmante>(`/api/firmar/${encodeURIComponent(token)}`),
  firmar: (token: string, valores: Record<string, string | boolean>, evidencias: Evidencias = {}, calculos: Record<string, string> = {}, libres: TextoLibre[] = [], versionLegal = "") =>
    pedir<{ completo: boolean }>(`/api/firmar/${encodeURIComponent(token)}`, json("POST", { valores, evidencias, calculos, libres, acepto: true, versionLegal })),
  rechazar: (token: string, motivo: string) => pedir(`/api/firmar/${encodeURIComponent(token)}/rechazar`, json("POST", { motivo })),
};

/** origen: «Celular|id» o «Computadora|id» (tipo de dispositivo y quién lo envió, para no mostrarse sus propios envíos). */
export interface TextoExTrae { id: number; texto: string; datos: Record<string, string> | null; origen: string; creadoEn: string | null }

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
  zipFirmados: (plantilla: number) => `/api/documentos/${plantilla}/firmados.zip`,
  imagenDueno: (id: number, campo: number) => `/api/documentos/${id}/campos/${campo}/imagen`,
  originalFirmante: (t: string) => `/api/firmar/${encodeURIComponent(t)}/archivo`,
  finalFirmante: (t: string, descargar = false) => `/api/firmar/${encodeURIComponent(t)}/final${descargar ? "?descargar=1" : ""}`,
  copiaFirmante: (t: string, descargar = false) => `/api/firmar/${encodeURIComponent(t)}/copia${descargar ? "?descargar=1" : ""}`,
  imagenFirmante: (t: string, campo: number) => `/api/firmar/${encodeURIComponent(t)}/campos/${campo}/imagen`,
  enlaceFirmante: (t: string) => `${location.origin}/f/${t}`,
};
