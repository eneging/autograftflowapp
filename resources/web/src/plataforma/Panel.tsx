import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ETIQUETA_ESTADO, LIMITES_PLATAFORMA, type EstadoDocumento } from "../../../shared/plataforma";
import type { EstadoCuenta } from "../../../shared/planes";
import { plataforma, type FilaDocumento } from "./api";
import { usarSesion } from "./sesion";
import { AvisoInvitado, CupoPanel } from "./Planes";
import { GuiaProceso, usarGuia } from "./GuiaProceso";
import { CargaLogoPantalla } from "../componentes/CargaLogo";

export const InsigniaDoc = ({ estado }: { estado: EstadoDocumento }) => <span className={`insignia doc-${estado}`}>{ETIQUETA_ESTADO[estado]}</span>;
export const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** «Mis documentos»: subir un PDF nuevo y ver el estado de los enviados. */
export function Panel() {
  const { guia, seguirDocumento } = usarGuia();
  const { usuario } = usarSesion();
  const navegar = useNavigate();
  const [filas, setFilas] = useState<FilaDocumento[] | null>(null);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [avance, setAvance] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const [estado, setEstado] = useState<EstadoCuenta | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    plataforma.documentos().then(setFilas).catch((e) => setError(e.message));
    plataforma.cuenta().then((d) => setEstado(d.estado)).catch(() => {});
  }, []);

  /**
   * Elimina un documento de la lista: el borrador y el terminado (completado, rechazado o anulado) se borran del todo;
   * el que sigue en firma primero se anula (los firmantes ya no podrán firmarlo) y después se borra.
   */
  async function eliminarFila(d: FilaDocumento) {
    const aviso = d.estado === "borrador" ? `¿Eliminar el borrador «${d.nombre}»?`
      : d.estado === "en_firma" ? `«${d.nombre}» sigue en firma: se anulará (los firmantes ya no podrán firmarlo) y se eliminará con su historial. ¿Continuar?`
      : `¿Eliminar «${d.nombre}» definitivamente? Se borran el PDF${d.estado === "completado" ? " firmado" : ""}, las firmas y el historial, y ya no se podrá verificar. Descárgalo antes si lo necesitas.`;
    if (!confirm(`${aviso} No se puede deshacer.`)) return;
    try {
      if ((await plataforma.eliminar(d.id)).resultado === "anulado") await plataforma.eliminar(d.id);
      setFilas((fs) => fs && fs.filter((x) => x.id !== d.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function subir(archivo?: File) {
    if (!archivo) return;
    if (archivo.type !== "application/pdf" && !/\.pdf$/i.test(archivo.name)) return setError("El archivo debe ser un PDF.");
    if (archivo.size > LIMITES_PLATAFORMA.pdfBytes) return setError(`El PDF pesa más de ${LIMITES_PLATAFORMA.pdfBytes / 1024 / 1024} MB.`);
    setSubiendo(true);
    setAvance(0);
    setError("");
    try {
      const r = await plataforma.subir(archivo, setAvance);
      seguirDocumento(r.id, 2, true);
      // El editor pregunta primero quién firma (tú, otras personas o ambos) para mostrar solo lo que hace falta.
      navegar(`/app/d/${r.id}`, { state: { detectados: r.camposDetectados, preguntarQuien: true } });
    } catch (e) {
      // Los errores de prepararPdf (PDF protegido, dañado…) ya traen un mensaje para la persona.
      setError(e instanceof Error && e.message ? e.message : "No se pudo subir el archivo.");
      setSubiendo(false);
    }
  }

  return (
    <>
      <GuiaProceso etapa="panel" cargando={!filas} documentoDisponible={!!filas?.some(d => d.id === guia.documentoId)} />
      {subiendo && <CargaLogoPantalla avance={avance}
        texto={avance < 0.4 ? "Leyendo el PDF y detectando sus campos…" : avance < 0.95 ? "Subiendo el documento…" : "Preparando el editor…"} />}
      <div className="card">
        <h1>Preparar documento</h1>
        <p>Hola{usuario && !usuario.invitado ? `, ${usuario.nombre}` : ""}. Sube un PDF, marca dónde firma cada persona y envíalo por WhatsApp.</p>
        <CupoPanel estado={estado} />
        {usuario?.invitado && <AvisoInvitado />}
        {filas && filas.length === 0 && <section className="primerDocumento" aria-labelledby="primerDocumentoTitulo">
          <h2 id="primerDocumentoTitulo">Tu primer documento, paso a paso</h2>
          <ol><li><strong>Sube tu PDF</strong> desde el botón de abajo.</li><li>Añade firmantes y coloca sus campos.</li><li>Revisa y comparte el enlace por WhatsApp.</li></ol>
        </section>}
        <div className="step">
          <div className="stepTitle"><span className="stepNumber">1</span>Documento PDF</div>
          <div
            role="button" tabIndex={0} aria-label="Seleccionar PDF"
            data-guia="subir"
            className={`filebtn primary dropZone ${arrastrando ? "dragover" : ""}`}
            onClick={() => !subiendo && entrada.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), entrada.current?.click())}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastrando(false); subir(e.dataTransfer.files[0]); }}
          >
            {subiendo ? "⏳ Subiendo y preparando el documento…" : "📄 Seleccionar PDF"}
            <span className="small">{subiendo ? "Detectando sus campos" : "o arrastra el PDF aquí"}</span>
          </div>
          <p className="small centro">Hasta {LIMITES_PLATAFORMA.pdfBytes / 1024 / 1024} MB y {LIMITES_PLATAFORMA.paginas} páginas. Si el PDF trae campos para llenar, se detectan solos.</p>
          <input ref={entrada} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {error && <div className="afAlerta" role="alert">{error}</div>}
      </div>

      {filas && filas.some((d) => d.esPlantilla) && (
        <div className="card">
          <h2>Plantillas</h2>
          <p className="afExtraHint">Documentos preparados una vez para usarlos muchas veces.</p>
          <div className="listaDocs">
            {filas.filter((d) => d.esPlantilla).map((d) => (
              <div className="filaDoc plantillaFila" key={d.id}>
                <div className="filaDocTitulo">
                  <strong>📋 {d.nombre}</strong>
                  <span className="row">
                    <Link className="boton" to={`/app/d/${d.id}`}>✏️ Editar</Link>
                    <button type="button" className="danger" onClick={async () => {
                      if (!confirm(`¿Eliminar la plantilla «${d.nombre}»? Los documentos que creaste con ella no cambian. No se puede deshacer.`)) return;
                      try { await plataforma.eliminar(d.id); setFilas((fs) => fs && fs.filter((x) => x.id !== d.id)); }
                      catch (e) { setError((e as Error).message); }
                    }}>🗑️ Eliminar</button>
                    <button type="button" className="primary" onClick={async () => navegar(`/app/d/${(await plataforma.duplicar(d.id)).id}`)}>Usar plantilla</button>
                  </span>
                </div>
                <div className="filaDocInfo">{d.firmantes} firmante(s)</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Documentos</h2>
        {!filas ? <p id="loading">Cargando…</p> : filas.filter((d) => !d.esPlantilla).length === 0 ? (
          <p>Aquí verás tus documentos y el avance de sus firmas. Empieza seleccionando tu primer PDF arriba.</p>
        ) : (
          <div className="listaDocs">
            {filas.filter((d) => !d.esPlantilla).map((d) => (
              <Link className="filaDoc" key={d.id} to={`/app/d/${d.id}`}>
                <div className="filaDocTitulo">
                  <strong>{d.nombre}</strong>
                  <span className="filaDocAcciones">
                    <InsigniaDoc estado={d.estado} />
                    <button type="button" className="botonIcono filaDocBorrar" title="Eliminar documento" aria-label={`Eliminar «${d.nombre}»`}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); eliminarFila(d); }}>🗑️</button>
                  </span>
                </div>
                <div className="filaDocInfo">
                  {d.estado === "borrador" ? `Creado ${fechaHora(d.creadoEn)}` : `Enviado ${fechaHora(d.enviadoEn)}`}
                  {d.estado !== "borrador" && <> · {d.firmados} de {d.firmantes} firmaron</>}
                </div>
                {d.estado === "en_firma" && <div className="progreso"><span style={{ width: `${(d.firmados / Math.max(1, d.firmantes)) * 100}%` }} /></div>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
