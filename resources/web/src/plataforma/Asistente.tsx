import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icono } from "../componentes/Marco";
import { PortadaMarco } from "./Portada";
import { usarSesion } from "./sesion";
import { DemoPaso, usarGuia } from "./GuiaProceso";
import { cambiarPasivo, usarPasivo } from "./asistido";
import "./asistente.css";

/*
 * Cada paso: qué es (texto), cómo se hace en la app real (como: acciones concretas, con los nombres de los botones) y
 * las animaciones «Así se hace» de la guía (demos: número de escena de DemoPaso).
 */
const PASOS = [
  { nombre: "Tu documento", titulo: "Empieza con tu PDF", texto: "Todo empieza con el archivo que quieres que firmen: un contrato, una solicitud, un acta o un recibo. Solo tiene que estar en PDF; si lo tienes en Word, guárdalo como PDF primero.",
    como: ["Entra a «Mis documentos».", "Pulsa «📄 Seleccionar PDF» o arrastra el archivo hasta el recuadro.", "Espera a que el logo llegue al 100 %: la app lee el PDF y detecta sola sus casillas y campos para llenar.", "Elige quién lo firma: solo tú, otras personas o ambos."],
    demos: [1], consejo: "Puedes usar contratos, solicitudes, actas o recibos en formato PDF, de hasta 20 MB.", icono: "doc" },
  { nombre: "Los firmantes", titulo: "Elige quién debe firmar", texto: "Indica cuántas personas firmarán y quiénes son. Cada una recibirá su propio enlace, así nadie puede firmar por otra.",
    como: ["En «Cantidad de firmantes», sube el número con las flechas.", "Pulsa «✉️ Apodo y envío» y escribe su nombre y su WhatsApp o correo.", "Si tú también firmas, usa «✍️ Agregar mi firma».", "Elige si firman «En orden» (uno después del otro) o «Todos a la vez»."],
    demos: [2], consejo: "Si ya guardaste a la persona en tu Directorio, al escribir su nombre se completan sus datos.", icono: "equipo" },
  { nombre: "Los campos", titulo: "Indica dónde va cada firma", texto: "Ahora marca en la hoja dónde debe firmar cada persona, como cuando pones una banderita adhesiva «firme aquí» en un papel.",
    como: ["Elige al firmante en «Configurar participante».", "Pulsa «✍️ Marcar dónde irá la firma» y toca el PDF en ese lugar.", "¿Debe firmar en varias partes, por ejemplo en cada página? Pulsa otra vez y toca cada lugar: firmará una sola vez y su firma aparecerá en todos.", "Arrastra el recuadro para moverlo y usa su esquina para cambiar su tamaño."],
    demos: [3], consejo: "Los sellos, las huellas y otras funciones dependen del plan que tengas.", icono: "mas" },
  { nombre: "El envío", titulo: "Revisa y comparte el enlace", texto: "Cuando todo esté en su lugar, envías el documento. Desde ese momento ya no se pueden mover los campos, y cada persona recibe su enlace para firmar desde el celular.",
    como: ["Revisa los nombres, los campos y el orden de firma.", "Pulsa «Guardar y enviar» (o «✍️ Firmar documento» si solo firmas tú).", "Junto a cada firmante, pulsa «Enviar por WhatsApp» o «Copiar enlace».", "Envía a cada persona solo su enlace: es personal."],
    demos: [4, 5], consejo: "Tus firmantes no necesitan crear una cuenta ni instalar una aplicación: el enlace se abre en el navegador.", icono: "usuario" },
  { nombre: "El resultado", titulo: "Sigue las firmas y recibe el PDF", texto: "Desde tu panel ves en todo momento quién abrió el documento y quién ya firmó. Cuando firman todos, el PDF final queda listo.",
    como: ["Abre el documento desde «Mis documentos» para ver su avance.", "Si alguien se demora, pulsa «📧 Recordar por correo» junto a su nombre.", "Cuando todos firmen, pulsa «⬇️ Descargar PDF»: es el documento firmado, con su certificado de firmas."],
    demos: [6], consejo: "El certificado registra la actividad. También puedes verificar la integridad del PDF en Verificar PDF.", icono: "verificar" },
] as const;

