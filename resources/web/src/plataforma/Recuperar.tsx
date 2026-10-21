import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ErrorApi, plataforma } from "./api";
import { usarSesion } from "./sesion";
import { PortadaMarco } from "./Portada";

/** «¿Olvidaste tu contraseña?»: pide el correo y envía el enlace. */
export function Olvide() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      await plataforma.olvide(email);
      setEnviado(true);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : "No se pudo enviar. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PortadaMarco angosta><form className="authForm" onSubmit={enviar} noValidate>
      <h1>Recupera tu contraseña</h1>
      {enviado ? (
        <div className="okNotice">
          Si <strong>{email}</strong> tiene una cuenta, te enviamos un correo con un enlace para crear una nueva contraseña. Vence en 60 minutos.
          <br />Revisa también la carpeta de spam.
        </div>
      ) : (
        <>
          <p>Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva contraseña.</p>
          <label className="field">
            <span className="fieldLabel">Correo electrónico</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
          </label>
          {error && <div className="afAlerta" role="alert">{error}</div>}
          <button className="primary ancho" disabled={enviando || !email}>{enviando ? "Enviando…" : "Enviar enlace"}</button>
        </>
      )}
      <p className="small centro"><Link to="/ingresar">← Volver a iniciar sesión</Link></p>
    </form></PortadaMarco>
  );
}

/** Página del enlace del correo: crea la nueva contraseña e inicia sesión. */
export function Restablecer() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { recargar } = usarSesion();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (clave.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (clave !== repetir) return setError("Las contraseñas no coinciden.");
    setEnviando(true);
    setError("");
    try {
      await plataforma.restablecer({ email, token, clave });
      await recargar();
      navegar("/app", { replace: true });
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setEnviando(false);
    }
  }

  if (!token || !email)
    return <PortadaMarco angosta><div className="afAlerta">Este enlace no es válido.</div><p className="small centro"><Link to="/olvide">Pedir un enlace nuevo</Link></p></PortadaMarco>;

  return (
    <PortadaMarco angosta><form className="authForm" onSubmit={enviar} noValidate>
      <h1>Crea tu nueva contraseña</h1>
      <p>Para la cuenta <strong>{email}</strong>.</p>
      <label className="field">
        <span className="fieldLabel">Nueva contraseña (mínimo 8 caracteres)</span>
        <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" required autoFocus />
      </label>
      <label className="field">
        <span className="fieldLabel">Repite la contraseña</span>
        <input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" required />
      </label>
      {error && <div className="afAlerta" role="alert">{error} {/venció|usó/.test(error) && <Link to="/olvide">Pedir otro enlace</Link>}</div>}
      <button className="primary ancho" disabled={enviando}>{enviando ? "Guardando…" : "Guardar y entrar"}</button>
    </form></PortadaMarco>
  );
}
