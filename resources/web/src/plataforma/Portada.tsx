import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PLANES, type IdPlan } from "../../../shared/planes";
import { BotonTema, Logo, LogoMarca } from "../componentes/Marco";
import { VentanaLegal, type TipoLegal } from "../componentes/Legal";
import { ErrorApi, plataforma, type Catalogo } from "./api";
import { ElegirPlan } from "./Planes";
import { marcarEntradaInvitado, usarSesion } from "./sesion";
import { Bienvenida } from "./Bienvenida";
import { RegistroDinamico } from "./Registro";

/**
 * Portada, planes y acceso (estilo Notion): barra superior con el logo y los accesos, un titular opcional y el
 * contenido sobre el lienzo blanco. «angosta» centra una columna estrecha (iniciar sesión, crear cuenta…).
 */
export function PortadaMarco({ children, despues, titular, angosta = false, inicio = false }: { children: ReactNode; despues?: ReactNode; titular?: ReactNode; angosta?: boolean; inicio?: boolean }) {
  const { usuario } = usarSesion();
  return (
    <div className={`landing ${inicio ? "landingInicio" : ""}`}>
      <a className="saltarContenido" href="#contenidoPortada">Saltar al contenido</a>
      <nav className="landingNav" aria-label="Navegación principal">
        <Logo />
        <div className="landingNavDer">
          {inicio && <Link className="navLink soloEscritorio" to="/como-funciona">Cómo funciona</Link>}
          <Link className="navLink soloEscritorio" to="/planes">Planes</Link>
          <Link className="navLink soloEscritorio" to="/verificar">Verificar PDF</Link>
          <BotonTema />
          {usuario
            ? <Link className="boton primary botonChico" to="/app">Ir a mis documentos</Link>
            : <>
                <Link className="navLink" to="/ingresar">Iniciar sesión</Link>
                <Link className="boton oscuro botonChico" to="/registro">Probar gratis</Link>
              </>}
        </div>
      </nav>
      <div id="contenidoPortada" className={`authWrap ${angosta ? "angosta" : ""}`}>
        {titular && <header className="authHeader">{titular}</header>}
        <div className="authCard">{children}</div>
        {despues}
      </div>
    </div>
  );
}

/** Titular de la portada. */
const TITULAR = (
  <>
    <LogoMarca tam={64} />
    <h1 className="heroTitulo">Firma tus documentos.<br /><span>Sin papeles ni complicaciones.</span></h1>
    <p className="heroTexto">Sube un PDF, marca dónde firma cada persona y envíalo por WhatsApp. Cada firmante firma desde su celular y tú recibes el PDF con su certificado.</p>
  </>
);

/** Portada: primero los planes; después crear la cuenta o iniciar sesión. Con sesión, «/» lleva a «Mis documentos». */
export function Inicio({ soloPlanes = false }: { soloPlanes?: boolean }) {
  const { usuario } = usarSesion();
  const [c, setC] = useState<Catalogo | null>(null);
  const [errorPlanes, setErrorPlanes] = useState(false);
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    if (!soloPlanes) return;
    let activo = true;
    setErrorPlanes(false);
    plataforma.planes().then((catalogo) => { if (activo) setC(catalogo); }).catch(() => { if (activo) setErrorPlanes(true); });
    return () => { activo = false; };
  }, [soloPlanes, intento]);
  if (usuario && !soloPlanes) return <Navigate to="/app" replace />;
  if (!soloPlanes) return <PortadaMarco inicio despues={<Presentacion compacto />}><Bienvenida /></PortadaMarco>;
  return (
    <PortadaMarco titular={usuario ? undefined : TITULAR} despues={<Presentacion />}>
      {usuario && (
        <div className="accountBar">
          <div className="accountInfo"><strong>{usuario.nombre}</strong> · Plan {PLANES[usuario.plan]?.nombre ?? "Gratis"}</div>
          {usuario.invitado && <Link className="boton botonChico" to="/registro">Crear mi cuenta</Link>}
        </div>
      )}
      <h2 className="plansTitle">Elige tu plan</h2>
      <p className="plansSub">Empieza gratis. Paga solo si necesitas más documentos, más firmantes, sellos o huellas.</p>
      {c ? <ElegirPlan c={c} actual={usuario?.plan} /> : errorPlanes ? <div className="afAlerta" role="alert">No pudimos cargar los planes. <button type="button" onClick={() => setIntento((n) => n + 1)}>Volver a intentar</button></div> : <p id="loading" role="status">Cargando planes…</p>}
    </PortadaMarco>
  );
}