/**
 * Las dos ayudas mientras preparas un documento. Activo: la guía «Te acompaño» (tarjeta con pasos y animaciones, va a
 * cada control y lo hace parpadear); necesita sesión porque se guarda en tu cuenta. Pasivo: sin tarjeta, al terminar un
 * paso del editor la vista baja al siguiente y parpadea una vez; se guarda en este navegador.
 */
function AjustesAsistencia() {
  const { usuario } = usarSesion();
  const { guia, cambiar } = usarGuia();
  const pasivo = usarPasivo();
  const activo = guia.estado === "pendiente" || guia.estado === "activa";
  return <section className="asistidoAjustes" aria-labelledby="asistidoTitulo">
    <h2 id="asistidoTitulo">Ayudas mientras trabajas</h2>
    <p>Elige cómo quieres que te acompañemos al preparar tus documentos. Puedes cambiarlo cuando quieras.</p>
    <label className="asistidoInterruptor">
      <input type="checkbox" role="switch" checked={!!usuario && activo} disabled={!usuario}
        onChange={(e) => cambiar(e.target.checked ? { estado: "activa", paso: 1, documentoId: null } : { ...guia, estado: "omitida", documentoId: null })} />
      <span><strong>Modo asistido activo (guía paso a paso)</strong>
        <small>{usuario
          ? "Una tarjeta te explica cada paso con una animación, lleva la vista al botón o campo real y lo hace parpadear."
          : "Entra a tu cuenta o prueba sin cuenta para activar la guía paso a paso."}</small></span>
    </label>
    <label className="asistidoInterruptor">
      <input type="checkbox" role="switch" checked={pasivo} onChange={(e) => cambiarPasivo(e.target.checked)} />
      <span><strong>Modo asistido pasivo</strong>
        <small>Sin tarjetas: al terminar un paso del editor (nombre, firmantes, orden…), la vista baja al siguiente y este parpadea una vez. Si la guía está activa, ella tiene prioridad.</small></span>
    </label>
  </section>;
}

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
    <AjustesAsistencia />
    <nav aria-label="Pasos de la guía" className="asistentePasos"><ol>{PASOS.map((item, i) => <li key={item.nombre}><button type="button" aria-label={`Paso ${i + 1}: ${item.nombre}`} aria-current={paso === i ? "step" : undefined} className={paso === i ? "actual" : ""} onClick={() => ir(i)}><span>{String(i + 1).padStart(2, "0")}</span><strong>{item.nombre}</strong></button></li>)}</ol></nav>
    <div className="asistenteProgreso" role="progressbar" aria-label="Progreso de la guía" aria-valuemin={1} aria-valuemax={PASOS.length} aria-valuenow={paso + 1} aria-valuetext={`Paso ${paso + 1} de ${PASOS.length}: ${p.nombre}`}><span style={{ width: `${(paso + 1) / PASOS.length * 100}%` }} /></div>
    <div className="asistenteCuerpo">
      <section className="asistenteExplicacion" aria-labelledby="asistenteTitulo"><span className="asistenteNumero">PASO {paso + 1} DE {PASOS.length}</span><h2 id="asistenteTitulo" ref={titulo} tabIndex={-1}>{p.titulo}</h2><p>{p.texto}</p>
        <div className="asistenteDemos">{p.demos.map((n) => <DemoPaso key={n} paso={n} />)}</div>
        <div className="asistenteComo"><strong>Cómo se hace en AutograFlow</strong><ol>{p.como.map((c) => <li key={c}>{c}</li>)}</ol></div>
        <div className="asistenteConsejo"><Icono n={p.icono} tam={22} /><p>{p.consejo}</p></div>
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
