import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ORDEN_PLANES, PLANES, formatoPrecio, type EstadoCuenta, type IdPlan, type PagoFila, type Plan } from "../../../shared/planes";
import { ErrorApi, plataforma, urls, type Catalogo } from "./api";
import { fechaHora } from "./Panel";
import { usarSesion } from "./sesion";

const CLASE_PLAN: Record<IdPlan, string> = { gratis: "planFree", ocasional: "planOccasional", profesional: "", empresarial: "business" };

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
export function textoAccion(p: Plan, conSesion: boolean, actual: IdPlan | undefined, moneda: string) {
  if (!conSesion) return `Continuar con ${p.nombre} →`;
  if (p.id === "gratis") return "Ir a mis documentos →";
  if (p.id === "ocasional") return `Comprar ${p.creditos} documentos — ${formatoPrecio(p.precio, moneda)}`;
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
            <div className="planPrice">{formatoPrecio(p.precio, c.moneda).replace(/\.00$/, "")}</div>
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
export function ElegirPlan({ c, actual, inicial }: { c: Catalogo; actual?: IdPlan; inicial?: IdPlan | null }) {
  const { usuario } = usarSesion();
  const [elegido, setElegido] = useState<IdPlan | null>(inicial ?? null);
  const { comprar, comprando, error } = usarCompra();
  const navegar = useNavigate();
  const plan = elegido ? c.planes.find((p) => p.id === elegido) : null;
  const conCuenta = !!usuario && !usuario.invitado;
  return (
    <>
      <GrillaPlanes c={c} elegido={elegido} alElegir={setElegido} actual={actual} />
      <p className="small centro">{c.notaIlimitado}</p>
      <div className="planAction">
        <button type="button" className={plan?.id === "gratis" && usuario ? "success" : "primary"} disabled={!plan || comprando !== null}
          onClick={() => plan && comprar(plan.id)}>
          {comprando ? "Abriendo Mercado Pago…" : plan ? textoAccion(plan, conCuenta || (!!usuario && plan.id === "gratis"), actual, c.moneda) : "Elige un plan"}
        </button>
        {/* Gratis sin cuenta: se entra aceptando los Términos (en cada entrada). */}
        {plan?.id === "gratis" && !usuario && (
          <button type="button" className="success" onClick={() => navegar("/sin-cuenta")}>🚀 Entrar sin cuenta</button>
        )}
      </div>
      {error && <div className="afAlerta centro" role="alert">{error}</div>}
      <div className="demoNote">
        🔒 Pagos seguros con <strong>Mercado Pago</strong> (tarjeta, Yape y otros medios). El plan se activa en cuanto se confirma el pago y no se renueva solo.
        {!c.pagosActivos && " Los pagos en línea aún no están activados en este servidor: escríbenos y lo activamos manualmente."}
      </div>
    </>
  );
}

/** «Mi Plan»: plan vigente, cupo, créditos, logo, cambio de plan e historial de pagos. */
export function MiPlan() {
  const [c, setC] = useState<Catalogo | null>(null);
  const [d, setD] = useState<{ estado: EstadoCuenta; pagos: PagoFila[] } | null>(null);
  const { comprar, comprando, error } = usarCompra();
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
          <div className="kpiCard"><div className="kpiVal">{e.creditos}</div><div className="kpiLbl">Documentos comprados (no vencen)</div></div>
          <div className="kpiCard"><div className="kpiVal">{e.disponibles === null ? "Ilimitados" : e.disponibles}</div><div className="kpiLbl">Puedes enviar {cuando}</div></div>
          <div className="kpiCard"><div className="kpiVal">{e.firmantesPorDocumento}</div><div className="kpiLbl">Firmantes por documento{e.selloHuella ? " · con sello y huella" : " · solo firma"}</div></div>
        </div>
        {e.plan === "profesional" && (
          <section className="kpiCard recarga">
            <strong>Recargar documentos</strong>
            <p className="small">Añade {PLANES.ocasional.creditos} documentos por {formatoPrecio(PLANES.ocasional.precio, e.moneda)} a tu cuota Profesional. No hay renovación automática y los documentos no vencen.</p>
            <button type="button" className="primary" disabled={comprando !== null} onClick={() => comprar("ocasional")}>
              {comprando ? "Abriendo Mercado Pago…" : `Añadir ${PLANES.ocasional.creditos} documentos — ${formatoPrecio(PLANES.ocasional.precio, e.moneda)}`}
            </button>
            {error && <div className="afAlerta">{error}</div>}
          </section>
        )}
      </div>
      <LogoCuenta pago={!plan.marcaAgua} />
      <div className="card">
        <h2>Cambiar o renovar plan</h2>
        <ElegirPlan c={c} actual={e.plan} />
      </div>
      <div className="card">
        <h2>Historial de pagos</h2>
        {d.pagos.length === 0 ? <p>Todavía no tienes pagos.</p> : (
          <div className="tabla-envoltura">
            <table className="dataTable">
              <thead><tr><th>Fecha</th><th>Concepto</th><th className="num">Monto</th><th>Estado</th></tr></thead>
              <tbody>
                {d.pagos.map((p) => (
                  <tr key={p.id}><td>{fechaHora(p.creadoEn)}</td><td>{p.titulo}</td><td className="num">{formatoPrecio(p.monto, p.moneda)}</td><td><span className={`insignia pago-${p.estado}`}>{ESTADO_PAGO[p.estado]}</span></td></tr>
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
