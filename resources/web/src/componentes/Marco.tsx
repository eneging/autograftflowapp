import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PLANES } from "../../../shared/planes";
import { plataforma, type FilaDocumento } from "../plataforma/api";
import { usarSesion } from "../plataforma/sesion";

/*
 * Diseño AutograFlow (inspirado en Notion): lienzo blanco, barra lateral gris clara con el espacio de trabajo, la
 * navegación y los documentos recientes, tipografía del sistema, iconos de línea y un solo color de acento.
 */

/** Marca: una hoja con sombra sólida (bloque blanco con borde negro) y una «A» con serifa sobre un trazo de firma. */
export function LogoMarca({ tam = 26 }: { tam?: number }) {
  return (
    <svg className="logoF" viewBox="0 0 64 64" width={tam} height={tam} aria-hidden>
      <rect x="10" y="10" width="48" height="48" rx="10" className="logoTinta" />
      <rect x="5" y="5" width="48" height="48" rx="10" className="logoPapel" strokeWidth="3.6" />
      <text x="29" y="38" textAnchor="middle" className="logoLetra" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="29">A</text>
      <path d="M14.5 45.5c5-4.2 8.6 2.4 13.2-.8 4.2-3 7.6-4.6 12.3-.6" fill="none" className="logoTrazo" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ grande = false, a = "/" }: { grande?: boolean; a?: string }) {
  return (
    <Link to={a} className={`logo ${grande ? "authLogo" : ""}`} aria-label="AutograFlow">
      <LogoMarca tam={grande ? 40 : 26} />
      <span className="logoWord">AutograFlow</span>
    </Link>
  );
}

// ---------------------------------------------------------------- iconos de línea (como los de Notion)

const trazo = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICONOS: Record<string, ReactNode> = {
  inicio: <><path d="M3.5 9.5 10 4l6.5 5.5" {...trazo} /><path d="M5.5 8.5V16h9V8.5" {...trazo} /></>,
  doc: <><path d="M6 3h5.5L15 6.5V17H6z" {...trazo} /><path d="M11 3v4h4" {...trazo} /></>,
  plan: <><rect x="3.5" y="5" width="13" height="10" rx="2" {...trazo} /><path d="M3.5 8.5h13" {...trazo} /></>,
  graficos: <><path d="M4 16V9M8.5 16V5M13 16v-5M17 16H3" {...trazo} /></>,
  equipo: <><circle cx="7.5" cy="7.5" r="2.5" {...trazo} /><circle cx="13.5" cy="8.5" r="2" {...trazo} /><path d="M3 16c.6-2.8 2.4-4 4.5-4s3.9 1.2 4.5 4M12.5 12.3c2 .1 3.4 1.3 4 3.7" {...trazo} /></>,
  planes: <><path d="M10 3 12 7.5l5 .6-3.7 3.4 1 4.9L10 14l-4.3 2.4 1-4.9L3 8.1l5-.6z" {...trazo} /></>,
  verificar: <><circle cx="9" cy="9" r="5" {...trazo} /><path d="m13 13 4 4M7 9l1.5 1.5L11.5 7.5" {...trazo} /></>,
  recibo: <><path d="M5 3h10v14l-2-1.3-1.7 1.3-1.6-1.3-1.7 1.3L6.3 15.7 5 17z" {...trazo} /><path d="M7.5 7h5M7.5 10h5" {...trazo} /></>,
  mas: <path d="M10 4v12M4 10h12" {...trazo} />,
  salir: <><path d="M8 4H4.5v12H8" {...trazo} /><path d="M12 6.5 15.5 10 12 13.5M15.5 10H8" {...trazo} /></>,
  luna: <path d="M15.5 12.2A6 6 0 0 1 7.8 4.5 6 6 0 1 0 15.5 12.2z" {...trazo} />,
  sol: <><circle cx="10" cy="10" r="3.2" {...trazo} /><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" {...trazo} /></>,
  menu: <path d="M3.5 6h13M3.5 10h13M3.5 14h13" {...trazo} />,
  plegar: <path d="M10.5 5.5 6 10l4.5 4.5M15 5.5 10.5 10l4.5 4.5" {...trazo} />,
  usuario: <><circle cx="10" cy="7" r="3" {...trazo} /><path d="M4 17c.8-3.2 3.2-5 6-5s5.2 1.8 6 5" {...trazo} /></>,
};
export const Icono = ({ n, tam = 18 }: { n: keyof typeof ICONOS; tam?: number }) => (
  <svg className="icono" viewBox="0 0 20 20" width={tam} height={tam} aria-hidden>{ICONOS[n]}</svg>
);

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