function Presentacion({ compacto = false }: { compacto?: boolean }) {
  return (
    <>
      {!compacto && <section className="pasosAf">
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
      </section>}
    </>
  );
}

/** Iniciar sesión o crear una cuenta (con el plan elegido en la portada, si lo hay). */
export function Acceso({ modo }: { modo: "ingresar" | "registro" }) {
  return modo === "registro" ? <RegistroDinamico /> : <Ingreso />;
}

function Ingreso() {
  const { usuario, recargar } = usarSesion();
  const navegar = useNavigate();
  const { search } = useLocation();
  const [params] = useSearchParams();
  const destino = params.get("volver") ?? "";
  const volver = destino.startsWith("/") && !destino.startsWith("//") ? destino : "/app";
  const idPlan = params.get("plan") ?? "";
  const planElegido = Object.hasOwn(PLANES, idPlan) ? idPlan as IdPlan : null;
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (usuario && !usuario.invitado && !enviando) return <Navigate to={volver} replace />;
  async function enviar(e: FormEvent) {
    e.preventDefault(); if (enviando) return;
    setErrores({}); setAviso(""); setEnviando(true);
    try {
      await plataforma.ingresar({ email: email.trim(), clave });
      if (planElegido && PLANES[planElegido].precio > 0) {
        try { location.href = (await plataforma.comprar(planElegido)).url; return; }
        catch (err) { await recargar(); navegar("/app/cuenta", { replace: true }); alert(err instanceof ErrorApi ? err.message : "No se pudo iniciar el pago."); return; }
      }
      await recargar(); navegar(volver, { replace: true });
    } catch (err) {
      if (err instanceof ErrorApi) { setErrores(err.campos ?? {}); setAviso(err.message); }
      else setAviso("No se pudo continuar. Inténtalo de nuevo.");
      setEnviando(false);
    }
  }
  return <PortadaMarco angosta>
    <div className="flowBackRow"><Link to="/">← Volver al inicio</Link>{planElegido && <span className="chosenPlanChip">Plan elegido: {PLANES[planElegido].nombre}</span>}</div>
    <div className="authTabs"><span className="active">Iniciar sesión</span><Link to={"/registro" + search} replace>Crear cuenta</Link></div>
    <form className="authForm" onSubmit={enviar}>
      <h1>Bienvenido</h1><span className="small centro bloque">Ingresa para continuar con tus documentos.</span>
      <div className="field"><label htmlFor="email">Correo electrónico</label><input id="email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="nombre@correo.com" required />{errores.email && <span className="error">{errores.email}</span>}</div>
      <div className="field"><label htmlFor="clave">Contraseña</label><input id="clave" name="clave" type="password" value={clave} onChange={e => setClave(e.target.value)} autoComplete="current-password" placeholder="Tu contraseña" required />{errores.clave && <span className="error">{errores.clave}</span>}</div>
      {aviso && <div className="afAlerta" role="alert">{aviso}</div>}
      <button className="primary ancho" disabled={enviando}>{enviando ? "Un momento…" : "Ingresar →"}</button>
      <p className="small centro"><Link to="/olvide">¿Olvidaste tu contraseña?</Link></p>
    </form>
  </PortadaMarco>;
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
    <PortadaMarco angosta>
      <div className="flowBackRow"><Link to="/">← Volver al inicio</Link></div>
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
