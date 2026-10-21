import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PLANES } from "../../../shared/planes";
import { usarSesion } from "../plataforma/sesion";

export function Logo({ grande = false }: { grande?: boolean }) {
  return (
    <Link to="/" className={`logo ${grande ? "authLogo" : ""}`} aria-label="AutograFlow">
      <svg className="logoF" viewBox="0 0 100 100" role="img" aria-hidden>
        <rect width="100" height="100" rx="22" fill="#4D148C" />
        <text x="50" y="64" fontFamily="Montserrat, Arial, sans-serif" fontWeight="900" fontSize="40" fill="#fff" textAnchor="middle">AF</text>
        <polygon points="38,74 62,74 50,88" fill="#FF6200" />
      </svg>
      <span className="logoWord">Autogra<span className="logoFlow">Flow</span></span>
    </Link>
  );
}

// ---------------------------------------------------------------- tema claro / oscuro

const CLAVE_TEMA = "autograflow_tema";
const temaGuardado = (): "light" | "dark" => {
  try { return localStorage.getItem(CLAVE_TEMA) === "dark" ? "dark" : "light"; } catch { return "light"; }
};

export function usarTema() {
  const [tema, setTema] = useState(temaGuardado);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    try { localStorage.setItem(CLAVE_TEMA, tema); } catch { /* navegador sin almacenamiento */ }
  }, [tema]);
  return { tema, cambiar: () => setTema((t) => (t === "dark" ? "light" : "dark")) };
}

