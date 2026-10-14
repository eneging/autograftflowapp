import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { plataforma, type Usuario } from "./api";

interface Sesion { usuario: Usuario | null | undefined; recargar: () => Promise<void>; salir: () => Promise<void> }
const Contexto = createContext<Sesion>({ usuario: undefined, recargar: async () => {}, salir: async () => {} });

/** Sesión del usuario de la plataforma (undefined = cargando, null = sin sesión). */
export function SesionProveedor({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const recargar = useCallback(async () => {
    try { setUsuario(await plataforma.yo()); } catch { setUsuario(null); }
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