export function BotonTema({ conTexto = false }: { conTexto?: boolean }) {
  const { tema, cambiar } = usarTema();
  const texto = tema === "dark" ? "Tema claro" : "Tema oscuro";
  return (
    <button type="button" className={conTexto ? "navItem" : "botonIcono"} onClick={cambiar} title={texto} aria-label={texto}>
      <Icono n={tema === "dark" ? "sol" : "luna"} />{conTexto && <span>{texto}</span>}
    </button>
  );
}

// ---------------------------------------------------------------- marco

const enAplicacion = () =>
  /WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Telegram|; wv\)/i.test(navigator.userAgent || "");
const esIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
/** Portada, planes y acceso: página de presentación con su propia barra (ver PortadaMarco). */
const RUTAS_PORTADA = /^\/(planes|ingresar|registro|sin-cuenta|olvide|restablecer)?$/;
/** Páginas que abren los firmantes con su enlace: sin menú de cuenta. */
const RUTAS_FIRMANTE = /^\/(f|s|a)\/|^\/reembolso$/;
const CLAVE_LATERAL = "autograflow_lateral_plegada";

/** Marco de la aplicación y aviso cuando el enlace se abre dentro de WhatsApp u otra aplicación. */
export function Marco({ children }: { children: ReactNode }) {
  const [verAviso, setVerAviso] = useState(enAplicacion);
  const { usuario } = usarSesion();
  const { pathname } = useLocation();
  const portada = RUTAS_PORTADA.test(pathname);
  const firmante = RUTAS_FIRMANTE.test(pathname);
  const ancho = pathname.startsWith("/app/d/");
  useEffect(() => {
    document.body.classList.toggle("conPortada", portada);
    window.scrollTo({ top: 0 });
  }, [portada, pathname]);

  const aviso = verAviso && (
    <div className="afInAppBanner" role="status">
      <span>
        {esIos()
          ? "Estás en el navegador interno de una aplicación. Si algo no funciona bien, toca Compartir (⬆) y ábrelo en Safari o Chrome."
          : "Estás en el navegador interno de una aplicación. Si algo no funciona bien, toca ⋮ y elige «Abrir en Chrome» o «Abrir en el navegador»."}
      </span>
      <button type="button" aria-label="Cerrar" onClick={() => setVerAviso(false)}>×</button>
    </div>
  );

  if (portada) return <>{aviso}<main className="mainPortada">{children}</main></>;
  // Con sesión: barra lateral como en Notion. Firmantes y visitantes: barra superior sencilla.
  if (usuario && !firmante) return <>{aviso}<ConLateral ancho={ancho}>{children}</ConLateral></>;
  return (
    <>
      {aviso}
      <header className="afHeader">
        <Logo a={firmante ? "#" : "/"} />
        <div className="headDer">
          {firmante ? <span className="headNota">Firma electrónica de documentos</span>
            : usuario === null && <Link className="boton botonChico" to="/ingresar">Iniciar sesión</Link>}
          <BotonTema />
        </div>
      </header>
      <main className={ancho ? "mainAncho" : ""}>{children}</main>
    </>
  );
}

/** Nombre de la página para la barra superior (como la ruta de una página en Notion). */
function tituloRuta(pathname: string) {
  if (pathname === "/app") return "Mis documentos";
  if (pathname.startsWith("/app/d/")) return "Documento";
  if (pathname === "/app/cuenta") return "Mi Plan";
  if (pathname === "/app/estadisticas") return "Estadísticas y directorio";
  if (pathname === "/app/equipo") return "Mi Equipo";
  if (pathname === "/app/pago") return "Pago";
  if (pathname === "/verificar") return "Verificar un PDF";
  if (pathname === "/admin") return "Administración";
  return "";
}

