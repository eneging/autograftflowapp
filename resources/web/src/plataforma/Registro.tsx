import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PLANES, type IdPlan } from "../../../shared/planes";
import { VentanaLegal, type TipoLegal } from "../componentes/Legal";
import { ErrorApi, plataforma } from "./api";
import { PortadaMarco } from "./Portada";
import { usarSesion } from "./sesion";
import "./registro.css";

const PASOS = ["Tus datos", "Tu contraseña", "Todo listo"];
const PASO_CAMPO: Record<string, number> = { nombre: 0, email: 0, clave: 1, clave2: 1, empresa: 2, codigoEquipo: 2, codigoReferido: 2, acepto: 2 };

export function RegistroDinamico() {
  const { usuario, recargar } = usarSesion();
  const navegar = useNavigate();
  const { search } = useLocation();
  const [params] = useSearchParams();
  const destino = params.get("volver") ?? "";
  const volver = destino.startsWith("/") && !destino.startsWith("//") ? destino : "/app";
  const idPlan = params.get("plan") ?? "";
  const planElegido = Object.hasOwn(PLANES, idPlan) ? idPlan as IdPlan : null;
  const [paso, setPaso] = useState(0);
  const [datos, setDatos] = useState({ nombre: "", email: "", clave: "", clave2: "", empresa: "", codigoEquipo: "", codigoReferido: (params.get("ref") ?? "").slice(0, 20).toUpperCase() });
  const [unirme, setUnirme] = useState(false);
  const [verEmpresa, setVerEmpresa] = useState(false);
  const [verReferido, setVerReferido] = useState(!!params.get("ref"));
  const [verClave, setVerClave] = useState(false);
  const [acepto, setAcepto] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [legal, setLegal] = useState<TipoLegal | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const focoError = useRef<string | null>(null);
  const pasoAnterior = useRef(0);
  const bloqueo = useRef(false);
  const pago = !unirme && !!planElegido && PLANES[planElegido].precio > 0;

  useEffect(() => {
    if (focoError.current) { document.getElementById(`registro-${focoError.current}`)?.focus(); focoError.current = null; }
    else if (pasoAnterior.current !== paso) { titulo.current?.focus({ preventScroll: true }); titulo.current?.scrollIntoView({ block: "start", behavior: "instant" }); }
    pasoAnterior.current = paso;
  }, [paso, errores]);

  if (usuario && !usuario.invitado && !enviando) return <Navigate to={volver} replace />;

  function campo(k: keyof typeof datos) {
    return { id: `registro-${k}`, name: k, value: datos[k], "aria-invalid": !!errores[k], "aria-describedby": errores[k] ? `registro-error-${k}` : undefined,
      onChange: (e: { target: { value: string } }) => { const value = e.target.value; setDatos(d => ({ ...d, [k]: value })); if (errores[k]) setErrores(prev => { const copia = { ...prev }; delete copia[k]; return copia; }); } };
  }
  const error = (k: string) => errores[k] && <span className="error" id={`registro-error-${k}`}>{errores[k]}</span>;
  function validar(p: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (p === 0) {
      if (datos.nombre.trim().length < 2) e.nombre = "Escribe tu nombre (al menos 2 caracteres).";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email.trim())) e.email = "Escribe un correo válido, por ejemplo nombre@correo.com.";
    }
    if (p === 1) {
      if (datos.clave.length < 8) e.clave = "Usa al menos 8 caracteres.";
      if (!datos.clave2 || datos.clave !== datos.clave2) e.clave2 = "Las contraseñas deben coincidir.";
    }
    if (p === 2) {
      if (unirme && !datos.codigoEquipo.trim()) e.codigoEquipo = "Ingresa el código que te compartió tu organización.";
      if (unirme && datos.codigoReferido.trim()) e.codigoReferido = "El referido es para una cuenta nueva. Retíralo para unirte a tu organización.";
      if (!acepto) e.acepto = "Lee y acepta los Términos y Condiciones y la Política de Privacidad para continuar.";
    }
    return e;
  }
  function mostrarErrores(e: Record<string, string>, mensaje = "Revisa los campos indicados.") {
    const primero = Object.keys(e)[0];
    setErrores(e); setAviso(mensaje);
    if (primero) { setPaso(PASO_CAMPO[primero] ?? 2); focoError.current = primero; }
    if (e.empresa) setVerEmpresa(true);
    if (e.codigoReferido) setVerReferido(true);
  }
  async function enviar(e: FormEvent) {
    e.preventDefault(); if (bloqueo.current) return;
    const problemas = validar(paso);
    if (Object.keys(problemas).length) { mostrarErrores(problemas); return; }
    setErrores({}); setAviso("");
    if (paso < 2) { setPaso(paso + 1); return; }
    const todos = { ...validar(0), ...validar(1), ...validar(2) };
    if (Object.keys(todos).length) { mostrarErrores(todos); return; }
    bloqueo.current = true; setEnviando(true);
    try {
      await plataforma.registrar({ nombre: datos.nombre.trim(), empresa: datos.empresa.trim(), email: datos.email.trim(), clave: datos.clave,
        acepto, codigoEquipo: unirme ? datos.codigoEquipo.trim() : "", codigoReferido: datos.codigoReferido.trim() });
      if (pago && planElegido) {
        try { location.href = (await plataforma.comprar(planElegido)).url; return; }
        catch (err) { await recargar(); navegar("/app/cuenta", { replace: true }); alert(err instanceof ErrorApi ? err.message : "Tu cuenta se creó, pero no se pudo abrir el pago. Puedes continuarlo desde Mi Plan."); return; }
      }
      await recargar(); navegar(volver, { replace: true });
    } catch (err) {
      if (err instanceof ErrorApi) mostrarErrores(err.campos ?? {}, err.message);
      else setAviso("No se pudo conectar. Tus datos siguen aquí; vuelve a intentarlo.");
      setEnviando(false); bloqueo.current = false;
    }
  }
  function retroceder(indice: number) { if (!enviando) { setAviso(""); setErrores({}); setPaso(indice); } }
  function elegirEspacio(equipo: boolean) {
    setUnirme(equipo); setAviso("");
    setErrores(prev => { const copia = { ...prev }; delete copia.codigoEquipo; delete copia.codigoReferido; return copia; });
  }

  return <PortadaMarco angosta>
    <div className="registroPagina">
      <div className="registroArriba"><Link to="/">← Inicio</Link><span>¿Ya tienes cuenta? <Link to={`/ingresar${search}`}>Ingresar</Link></span></div>
      <div className="registroIntro"><span className="entradaEyebrow">TU PRIMER DOCUMENTO EMPIEZA AQUÍ</span><h1>Crea tu cuenta,<br />paso a paso.</h1><p>{planElegido && PLANES[planElegido].precio > 0 ? `Elegiste ${PLANES[planElegido].nombre}. Primero creamos tu cuenta.` : `${PLANES.gratis.documentos} documentos gratis al día. Sin tarjeta.`}</p></div>
      {usuario?.invitado && <p className="registroInvitado">Conservarás los documentos que preparaste como invitado al crear tu cuenta propia.</p>}
      <nav className="registroPasos" aria-label="Pasos para crear tu cuenta"><ol>{PASOS.map((nombre, i) => <li key={nombre}><button type="button" disabled={i > paso || enviando} aria-current={i === paso ? "step" : undefined} onClick={() => retroceder(i)}><span aria-hidden>{i < paso ? "✓" : i + 1}</span>{nombre}</button></li>)}</ol></nav>
      <div className="registroProgreso" role="progressbar" aria-label="Progreso del registro" aria-valuemin={1} aria-valuemax={3} aria-valuenow={paso + 1}><span style={{ width: `${(paso + 1) / 3 * 100}%` }} /></div>
      <form className="registroForm" onSubmit={enviar} noValidate>
        <fieldset disabled={enviando}>
          <div className="registroPasoTitulo"><span>PASO {paso + 1} DE 3</span><h2 ref={titulo} tabIndex={-1}>{["¿Cómo te llamas?", "Protege tu cuenta", "Todo listo para empezar"][paso]}</h2><p>{["Solo necesitamos tu nombre y tu correo.", "Elige una contraseña y confírmala.", "Elige tu espacio y revisa tus datos antes de continuar."][paso]}</p></div>
          {paso === 0 && <div className="registroCampos">
            <label htmlFor="registro-nombre">Tu nombre<input {...campo("nombre")} autoComplete="name" maxLength={120} required placeholder="Ej. María García" />{error("nombre")}</label>
            <label htmlFor="registro-email">Correo electrónico<input {...campo("email")} type="email" autoComplete="email" maxLength={160} required placeholder="nombre@correo.com" />{error("email")}</label>
          </div>}
          {paso === 1 && <div className="registroCampos">
            <label htmlFor="registro-clave">Contraseña<div className="registroClave"><input {...campo("clave")} type={verClave ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={200} required placeholder="Mínimo 8 caracteres" /><button type="button" aria-pressed={verClave} aria-label={verClave ? "Ocultar contraseñas" : "Mostrar contraseñas"} onClick={() => setVerClave(!verClave)}>{verClave ? "Ocultar" : "Mostrar"}</button></div>{error("clave")}</label>
            <label htmlFor="registro-clave2">Confirma tu contraseña<input {...campo("clave2")} type={verClave ? "text" : "password"} autoComplete="new-password" maxLength={200} required placeholder="Escríbela una vez más" />{error("clave2")}</label>
            <ul className="registroRequisitos" aria-label="Requisitos de contraseña"><li className={datos.clave.length >= 8 ? "cumple" : ""}>{datos.clave.length >= 8 ? "✓" : "○"} Al menos 8 caracteres</li><li className={datos.clave2 && datos.clave === datos.clave2 ? "cumple" : ""}>{datos.clave2 && datos.clave === datos.clave2 ? "✓" : "○"} Las contraseñas coinciden</li></ul>
          </div>}
          {paso === 2 && <>
            <div className="registroResumen"><div><strong>{datos.nombre}</strong><span>{datos.email}</span></div><button type="button" onClick={() => retroceder(0)}>Editar</button></div>
            <div className="registroEspacio" role="radiogroup" aria-label="Tipo de espacio"><label className={!unirme ? "elegida" : ""}><input type="radio" name="espacio" checked={!unirme} onChange={() => elegirEspacio(false)} /><span><strong>Mi propia cuenta</strong><small>Personal o para mi negocio</small></span></label><label className={unirme ? "elegida" : ""}><input type="radio" name="espacio" checked={unirme} onChange={() => elegirEspacio(true)} /><span><strong>Unirme a un equipo</strong><small>Tengo un código de organización</small></span></label></div>
            {unirme ? <div className="registroCampos"><label htmlFor="registro-codigoEquipo">Código de organización<input {...campo("codigoEquipo")} autoComplete="off" maxLength={20} placeholder="Ej. AF-ORG-5K8PQ" required />{error("codigoEquipo")}</label><p className="registroNota">Usarás el plan de tu organización. No iniciaremos un pago individual.</p>{usuario?.invitado && <p className="registroNota">Esta opción te une al equipo; para conservar los documentos de tu sesión de invitado en tu cuenta propia, elige «Mi propia cuenta».</p>}</div>
              : <div className="registroOpcional"><button type="button" aria-expanded={verEmpresa} aria-controls="registroEmpresa" onClick={() => setVerEmpresa(!verEmpresa)}>{verEmpresa ? "−" : "+"} Añadir empresa u organización (opcional)</button>{verEmpresa && <label id="registroEmpresa" htmlFor="registro-empresa">Nombre de tu negocio<input {...campo("empresa")} autoComplete="organization" maxLength={120} placeholder="Ej. Mi Empresa S.A.C." />{error("empresa")}</label>}</div>}
            <div className="registroOpcional"><button type="button" aria-expanded={verReferido} aria-controls="registroReferido" onClick={() => setVerReferido(!verReferido)}>{verReferido ? "−" : "+"} {datos.codigoReferido ? "Tu código de referido" : "Tengo un código de referido"}</button>{verReferido && <div id="registroReferido"><label htmlFor="registro-codigoReferido">Código de referido (opcional)<input {...campo("codigoReferido")} maxLength={20} autoComplete="off" placeholder="AF-…" />{error("codigoReferido")}</label><p className="registroNota">Quien te invitó puede recibir documentos por tu primera compra. Tu precio no cambia. <Link to="/referidos" target="_blank" rel="noreferrer">Ver condiciones ↗</Link></p>{unirme && datos.codigoReferido && <div className="registroConflicto"><p>El referido aplica a cuentas nuevas, no al ingreso a un equipo.</p><button type="button" onClick={() => { setDatos(d => ({ ...d, codigoReferido: "" })); setErrores(prev => { const copia = { ...prev }; delete copia.codigoReferido; return copia; }); }}>Quitar código de referido</button></div>}</div>}</div>
            <div className="registroPlan"><strong>{unirme ? "Plan de tu organización" : `Plan ${PLANES[planElegido ?? 'gratis'].nombre}`}</strong><span>{unirme ? "Se asigna al validar el código del equipo." : pago ? "Después de crear tu cuenta continuarás al pago seguro en Mercado Pago." : `${PLANES.gratis.documentos} documentos al día · Sin tarjeta`}</span><button type="button" onClick={() => retroceder(1)}>Revisar contraseña</button></div>
            <label className="registroAcepto" htmlFor="registro-acepto"><input id="registro-acepto" type="checkbox" checked={acepto} aria-invalid={!!errores.acepto} aria-describedby={errores.acepto ? "registro-error-acepto" : undefined} onChange={e => { setAcepto(e.target.checked); if(e.target.checked) setErrores(prev => { const copia = { ...prev }; delete copia.acepto; return copia; }); }} /><span>He leído, entiendo y acepto los Términos y Condiciones y la Política de Privacidad.</span></label>
            <div className="registroLegales"><button type="button" onClick={() => setLegal("terminos")}>Leer Términos y Condiciones</button><button type="button" onClick={() => setLegal("privacidad")}>Leer Política de Privacidad</button></div>{error("acepto")}
          </>}
        </fieldset>
        {aviso && <div className="afAlerta" role="alert">{aviso}</div>}
        <div className="registroAcciones">{paso > 0 && <button type="button" disabled={enviando} onClick={() => retroceder(paso - 1)}>← Atrás</button>}<button type="submit" className="primary" disabled={enviando}>{enviando ? "Creando tu cuenta…" : paso < 2 ? "Continuar →" : pago ? "Crear cuenta y continuar al pago →" : "Crear mi cuenta →"}</button></div>
        {paso === 0 && !usuario && <p className="registroSinCuenta">¿Prefieres explorar primero? <Link to="/sin-cuenta">Probar sin cuenta</Link></p>}
      </form>
    </div>
    {legal && <VentanaLegal tipo={legal} alCerrar={() => setLegal(null)} />}
  </PortadaMarco>;
}
