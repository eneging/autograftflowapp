import { useCallback, useEffect, useState } from "react";
import type { SolicitudPublica } from "../../shared/esquema";
import { api, ErrorApi } from "./api";

/** Carga una solicitud por su enlace; `recargar` la vuelve a pedir (p. ej. tras aprobar). */
export function usarSolicitud(token: string) {
  const [s, setS] = useState<SolicitudPublica | null>(null);
  const [error, setError] = useState("");
  const recargar = useCallback(async () => {
    try {
      setS(await api.ver(token));
      setError("");
    } catch (e) {
      setError(e instanceof ErrorApi && e.status === 404 ? "Este enlace no es válido o la solicitud no existe." : (e as Error).message);
    }
  }, [token]);
  useEffect(() => {
    recargar();
  }, [recargar]);
  return { s, error, recargar };
}