function ConLateral({ ancho, children }: { ancho: boolean; children: ReactNode }) {
  const { usuario } = usarSesion();
  const { pathname } = useLocation();
  const [plegada, setPlegada] = useState(() => { try { return localStorage.getItem(CLAVE_LATERAL) === "1"; } catch { return false; } });
  const [abierta, setAbierta] = useState(false); // celular: la barra lateral se abre encima
  useEffect(() => setAbierta(false), [pathname]);
  useEffect(() => { try { localStorage.setItem(CLAVE_LATERAL, plegada ? "1" : "0"); } catch { /* sin almacenamiento */ } }, [plegada]);
  const titulo = tituloRuta(pathname);
  return (
    <div className={`afShell ${plegada ? "plegada" : ""} ${abierta ? "abierta" : ""}`}>
      <Lateral alPlegar={() => setPlegada(true)} />
      <div className="afVelo" onClick={() => setAbierta(false)} aria-hidden />
      <div className="afContenido">
        <div className="afTopbar">
          <button type="button" className="botonIcono soloMovil" aria-label="Abrir menú" onClick={() => setAbierta(true)}><Icono n="menu" /></button>
          {plegada && <button type="button" className="botonIcono soloEscritorio" title="Mostrar barra lateral" aria-label="Mostrar barra lateral" onClick={() => setPlegada(false)}><Icono n="menu" /></button>}
          <nav className="migas" aria-label="Ruta">
            <Link to="/app">{usuario?.invitado ? "Invitado" : usuario?.cuenta || "Mi espacio"}</Link>
            {titulo && <><span className="migasSep">/</span><span className="migasActual">{titulo}</span></>}
          </nav>
          <div className="afTopbarDer">
            {usuario && <Link className="chipPlan" to="/app/cuenta">{PLANES[usuario.plan]?.nombre ?? "Gratis"}</Link>}
          </div>
        </div>
        <main className={ancho ? "mainAncho" : ""}>{children}</main>
      </div>
    </div>
  );
}

