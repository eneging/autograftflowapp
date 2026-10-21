import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ETIQUETA_TIPO, type DocumentoDetalle } from "../../../shared/plataforma";
import { enlaceWhatsApp } from "../api";
import { copiar } from "../compartir";
import { plataforma, urls } from "./api";
import { Editor } from "./Editor";
import { InsigniaDoc, fechaHora } from "./Panel";
import { usarSesion } from "./sesion";
import { NavPaginas, PaginaPdf, posicion, usarPdf } from "./VisorPdf";

/** Página de un documento: editor si es borrador, seguimiento si ya se envió. */
export function DocumentoPagina() {
  const id = Number(useParams().id);
  const [d, setD] = useState<DocumentoDetalle | null>(null);
  const [error, setError] = useState("");
  // Al quitar una página cambia el PDF: el editor se vuelve a armar (versión) con un aviso.
  const [version, setVersion] = useState(0);
  const [avisoEditor, setAvisoEditor] = useState("");
  useEffect(() => {
    setD(null);
    setError("");
    plataforma.documento(id).then(setD).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <div className="card"><div className="afAlerta">{error}</div><Link to="/app">← Mis documentos</Link></div>;
  if (!d) return <div className="card"><p id="loading">Cargando documento…</p></div>;
  // La clave reinicia el editor al pasar a otro documento (p. ej. a la copia de una plantilla).
  return d.estado === "borrador"
    ? <Editor key={`${d.id}-${version}`} inicial={d} alEnviar={setD} avisoInicial={avisoEditor}
        alCambiarPdf={(nuevo, aviso) => { setAvisoEditor(aviso); setD(nuevo); setVersion((v) => v + 1); }} />
    : <Seguimiento key={d.id} d={d} recargar={() => plataforma.documento(id).then(setD)} />;
}

/** Comparte un PDF como archivo (menú del celular → WhatsApp) o, si no se puede, lo descarga. */
export async function compartirArchivo(url: string, nombre: string, texto: string) {
  try {
    const r = await fetch(url, { credentials: "same-origin" });
    const archivo = new File([await r.blob()], `${nombre}.pdf`, { type: "application/pdf" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [archivo] }))) {
      await navigator.share({ title: nombre, text: texto, files: [archivo] });
      return;
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return;
  }
  const a = document.createElement("a");
  a.href = `${url}${url.includes("?") ? "&" : "?"}descargar=1`;
  a.click();
}

function Seguimiento({ d, recargar }: { d: DocumentoDetalle; recargar: () => void }) {
  const { usuario } = usarSesion();
  const navegar = useNavigate();
  const completo = d.estado === "completado";
  const { doc } = usarPdf(completo ? urls.final(d.id) : urls.original(d.id));
  const [pagina, setPagina] = useState(1);
  const [copiado, setCopiado] = useState<number | null>(null);
  const [recordado, setRecordado] = useState<Record<number, string>>({});
  async function recordar(firmanteId: number) {
    setRecordado((r) => ({ ...r, [firmanteId]: "Enviando…" }));
    try {
      await plataforma.recordar(d.id, firmanteId);
      setRecordado((r) => ({ ...r, [firmanteId]: "✓ Recordatorio enviado" }));
      recargar();
    } catch (e) {
      setRecordado((r) => ({ ...r, [firmanteId]: (e as Error).message }));
    }
  }
  const firmados = d.firmantes.filter((f) => f.estado === "firmado").length;
  const totalPaginas = completo ? (doc?.numPages ?? d.paginas.length) : d.paginas.length;
  const tamano = d.paginas[pagina - 1] ?? { ancho: 612, alto: 792 }; // las páginas del certificado son tamaño carta
  const nombreArchivo = `${d.nombre}_firmado`.replace(/\s+/g, "_");

  const turnoDe = (orden: number) =>
    d.orden === "paralelo" || d.firmantes.filter((f) => f.orden < orden).every((f) => f.estado === "firmado");
  const textoInvitacion = (nombre: string, token: string) =>
    `Hola ${nombre}, ${usuario && !usuario.invitado ? usuario.nombre : "un usuario de AutograFlow"} te envió «${d.nombre}» para firmar en AutograFlow.${d.mensaje ? ` ${d.mensaje}` : ""} Ábrelo aquí: ${urls.enlaceFirmante(token)}`;

  async function anular() {
    if (!confirm("¿Anular este documento? Los firmantes ya no podrán firmarlo.")) return;
    await plataforma.eliminar(d.id);
    recargar();
  }

  return (
    <>
      <div className="card">
        <Link to="/app" className="enlace">← Mis documentos</Link>
        <h1>{d.nombre}</h1>
        <div className="notice">
          <InsigniaDoc estado={d.estado} /> {firmados} de {d.firmantes.length} firmaron · enviado {fechaHora(d.enviadoEn)}
          {d.completadoEn && <> · completado {fechaHora(d.completadoEn)}</>}
          <div className="progreso"><span style={{ width: `${(firmados / Math.max(1, d.firmantes.length)) * 100}%` }} /></div>
        </div>

        {completo && (
          <div className="readyBar">
            <button type="button" className="success" onClick={() => compartirArchivo(urls.final(d.id), nombreArchivo, `Documento firmado: ${d.nombre}`)}>💬 Enviar PDF firmado por WhatsApp</button>
            <a className="boton" href={urls.final(d.id, true)}>⬇️ Descargar PDF firmado</a>
          </div>
        )}

        <h2>Firmantes {d.orden === "secuencial" ? "(en orden)" : "(todos a la vez)"}</h2>
        <div className="listaFirmantes">
          {d.firmantes.map((f) => {
            const turno = turnoDe(f.orden);
            return (
              <div className="firmanteSeguimiento" key={f.id} style={{ "--c": f.color } as CSSProperties}>
                <div className="firmanteSeguimientoCab">
                  <span className="punto" />
                  <strong>{f.orden}. {f.nombre}</strong>
                  <span className={`insignia f-${f.estado === "pendiente" && !turno ? "espera" : f.estado}`}>
                    {f.estado === "firmado" ? "Firmó" : f.estado === "rechazado" ? "Rechazó" : turno ? "Pendiente" : "Espera su turno"}
                  </span>
                </div>
                <small>
                  {[f.telefono, f.email].filter(Boolean).join(" · ") || "Sin contacto"}
                  {f.abiertoEn && <> · abrió {fechaHora(f.abiertoEn)}</>}
                  {f.firmadoEn && <> · {f.estado === "rechazado" ? "rechazó" : "firmó"} {fechaHora(f.firmadoEn)}</>}
                </small>
                {f.motivoRechazo && <div className="afAlerta">Motivo: {f.motivoRechazo}</div>}
                {recordado[f.id] && recordado[f.id] !== "Enviando…" && <small className="avisoRecordatorio">{recordado[f.id]}</small>}
                {d.estado === "en_firma" && f.estado === "pendiente" && f.token && (
                  <div className="row">
                    {turno && usuario && f.email.toLowerCase() === usuario.email.toLowerCase() && (
                      <Link className="boton success" to={`/f/${f.token}`}>✍️ Firmar ahora (eres tú)</Link>
                    )}
                    <a className="boton primary" target="_blank" rel="noopener noreferrer" href={enlaceWhatsApp(textoInvitacion(f.nombre, f.token), f.telefono)}>💬 Enviar por WhatsApp</a>
                    <button type="button" onClick={async () => { if (await copiar(urls.enlaceFirmante(f.token!))) { setCopiado(f.id); setTimeout(() => setCopiado(null), 2000); } }}>
                      {copiado === f.id ? "✓ Copiado" : "🔗 Copiar enlace"}
                    </button>
                    {f.email && turno && (
                      <button type="button" disabled={recordado[f.id] === "Enviando…"} onClick={() => recordar(f.id)}>📧 Recordar por correo</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="row">
          <button type="button" onClick={async () => { navegar(`/app/d/${(await plataforma.duplicar(d.id)).id}`); }}>📄 Usar de nuevo (copia en borrador)</button>
          {d.estado === "en_firma" && <button type="button" className="danger" onClick={anular}>Anular documento</button>}
        </div>
      </div>

      <div className="card">
        <h2>{completo ? "Documento firmado" : "Documento"}</h2>
        <NavPaginas actual={pagina} total={totalPaginas} alCambiar={setPagina} />
        <div className="preview">
          <PaginaPdf doc={doc} numero={pagina} pagina={tamano}>
            {!completo && d.campos.filter((c) => c.pagina === pagina).map((c) => {
              const f = d.firmantes.find((x) => x.clave === c.firmante);
              const quien = c.tipo === "calculo" ? "lo calcula el PDF" : f?.nombre ?? "lo llenaste tú";
              return (
                <div key={c.id} className={`campoEditor lectura tipo-${c.tipo} ${c.lleno ? "lleno" : ""}`} style={{ ...posicion(c, tamano), "--c": f?.color ?? "#dc2626" } as CSSProperties} title={`${c.etiqueta || ETIQUETA_TIPO[c.tipo]} — ${quien}`}>
                  {c.lleno && ["firma", "sello", "huella"].includes(c.tipo)
                    ? <img src={urls.imagenDueno(d.id, c.id)} alt={ETIQUETA_TIPO[c.tipo]} />
                    : typeof c.valor === "string" && c.valor && c.tipo !== "fecha" ? <span className="campoEditorTexto valorLleno">{c.valor}</span>
                    : ["texto", "fecha", "casilla", "calculo"].includes(c.tipo) ? (c.lleno ? <span className="campoEditorTexto">✓</span> : null)
                    : <span className="campoEditorTexto">{c.lleno ? "✓" : ""} {c.etiqueta || ETIQUETA_TIPO[c.tipo]}</span>}
                </div>
              );
            })}
          </PaginaPdf>
        </div>
        {completo && d.sha256Final && <p className="afExtraHint huella">Huella SHA-256 del PDF firmado: <code>{d.sha256Final}</code></p>}
      </div>

      <div className="card">
        <h2>Historial</h2>
        <ul className="historial">
          {d.eventos.map((e, i) => (
            <li key={i}><time>{fechaHora(e.creadoEn)}</time> {e.detalle}{e.firmante ? ` — ${e.firmante}` : ""}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
