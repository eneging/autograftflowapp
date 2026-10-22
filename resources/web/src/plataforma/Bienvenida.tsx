import { useState } from "react";
import { Link } from "react-router-dom";
import { PLANES } from "../../../shared/planes";
import { Icono } from "../componentes/Marco";
import "./bienvenida.css";

const PASOS = [
  { titulo: "Prepara tu PDF", texto: "Sube tu documento, añade a los firmantes y coloca los campos donde los necesitas.", icono: "doc" },
  { titulo: "Comparte el enlace", texto: "Envía el enlace personal por WhatsApp. Cada persona abre el documento y firma desde su celular.", icono: "equipo" },
  { titulo: "Recibe las firmas", texto: "Consulta quién ha firmado y descarga el PDF completo con su certificado de firmas.", icono: "verificar" },
] as const;

export function Bienvenida() {
  const [paso, setPaso] = useState(0);
  return (
    <div className="bienvenida">
      <section className="entradaHero" aria-labelledby="tituloEntrada">
        <div className="entradaTexto">
          <span className="entradaEyebrow"><span /> DEL PDF A LA FIRMA, SIN VUELTAS</span>
          <h1 id="tituloEntrada">Tu documento.<br />Su firma.<br /><em>Todo más fácil.</em></h1>
          <p>Envía tu PDF por WhatsApp y recibe las firmas desde el celular. Sin imprimir, escanear ni coordinar reuniones.</p>
          <div className="entradaAcciones">
            <Link className="boton primary" to="/registro?plan=gratis">Empezar gratis <span aria-hidden>↗</span></Link>
            <Link className="boton" to="/como-funciona">Ver cómo funciona <span aria-hidden>→</span></Link>
          </div>
          <p className="entradaMicro">{PLANES.gratis.documentos} documentos gratis al día · Sin tarjeta</p>
          <Link className="entradaInvitado" to="/sin-cuenta">¿Solo quieres probar? Entra sin cuenta →</Link>
        </div>
        <div className="entradaVisual" aria-label="Ejemplo de un documento completado">
          <div className="visualCabecera"><span className="visualPunto" /> TU PRÓXIMO DOCUMENTO, RESUELTO <span>PDF</span></div>
          <div className="papelEjemplo">
            <div className="papelCabecera"><Icono n="doc" tam={24} /><span>DOCUMENTO DE EJEMPLO</span></div>
            <h2>Acuerdo de servicios</h2><p>Todo listo para seguir adelante.</p>
            <div className="papelLineas" aria-hidden><i /><i /><i /></div>
            <div className="papelFirma"><span>Firma del destinatario</span><span className="firmaEjemplo">María García</span><small>Firmado desde el celular</small></div>
            <div className="papelPie"><Icono n="verificar" /> Certificado de firmas incluido</div>
          </div>
          <div className="firmaAviso"><span className="firmaCheck" aria-hidden>✓</span><div><strong>Documento completado</strong><span>Listo para descargar y compartir</span></div></div>
          <p className="visualLeyenda">Así se ve el resultado · Ejemplo ilustrativo</p>
        </div>
      </section>

      <div className="entradaBeneficios">
        <span><Icono n="doc" /> Trabaja con tus propios PDF</span>
        <span><Icono n="usuario" /> Tus firmantes no necesitan cuenta</span>
        <span><Icono n="verificar" /> Sigue el estado de cada firma</span>
      </div>

      <section id="como-funciona" className="entradaSeccion" aria-labelledby="tituloPasos">
        <span className="entradaEyebrow">UN RECORRIDO SIMPLE</span>
        <h2 id="tituloPasos">Menos trámites. Más cosas hechas.</h2>
        <p>De tu archivo al documento firmado, en tres pasos.</p>
        <div className="recorrido">
          <div className="recorridoOpciones" aria-label="Explorar los pasos">
            {PASOS.map((p, i) => <button type="button" key={p.titulo} className={paso === i ? "activo" : ""} aria-pressed={paso === i} aria-controls="vistaPaso" onClick={() => setPaso(i)}><span className="recorridoNumero">0{i + 1}</span><span><strong>{p.titulo}</strong><span>{p.texto}</span></span><span aria-hidden>↗</span></button>)}
          </div>
          <div id="vistaPaso" className="recorridoVista" aria-live="polite" aria-atomic="true">
            <span className="demoEtiqueta">DEMOSTRACIÓN · PASO {paso + 1} DE 3</span>
            <div className="demoIcono"><Icono n={PASOS[paso].icono} tam={30} /></div>
            <h3>{["Un PDF. Tu punto de partida.", "Un enlace. Sin instalar nada.", "Todas las firmas, en un lugar."][paso]}</h3>
            {paso === 0 ? <div className="demoArchivo"><Icono n="doc" tam={26} /><span><strong>Acuerdo-de-servicios.pdf</strong><small>Ejemplo de documento</small></span><span className="demoEstado">PDF</span></div>
              : paso === 1 ? <div className="demoMensaje"><strong>Hola, María 👋</strong><p>Te comparto el documento para que lo revises y firmes desde tu celular.</p><span>Enlace personal de firma ↗</span></div>
              : <div className="demoFinal"><span className="firmaCheck" aria-hidden>✓</span><strong>Firmas completadas</strong><p>PDF firmado + certificado</p><span className="demoEstado">Listo para descargar</span></div>}
            <p className="demoNota">{["En el editor eliges quién firma y dónde.", "Cada persona ve y completa los campos que le asignaste.", "El certificado registra la actividad de los firmantes."][paso]}</p>
            <button className="demoSiguiente" type="button" onClick={() => setPaso((paso + 1) % PASOS.length)}>{paso === 2 ? "Volver al primer paso" : "Ver siguiente paso"} <span aria-hidden>→</span></button>
          </div>
        </div>
      </section>

      <section className="entradaGratis" aria-labelledby="tituloGratis">
        <div><span className="entradaEyebrow">EMPIEZA A TU RITMO</span><h2 id="tituloGratis">Tu primer documento empieza aquí.</h2><p>Con tu cuenta gratuita tienes {PLANES.gratis.documentos} documentos al día y hasta {PLANES.gratis.firmantesPorDocumento} firmantes por documento. Incluye certificado y la marca de AutograFlow.</p><Link to="/planes">Comparar todos los planes →</Link></div>
        <div className="gratisAccion"><Link className="boton primary" to="/registro?plan=gratis">Crear mi cuenta gratis <span aria-hidden>↗</span></Link><span>Sin tarjeta · Sin compromiso</span></div>
      </section>

      <section className="entradaPreguntas entradaSeccion" aria-labelledby="tituloPreguntas">
        <div><span className="entradaEyebrow">ANTES DE EMPEZAR</span><h2 id="tituloPreguntas">Las cosas claras.</h2><p>Lo que necesitas saber para enviar tu primer documento.</p></div>
        <div className="preguntasLista">
          {[
            ["¿La persona que firma necesita una cuenta?", "No. Recibe un enlace personal, abre el PDF en su navegador y completa sus campos desde el celular o la computadora. No necesita instalar una aplicación."],
            ["¿Puedo probar sin registrarme?", `Sí. Puedes entrar sin cuenta y aceptar las condiciones para probar con ${PLANES.gratis.documentos} documentos al día y ${PLANES.gratis.firmantesSinCuenta ?? 1} firmante por documento. Si después creas una cuenta desde esa sesión, conservas los documentos que preparaste.`],
            ["¿Qué recibo cuando todos terminan de firmar?", "Un PDF con los campos completados y un certificado de firmas con el registro de actividad. Puedes descargarlo y compartirlo. También puedes consultar la integridad del archivo desde Verificar PDF."],
            ["¿Tengo que elegir un plan de pago para empezar?", "No. Puedes empezar gratis y consultar los planes si necesitas más documentos, más firmantes, sellos, huellas o funciones para tu equipo."],
          ].map(([pregunta, respuesta]) => <details key={pregunta}><summary>{pregunta}<span aria-hidden>+</span></summary><p>{respuesta}</p></details>)}
        </div>
      </section>
    </div>
  );
}