/** Barra lateral: espacio de trabajo, navegación, documentos recientes y, abajo, nuevo documento, tema y salir. */
function Lateral({ alPlegar }: { alPlegar: () => void }) {
  const { usuario, salir } = usarSesion();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const [recientes, setRecientes] = useState<FilaDocumento[]>([]);
  const [plantillas, setPlantillas] = useState<FilaDocumento[]>([]);
  const [reembolsoOculto, setReembolsoOculto] = usarReembolsoOculto();
  const [menuCuenta, setMenuCuenta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  // Los documentos recientes se actualizan al cambiar de página (p. ej. al crear o enviar uno).
  useEffect(() => {
    plataforma.documentos().then((d) => {
      setRecientes(d.filter((x) => !x.esPlantilla).slice(0, 8));
      setPlantillas(d.filter((x) => x.esPlantilla));
    }).catch(() => {});
  }, [pathname]);
  useEffect(() => {
    if (!menuCuenta) return;
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setMenuCuenta(false); };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [menuCuenta]);
  if (!usuario) return null;
  const empresarial = PLANES[usuario.plan]?.usuarios > 1;
  const item = (icono: keyof typeof ICONOS, texto: string, a: string) => (
    <Link to={a} className={`navItem ${pathname === a ? "activo" : ""}`}><Icono n={icono} /><span>{texto}</span></Link>
  );
  const inicial = (usuario.invitado ? "I" : usuario.nombre.trim()[0] || "A").toUpperCase();
  return (
    <aside className="afLateral" aria-label="Navegación">
      <div className="espacio" ref={caja}>
        <button type="button" className="espacioBoton" aria-haspopup="true" aria-expanded={menuCuenta} onClick={() => setMenuCuenta(!menuCuenta)}>
          <span className="avatar">{inicial}</span>
          <span className="espacioNombre">{usuario.invitado ? "Invitado (sin cuenta)" : `Espacio de ${usuario.nombre}`}</span>
          <span className="espacioFlecha" aria-hidden>⌄</span>
        </button>
        <button type="button" className="botonIcono soloEscritorio" title="Ocultar barra lateral" aria-label="Ocultar barra lateral" onClick={alPlegar}><Icono n="plegar" /></button>
        {menuCuenta && (
          <div className="menuDropdown" role="menu">
            <div className="menuCabecera">
              <span className="avatar grande">{inicial}</span>
              <div><strong>{usuario.invitado ? "Invitado (sin cuenta)" : usuario.nombre}</strong><small>{usuario.invitado ? "1 firmante por documento" : usuario.email}</small></div>
            </div>
            <div className="menuDivider" />
            <Link to="/app/cuenta" role="menuitem"><Icono n="plan" />Mi Plan · {PLANES[usuario.plan]?.nombre ?? "Gratis"}</Link>
            {usuario.invitado && <Link to="/registro" role="menuitem"><Icono n="usuario" />Crear mi cuenta</Link>}
            {reembolsoOculto && <button type="button" role="menuitem" onClick={() => { setReembolsoOculto(false); setMenuCuenta(false); }}><Icono n="recibo" />Mostrar «Plantilla de reembolso»</button>}
            <div className="menuDivider" />
            <button type="button" role="menuitem" className="menuLogoutBtn" onClick={async () => { await salir(); navegar("/"); }}>
              <Icono n="salir" />{usuario.invitado ? "Salir" : "Cerrar sesión"}
            </button>
          </div>
        )}
      </div>

      <nav className="navGrupo">
        {item("inicio", "Mis documentos", "/app")}
        {item("plan", "Mi Plan", "/app/cuenta")}
        {item("graficos", "Estadísticas y directorio", "/app/estadisticas")}
        {empresarial && item("equipo", "Mi Equipo", "/app/equipo")}
      </nav>

      {recientes.length > 0 && (
        <nav className="navGrupo">
          <div className="navTitulo">Recientes</div>
          {recientes.map((d) => (
            <Link key={d.id} to={`/app/d/${d.id}`} className={`navItem doc ${pathname === `/app/d/${d.id}` ? "activo" : ""}`} title={d.nombre}>
              <Icono n="doc" /><span>{d.nombre}</span><i className={`puntoEstado e-${d.estado}`} aria-hidden />
            </Link>
          ))}
        </nav>
      )}

      {plantillas.length > 0 && (
        <nav className="navGrupo">
          <div className="navTitulo">Plantillas</div>
          {plantillas.map((d) => (
            <Link key={d.id} to={`/app/d/${d.id}`} className={`navItem doc ${pathname === `/app/d/${d.id}` ? "activo" : ""}`} title={`${d.nombre} — abrir para editarla, usarla o eliminarla`}>
              <span className="navEmoji" aria-hidden>📋</span><span>{d.nombre}</span>
            </Link>
          ))}
        </nav>
      )}

      <nav className="navGrupo">
        <div className="navTitulo">Herramientas</div>
        {item("planes", "Planes", "/planes")}
        {item("verificar", "Verificar un PDF", "/verificar")}
        {!reembolsoOculto && item("recibo", "Plantilla de reembolso", "/reembolso")}
      </nav>

      <div className="lateralPie">
        <Link to="/app" className="navItem nuevoDoc"><Icono n="mas" /><span>Nuevo documento</span></Link>
        <BotonTema conTexto />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- plantilla incluida «Solicitud de reembolso»

const CLAVE_REEMBOLSO_OCULTO = "autograflow_ocultar_reembolso";
const reembolsoOculto = () => { try { return localStorage.getItem(CLAVE_REEMBOLSO_OCULTO) === "1"; } catch { return false; } };
/** Si el usuario quitó la plantilla incluida de su barra lateral (se guarda en este navegador). */
function usarReembolsoOculto() {
  const [oculto, setOculto] = useState(reembolsoOculto);
  useEffect(() => {
    const actualizar = () => setOculto(reembolsoOculto());
    window.addEventListener("af-reembolso", actualizar);
    return () => window.removeEventListener("af-reembolso", actualizar);
  }, []);
  const cambiar = (v: boolean) => {
    try { localStorage.setItem(CLAVE_REEMBOLSO_OCULTO, v ? "1" : "0"); } catch { /* sin almacenamiento */ }
    window.dispatchEvent(new Event("af-reembolso"));
  };
  return [oculto, cambiar] as const;
}

/**
 * Barra de la plantilla incluida (solo con sesión): no se puede modificar directamente porque viene con AutograFlow,
 * así que «Editar» crea una copia en el editor (editable, guardable como plantilla propia y eliminable) y
 * «Quitar» la saca de la barra lateral.
 */
export function AdministrarPlantillaIncluida() {
  const { usuario } = usarSesion();
  const navegar = useNavigate();
  const [oculto, setOculto] = usarReembolsoOculto();
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  if (!usuario) return null;
  async function editar() {
    setCreando(true);
    setError("");
    try {
      const r = await plataforma.desdePlantillaReembolso();
      navegar(`/app/d/${r.id}`, { state: { detectados: r.camposDetectados } });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo abrir la plantilla.");
      setCreando(false);
    }
  }
  return (
    <div className="card plantillaIncluida">
      <div className="plantillaIncluidaFila">
        <div>
          <strong>📋 Plantilla incluida: Solicitud de reembolso</strong>
          <p className="small">Viene con AutograFlow y no se puede modificar directamente. Para cambiarla, ábrela en el editor: se crea una copia tuya que puedes editar, guardar como plantilla y eliminar cuando quieras.</p>
        </div>
        <div className="row">
          <button type="button" className="primary" disabled={creando} onClick={editar}>{creando ? "Abriendo…" : "✏️ Editar (copia en el editor)"}</button>
          {oculto
            ? <button type="button" onClick={() => setOculto(false)}>Mostrar en la barra lateral</button>
            : <button type="button" className="danger" onClick={() => {
                if (!confirm("¿Quitar «Plantilla de reembolso» de tu barra lateral? Podrás volver a mostrarla desde el menú de tu espacio.")) return;
                setOculto(true);
                navegar("/app");
              }}>🗑️ Quitar de mi barra lateral</button>}
        </div>
      </div>
      {error && <div className="afAlerta">{error}</div>}
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
