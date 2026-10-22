import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icono } from "../componentes/Marco";
import { PortadaMarco } from "./Portada";
import { usarSesion } from "./sesion";
import "./asistente.css";

const PASOS = [
  { nombre: "Tu documento", titulo: "Empieza con tu PDF", texto: "En Mis documentos, selecciona el archivo que quieres enviar a firmar. Si tiene campos rellenables, la app los detecta.", consejo: "Puedes usar contratos, solicitudes, actas o recibos en formato PDF.", icono: "doc" },
  { nombre: "Los firmantes", titulo: "Elige quién debe firmar", texto: "Añade el nombre y el contacto de cada persona. Puedes elegir que firmen en orden o todos a la vez.", consejo: "Cada persona recibe un enlace personal para completar sus propios campos.", icono: "equipo" },
  { nombre: "Los campos", titulo: "Indica dónde va cada firma", texto: "En el editor, agrega los campos al PDF y asígnalos a un firmante. Puedes moverlos y ajustar su tamaño sobre la hoja.", consejo: "Los sellos, las huellas y otras funciones dependen del plan que tengas.", icono: "mas" },
  { nombre: "El envío", titulo: "Revisa y comparte el enlace", texto: "Cuando el documento esté listo, envíalo a firmar y comparte el enlace personal por WhatsApp. La otra persona lo abre desde su navegador.", consejo: "Tus firmantes no necesitan crear una cuenta ni instalar una aplicación.", icono: "usuario" },
  { nombre: "El resultado", titulo: "Sigue las firmas y recibe el PDF", texto: "En tu panel puedes consultar quién ha firmado. Cuando todos terminan, descargas el PDF firmado con su certificado de firmas.", consejo: "El certificado registra la actividad. También puedes verificar la integridad del PDF en Verificar PDF.", icono: "verificar" },
] as const;