export function BotonTema() {
  const { tema, cambiar } = usarTema();
  return (
    <button type="button" className="botonRedondo" onClick={cambiar} title={tema === "dark" ? "Tema claro" : "Tema oscuro"} aria-label="Cambiar tema">
      {tema === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

// ---------------------------------------------------------------- marco

const enAplicacion = () =>
  /WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Telegram|; wv\)/i.test(navigator.userAgent || "");
const esIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
/** Portada, planes y acceso: fondo de color a pantalla completa, sin encabezado (como el prototipo). */
const RUTAS_PORTADA = /^\/(planes|ingresar|registro|sin-cuenta|olvide|restablecer)?$/;
/** Páginas que abren los firmantes con su enlace: sin menú de cuenta. */
const RUTAS_FIRMANTE = /^\/(f|s|a)\/|^\/reembolso$/;

/** Encabezado de AutograFlow y aviso cuando el enlace se abre dentro de WhatsApp u otra aplicación. */
export function Marco({ children }: { children: ReactNode }) {
  const [verAviso, setVerAviso] = useState(enAplicacion);
  const { pathname } = useLocation();
  const portada = RUTAS_PORTADA.test(pathname);
  useEffect(() => {
    document.body.classList.toggle("conPortada", portada);
    window.scrollTo({ top: 0 });
  }, [portada, pathname]);
  return (
    <>
      {verAviso && (
        <div className="afInAppBanner" role="status">
          <span>
            {esIos()
              ? "Estás en el navegador interno de una aplicación. Si algo no funciona bien, toca Compartir (⬆) y ábrelo en Safari o Chrome."
              : "Estás en el navegador interno de una aplicación. Si algo no funciona bien, toca ⋮ y elige «Abrir en Chrome» o «Abrir en el navegador»."}
          </span>
          <button type="button" aria-label="Cerrar" onClick={() => setVerAviso(false)}>×</button>
        </div>
      )}
      {!portada && (
        <header className="afHeader">
          <div className="headIzq">
            {!RUTAS_FIRMANTE.test(pathname) && <MenuPrincipal />}
            <BotonTema />
            <Logo />
          </div>
          <Derecha firmante={RUTAS_FIRMANTE.test(pathname)} />
        </header>
      )}
      <main className={portada ? "mainPortada" : pathname.startsWith("/app/d/") ? "mainAncho" : ""}>{children}</main>
    </>
  );
}

function Derecha({ firmante }: { firmante: boolean }) {
  const { usuario } = usarSesion();
  if (firmante) return <span className="small headNota">Firma electrónica de documentos</span>;
  if (usuario === undefined) return null;
  if (!usuario) return <Link className="boton primary botonChico" to="/ingresar">🔐 Iniciar sesión</Link>;
  return <span className="small headNota">{PLANES[usuario.plan]?.nombre ?? "Gratis"} · {usuario.nombre}</span>;
}

/** Menú ☰ (vidrio oscuro): accesos de la cuenta, o de la portada si no hay sesión. */
function MenuPrincipal() {
  const { usuario, salir } = usarSesion();
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setAbierto(false), [pathname]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  const opcion = (icono: string, color: string, texto: string, a: string) => (
    <Link to={a} role="menuitem"><span className="menuIcon" style={{ background: color }}>{icono}</span>{texto}</Link>
  );
  const empresarial = usuario && PLANES[usuario.plan]?.usuarios > 1;
  return (
    <div className="menuWrap" ref={caja}>
      <button type="button" className="botonRedondo" aria-haspopup="true" aria-expanded={abierto} title="Menú" onClick={() => setAbierto(!abierto)}>☰</button>
      {abierto && (
        <nav className="menuDropdown" role="menu">
          <div className="menuTitle">Menú</div>
          {usuario ? (
            <>
              {opcion("📄", "#2563eb", "Mis documentos", "/app")}
              {opcion("📋", "#4d148c", "Mi Plan", "/app/cuenta")}
              {opcion("📈", "#0e9f6e", "Mis estadísticas y directorio", "/app/estadisticas")}
              {empresarial && <><div className="menuDivider" />{opcion("🏢", "#7c3aed", "Mi Equipo", "/app/equipo")}</>}
              <div className="menuDivider" />
              {opcion("💎", "#ff6200", "Planes", "/planes")}
              {opcion("🔍", "#0891b2", "Verificar un PDF", "/verificar")}
              {opcion("🧾", "#b45309", "Plantilla de reembolso", "/reembolso")}
              <div className="menuDivider" />
              {usuario.invitado && opcion("👤", "#ff6200", "Crear mi cuenta", "/registro")}
              <div className="accountInfo">👤 <strong>{usuario.nombre}</strong><br />{usuario.invitado ? <span>Sin cuenta · 1 firmante por documento</span> : <span>{usuario.email}</span>}<br />🟢 Plan {PLANES[usuario.plan]?.nombre ?? "Gratis"}{!usuario.invitado && usuario.cuenta !== usuario.nombre ? ` · ${usuario.cuenta}` : ""}</div>
              <button type="button" className="menuLogoutBtn" role="menuitem" onClick={async () => { await salir(); navegar("/"); }}>
                <span className="menuIcon" style={{ background: "#e0294f" }}>🚪</span>{usuario.invitado ? "Salir" : "Cerrar sesión"}
              </button>
            </>
          ) : (
            <>
              {opcion("💎", "#4d148c", "Planes", "/planes")}
              {opcion("🔐", "#0e9f6e", "Iniciar sesión", "/ingresar")}
              {opcion("👤", "#ff6200", "Crear cuenta", "/registro")}
              <div className="menuDivider" />
              {opcion("🔍", "#0891b2", "Verificar un PDF", "/verificar")}
              {opcion("🧾", "#b45309", "Plantilla de reembolso", "/reembolso")}
            </>
          )}
        </nav>
      )}
    </div>
  );
}

/** Aviso de privacidad, adaptado a que la solicitud sí se guarda en el servidor. */
export function AvisoPrivacidad() {
  return (
    <div className="privNotice">
      🔒 <strong>Tu firma y tus datos se guardan de forma privada.</strong> Solo pueden verlos quien te envió el documento y quienes tengan su enlace.
      <details>
        <summary>Ver Política de Privacidad</summary>
        <div className="privBody">
          <p>Este documento se llena y se firma en tu navegador. Al enviarlo, los datos, tu firma y el documento se guardan de forma privada para que quien te lo envió reciba el PDF firmado.</p>
          <p>Cada firmante tiene un enlace secreto. No compartas tu enlace con personas que no deban ver tu información.</p>
        </div>
      </details>
    </div>
  );
}
