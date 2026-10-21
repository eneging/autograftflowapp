import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PLANES, type IdPlan } from "../../../shared/planes";
import { BotonTema, Logo } from "../componentes/Marco";
import { VentanaLegal, type TipoLegal } from "../componentes/Legal";
import { ErrorApi, plataforma, type Catalogo } from "./api";
import { ElegirPlan } from "./Planes";
import { marcarEntradaInvitado, usarSesion } from "./sesion";

/** Fondo de color a pantalla completa con el logo grande y una tarjeta de vidrio (portada, planes y acceso). */
export function PortadaMarco({ children, despues }: { children: ReactNode; despues?: ReactNode }) {
  return (
    <div className="authWrap">
      <div className="authHeader">
        <Logo grande />
        <div className="authTagline">Firma tus documentos de forma sencilla.</div>
      </div>
      <div className="authCard">
        <div className="authLangRow"><BotonTema /></div>
        {children}
      </div>
      {despues}
    </div>
  );
}

/** Portada: primero los planes; después crear la cuenta o iniciar sesión. Con sesión, «/» lleva a «Mis documentos». */
export function Inicio({ soloPlanes = false }: { soloPlanes?: boolean }) {
  const { usuario } = usarSesion();
  const [c, setC] = useState<Catalogo | null>(null);
  useEffect(() => { plataforma.planes().then(setC).catch(() => {}); }, []);
  if (usuario && !soloPlanes) return <Navigate to="/app" replace />;
  return (
    <PortadaMarco despues={<Presentacion />}>
      {usuario ? (
        <div className="accountBar">
          <div className="accountInfo">👤 <strong>{usuario.nombre}</strong> · 🟢 {PLANES[usuario.plan]?.nombre ?? "Gratis"}</div>
          <Link className="boton success" to="/app">Ir a AutograFlow →</Link>
          {usuario.invitado && <Link className="boton primary" to="/registro">👤 Crear mi cuenta</Link>}
        </div>
      ) : (
        <div className="landingLoginBar">
          <span>¿Ya tienes una cuenta o suscripción?</span>
          <Link className="boton primary" to="/ingresar">🔐 Iniciar sesión</Link>
        </div>
      )}
      <h1 className="plansTitle">Elige tu tarifa de acceso</h1>
      <p className="plansSub">Elige cuántos documentos necesitas.</p>
      {c ? <ElegirPlan c={c} actual={usuario?.plan} /> : <p id="loading">Cargando planes…</p>}
    </PortadaMarco>
  );
}

function Presentacion() {
  return (
    <>
      <section className="pasosAf">
        {[
          ["📄", "Sube tu PDF", "Contratos, solicitudes, actas, recibos… Si el PDF ya trae campos rellenables, se detectan solos."],
          ["✍️", "Marca los campos", "Firma, sello, huella, texto, fecha y casillas para cada firmante."],
          ["💬", "Envía por WhatsApp", "Cada firmante recibe su enlace y firma con el dedo desde el celular, sin instalar nada."],
          ["🔒", "PDF con certificado", "El PDF firmado incluye fecha, hora, IP, dispositivo y huella SHA-256 de cada firma."],
        ].map(([icono, titulo, texto]) => (
          <div className="pasoAf" key={titulo}>
            <div className="pasoIcono">{icono}</div>
            <h3>{titulo}</h3>
            <p>{texto}</p>
          </div>
        ))}
      </section>
      <p className="pieAuth">
        <Link to="/verificar">🔍 Verificar un PDF firmado</Link> · <Link to="/reembolso">🧾 Plantilla de reembolso</Link>
      </p>
    </>
  );
}

