import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { solicitar, type HojaReclamacion } from "./api";
import "./reclamaciones.css";

interface Pagina { data: HojaReclamacion[]; current_page: number; last_page: number; total: number }
export function AdminReclamaciones() {
  const [clave, setClave] = useState("");
  const [entrada, setEntrada] = useState("");
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [numeroPagina, setNumeroPagina] = useState(1);
  const [estado, setEstado] = useState("pendiente");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [actualizar, setActualizar] = useState(0);
  useEffect(() => {
    if (!clave) return;
    let activo = true; setError(""); setPagina(null);
    solicitar<Pagina>(`/api/admin/reclamaciones?estado=${estado}&page=${numeroPagina}`, undefined, clave).then(d => { if(activo) setPagina(d); }).catch(e => { if(activo) setError(e.message); });
    return () => { activo = false; };
  }, [clave, estado, numeroPagina, actualizar]);
  async function responder(e: FormEvent<HTMLFormElement>, h: HojaReclamacion) {
    e.preventDefault(); if (ocupado) return;
    const form = new FormData(e.currentTarget);
    if (!confirm(`Registrar la respuesta definitiva de ${h.numero}${h.datos.canal === 'email' ? ' y enviarla por correo' : ' con la constancia de envío postal indicada'}? No se podrá modificar.`)) return;
    setOcupado(true); setError("");
    try { await solicitar(`/api/admin/reclamaciones/${h.id}/respuesta`, Object.fromEntries(form), clave); setActualizar(n => n + 1); }
    catch(e) { setError((e as Error).message); } finally { setOcupado(false); }
  }
  async function pdf(h: HojaReclamacion) {
    try {
      const r = await fetch(`/api/admin/reclamaciones/${h.id}/pdf`, { headers: { "X-AutograFlow": "1", "x-admin-password": clave } });
      if (!r.ok) throw new Error("No se pudo descargar la hoja.");
      const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = `${h.numero}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch(e) { setError((e as Error).message); }
  }
  return <div className="libroAdmin"><Link to="/admin">← Administración</Link><h1>Atención de reclamaciones</h1><p>Reclamos y quejas · Respuesta en 15 días hábiles improrrogables</p>
    <form className="libroAdminAcceso" onSubmit={e => { e.preventDefault(); setClave(entrada); setActualizar(n => n + 1); }}><label>Contraseña de administración<input type="password" autoComplete="current-password" required value={entrada} onChange={e => setEntrada(e.target.value)} /></label><button className="primary">{clave ? "Actualizar acceso" : "Ingresar"}</button>{clave && <button type="button" onClick={() => { setClave(""); setEntrada(""); setPagina(null); }}>Cerrar acceso</button>}</form>
    {error && <div className="afAlerta" role="alert">{error}</div>}
    {clave && <><label className="libroFiltro">Mostrar<select value={estado} onChange={e => { setEstado(e.target.value); setNumeroPagina(1); }}><option value="pendiente">Pendientes de respuesta o envío</option><option value="respondido">Respondidos</option><option value="">Todos</option></select></label><button type="button" onClick={() => setActualizar(n => n + 1)}>Actualizar lista</button>
      {!pagina ? <p role="status">Cargando hojas…</p> : <><p>{pagina.total} hojas · Página {pagina.current_page} de {pagina.last_page}</p>{pagina.data.length === 0 && <p>No hay hojas en este filtro.</p>}
        {pagina.data.map(h => <article className="libroAdminHoja" key={h.id}><div className="libroAdminTitulo"><h2>{h.numero} · {h.datos.tipo}</h2><span className={h.estado === 'respondido' ? "libroExito" : ""}>{h.estado === 'respondido' ? "Respuesta enviada" : h.estado === 'pendiente_envio' ? "Respuesta pendiente de envío" : "Pendiente de atención"}</span></div>
          <p>Registrado: {new Date(h.registradoEn).toLocaleString('es-PE', { timeZone:'America/Lima' })} (Perú)<br /><strong>Responder hasta el {h.venceEl}</strong>{h.estado !== 'respondido' && h.venceEl < new Intl.DateTimeFormat('en-CA', { timeZone:'America/Lima' }).format(new Date()) && <strong className="error"> · PLAZO VENCIDO</strong>}</p>
          <details><summary>Ver datos del consumidor y del bien</summary><p>{h.datos.nombre} · {h.datos.documentoTipo} {h.datos.documento}<br />{h.datos.domicilio}<br />{h.datos.email} · {h.datos.telefono}<br />Respuesta por: {h.datos.canal === 'email' ? 'correo electrónico' : 'carta al domicilio'}</p>{h.datos.menor && <p>Representante: {h.datos.representante} · {h.datos.representanteDocumento}</p>}<p>{h.datos.bien}: {h.datos.descripcion}<br />Monto: {h.datos.monto === null ? 'No precisado' : `${h.datos.moneda} ${h.datos.monto}`}</p></details>
          <h3>Detalle</h3><p className="libroTextoLargo">{h.datos.detalle}</p><h3>Pedido</h3><p className="libroTextoLargo">{h.datos.pedido}</p>
          <button type="button" onClick={() => pdf(h)}>Descargar hoja PDF</button>
          {h.respuesta ? <div className="libroResumen"><h3>Respuesta registrada por {h.responsable}</h3><p>{h.respuesta}</p>{h.constanciaPostal && <p>Constancia postal: {h.constanciaPostal}</p>}</div> : <form className="libroRespuesta" onSubmit={e => responder(e, h)}><label>Responsable de la respuesta<input name="responsable" required minLength={2} maxLength={150} /></label><label>Observaciones y acciones adoptadas<textarea name="respuesta" required minLength={10} maxLength={10000} rows={5} /></label>{h.datos.canal === 'domicilio' && <label>Número de guía y evidencia del envío postal realizado<input name="constanciaPostal" required maxLength={500} /><small>Registra este dato después de enviar la carta. Conserva el comprobante original.</small></label>}<button className="primary" disabled={ocupado}>Registrar respuesta definitiva</button></form>}
          <div className="libroCorreos"><h3>Constancias de correo</h3>{h.correos.map(c => <p key={c.id}>{c.tipo}: {c.estado} · {c.intentos} intentos{c.enviado_en && ` · ${c.enviado_en} UTC`}</p>)}{h.correos.some(c => c.estado === 'error' || c.estado === 'pendiente') && <button type="button" disabled={ocupado} onClick={async () => { setOcupado(true); try { await solicitar(`/api/admin/reclamaciones/${h.id}/reintentar`, {}, clave); setActualizar(n => n + 1); } catch(e) { setError((e as Error).message); } finally { setOcupado(false); } }}>Reintentar correos pendientes</button>}<p className="small">Un correo pendiente o con error aún requiere atención. «Enviado» indica aceptación por el transporte de correo, no lectura del destinatario.</p></div>
        </article>)}
        <div className="row"><button type="button" disabled={numeroPagina <= 1} onClick={() => setNumeroPagina(n => n - 1)}>Anterior</button><button type="button" disabled={numeroPagina >= pagina.last_page} onClick={() => setNumeroPagina(n => n + 1)}>Siguiente</button></div>
      </>}
    </>}
  </div>;
}
