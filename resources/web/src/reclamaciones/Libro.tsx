import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PortadaMarco } from "../plataforma/Portada";
import { VentanaLegal } from "../componentes/Legal";
import { ErrorReclamacion, solicitar, type DatosReclamacion, type HojaReclamacion, type Proveedor } from "./api";
import "./reclamaciones.css";

const VACIO: DatosReclamacion = { nombre: "", documentoTipo: "DNI", documento: "", domicilio: "", telefono: "", email: "", menor: false, representante: "", representanteDocumento: "", bien: "servicio", descripcion: "", monto: "", moneda: "PEN", tipo: "reclamo", detalle: "", pedido: "", canal: "email" };
const fecha = (f: string) => new Date(f.length === 10 ? `${f}T12:00:00-05:00` : f).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "long", ...(f.length === 10 ? {} : { timeStyle: "short" as const }) });

export function LibroReclamaciones() {
  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [datos, setDatos] = useState(VACIO);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [hoja, setHoja] = useState<HojaReclamacion | null>(null);
  const [legal, setLegal] = useState(false);
  const [intento, setIntento] = useState(0);
  const solicitud = useRef("");
  const resultado = useRef<HTMLDivElement>(null);
  useEffect(() => { let activo = true; solicitar<Proveedor>("/api/reclamaciones/configuracion").then(p => { if(activo) { setProveedor(p); setAviso(""); } }).catch(e => { if(activo) setAviso(e.message); }); return () => { activo = false; }; }, [intento]);
  useEffect(() => { if (hoja) { resultado.current?.focus(); resultado.current?.scrollIntoView({ block: "start" }); } }, [hoja]);
  function campo(k: keyof DatosReclamacion) { return { id: `lr-${k}`, name: k, value: String(datos[k] ?? ""), "aria-invalid": !!errores[k], "aria-describedby": errores[k] ? `err-${k}` : undefined, onChange: (e: { target: { value: string } }) => setDatos(d => ({ ...d, [k]: e.target.value })) }; }
  const error = (k: string) => errores[k] && <span id={`err-${k}`} className="error">{errores[k]}</span>;
  async function enviar(e: FormEvent) {
    e.preventDefault(); if (enviando) return;
    if (!solicitud.current) solicitud.current = crypto.randomUUID();
    setEnviando(true); setErrores({}); setAviso("");
    try { setHoja(await solicitar<HojaReclamacion>("/api/reclamaciones", { ...datos, monto: datos.monto === "" ? null : datos.monto, solicitudId: solicitud.current })); }
    catch(e) { setAviso(e instanceof Error ? e.message : "No se pudo registrar."); if(e instanceof ErrorReclamacion) { setErrores(e.campos); const k = Object.keys(e.campos)[0]; if(k) requestAnimationFrame(() => document.getElementById(`lr-${k}`)?.focus()); } }
    finally { setEnviando(false); }
  }
  return <PortadaMarco><div className="libroPagina">
    <Link to="/" className="libroVolver">← Volver al inicio</Link>
    <div className="libroEncabezado"><span className="entradaEyebrow">ATENCIÓN AL CONSUMIDOR · PERÚ</span><h1>Libro de Reclamaciones</h1><p>Tu experiencia nos importa. Registra aquí un reclamo o una queja sobre AutograFlow, sin crear una cuenta y sin costo.</p></div>
    {proveedor && <div className="libroProveedor"><strong>{proveedor.razonSocial || "Proveedor pendiente de configurar"}</strong><span>RUC {proveedor.ruc || "pendiente"}</span><span>{proveedor.domicilio || "Domicilio pendiente"}</span>{proveedor.correo && <a href={`mailto:${proveedor.correo}`}>{proveedor.correo}</a>}</div>}
    {!proveedor && <div role="status" className="libroNota">Cargando identificación del proveedor… <button type="button" onClick={() => setIntento(n => n + 1)}>Volver a intentar</button></div>}
    {proveedor && !proveedor.configurado && <div role="status" className="afAlerta">El proveedor está completando sus datos legales y su correo de atención. El registro aún no está habilitado.</div>}
    {hoja ? <div ref={resultado} tabIndex={-1} className="libroConstancia">
      <span className="libroExito">✓ Registro realizado</span><h2>Hoja de Reclamación {hoja.numero}</h2>
      <p>Presentada el {fecha(hoja.registradoEn)} (hora de Perú).</p>
      <p><strong>Fecha límite de respuesta: {fecha(hoja.venceEl)}.</strong><br />Te responderemos {hoja.datos.canal === "email" ? `a ${hoja.datos.email}` : "por carta al domicilio que indicaste"}.</p>
      <div className="libroResumen"><h3>Tu {hoja.datos.tipo}</h3><p>{hoja.datos.detalle}</p><h3>Lo que solicitas</h3><p>{hoja.datos.pedido}</p></div>
      <a className="boton primary" href={`/api/reclamaciones/${hoja.token}/constancia`} referrerPolicy="no-referrer">Descargar constancia PDF</a>
      <p className="small">Puedes abrir el PDF para imprimirlo o guardarlo. Conserva tu copia y su número.</p>
      {hoja.datos.email && <p className="libroNota">{hoja.correos.some(c => c.tipo === "copia" && c.estado === "enviado") ? "La copia fue enviada al correo indicado." : "La copia por correo está pendiente de envío. Tu hoja ya está registrada; descarga el PDF ahora."}</p>}
      <Link to="/">Volver al inicio →</Link>
    </div> : <form className="libroFormulario" onSubmit={enviar}>
      <p className="libroNota">Responderemos en un máximo de <strong>15 días hábiles improrrogables</strong>. Los campos con * son obligatorios.</p>
      <fieldset disabled={enviando}><legend><span>01</span> Tus datos</legend><div className="libroGrid">
        <label className="libroAncho" htmlFor="lr-nombre">Nombres y apellidos *<input {...campo("nombre")} autoComplete="name" required maxLength={150} />{error("nombre")}</label>
        <label htmlFor="lr-documentoTipo">Tipo de documento *<select {...campo("documentoTipo")}><option>DNI</option><option>CE</option><option>Pasaporte</option><option>Otro</option></select></label>
        <label htmlFor="lr-documento">Número de documento *<input {...campo("documento")} required maxLength={datos.documentoTipo === "DNI" ? 8 : 30} minLength={datos.documentoTipo === "DNI" ? 8 : 3} inputMode={datos.documentoTipo === "DNI" ? "numeric" : "text"} pattern={datos.documentoTipo === "DNI" ? "[0-9]{8}" : undefined} />{error("documento")}</label>
        <label className="libroAncho" htmlFor="lr-domicilio">Domicilio completo *<input {...campo("domicilio")} autoComplete="street-address" required minLength={5} maxLength={500} placeholder="Dirección, distrito, provincia y departamento" />{error("domicilio")}</label>
        <label htmlFor="lr-telefono">Teléfono (opcional)<input {...campo("telefono")} type="tel" autoComplete="tel" maxLength={30} />{error("telefono")}</label>
        <label htmlFor="lr-email">Correo electrónico {datos.canal === "email" ? "*" : "(opcional)"}<input {...campo("email")} type="email" autoComplete="email" required={datos.canal === "email"} maxLength={254} />{error("email")}</label>
        <label className="libroAncho libroCheck"><input type="checkbox" checked={datos.menor} onChange={e => setDatos(d => ({ ...d, menor: e.target.checked }))} /> Soy menor de edad</label>
        {datos.menor && <p className="libroAncho small">Si eres menor, indica el domicilio, teléfono y correo de tu padre, madre o representante para poder atender tu caso.</p>}
        {datos.menor && <><label htmlFor="lr-representante">Padre, madre o representante *<input {...campo("representante")} required minLength={2} maxLength={150} />{error("representante")}</label><label htmlFor="lr-representanteDocumento">Documento del representante *<input {...campo("representanteDocumento")} required maxLength={30} />{error("representanteDocumento")}</label></>}
      </div></fieldset>
      <fieldset disabled={enviando}><legend><span>02</span> Producto o servicio</legend><div className="libroGrid">
        <label htmlFor="lr-bien">Tipo *<select {...campo("bien")}><option value="servicio">Servicio</option><option value="producto">Producto</option></select></label>
        <label htmlFor="lr-moneda">Moneda<select {...campo("moneda")}><option value="PEN">Soles (PEN)</option><option value="USD">Dólares (USD)</option></select></label>
        <label className="libroAncho" htmlFor="lr-descripcion">Describe el producto o servicio *<textarea {...campo("descripcion")} required minLength={3} maxLength={2000} rows={3} placeholder="Por ejemplo: plan contratado o envío de un documento." />{error("descripcion")}</label>
        <label htmlFor="lr-monto">Monto reclamado (opcional)<input {...campo("monto")} type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" placeholder="0.00" />{error("monto")}</label>
      </div></fieldset>
      <fieldset disabled={enviando}><legend><span>03</span> Cuéntanos qué pasó</legend>
        <div className="libroTipos"><label><input type="radio" name="tipo" value="reclamo" checked={datos.tipo === "reclamo"} onChange={() => setDatos(d => ({ ...d, tipo: "reclamo" }))} /><span><strong>Reclamo</strong><small>Disconformidad relacionada con el producto o servicio.</small></span></label><label><input type="radio" name="tipo" value="queja" checked={datos.tipo === "queja"} onChange={() => setDatos(d => ({ ...d, tipo: "queja" }))} /><span><strong>Queja</strong><small>Malestar por la atención u otros aspectos distintos al producto o servicio.</small></span></label></div>
        <label htmlFor="lr-detalle">Detalle del reclamo o queja *<textarea {...campo("detalle")} required minLength={5} maxLength={10000} rows={5} placeholder="Indica lo sucedido y las fechas que nos ayuden a entender tu caso." />{error("detalle")}</label>
        <label htmlFor="lr-pedido">¿Qué solución solicitas? *<textarea {...campo("pedido")} required minLength={3} maxLength={5000} rows={3} />{error("pedido")}</label>
        <label htmlFor="lr-canal">¿Dónde deseas recibir nuestra respuesta? *<select {...campo("canal")}><option value="email">Por correo electrónico</option><option value="domicilio">Por carta al domicilio indicado</option></select>{error("canal")}</label>
      </fieldset>
      <p className="libroPrivacidad">Usaremos tus datos para registrar y atender este caso y cumplir las obligaciones legales de conservación. No se usarán para publicidad. <button type="button" onClick={() => setLegal(true)}>Consultar la Política de Privacidad</button>.</p>
      <button className="primary libroEnviar" disabled={enviando || !proveedor?.configurado}>{enviando ? "Registrando tu hoja…" : "Registrar y obtener mi constancia →"}</button>
    </form>}
    {aviso && <div role="alert" className="afAlerta">{aviso}</div>}
    <p className="libroDerechos">Presentar un reclamo o queja no limita otras vías de solución ni es requisito previo para denunciar ante el Indecopi. El trámite no está condicionado a pagos. <a href="https://www.gob.pe/indecopi" target="_blank" rel="noreferrer">Conoce tus derechos ↗</a></p>
    {legal && <VentanaLegal tipo="privacidad" alCerrar={() => setLegal(false)} />}
  </div></PortadaMarco>;
}