/** Iniciar sesión o crear una cuenta (con el plan elegido en la portada, si lo hay). */
export function Acceso({ modo }: { modo: "ingresar" | "registro" }) {
  const { usuario, recargar } = usarSesion();
  const navegar = useNavigate();
  const { search } = useLocation();
  const [params] = useSearchParams();
  const volver = params.get("volver")?.startsWith("/") ? params.get("volver")! : "/app";
  const planElegido = (params.get("plan") ?? "") in PLANES ? (params.get("plan") as IdPlan) : null;
  const [datos, setDatos] = useState({ nombre: "", empresa: "", email: "", clave: "", clave2: "", codigoEquipo: "" });
  const [unirme, setUnirme] = useState(false);
  const [acepto, setAcepto] = useState(false);
  const [legal, setLegal] = useState<TipoLegal | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  // El invitado sí puede abrir estas páginas: para crear su cuenta (conserva sus documentos) o entrar con otra.
  if (usuario && !usuario.invitado && !enviando) return <Navigate to={volver} replace />;
  const campo = (k: keyof typeof datos) => ({ value: datos[k], onChange: (e: { target: { value: string } }) => setDatos({ ...datos, [k]: e.target.value }) });
  const registro = modo === "registro";

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErrores({});
    setAviso("");
    if (registro) {
      if (datos.clave.length < 8) return setErrores({ clave: "Mínimo 8 caracteres" });
      if (datos.clave !== datos.clave2) return setErrores({ clave2: "Las contraseñas no coinciden" });
      if (unirme && !datos.codigoEquipo.trim()) return setErrores({ codigoEquipo: "Escribe el código de tu organización" });
      if (!acepto) return setAviso("Debes confirmar que has leído y aceptas los Términos y Condiciones y la Política de Privacidad para crear una cuenta.");
    }
    setEnviando(true);
    try {
      if (registro) await plataforma.registrar({ nombre: datos.nombre, empresa: datos.empresa, email: datos.email, clave: datos.clave, acepto, codigoEquipo: unirme ? datos.codigoEquipo : "" });
      else await plataforma.ingresar({ email: datos.email, clave: datos.clave });
      // Con un plan de pago elegido en la portada, se va directo a pagarlo.
      if (planElegido && PLANES[planElegido].precio > 0 && !unirme) {
        try { location.href = (await plataforma.comprar(planElegido)).url; return; }
        catch (err) { await recargar(); navegar(`/app/cuenta`, { replace: true }); alert(err instanceof ErrorApi ? err.message : "No se pudo iniciar el pago."); return; }
      }
      await recargar();
      navegar(volver, { replace: true });
    } catch (err) {
      if (err instanceof ErrorApi) { setErrores(err.campos ?? {}); setAviso(err.message); }
      else setAviso("No se pudo continuar. Inténtalo de nuevo.");
      setEnviando(false);
    }
  }

  const otro = `${registro ? "/ingresar" : "/registro"}${search}`;
  const error = (k: string) => errores[k] && <span className="error">{errores[k]}</span>;
  return (
    <PortadaMarco>
      <div className="flowBackRow">
        <Link to={usuario ? "/planes" : "/"}>← Ver planes</Link>
        {planElegido && <span className="chosenPlanChip">Plan elegido: {PLANES[planElegido].nombre}</span>}
        {planElegido === "gratis" && !usuario && (
          <div className="guestAltRow">¿Prefieres no crear cuenta? <Link to="/sin-cuenta">Entrar sin cuenta →</Link></div>
        )}
        {usuario?.invitado && registro && (
          <div className="guestAltRow">Al crear tu cuenta conservarás los documentos que preparaste sin cuenta.</div>
        )}
      </div>
      <div className="authTabs" role="tablist">
        {registro ? <Link role="tab" aria-selected={false} to={otro} replace>Iniciar sesión</Link> : <span role="tab" aria-selected className="active">Iniciar sesión</span>}
        {registro ? <span role="tab" aria-selected className="active">Crear cuenta</span> : <Link role="tab" aria-selected={false} to={otro} replace>Crear cuenta</Link>}
      </div>
      <form className="authForm" onSubmit={enviar} noValidate>
        <h1>{registro ? "Crear cuenta" : "Bienvenido"}</h1>
        <span className="small centro bloque">{registro ? "Crea tu cuenta para asociar tus documentos, pagos y acceso." : "Ingresa con tu correo y contraseña."}</span>
        {registro && (
          <>
            <div className={`field ${errores.nombre ? "con-error" : ""}`}><label htmlFor="regNombre">Tu nombre</label>
              <input id="regNombre" {...campo("nombre")} autoComplete="name" placeholder="Ej. Juan Pérez" required />{error("nombre")}</div>
            <div className="field"><label htmlFor="regEmpresa">Empresa u organización (opcional)</label>
              <input id="regEmpresa" {...campo("empresa")} autoComplete="organization" placeholder="Ej. Mi Empresa S.A.C." /></div>
          </>
        )}
        <div className={`field ${errores.email ? "con-error" : ""}`}><label htmlFor="email">Correo electrónico</label>
          <input id="email" {...campo("email")} type="email" autoComplete="email" placeholder="Ej. juan@correo.com" required />{error("email")}</div>
        <div className={`field ${errores.clave ? "con-error" : ""}`}><label htmlFor="clave">Contraseña</label>
          <input id="clave" {...campo("clave")} type="password" autoComplete={registro ? "new-password" : "current-password"} placeholder={registro ? "Mínimo 8 caracteres" : "Tu contraseña"} required />{error("clave")}</div>
        {registro && (
          <>
            <div className={`field ${errores.clave2 ? "con-error" : ""}`}><label htmlFor="clave2">Confirmar contraseña</label>
              <input id="clave2" {...campo("clave2")} type="password" autoComplete="new-password" placeholder="Repite tu contraseña" required />{error("clave2")}</div>
            <label className="checkrow">
              <input type="checkbox" checked={unirme} onChange={(e) => setUnirme(e.target.checked)} />
              <div><strong>Unirme a una organización</strong><div className="small">Ingresa el código que te compartió el administrador de tu empresa (plan Empresarial).</div></div>
            </label>
            {unirme && (
              <div className={`orgJoinField field ${errores.codigoEquipo ? "con-error" : ""}`}><label htmlFor="codigoEquipo">Código de organización</label>
                <input id="codigoEquipo" {...campo("codigoEquipo")} placeholder="Ej. AF-ORG-5K8PQ" autoComplete="off" />{error("codigoEquipo")}</div>
            )}
            <label className={`checkrow termsCheck ${errores.acepto ? "con-error" : ""}`}>
              <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
              <div>
                <strong>He leído y acepto los Términos y Condiciones y la Política de Privacidad</strong>
                <p className="termsDeclare">Al marcar esta casilla declaras que <b>has leído completamente, entiendes y aceptas</b> los Términos y Condiciones y la Política de Privacidad.</p>
                <div className="small">Léelos aquí: <a href="#" onClick={(e) => { e.preventDefault(); setLegal("terminos"); }}>Términos y Condiciones</a> · <a href="#" onClick={(e) => { e.preventDefault(); setLegal("privacidad"); }}>Política de Privacidad</a></div>
              </div>
            </label>
          </>
        )}
        {aviso && <div className="afAlerta" role="alert">{aviso}</div>}
        <button className="primary ancho" disabled={enviando}>{enviando ? "Un momento…" : registro ? "👤 Crear cuenta" : "🔐 Ingresar"}</button>
        {!registro && <p className="small centro"><Link to="/olvide">¿Olvidaste tu contraseña?</Link></p>}
      </form>
      {legal && <VentanaLegal tipo={legal} alCerrar={() => setLegal(null)} />}
    </PortadaMarco>
  );
}