export function Asistente() {
  const { usuario } = usarSesion();
  const [params, setParams] = useSearchParams();
  const valor = Number(params.get("paso") ?? 1);
  const paso = Number.isInteger(valor) && valor >= 1 && valor <= PASOS.length ? valor - 1 : 0;
  const [cargado, setCargado] = useState(false);
  const [nombre, setNombre] = useState("María García");
  const [orden, setOrden] = useState("paralelo");
  const [firma, setFirma] = useState(false);
  const [fecha, setFecha] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [aviso, setAviso] = useState("");
  const titulo = useRef<HTMLHeadingElement>(null);
  const anterior = useRef(paso);
  const p = PASOS[paso];
  const destinatario = nombre.trim() || "María García";
  const volver = params.get("desde") === "panel" || usuario ? "/app" : "/";
  useEffect(() => {
    if (anterior.current !== paso) {
      setAviso("");
      titulo.current?.focus({ preventScroll: true });
      if (matchMedia("(max-width: 700px)").matches) titulo.current?.scrollIntoView({ block: "start", behavior: "instant" });
      anterior.current = paso;
    }
  }, [paso]);
  function ir(indice: number) {
    const siguiente = new URLSearchParams(params);
    siguiente.set("paso", String(indice + 1));
    setParams(siguiente);
  }
  function reiniciar() {
    setCargado(false); setNombre("María García"); setOrden("paralelo"); setFirma(false); setFecha(false); setEnviado(false); setAviso(""); ir(0);
  }
  return <PortadaMarco><div className="asistentePagina">
    <div className="asistenteSuperior"><span className="entradaEyebrow">CONOCE AUTOGRAFLOW · GUÍA INTERACTIVA</span><Link to={volver}>Salir de la guía <span aria-hidden>↗</span></Link></div>
    <div className="asistenteIntro"><h1>Tu primera firma empieza aquí.</h1><p>Explora el recorrido con un documento de ejemplo. Puedes probar cada paso o avanzar a tu ritmo.</p></div>
    <nav aria-label="Pasos de la guía" className="asistentePasos"><ol>{PASOS.map((item, i) => <li key={item.nombre}><button type="button" aria-label={`Paso ${i + 1}: ${item.nombre}`} aria-current={paso === i ? "step" : undefined} className={paso === i ? "actual" : ""} onClick={() => ir(i)}><span>{String(i + 1).padStart(2, "0")}</span><strong>{item.nombre}</strong></button></li>)}</ol></nav>
    <div className="asistenteProgreso" role="progressbar" aria-label="Progreso de la guía" aria-valuemin={1} aria-valuemax={PASOS.length} aria-valuenow={paso + 1} aria-valuetext={`Paso ${paso + 1} de ${PASOS.length}: ${p.nombre}`}><span style={{ width: `${(paso + 1) / PASOS.length * 100}%` }} /></div>
    <div className="asistenteCuerpo">
      <section className="asistenteExplicacion" aria-labelledby="asistenteTitulo"><span className="asistenteNumero">PASO {paso + 1} DE {PASOS.length}</span><h2 id="asistenteTitulo" ref={titulo} tabIndex={-1}>{p.titulo}</h2><p>{p.texto}</p><div className="asistenteConsejo"><Icono n={p.icono} tam={22} /><p>{p.consejo}</p></div>
        {paso === 0 && <button type="button" className="primary" onClick={() => { setCargado(true); setAviso("El PDF de ejemplo está listo. Puedes continuar al paso de firmantes."); }}>{cargado ? "PDF de ejemplo preparado ✓" : "Probar con un PDF de ejemplo"}</button>}
        {paso === 1 && <div className="asistenteControles"><label htmlFor="ejemploFirmante">Nombre del firmante de ejemplo<input id="ejemploFirmante" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={60} autoComplete="off" /></label><label htmlFor="ejemploOrden">Orden de firma<select id="ejemploOrden" value={orden} onChange={e => setOrden(e.target.value)}><option value="paralelo">Todos a la vez</option><option value="secuencial">En orden</option></select></label></div>}
        {paso === 2 && <div className="asistenteCampos" aria-label="Campos del documento de ejemplo"><button type="button" aria-pressed={firma} onClick={() => { setFirma(!firma); setAviso(firma ? "Campo de firma retirado del ejemplo." : "Campo de firma añadido y asignado al firmante de ejemplo."); }}>{firma ? "✓ Firma añadida" : "+ Añadir firma"}</button><button type="button" aria-pressed={fecha} onClick={() => { setFecha(!fecha); setAviso(fecha ? "Campo de fecha retirado del ejemplo." : "Campo de fecha añadido al ejemplo."); }}>{fecha ? "✓ Fecha añadida" : "+ Añadir fecha"}</button></div>}
        {paso === 3 && <button type="button" className="primary" onClick={() => { setEnviado(true); setAviso("Envío simulado. En la app compartes el enlace personal con el firmante."); }}>{enviado ? "Envío simulado ✓" : "Simular el envío del enlace"}</button>}
        {paso === 4 && <div className="asistenteFinal"><strong>Ya conoces el recorrido.</strong><p>Ahora puedes empezar con tu propio documento.</p><Link className="boton primary" to={usuario ? "/app" : "/registro?plan=gratis"}>{usuario ? "Preparar mi documento →" : "Crear mi cuenta gratis →"}</Link>{!usuario && <Link to="/sin-cuenta">También puedes probar sin cuenta →</Link>}</div>}
        <p className="asistenteAviso" role="status" aria-live="polite">{aviso}</p>
      </section>
      <section className="asistenteDemo" aria-label={`Ejemplo del paso ${paso + 1}: ${p.nombre}`}>
        <div className="asistenteDemoBarra"><span><i /> EJEMPLO INTERACTIVO</span><span>{paso === 4 ? "COMPLETADO" : paso === 3 && enviado ? "EN FIRMA" : "BORRADOR"}</span></div>
        <div className="asistenteHoja"><div className="asistenteHojaMarca"><Icono n="doc" tam={25} /><span>ACUERDO-DE-SERVICIOS.PDF</span></div><h3>Acuerdo de servicios</h3><p>Documento ilustrativo para aprender el recorrido.</p><div className="asistenteLineas" aria-hidden><i /><i /><i /><i /></div>
          {paso === 0 && <div className={`asistenteArchivo ${cargado ? "listo" : ""}`}><Icono n="doc" tam={28} /><strong>{cargado ? "PDF preparado" : "Tu documento PDF"}</strong><span>{cargado ? "Listo para añadir firmantes" : "Prueba con el PDF de ejemplo o continúa"}</span></div>}
          {paso === 1 && <div className="asistentePersona"><span aria-hidden>{destinatario.slice(0, 1).toUpperCase()}</span><div><strong>{destinatario}</strong><small>Firmante de ejemplo · {orden === "paralelo" ? "Todos a la vez" : "En orden"}</small></div></div>}
          {paso === 2 && <div className="asistenteZonaCampos">{!firma && !fecha && <span>Añade un campo para ver dónde aparecerá.</span>}{firma && <div className="asistenteCampoFirma"><small>Firma · {destinatario}</small><strong>Tu firma aquí</strong></div>}{fecha && <div className="asistenteCampoFecha">Fecha de firma · DD/MM/AAAA</div>}</div>}
          {paso === 3 && <div className="asistenteMensaje"><strong>Hola, {destinatario.split(" ")[0]} 👋</strong><p>Te comparto este documento para que lo revises y firmes desde tu celular.</p><span>Enlace personal de firma ↗</span>{enviado && <small>✓ Envío simulado en esta guía</small>}</div>}
          {paso === 4 && <div className="asistenteFirmado"><small>Firma del destinatario</small><strong>{destinatario}</strong><span>✓ Firma de ejemplo completada</span></div>}
          <div className="asistenteHojaPie">{paso === 4 ? <><Icono n="verificar" /> PDF firmado + certificado de firmas</> : <><Icono n="usuario" /> {paso === 0 ? "Documento de ejemplo" : destinatario}</>}</div>
        </div>
        <p className="asistenteDemoNota">Esta guía usa datos de ejemplo. No sube archivos ni envía mensajes.</p>
      </section>
    </div>
    <div className="asistenteNavegacion"><button type="button" onClick={() => ir(paso - 1)} disabled={paso === 0}>← Anterior</button><span>{paso + 1} / {PASOS.length}</span>{paso < PASOS.length - 1 ? <button type="button" className="primary" onClick={() => ir(paso + 1)}>Siguiente →</button> : <button type="button" onClick={reiniciar}>Volver a empezar ↺</button>}</div>
  </div></PortadaMarco>;
}
