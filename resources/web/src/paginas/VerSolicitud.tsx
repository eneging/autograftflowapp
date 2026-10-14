import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { calcular, formatoFecha, formatoMonto } from "../../../shared/calculos";
import { enlaceWhatsApp } from "../api";
import { compartirPdf, copiar, descargarPdf } from "../compartir";
import { Documento } from "../componentes/Documento";
import { EstadoInsignia, fechaHora } from "../componentes/Estado";
import { desdeDatos, reembolsoPorFila } from "../formulario";
import { usarSolicitud } from "../usarSolicitud";
import { NOMBRE_DOCUMENTO } from "./NuevaSolicitud";

const fechaIso = (iso: string) => formatoFecha(new Date(iso).toLocaleDateString("sv")); // «sv» da AAAA-MM-DD en hora local

/** Firmante 1 después de enviar: estado, PDF y envío al Firmante 2. */
export function VerSolicitud() {
  const { token = "" } = useParams();
  const nueva = Boolean((useLocation().state as { nueva?: boolean } | null)?.nueva);
  const { s, error } = usarSolicitud(token);
  const [copiado, setCopiado] = useState("");
  const vista = useMemo(() => {
    if (!s) return null;
    const t = calcular(s.datos), f = desdeDatos(s.datos);
    return { t, f, porFila: reembolsoPorFila(f, t.viajes) };
  }, [s]);

  if (error) return <div className="card"><div className="afAlerta">{error}</div></div>;
  if (!s || !vista) return <div className="card"><p id="loading">Cargando documento...</p></div>;

  const enlaceFirmante2 = s.tokenAprobador ? `${location.origin}/a/${s.tokenAprobador}` : "";
  const nombrePdf = `AutograFlow_${NOMBRE_DOCUMENTO}_${s.numeroFactura}`.replace(/\s+/g, "_");
  const marcar = async (texto: string, que: string) => {
    if (await copiar(texto)) {
      setCopiado(que);
      setTimeout(() => setCopiado(""), 2000);
    }
  };

  return (
    <div className="card">
      <h1>{s.estado === "pendiente" ? "Documento firmado — Firmante 1" : s.estado === "aprobada" ? "Documento aprobado" : "Documento rechazado"}</h1>
      {nueva && <div className="okNotice">✓ Tu firma quedó registrada. Número de factura: <strong>{s.numeroFactura}</strong></div>}
      <div className="notice">
        <strong>{NOMBRE_DOCUMENTO}</strong> <EstadoInsignia estado={s.estado} />
        <br />Factura N.º {s.numeroFactura} · firmada el {fechaHora(s.firmadoEn)} · total {formatoMonto(vista.t.total)}
        {s.decididoEn && <><br />{s.estado === "aprobada" ? "Aprobada" : "Rechazada"} por {s.aprobadorNombre} el {fechaHora(s.decididoEn)}</>}
        {s.motivoRechazo && <><br />Motivo: {s.motivoRechazo}</>}
      </div>

      <div className="readyBar">
        <button type="button" className="success" onClick={() => compartirPdf(token, nombrePdf, `Documento firmado: ${NOMBRE_DOCUMENTO} N.º ${s.numeroFactura}.`)}>
          💬 Enviar PDF por WhatsApp
        </button>
        <button type="button" onClick={() => descargarPdf(token)}>⬇️ Descargar PDF firmado</button>
      </div>

      {s.estado === "pendiente" && enlaceFirmante2 && (
        <section className="siguiente">
          <strong>Firmante 2 · Responsable de la aprobación</strong>
          <p>Envíale este enlace para que revise el documento y lo firme.</p>
          <div className="readyBar">
            <a
              className="boton primary" target="_blank" rel="noopener noreferrer"
              href={enlaceWhatsApp(`Hola, te envío la ${NOMBRE_DOCUMENTO} N.º ${s.numeroFactura} para que la revises y firmes como responsable de la aprobación: ${enlaceFirmante2}`)}
            >
              💬 Enviar al Firmante 2 por WhatsApp
            </a>
            <button type="button" onClick={() => marcar(enlaceFirmante2, "f2")}>{copiado === "f2" ? "✓ Enlace copiado" : "🔗 Copiar enlace del Firmante 2"}</button>
          </div>
        </section>
      )}

      <div className="signerPageNav"><span>Página <b>1</b> de <b>1</b></span></div>
      <div className="preview">
        <Documento
          f={vista.f} totales={vista.t} reembolsosFila={vista.porFila} numeroFactura={s.numeroFactura}
          solicitante={{ imagen: `/api/solicitudes/${token}/firma/solicitante`, fecha: fechaIso(s.firmadoEn) }}
          aprobador={s.estado === "aprobada" && s.decididoEn ? { imagen: `/api/solicitudes/${token}/firma/aprobador`, fecha: fechaIso(s.decididoEn) } : undefined}
        />
      </div>

      <p className="afExtraHint">
        Guarda el enlace de esta página para consultar el estado más tarde.{" "}
        <button type="button" className="enlace" onClick={() => marcar(`${location.origin}/s/${token}`, "propio")}>
          {copiado === "propio" ? "✓ Copiado" : "Copiar mi enlace"}
        </button>
      </p>
      <div className="row pie"><Link to="/reembolso" className="enlace">Llenar una nueva solicitud</Link></div>
    </div>
  );
}