/**
 * «Entrar sin cuenta» (plan Gratis): 2 documentos diarios y 1 firmante por documento.
 * La casilla de Términos y Privacidad empieza siempre desmarcada: hay que aceptarlos en cada entrada.
 */
export function SinCuenta() {
  const { usuario, recargar } = usarSesion();
  const navegar = useNavigate();
  const [acepto, setAcepto] = useState(false);
  const [legal, setLegal] = useState<TipoLegal | null>(null);
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (usuario && !enviando) return <Navigate to="/app" replace />;

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setAviso("");
    if (!acepto) return setAviso("Debes confirmar que has leído y aceptas los Términos y Condiciones y la Política de Privacidad para continuar.");
    setEnviando(true);
    try {
      await plataforma.invitado(true);
      marcarEntradaInvitado();
      await recargar();
      navegar("/app", { replace: true });
    } catch (err) {
      setAviso(err instanceof ErrorApi ? err.message : "No se pudo continuar. Inténtalo de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <PortadaMarco>
      <div className="flowBackRow"><Link to="/">← Ver planes</Link></div>
      <form className="authForm" onSubmit={entrar} noValidate>
        <h1>Entrar sin cuenta</h1>
        <span className="small centro bloque">
          Prueba Gratis: {PLANES.gratis.documentos} documentos diarios y {PLANES.gratis.firmantesSinCuenta ?? 1} firmante por documento. Para continuar debes aceptar las condiciones cada vez que entras.
        </span>
        <label className="checkrow termsCheck">
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
          <div>
            <strong>He leído y acepto los Términos y Condiciones y estoy de acuerdo con la Política de Privacidad</strong>
            <p className="termsDeclare">Al marcar esta casilla declaras que <b>has leído completamente, entiendes y aceptas</b> los Términos y Condiciones y la Política de Privacidad. Debes confirmarlo cada vez que entras sin cuenta.</p>
            <div className="small">Léelos aquí: <a href="#" onClick={(e) => { e.preventDefault(); setLegal("terminos"); }}>Términos y Condiciones</a> · <a href="#" onClick={(e) => { e.preventDefault(); setLegal("privacidad"); }}>Política de Privacidad</a></div>
          </div>
        </label>
        {aviso && <div className="afAlerta" role="alert">{aviso}</div>}
        <button className="success ancho" disabled={enviando}>{enviando ? "Un momento…" : "🚀 Entrar sin cuenta"}</button>
        <p className="small centro">¿Prefieres guardar tus documentos a tu nombre? <Link to="/registro?plan=gratis">Crea tu cuenta gratis</Link></p>
      </form>
      {legal && <VentanaLegal tipo={legal} alCerrar={() => setLegal(null)} />}
    </PortadaMarco>
  );
}
