import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PLANES, type IdPlan } from "../../../shared/planes";
import { usarSesion } from "./sesion";
import { PortadaMarco } from "./Portada";
import { solicitar } from "../reclamaciones/api";
import "./referidos.css";

interface Reglas { activo: boolean; bonos: Record<IdPlan, number>; espera_dias: number; vigencia_dias: number; tope_mensual: number; version: string }
interface EstadoReferidos {
  codigo: string; enlace: string; saldo: number; registrados: number; conCompra: number; reglas: Reglas;
  historial: { id: number; alias: string; estado: string; documentos: number; restantes: number; creadoEn: string; liberarEn: string | null; venceEn: string | null }[];
}
const ETIQUETAS: Record<string, string> = { registrado: "Esperando primera compra", en_espera: "En espera de acreditación", acreditado: "Bono acreditado", vencido: "Bono vencido", anulado: "Recompensa anulada" };
const fecha = (f: string | null) => f ? new Date(f).toLocaleDateString("es-PE", { timeZone: "America/Lima", year: "numeric", month: "short", day: "numeric" }) : "—";

export function ReferidosPagina({ publico = false }: { publico?: boolean }) {
  const { usuario } = usarSesion();
  const [reglas, setReglas] = useState<Reglas | null>(null);
  const [estado, setEstado] = useState<EstadoReferidos | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [intento, setIntento] = useState(0);
  const enlace = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let activo = true; setError("");
    solicitar<Reglas>("/api/referidos/reglas").then(r => { if(activo) setReglas(r); }).catch(e => { if(activo) setError(e.message); });
    if (!publico && usuario && !usuario.invitado) solicitar<EstadoReferidos>("/api/cuenta/referidos").then(d => { if(activo) { setEstado(d); setReglas(d.reglas); } }).catch(e => { if(activo) setError(e.message); });
    return () => { activo = false; };
  }, [usuario?.cuentaId, usuario?.invitado, publico, intento]);
  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); setAviso("Copiado. Ya puedes compartirlo."); }
    catch { enlace.current?.focus(); enlace.current?.select(); setAviso("Copia el enlace seleccionado con el menú de tu dispositivo."); }
  }
  const contenido = <div className="referidosPagina">
    <div className="referidosHero"><span className="entradaEyebrow">COMPARTE ALGO QUE TE SIRVE</span><h1>Invita. Ayuda. Gana documentos.</h1><p>Comparte AutograFlow con alguien que necesite firmar sus PDF. Cuando haga su primera compra válida, tú recibes documentos extra.</p></div>
    {error && <div role="alert" className="afAlerta">{error} <button type="button" onClick={() => setIntento(n => n + 1)}>Volver a intentar</button></div>}
    {!reglas ? !error && <p role="status">Cargando el programa…</p> : <>
      {!reglas.activo && <p className="notice">El programa está pausado para nuevas invitaciones. Las recompensas ya registradas conservan sus condiciones.</p>}
      {estado && !publico ? <>
        <section className="referidoCompartir" aria-labelledby="tituloCompartir"><div><h2 id="tituloCompartir">Tu próxima invitación empieza aquí</h2><p>El beneficio se acredita a tu cuenta{usuario?.cuenta ? ` «${usuario.cuenta}»` : ""}. Si compartes un equipo, su saldo también es compartido.</p></div><div className="referidoCodigo"><span>Tu código</span><strong>{estado.codigo}</strong><button type="button" onClick={() => copiar(estado.codigo)}>Copiar código</button></div>
          <label htmlFor="enlaceReferido">Tu enlace de invitación</label><div className="referidoEnlace"><input id="enlaceReferido" ref={enlace} readOnly value={estado.enlace} onFocus={e => e.target.select()} /><button type="button" className="primary" onClick={() => copiar(estado.enlace)}>Copiar enlace ↗</button></div>
          <a className="referidoWhatsapp" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Firma tus PDF con AutograFlow. Puedes empezar gratis: ${estado.enlace}\nSi haces tu primera compra válida, yo puedo recibir documentos extra por invitarte. Tu precio no cambia.`)}`}>Compartir por WhatsApp ↗</a><span className="small" role="status">{aviso}</span>
        </section>
        <div className="referidosMetricas"><div><strong>{estado.saldo}</strong><span>Documentos de bono disponibles</span></div><div><strong>{estado.registrados}</strong><span>Cuentas registradas con tu código</span></div><div><strong>{estado.conCompra}</strong><span>Primeras compras válidas</span></div></div>
        {usuario?.plan === 'empresarial' && <p className="notice">Tu plan Empresarial ya incluye documentos ilimitados. Estos bonos solo se usarán si pasas a un plan limitado antes de que venzan.</p>}
      </> : !publico && usuario?.invitado ? <div className="referidoCompartir"><h2>Crea tu cuenta para participar</h2><p>Conserva tus documentos y consigue tu propio código de invitación.</p><Link className="boton primary" to="/registro">Crear cuenta gratis</Link></div> : <div className="referidoCompartir"><h2>Recomienda AutograFlow a tu manera</h2><p>Comparte tu código o tu enlace personal. La otra persona puede registrarse gratis; la recompensa llega si realiza una primera compra válida.</p><Link className="boton primary" to={usuario && !usuario.invitado ? "/app/referidos" : "/registro"}>{usuario && !usuario.invitado ? "Ver mi código de referido" : "Crear cuenta gratis"}</Link></div>}
      <section aria-labelledby="premiosReferidos"><h2 id="premiosReferidos">Lo que puedes ganar</h2><p>Solo por la primera compra de cada cuenta nueva que invitaste.</p><div className="referidosPremios">{(["ocasional", "profesional", "empresarial"] as IdPlan[]).map(id => <div key={id}><span>Si compra {PLANES[id].nombre}</span><strong>+{reglas.bonos[id]}</strong><span>{reglas.bonos[id] === 1 ? "documento para ti" : "documentos para ti"}</span></div>)}</div></section>
      <section className="referidosCondiciones" aria-labelledby="condicionesReferidos"><h2 id="condicionesReferidos">Así funciona, sin sorpresas</h2><ol><li>La persona debe registrarse con tu enlace o ingresar tu código al crear su cuenta. No se añade después ni se aplica al unirse a una organización existente.</li><li>Se premia una sola compra por cuenta referida. Un registro gratuito, una renovación o un segundo pago no generan otro bono. No puedes referirte a ti mismo.</li><li>La recompensa espera {reglas.espera_dias} días desde el pago aprobado. Si se reembolsa o hay un contracargo, se anula el bono pendiente y el saldo promocional que aún no se usó.</li><li>Puedes recibir hasta {reglas.tope_mensual} documentos al mes. Si un bono supera ese límite, se difiere completo al mes siguiente. La fecha de disponibilidad se muestra en tu historial.</li><li>Cada bono vence {reglas.vigencia_dias} días después de acreditarse. Se consume después del cupo de tu plan y antes de los documentos comprados.</li><li>Los bonos mantienen las funciones y límites de tu plan vigente: no añaden sellos, huellas, usuarios ni más firmantes. No se canjean por dinero ni se transfieren a otra cuenta.</li><li>Comparte el enlace solo con personas interesadas. Por privacidad, el historial no muestra sus nombres ni sus correos.</li></ol><p className="small">Condiciones del programa: versión {reglas.version}. Las invitaciones ya registradas conservan las reglas vigentes al registrarse.</p></section>
      {estado && !publico && <section className="referidosHistorial"><div className="referidosCabecera"><h2>Tu historial</h2><button type="button" onClick={() => setIntento(n => n + 1)}>Actualizar</button></div>{estado.historial.length === 0 ? <div className="referidosVacio"><strong>Tu primera invitación puede empezar hoy.</strong><p>Comparte tu enlace. Aquí verás los registros, las compras y los bonos.</p></div> : <><p className="small">Últimas {estado.historial.length} invitaciones. Las condiciones de cada bono se conservan desde el registro.</p><div className="tabla-envoltura"><table className="dataTable"><thead><tr><th>Invitación</th><th>Estado</th><th>Bono</th><th>Disponible desde</th><th>Vence</th></tr></thead><tbody>{estado.historial.map(h => <tr key={h.id}><td>{h.alias}<small>{fecha(h.creadoEn)}</small></td><td>{ETIQUETAS[h.estado] ?? h.estado}</td><td>{h.estado === 'acreditado' ? `${h.restantes} de ${h.documentos}` : h.documentos || '—'}</td><td>{fecha(h.liberarEn)}</td><td>{fecha(h.venceEn)}</td></tr>)}</tbody></table></div></>}</section>}
    </>}
  </div>;
  return publico ? <PortadaMarco>{contenido}</PortadaMarco> : contenido;
}
