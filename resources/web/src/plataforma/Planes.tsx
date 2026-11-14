import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ORDEN_PLANES, PLANES, formatoPrecio, type EstadoCuenta, type IdPlan, type PagoFila, type Plan, type Suscripcion } from "../../../shared/planes";
import { ErrorApi, plataforma, urls, type Catalogo } from "./api";
import { fechaHora } from "./Panel";
import { usarSesion } from "./sesion";
import { VentanaLegal } from "../componentes/Legal";

const CLASE_PLAN: Record<IdPlan, string> = { gratis: "planFree", basico: "planOccasional", ocasional: "planOccasional", profesional: "", empresarial: "business" };

/** Lleva a pagar a Mercado Pago (o a crear la cuenta primero, con el plan elegido). */
export function usarCompra() {
  const { usuario } = usarSesion();
  const navegar = useNavigate();
  const [comprando, setComprando] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function comprar(plan: IdPlan) {
    if (usuario && plan === "gratis") return navegar("/app");
    // Sin cuenta (o como invitado) se crea la cuenta primero; el invitado conserva sus documentos al crearla.
    if (!usuario || usuario.invitado) return navegar(`/registro?plan=${plan}`);
    setComprando(plan);
    setError("");
    try {
      location.href = (await plataforma.comprar(plan)).url; // página segura de Mercado Pago
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo iniciar el pago.");
      setComprando(null);
    }
  }
  return { comprar, comprando, error };
}

/** Texto del botón principal según el plan elegido y la cuenta. */
export function textoAccion(p: Plan, conSesion: boolean, actual: IdPlan | undefined, moneda: string, prueba = true, suscrito = false) {
  // Gratis sin sesión: este botón lleva a crear la cuenta (el de al lado, «Entrar sin cuenta», entra sin ella).
  if (!conSesion) return p.id === "gratis" ? "Continuar con cuenta" : p.suscripcion && p.pruebaDias ? `Probar ${p.nombre} ${p.pruebaDias} días gratis →` : `Continuar con ${p.nombre} →`;
  if (p.id === "gratis") return "Ir a mis documentos →";
  if (p.suscripcion) {
    if (suscrito) return `Ya estás suscrito a ${p.nombre}`;
    return prueba && p.pruebaDias ? `Probar ${p.pruebaDias} días gratis — luego ${formatoPrecio(p.precio, moneda)} al mes` : `Suscribirme — ${formatoPrecio(p.precio, moneda)} al mes`;
  }
  return `${actual === p.id ? "Renovar" : "Adquirir"} ${p.nombre} — ${formatoPrecio(p.precio, moneda)}`;
}

