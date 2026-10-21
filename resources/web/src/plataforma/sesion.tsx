import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { plataforma, type Usuario } from "./api";

interface Sesion { usuario: Usuario | null | undefined; recargar: () => Promise<void>; salir: () => Promise<void> }
const Contexto = createContext<Sesion>({ usuario: undefined, recargar: async () => {}, salir: async () => {} });

/**
 * Marca de que el invitado aceptó los Términos en esta pestaña. Sin cuenta hay que aceptarlos en cada entrada:
 * al abrir la app en otra pestaña o después de cerrar el navegador, la sesión de invitado se cierra.
 */
const ACEPTO_INVITADO = "af_invitado_acepto";
export function marcarEntradaInvitado() {
  try { sessionStorage.setItem(ACEPTO_INVITADO, "1"); } catch { /* sin almacenamiento: vale para esta carga */ }
}
function aceptoEnEstaPestana() {
  try { return sessionStorage.getItem(ACEPTO_INVITADO) === "1"; } catch { return false; }
}

/** Sesión del usuario de la plataforma (undefined = cargando, null = sin sesión). */
export function SesionProveedor({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const recargar = useCallback(async () => {
    try {
      const u = await plataforma.yo();
      if (u.invitado && !aceptoEnEstaPestana()) {
        await plataforma.salir().catch(() => {});
        setUsuario(null);
        return;
      }
      setUsuario(u);
    } catch { setUsuario(null); }
  }, []);
  const salir = useCallback(async () => {
    try { await plataforma.salir(); } finally { setUsuario(null); }
  }, []);
  useEffect(() => { recargar(); }, [recargar]);
  return <Contexto.Provider value={{ usuario, recargar, salir }}>{children}</Contexto.Provider>;
}
export const usarSesion = () => useContext(Contexto);

/** Envuelve las páginas que requieren sesión: si no hay, manda a «Ingresar» y vuelve después. */
export function ConSesion({ children }: { children: ReactNode }) {
  const { usuario } = usarSesion();
  const ubicacion = useLocation();
  if (usuario === undefined) return <div className="card"><p id="loading">Cargando…</p></div>;
  if (!usuario) return <Navigate to={`/ingresar?volver=${encodeURIComponent(ubicacion.pathname)}`} replace />;
  return <>{children}</>;
}
