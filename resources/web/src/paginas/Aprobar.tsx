import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { calcular, formatoFecha, formatoMonto } from "../../../shared/calculos";
import { esquemaDecision } from "../../../shared/esquema";
import { api, enlaceWhatsApp, ErrorApi, urlPdf } from "../api";
import { compartirPdf, descargarPdf } from "../compartir";
import { Documento } from "../componentes/Documento";
import { AvisoPrivacidad } from "../componentes/Marco";
import { PantallaFirma } from "../componentes/PantallaFirma";
import { EstadoInsignia } from "../componentes/Estado";
import { desdeDatos, hoy, reembolsoPorFila } from "../formulario";
import { usarSolicitud } from "../usarSolicitud";
import { NOMBRE_DOCUMENTO } from "./NuevaSolicitud";

const fechaIso = (iso: string) => formatoFecha(new Date(iso).toLocaleDateString("sv"));

/** Firmante 2 (responsable de la aprobación): revisa el documento del Firmante 1 y lo firma, o lo rechaza. */
export function Aprobar() {
  const { token = "" } = useParams();
  const { s, error, recargar } = usarSolicitud(token);
  const [nombre, setNombre] = useState("");
  const [firma, setFirma] = useState<string | null>(null);
  const [firmando, setFirmando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const vista = useMemo(() => {
    if (!s) return null;
    const t = calcular(s.datos), f = desdeDatos(s.datos);
    return { t, f, porFila: reembolsoPorFila(f, t.viajes) };
  }, [s]);

  if (error) return <div className="card"><div className="afAlerta">{error}</div></div>;
  if (!s || !vista) return <div className="card"><p id="loading">Cargando documento...</p></div>;
  if (s.rol !== "aprobador") return <div className="card"><div className="afAlerta">Este enlace es del Firmante 1; no sirve para aprobar.</div></div>;

  async function decidir(decision: "aprobada" | "rechazada") {
    const r = esquemaDecision.safeParse({ decision, nombre, firma: decision === "aprobada" ? firma ?? undefined : undefined, motivo });
    if (!r.success) {
      setErrores(Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message])));
      setRevisando(false);
      return;
    }
    setEnviando(true);
    try {
      await api.decidir(token, r.data);
      setRevisando(false);
      setRechazando(false);
      await recargar();
      window.scrollTo({ top: 0 });
    } catch (e) {
      alert("No se pudo guardar: " + (e as Error).message);
      if (e instanceof ErrorApi && e.status === 409) await recargar();
    } finally {
      setEnviando(false);
    }
  }

  const firmaSolicitante = { imagen: `/api/solicitudes/${token}/firma/solicitante`, fecha: fechaIso(s.firmadoEn) };
  const doc = (aprobador: Parameters<typeof Documento>[0]["aprobador"]) => (
    <Documento f={vista.f} totales={vista.t} reembolsosFila={vista.porFila} numeroFactura={s.numeroFactura} solicitante={firmaSolicitante} aprobador={aprobador} />
  );
  const nombrePdf = `AutograFlow_${NOMBRE_DOCUMENTO}_${s.numeroFactura}`.replace(/\s+/g, "_");

  // Ya decidida: mostrar el resultado y avisar al Firmante 1.
  if (s.estado !== "pendiente")
    return (
      <div className="card">
        <h1>{s.estado === "aprobada" ? "Documento aprobado — Firmante 2" : "Documento rechazado — Firmante 2"}</h1>
        <div className="notice">
          <strong>{NOMBRE_DOCUMENTO}</strong> <EstadoInsignia estado={s.estado} />
          <br />Factura N.º {s.numeroFactura} · {s.datos.contacto.nombre} · total {formatoMonto(vista.t.total)}
          {s.motivoRechazo && <><br />Motivo: {s.motivoRechazo}</>}
        </div>
        <div className="readyBar">
          {s.estado === "aprobada" ? (
            <button type="button" className="success" onClick={() => compartirPdf(token, nombrePdf, `Tu ${NOMBRE_DOCUMENTO} N.º ${s.numeroFactura} fue aprobada.`, s.datos.contacto.telefono)}>
              💬 Enviar PDF aprobado por WhatsApp
            </button>
          ) : (
            <a className="boton primary" target="_blank" rel="noopener noreferrer"
              href={enlaceWhatsApp(`Hola, tu ${NOMBRE_DOCUMENTO} N.º ${s.numeroFactura} fue rechazada. Motivo: ${s.motivoRechazo}`, s.datos.contacto.telefono)}>
              💬 Avisar al Firmante 1 por WhatsApp
            </a>
          )}
          <button type="button" onClick={() => descargarPdf(token)}>⬇️ Descargar PDF</button>
        </div>
        <div className="preview">
          {doc(s.estado === "aprobada" && s.decididoEn ? { imagen: `/api/solicitudes/${token}/firma/aprobador`, fecha: fechaIso(s.decididoEn) } : undefined)}
        </div>
      </div>
    );

  if (revisando)
    return (
      <div className="card">
        <h2 id="finishTitle">Previsualización del documento firmado</h2>
        <div className="signed">{doc({ imagen: firma, fecha: formatoFecha(hoy()) })}</div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" onClick={() => setRevisando(false)} disabled={enviando}>Volver a firmar</button>
          <button type="button" className="success" onClick={() => decidir("aprobada")} disabled={enviando}>
            {enviando ? "Guardando…" : "✓ Aprobar y guardar documento"}
          </button>
        </div>
      </div>
    );

  return (
    <>
      <div className="card">
        <h1>Documento listo para firmar — Firmante 2</h1>
        <div className="notice">
          <strong>Firmante 2 · Responsable de la aprobación</strong>
          <br />{s.datos.contacto.nombre} solicita un reembolso de <strong>{formatoMonto(vista.t.total)}</strong>. Revisa el documento y firma en el campo configurado.
        </div>
        <h3>{NOMBRE_DOCUMENTO}</h3>
        <AvisoPrivacidad />

        <label className={`campoNombre ${errores.nombre ? "invalido" : ""}`}>
          <span>Tu nombre (responsable de la aprobación)</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" placeholder="Nombre y apellido" />
          {errores.nombre && <small className="afSheetError">{errores.nombre}</small>}
        </label>

        <div className="readyBar">
          <button type="button" className="primary" onClick={() => setFirmando(true)}>{firma ? "✍️ Cambiar mi firma" : "✍️ Listo para firmar"}</button>
        </div>
        <div className="readyBar">
          <button type="button" className="success" disabled={!firma} onClick={() => {
            const r = esquemaDecision.safeParse({ decision: "aprobada", nombre, firma: firma ?? undefined });
            if (!r.success) return setErrores(Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message])));
            setErrores({});
            setRevisando(true);
            window.scrollTo({ top: 0 });
          }}>✓ Revisar y continuar</button>
          <button type="button" className="danger" onClick={() => setRechazando(true)}>✕ Rechazar solicitud</button>
        </div>

        <div className="signerPageNav"><span>Página <b>1</b> de <b>1</b></span></div>
        <div className="preview">{doc({ imagen: firma, fecha: firma ? formatoFecha(hoy()) : undefined, alTocar: () => setFirmando(true), error: Boolean(errores.firma) })}</div>
        <p className="afExtraHint"><a href={urlPdf(token)} target="_blank" rel="noopener">Ver el PDF completo</a> (incluye la hoja anexa si la hay).</p>
      </div>

      {firmando && (
        <PantallaFirma titulo="Firma manuscrita — Firmante 2" inicial={firma}
          alTerminar={(png) => { setFirma(png); setFirmando(false); }} alCerrar={() => setFirmando(false)} />
      )}
      {rechazando && (
        <div className="afSheet" onClick={(e) => e.target === e.currentTarget && setRechazando(false)}>
          <div className="afSheetCard" role="dialog" aria-label="Rechazar solicitud">
            <div className="afSheetHead"><div className="afSheetTitles"><strong>Rechazar solicitud</strong><small>El Firmante 1 verá este motivo</small></div></div>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" aria-label="Tu nombre" className={errores.nombre ? "invalido" : ""} />
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Motivo del rechazo" aria-label="Motivo del rechazo" className={errores.motivo ? "invalido" : ""} />
            {(errores.nombre || errores.motivo) && <small className="afSheetError">{errores.nombre || errores.motivo}</small>}
            <div className="afSheetActions">
              <button type="button" onClick={() => setRechazando(false)}>Cancelar</button>
              <button type="button" className="danger" disabled={enviando} onClick={() => decidir("rechazada")}>{enviando ? "Guardando…" : "Rechazar"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
