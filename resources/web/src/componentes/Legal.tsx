import { useEffect } from "react";

/*
 * Términos y Política de Privacidad, con el mismo formato que el prototipo, pero adaptados a cómo funciona
 * esta versión: los documentos, las firmas y los datos de la cuenta SÍ se guardan en el servidor
 * (y las imágenes en Cloudinary), y los pagos los procesa Mercado Pago.
 */

const TERMINOS = [
  ["0. Alcance.", "Tu cuenta da acceso a AutograFlow, la plataforma para preparar documentos PDF y recoger firmas, sellos y huellas. Estos Términos y Condiciones aplican a todos sus planes."],
  ["1. Aceptación.", "Al crear una cuenta, entrar sin cuenta o usar la plataforma declaras que has leído completamente, entiendes y aceptas estos Términos y Condiciones en su totalidad. Si entras sin cuenta, debes aceptarlos cada vez que entras. Si no estás de acuerdo, no debes usarla."],
  ["1.1 Acceso sin cuenta.", "Puedes usar el plan Gratis sin crear una cuenta: 2 documentos diarios y 1 firmante por documento. Tus documentos quedan asociados a este navegador; si borras sus datos, no podrás recuperarlos. Para comprar un plan debes crear una cuenta, y al crearla conservas los documentos que preparaste sin cuenta."],
  ["2. Descripción del servicio.", "AutograFlow permite subir documentos, marcar dónde firma cada persona, enviar enlaces de firma y generar un PDF firmado con un certificado de firmas (fecha, hora, IP, dispositivo y huella SHA-256). Se trata de una firma electrónica simple: no es una firma digital certificada por una entidad acreditada."],
  ["3. Planes y pagos.", "Los planes y sus límites se describen en la página de planes. Los pagos se procesan con Mercado Pago; AutograFlow no recibe ni guarda los datos de tu tarjeta. Los planes se activan cuando Mercado Pago confirma el pago y no se renuevan solos."],
  ["4. Responsabilidad del usuario.", "Es responsabilidad exclusiva de cada usuario verificar que el uso de firmas electrónicas cumpla con la normativa aplicable en su país o sector, y garantizar la veracidad, la legalidad y el consentimiento de todas las partes de cada documento."],
  ["5. Documentos sensibles o confidenciales.", "El usuario es el único responsable de los documentos que sube, en especial cuando contienen información personal, financiera, médica, legal o de terceros. Antes de subirlos debe asegurarse de tener el derecho y la autorización para usarlos."],
  ["6. Exención de responsabilidad.", "El servicio se ofrece tal como está, sin garantías de ningún tipo. El creador de la plataforma, sus administradores y colaboradores no responden por el contenido de los documentos ni por la validez legal o los efectos jurídicos que estos tengan en cualquier jurisdicción."],
  ["7. No constituye asesoría legal.", "Nada en esta plataforma constituye asesoría legal. Ante dudas sobre la validez de una firma electrónica, consulta con un profesional calificado."],
  ["8. Uso razonable.", "Los documentos «ilimitados» del plan Empresarial están sujetos a una política de uso razonable (tamaño, páginas y firmantes máximos por documento). Podemos suspender cuentas que hagan un uso abusivo o automatizado del servicio."],
  ["9. Modificaciones.", "Estos términos pueden actualizarse en cualquier momento; el uso continuado de la plataforma implica la aceptación de los cambios vigentes."],
];

const PRIVACIDAD = [
  ["0. Alcance.", "Esta Política de Privacidad explica qué datos trata AutograFlow y para qué."],
  ["1. Qué datos se guardan.", "De tu cuenta: nombre, empresa, correo y contraseña (solo su versión cifrada, nunca en texto plano). De cada documento: el PDF, los firmantes que indicas (nombre, WhatsApp y correo), lo que cada firmante llena, sus firmas, sellos y huellas, y el registro de cada paso (fecha, hora, IP y dispositivo)."],
  ["2. Para qué se usan.", "Solo para prestar el servicio: enviar los enlaces de firma, generar el PDF firmado con su certificado, permitir verificarlo y avisarte por correo de cada paso. No vendemos ni cedemos tus datos."],
  ["3. Dónde se guardan.", "Los documentos y los datos se guardan en el servidor de AutograFlow. Las imágenes de firmas, sellos, huellas y logos se guardan como archivos privados en Cloudinary, sin una dirección pública: solo la plataforma puede leerlas para entregarlas a quien tiene el enlace del documento."],
  ["4. Quién puede verlos.", "Tu documento solo lo ven tú (y los usuarios de tu organización en el plan Empresarial) y los firmantes a los que les enviaste su enlace secreto. Cada firmante ve únicamente sus campos y lo que ya firmaron los demás."],
  ["5. Pagos.", "Los pagos los procesa Mercado Pago. AutograFlow solo guarda el monto, el plan comprado y el estado del pago."],
  ["6. Huellas y datos sensibles.", "La huella dactilar es un dato especialmente sensible: solo se usa dentro del documento para el que se pidió y no se crea una biblioteca reutilizable."],
  ["7. Tus derechos.", "Puedes pedir el acceso, la corrección o la eliminación de tus datos escribiendo al correo de soporte. Algunos registros de los documentos firmados pueden conservarse el tiempo necesario para demostrar su validez."],
  ["8. Compartir por WhatsApp u otros medios.", "Si compartes un enlace o un PDF por WhatsApp o por correo, el envío lo hace tu propio dispositivo o tu aplicación; AutograFlow no interviene en ese envío."],
];

export type TipoLegal = "terminos" | "privacidad";

/** Ventana con los Términos o la Política de Privacidad. */
export function VentanaLegal({ tipo, alCerrar }: { tipo: TipoLegal; alCerrar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [alCerrar]);
  const texto = tipo === "terminos" ? TERMINOS : PRIVACIDAD;
  return (
    <div className="modalAf" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="modalCard" role="dialog" aria-modal="true" aria-label={tipo === "terminos" ? "Términos y Condiciones" : "Política de Privacidad"}>
        <h2>{tipo === "terminos" ? "Términos y Condiciones" : "Política de Privacidad"}</h2>
        <div className="legalAcceptNote">📌 <strong>Importante:</strong> al marcar la casilla de aceptación o al usar la plataforma, <strong>declaras que has leído completamente, entiendes y aceptas</strong> este documento en su totalidad.</div>
        <div className="legalTexto">
          {texto.map(([t, p]) => <p key={t}><strong>{t}</strong> {p}</p>)}
        </div>
        <div className="row pie"><button type="button" className="primary" onClick={alCerrar}>Cerrar</button></div>
      </div>
    </div>
  );
}