/** Las cuatro tarjetas de planes del prototipo (se elige una y después se confirma con el botón de abajo). */
export function GrillaPlanes({ c, elegido, alElegir, actual }: { c: Catalogo; elegido: IdPlan | null; alElegir: (p: IdPlan) => void; actual?: IdPlan }) {
  const porId = Object.fromEntries(c.planes.map((p) => [p.id, p])) as Record<IdPlan, Plan>;
  return (
    <div className="plans" role="radiogroup" aria-label="Planes">
      {ORDEN_PLANES.filter((id) => porId[id]).map((id) => {
        const p = porId[id];
        return (
          <div
            key={id} role="radio" aria-checked={elegido === id} tabIndex={0}
            className={`plan ${CLASE_PLAN[id]} ${elegido === id ? "selected" : ""}`}
            onClick={() => alElegir(id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), alElegir(id))}
          >
            {p.insignia && <div className={`planBadge ${id === "empresarial" ? "best" : "popular"}`}>{p.insignia}</div>}
            {actual === id && <div className="planActual">Tu plan actual</div>}
            <div className="planIcon">{p.icono}</div>
            <div className="planName">{p.nombre.toUpperCase()}</div>
            <div className="planPrice">{formatoPrecio(p.precio, c.moneda).replace(/\.00$/, "")}{p.suscripcion && <small className="planPorMes"> /mes</small>}</div>
            <div className="planDays">{p.resumen}</div>
            <div className="planNote">{p.nota}</div>
            <ul className="planFeatures">
              {p.ventajas.map((v) => <li key={v}>{v}</li>)}
              {p.destacada && <li className="afPerk20">{p.destacada}</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Tarjetas + botón de compra (se usa en la portada y en «Mi Plan»). */
export function ElegirPlan({ c, actual, inicial, prueba = true, suscrito = false }: {
  c: Catalogo; actual?: IdPlan; inicial?: IdPlan | null;
  /** Todavía puede usar la prueba gratuita del Básico (sin sesión se asume que sí; el servidor decide al final). */
  prueba?: boolean;
  /** Ya tiene la suscripción Básico activa. */
  suscrito?: boolean;
}) {
  const { usuario } = usarSesion();
  const [elegido, setElegido] = useState<IdPlan | null>(inicial ?? null);
  const { comprar, comprando, error } = usarCompra();
  const navegar = useNavigate();
  const plan = elegido ? c.planes.find((p) => p.id === elegido) : null;
  const conCuenta = !!usuario && !usuario.invitado;
  // Al elegir un plan se desliza hasta el botón de abajo y se resalta, para que se note que apareció.
  const accion = useRef<HTMLDivElement>(null);
  const [legal, setLegal] = useState<"terminos" | null>(null);
  const [toque, setToque] = useState(0);
  useEffect(() => {
    if (!toque || !accion.current) return;
    const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
    accion.current.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "center" });
    const el = accion.current;
    el.classList.remove("resaltar");
    void el.offsetWidth; // reinicia la animación si se vuelve a elegir
    el.classList.add("resaltar");
  }, [toque]);
  function elegir(id: IdPlan) {
    setElegido(id);
    setToque((n) => n + 1);
  }
  return (
    <>
      <GrillaPlanes c={c} elegido={elegido} alElegir={elegir} actual={actual} />
      <p className="small centro">{c.notaIlimitado}</p>
      <div className="planAction" ref={accion}>
        <button type="button" className={plan?.id === "gratis" && usuario ? "success" : "primary"} disabled={!plan || comprando !== null || (!!plan?.suscripcion && suscrito)}
          onClick={() => plan && comprar(plan.id)}>
          {comprando ? "Abriendo Mercado Pago…" : plan ? textoAccion(plan, conCuenta || (!!usuario && plan.id === "gratis"), actual, c.moneda, prueba, suscrito) : "Elige un plan"}
        </button>
        {/* Gratis sin cuenta: se entra aceptando los Términos (en cada entrada). */}
        {plan?.id === "gratis" && !usuario && (
          <button type="button" className="success" onClick={() => navegar("/sin-cuenta")}>🚀 Entrar sin cuenta</button>
        )}
      </div>
      {plan?.suscripcion && !suscrito && (
        <p className="small centro avisoSuscripcion">
          {prueba && plan.pruebaDias
            ? <>Ingresarás tu tarjeta en Mercado Pago. <strong>No se cobra nada durante {plan.pruebaDias} días</strong>; después, {formatoPrecio(plan.precio, c.moneda)} cada mes hasta que canceles.</>
            : <>Se cobra {formatoPrecio(plan.precio, c.moneda)} hoy y luego cada mes con tu tarjeta, hasta que canceles.</>}
          {" "}Puedes cancelar desde Mi Plan; al cancelar, el plan se corta en ese momento.
        </p>
      )}
      {error && <div className="afAlerta centro" role="alert">{error}</div>}
      <div className="demoNote">
        🔒 Pagos seguros con <strong>Mercado Pago</strong>. Profesional y Empresarial son pagos únicos (tarjeta, Yape y otros medios) que se activan al confirmarse y no se renuevan solos. Básico es una suscripción mensual con tarjeta. Los pagos no son reembolsables; si una falla nuestra te impide usarlo, te compensamos extendiendo tu plan (hasta 31 días) o reponiendo tus documentos. <a href="#" onClick={(e) => { e.preventDefault(); setLegal("terminos"); }}>Ver Términos</a>.
        {!c.pagosActivos && " Los pagos en línea aún no están activados en este servidor: escríbenos y lo activamos manualmente."}
      </div>
      {legal && <VentanaLegal tipo={legal} alCerrar={() => setLegal(null)} />}
    </>
  );
}

/** «Mi Plan»: plan vigente, cupo, créditos, logo, cambio de plan e historial de pagos. */
export function MiPlan() {
  const [c, setC] = useState<Catalogo | null>(null);
  const [d, setD] = useState<{ estado: EstadoCuenta; pagos: PagoFila[] } | null>(null);
  const { recargar } = usarSesion();
  useEffect(() => {
    plataforma.planes().then(setC);
    plataforma.cuenta().then(setD);
  }, []);
  if (!c || !d) return <div className="card"><p id="loading">Cargando…</p></div>;
  const e = d.estado, plan = PLANES[e.plan];
  const vencido = PLANES[e.planContratado]?.dias && e.plan !== e.planContratado;
  const cuando = e.periodo === "dia" ? "hoy" : "este mes";
  return (
    <>
      <div className="card">
        <div className="sidePanelHead"><div><h1>📋 Mi Plan</h1><p className="small">Estado de tu plan y de tus documentos.</p></div></div>
        {vencido && <div className="afAlerta">Tu plan {PLANES[e.planContratado].nombre} venció. Renuévalo abajo para recuperar sus beneficios.</div>}
        {e.invitado && <AvisoInvitado />}
        <div className="kpiGrid">
          <div className="kpiCard"><div className="kpiVal">{plan.icono} {plan.nombre}</div><div className="kpiLbl">Tipo de plan</div></div>
          <div className="kpiCard"><div className="kpiVal">{e.vence ? fechaHora(e.vence).slice(0, 10) : plan.dias === null && e.plan !== "gratis" ? "No vence" : "—"}</div><div className="kpiLbl">Vencimiento</div></div>
          <div className="kpiCard"><div className="kpiVal">{e.limite === null ? "Ilimitados" : `${e.usados} / ${e.limite}`}</div><div className="kpiLbl">Documentos usados {cuando}</div>
            {e.limite !== null && <div className="progreso"><span style={{ width: `${Math.min(100, (e.usados / Math.max(1, e.limite)) * 100)}%` }} /></div>}</div>
          {e.limiteMes !== null && <div className="kpiCard"><div className="kpiVal">{`${e.usadosMes} / ${e.limiteMes}`}</div><div className="kpiLbl">Documentos del mes (después de los diarios)</div>
            <div className="progreso"><span style={{ width: `${Math.min(100, (e.usadosMes / Math.max(1, e.limiteMes)) * 100)}%` }} /></div></div>}
          {(e.creditos > 0 || !e.limiteMes) && <div className="kpiCard"><div className="kpiVal">{e.creditos}</div><div className="kpiLbl">Documentos comprados (no vencen)</div></div>}
          <div className="kpiCard"><div className="kpiVal">{e.creditosReferidos}</div><div className="kpiLbl">Bonos de referido con vencimiento · <Link to="/app/referidos">Ver mis bonos</Link></div></div>
          <div className="kpiCard"><div className="kpiVal">{e.disponibles === null ? "Ilimitados" : e.disponibles}</div><div className="kpiLbl">Puedes enviar {cuando}</div></div>
          <div className="kpiCard"><div className="kpiVal">{e.firmantesPorDocumento}</div><div className="kpiLbl">Firmantes por documento{e.selloHuella ? " · con sello y huella" : " · solo firma"}</div></div>
        </div>
        {e.suscripcion && <TarjetaSuscripcion s={e.suscripcion} alCancelar={() => { plataforma.cuenta().then(setD); recargar(); }} />}
      </div>
      <LogoCuenta pago={!plan.marcaAgua} />
      <div className="card">
        <h2>Cambiar o renovar plan</h2>
        <ElegirPlan c={c} actual={e.plan} prueba={e.pruebaDisponible} suscrito={!!e.suscripcion} />
      </div>
      <div className="card">
        <h2>Historial de pagos</h2>
        {d.pagos.length === 0 ? <p>Todavía no tienes pagos.</p> : (
          <div className="tabla-envoltura">
            <table className="dataTable">
              <thead><tr><th>Fecha</th><th>Concepto</th><th className="num">Monto</th><th>Estado</th><th>Comprobante</th></tr></thead>
              <tbody>
                {d.pagos.map((p) => (
                  <tr key={p.id}><td>{fechaHora(p.creadoEn)}</td><td>{p.titulo}</td><td className="num">{formatoPrecio(p.monto, p.moneda)}</td><td><span className={`insignia pago-${p.estado}`}>{ESTADO_PAGO[p.estado]}</span></td><td>{p.estado === "aprobado" && !e.invitado ? <Link to="/app/perfil#pfComprobantes">📄 Boleta / factura</Link> : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
const ESTADO_PAGO: Record<PagoFila["estado"], string> = { pendiente: "Pendiente", aprobado: "Aprobado", rechazado: "Rechazado", cancelado: "Cancelado" };

/** Vuelta desde Mercado Pago: confirma el pago con el servidor y muestra el resultado. */
export function ResultadoPago() {
  const [params] = useSearchParams();
  const { recargar } = usarSesion();
  const id = Number(params.get("pago"));
  const [pago, setPago] = useState<PagoFila | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return setError("Pago no encontrado.");
    let intentos = 0, vivo = true;
    // El aviso de Mercado Pago puede tardar unos segundos: se consulta varias veces.
    const consultar = async () => {
      try {
        const p = await plataforma.verificarPago(id);
        if (!vivo) return;
        setPago(p);
        if (p.estado === "aprobado") recargar();
        if (p.estado === "pendiente" && ++intentos < 8) setTimeout(consultar, 2500);
      } catch (e) {
        if (vivo) setError((e as Error).message);
      }
    };
    consultar();
    return () => { vivo = false; };
  }, [id, recargar]);
  return (
    <div className="card angosta">
      {error ? <div className="afAlerta">{error}</div> : !pago ? <p id="loading">Confirmando tu pago…</p> : (
        <>
          <h1>{pago.estado === "aprobado" ? "✓ ¡Pago aprobado!" : pago.estado === "pendiente" ? "Pago en proceso" : "El pago no se completó"}</h1>
          <div className={pago.estado === "aprobado" ? "okNotice" : "notice"}>
            <strong>{pago.titulo}</strong> · {formatoPrecio(pago.monto, pago.moneda)}<br />
            {pago.estado === "aprobado" ? "Tu cuenta ya tiene lo que compraste." :
              pago.estado === "pendiente" ? "Mercado Pago todavía está procesando el pago (por ejemplo, un pago en efectivo o transferencia). Se activará solo cuando se confirme." :
              "Puedes intentarlo de nuevo con otro medio de pago."}
          </div>
          <div className="readyBar">
            <Link className="boton primary" to="/app">Ir a mis documentos</Link>
            <Link className="boton" to="/app/cuenta">Ver mi plan</Link>
          </div>
        </>
      )}
    </div>
  );
}

/** Suscripción Básico en Mi Plan: prueba o próximo cobro, y cancelar (corta el plan al instante). */
function TarjetaSuscripcion({ s, alCancelar }: { s: Suscripcion; alCancelar: () => void }) {
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState("");
  const nombre = PLANES[s.producto]?.nombre ?? "Básico";
  async function cancelar() {
    if (!confirm(`¿Cancelar tu suscripción ${nombre}? Se corta en este momento: vuelves al plan Gratis y no se te volverá a cobrar.`)) return;
    setCancelando(true);
    setError("");
    try { await plataforma.cancelarSuscripcion(); alCancelar(); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : "No se pudo cancelar. Inténtalo de nuevo."); setCancelando(false); }
  }
  return (
    <section className="kpiCard recarga">
      <strong>Suscripción {nombre} · {formatoPrecio(s.monto, s.moneda)} al mes</strong>
      <p className="small">
        {s.enPrueba && s.pruebaHasta
          ? <>Estás en tu prueba gratuita hasta el {fechaHora(s.pruebaHasta).slice(0, 10)}. Ese día se hará el primer cobro, salvo que canceles antes.</>
          : s.proximoCobro ? <>Próximo cobro: {fechaHora(s.proximoCobro).slice(0, 10)}.</> : <>Se cobra cada mes con tu tarjeta.</>}
        {" "}Si cancelas, el plan se corta en ese momento y no se te vuelve a cobrar.
      </p>
      <button type="button" className="danger" disabled={cancelando} onClick={cancelar}>{cancelando ? "Cancelando…" : "Cancelar suscripción"}</button>
      {error && <div className="afAlerta">{error}</div>}
    </section>
  );
}

/** Vuelta desde Mercado Pago tras ingresar la tarjeta de la suscripción. */
export function ResultadoSuscripcion() {
  const [params] = useSearchParams();
  const { recargar } = usarSesion();
  const id = Number(params.get("s"));
  const [s, setS] = useState<Suscripcion | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return setError("Suscripción no encontrada.");
    let intentos = 0, vivo = true;
    // Mercado Pago puede tardar unos segundos en confirmar la tarjeta (y el primer cobro si no hay prueba).
    const consultar = async () => {
      try {
        const r = await plataforma.verificarSuscripcion(id);
        if (!vivo) return;
        setS(r);
        if (r.estado === "activa") recargar();
        if ((r.estado === "pendiente" || (r.estado === "activa" && !r.conPrueba)) && ++intentos < 8) setTimeout(consultar, 2500);
      } catch (e) {
        if (vivo) setError((e as Error).message);
      }
    };
    consultar();
    return () => { vivo = false; };
  }, [id, recargar]);
  const nombre = s ? PLANES[s.producto]?.nombre ?? "Básico" : "";
  return (
    <div className="card angosta">
      {error ? <div className="afAlerta">{error}</div> : !s ? <p id="loading">Confirmando tu suscripción…</p> : (
        <>
          <h1>{s.estado === "activa" ? (s.conPrueba ? "✓ ¡Tu prueba gratuita empezó!" : "✓ ¡Suscripción activa!") : s.estado === "pendiente" ? "Suscripción en proceso" : "La suscripción no se completó"}</h1>
          <div className={s.estado === "activa" ? "okNotice" : "notice"}>
            <strong>AutograFlow {nombre}</strong> · {formatoPrecio(s.monto, s.moneda)} al mes<br />
            {s.estado === "activa" && s.conPrueba && s.pruebaHasta ? `Ya tienes el plan ${nombre}. El primer cobro será el ${fechaHora(s.pruebaHasta).slice(0, 10)}, salvo que canceles antes desde Mi Plan.` :
              s.estado === "activa" ? `Tu plan ${nombre} se activa en cuanto Mercado Pago confirme el primer cobro (suele tardar unos segundos).` :
              s.estado === "pendiente" ? "Todavía no recibimos la confirmación de Mercado Pago. Si ingresaste tu tarjeta, se activará en unos minutos." :
              s.motivo === "prueba_usada" ? "Esa cuenta de Mercado Pago ya usó la prueba gratuita. No se te cobró nada; puedes suscribirte sin prueba desde Mi Plan." :
              "No se te cobró nada. Puedes intentarlo de nuevo desde Mi Plan."}
          </div>
          <div className="readyBar">
            <Link className="boton primary" to="/app">Ir a mis documentos</Link>
            <Link className="boton" to="/app/cuenta">Ver mi plan</Link>
          </div>
        </>
      )}
    </div>
  );
}

/** Aviso para quien entró sin cuenta: límites y cómo crear la cuenta sin perder lo hecho. */
export function AvisoInvitado() {
  return (
    <div className="guestAltRow">
      Entraste <strong>sin cuenta</strong>: 2 documentos diarios y 1 firmante por documento. Crea tu cuenta gratis para usar hasta {PLANES.gratis.firmantesPorDocumento} firmantes
      o comprar un plan; conservarás los documentos que preparaste. <Link to="/registro">Crear mi cuenta →</Link>
    </div>
  );
}

/** Aviso compacto del cupo en «Mis documentos». */
export function CupoPanel({ estado }: { estado: EstadoCuenta | null }) {
  const e = estado;
  if (!e) return null;
  const pocos = e.disponibles !== null && e.disponibles <= 1;
  const cuando = e.periodo === "dia" ? "hoy" : "este mes";
  return (
    <div className={`cupo ${pocos ? "pocos" : ""}`}>
      <span>
        {PLANES[e.plan].icono} Plan <strong>{PLANES[e.plan].nombre}</strong> ·{" "}
        {e.limite === null ? "documentos ilimitados" : `${e.usados} de ${e.limite} documentos ${cuando}`}
        {e.creditos ? ` · ${e.creditos} comprados` : ""}
        {e.creditosReferidos > 0 ? ` · ${e.creditosReferidos} de referido` : ""}
      </span>
      <Link to={pocos ? "/planes" : "/app/cuenta"}>{pocos ? "Ver planes" : "Mi Plan"}</Link>
    </div>
  );
}

/** Logo propio (planes de pago): aparece a los firmantes y en el certificado de firmas. */
function LogoCuenta({ pago }: { pago: boolean }) {
  const [version, setVersion] = useState(0);
  const [hay, setHay] = useState(true);
  const [error, setError] = useState("");
  async function subir(archivo?: File) {
    if (!archivo) return;
    setError("");
    try { await plataforma.subirLogo(archivo); setHay(true); setVersion((v) => v + 1); }
    catch (e) { setError((e as Error).message); }
  }
  return (
    <div className="card">
      <h2>Logo de tu empresa</h2>
      {!pago ? (
        <p>Con un plan de pago, tu logo aparece a los firmantes y en el certificado de firmas, y se quita la marca de AutograFlow.</p>
      ) : (
        <div className="logoCuenta">
          <div className="logoVista">{hay ? <img src={`${urls.logo()}?v=${version}`} alt="Logo" onError={() => setHay(false)} /> : <span className="afExtraHint">Sin logo</span>}</div>
          <div className="row">
            <label className="boton primary">Subir logo (PNG o JPG)<input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ""; }} /></label>
            {hay && <button type="button" className="danger" onClick={async () => { await plataforma.quitarLogo(); setHay(false); }}>Quitar</button>}
          </div>
        </div>
      )}
      {error && <div className="afAlerta">{error}</div>}
    </div>
  );
}
