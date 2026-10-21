import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { EstadoDocumento, Pagina } from "../../../shared/plataforma";
import { enlaceWhatsApp } from "../api";
import { ErrorApi, plataforma, urls, type Contacto, type Destinatario, type EnvioPlantilla, type ResultadoEnvio } from "./api";
import { InsigniaDoc, fechaHora } from "./Panel";
import { usarSesion } from "./sesion";
import { NavPaginas, PaginaPdf, usarPdf } from "./VisorPdf";

const SIN_CATEGORIA = "Sin categoría";
const clave = (d: Destinatario) => `${d.nombre.trim().toLowerCase()}|${d.telefono.replace(/\D/g, "")}|${d.email.trim().toLowerCase()}`;
const contactable = (c: Pick<Contacto, "telefono" | "email">) => !!(c.telefono || c.email);

/** Ventana con Escape para cerrar. */
function usarEscape(alCerrar: () => void) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [alCerrar]);
}

/**
 * «Enviar a varios»: elige a quiénes (del Directorio, por categoría o escribiéndolos) y se crea y envía un documento por
 * persona, en el lugar del firmante elegido. Al final muestra el enlace de cada uno para mandarlo por WhatsApp.
 */
export function EnviarAVarios({ plantilla, nombrePlantilla, firmantes, guardar, alCerrar }: {
  plantilla: number; nombrePlantilla: string; firmantes: { nombre: string }[];
  /** Guarda la plantilla antes de enviar (el editor guarda los cambios solo cada tanto). */
  guardar: () => Promise<unknown>; alCerrar: (huboEnvios: boolean) => void;
}) {
  const { usuario } = usarSesion();
  const [orden, setOrden] = useState(1);
  const [contactos, setContactos] = useState<Contacto[] | null>(null);
  const [buscar, setBuscar] = useState("");
  const [elegidos, setElegidos] = useState<Destinatario[]>([]);
  const [nuevo, setNuevo] = useState<Destinatario>({ nombre: "", telefono: "", email: "" });
  const [errorNuevo, setErrorNuevo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [resultados, setResultados] = useState<ResultadoEnvio[] | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const cerrar = useCallback(() => !enviando && alCerrar(!!resultados?.some((r) => r.token)), [enviando, alCerrar, resultados]);
  usarEscape(cerrar);
  useEffect(() => { plataforma.contactos().then(setContactos).catch(() => setContactos([])); }, []);

  const claves = useMemo(() => new Set(elegidos.map(clave)), [elegidos]);
  const grupos = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const lista = (contactos ?? []).filter((c) => !q || [c.nombre, c.telefono, c.email, c.categoria].some((x) => x.toLowerCase().includes(q)));
    const porCategoria = new Map<string, Contacto[]>();
    for (const c of lista) {
      const k = c.categoria || SIN_CATEGORIA;
      porCategoria.set(k, [...(porCategoria.get(k) ?? []), c]);
    }
    return [...porCategoria.entries()].sort(([a], [b]) => (a === SIN_CATEGORIA ? 1 : b === SIN_CATEGORIA ? -1 : a.localeCompare(b, "es")));
  }, [contactos, buscar]);

  const aDestinatario = (c: Contacto): Destinatario => ({ nombre: c.nombre, telefono: c.telefono, email: c.email });
  function alternar(c: Contacto) {
    const d = aDestinatario(c), k = clave(d);
    setElegidos((l) => (l.some((x) => clave(x) === k) ? l.filter((x) => clave(x) !== k) : [...l, d]));
  }
  function alternarGrupo(lista: Contacto[]) {
    const validos = lista.filter(contactable).map(aDestinatario);
    const todos = validos.every((d) => claves.has(clave(d)));
    setElegidos((l) => (todos ? l.filter((x) => !validos.some((d) => clave(d) === clave(x))) : [...l, ...validos.filter((d) => !l.some((x) => clave(x) === clave(d)))]));
  }
  function agregarNuevo() {
    const d = { nombre: nuevo.nombre.trim(), telefono: nuevo.telefono.trim(), email: nuevo.email.trim() };
    if (d.nombre.length < 2) return setErrorNuevo("Escribe su nombre.");
    if (d.telefono && !/^[+\d][\d\s()-]{6,}$/.test(d.telefono)) return setErrorNuevo("El número de WhatsApp no parece válido.");
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return setErrorNuevo("El correo electrónico no parece válido.");
    if (!d.telefono && !d.email) return setErrorNuevo("Escribe su WhatsApp o su correo.");
    if (claves.has(clave(d))) return setErrorNuevo("Ya está en la lista.");
    setElegidos((l) => [...l, d]);
    setNuevo({ nombre: "", telefono: "", email: "" });
    setErrorNuevo("");
  }

  async function enviar() {
    if (!elegidos.length) return;
    if (!confirm(`Se crearán ${elegidos.length} documento(s), uno por persona, y cada uno usará un envío de tu plan. ¿Enviar ahora?`)) return;
    setEnviando(true);
    setError("");
    try {
      await guardar();
      setResultados(await plataforma.enviarAVarios(plantilla, orden, elegidos));
    } catch (e) {
      setError(e instanceof ErrorApi ? (Object.values(e.campos)[0] ? `${e.message}: ${Object.values(e.campos)[0]}` : e.message) : "No se pudo enviar.");
    } finally {
      setEnviando(false);
    }
  }

  const mensaje = (r: ResultadoEnvio) =>
    `Hola ${r.nombre}, ${usuario?.nombre ?? "te"} te envió «${nombrePlantilla}» para firmar en AutograFlow. Ábrelo aquí: ${urls.enlaceFirmante(r.token!)}`;
  async function copiar(r: ResultadoEnvio) {
    try { await navigator.clipboard.writeText(urls.enlaceFirmante(r.token!)); setCopiado(r.token); setTimeout(() => setCopiado(null), 1800); } catch { /* sin portapapeles */ }
  }

  if (resultados) {
    const ok = resultados.filter((r) => r.token);
    return (
      <div className="modalAf" onClick={(e) => e.target === e.currentTarget && cerrar()}>
        <div className="modalCard envioVarios" role="dialog" aria-modal="true" aria-label="Resultado del envío">
          <h2>📨 {ok.length === resultados.length ? `Enviado a ${ok.length} persona(s)` : `Enviado a ${ok.length} de ${resultados.length}`}</h2>
          <p className="small">Quienes tienen correo lo reciben automáticamente. A los demás, mándales su enlace por WhatsApp con el botón de cada uno. Cada documento aparece en el historial de esta plantilla y en «Mis documentos».</p>
          <ul className="listaResultados">
            {resultados.map((r, i) => (
              <li key={i} className={r.token ? "ok" : "fallo"}>
                <div>
                  <strong>{r.token ? "✓" : "✕"} {r.nombre}</strong>
                  <span className="small">{[r.telefono, r.email].filter(Boolean).join(" · ")}</span>
                  {r.error && <span className="small textoError">{r.error}</span>}
                  {r.esperaTurno && <span className="small">Su enlace se activa cuando firmen los anteriores.</span>}
                </div>
                {r.token && (
                  <div className="row accionesResultado">
                    <a className="boton green botonChico" target="_blank" rel="noopener noreferrer" href={enlaceWhatsApp(mensaje(r), r.telefono)}>💬 WhatsApp</a>
                    <button type="button" className="botonChico" onClick={() => copiar(r)}>{copiado === r.token ? "✓ Copiado" : "🔗 Copiar enlace"}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="row pie"><button type="button" className="primary" onClick={cerrar}>Listo</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="modalAf" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="modalCard envioVarios" role="dialog" aria-modal="true" aria-label="Enviar a varios">
        <h2>📨 Enviar a varios</h2>
        <p className="small">Se crea un documento por persona con esta plantilla y se le envía. Cada uno firma su propio documento.</p>

        {firmantes.length > 1 && (
          <fieldset className="ladoEnvio">
            <legend>¿Qué firmante cambia en cada envío?</legend>
            {firmantes.map((f, i) => (
              <label key={i} className="checkrow compacto">
                <input type="radio" name="ordenEnvio" checked={orden === i + 1} onChange={() => setOrden(i + 1)} />
                <span>Firmante {i + 1}{f.nombre && !/^Firmante \d+$/.test(f.nombre) ? ` · ${f.nombre}` : ""}</span>
              </label>
            ))}
            <small className="small">Los demás firmantes se mantienen como están en la plantilla, con su WhatsApp y su correo.</small>
          </fieldset>
        )}

        <div className="elegirDestinatarios">
          <div className="afDirHead">
            <strong>Desde tu Directorio</strong>
            <input type="search" placeholder="Buscar por nombre, número, correo o categoría" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          </div>
          {!contactos ? <p className="small">Cargando contactos…</p> : !contactos.length ? (
            <p className="small">Aún no tienes contactos. Agrégalos abajo o en <Link to="/app/estadisticas">Directorio</Link>.</p>
          ) : (
            <div className="gruposContactos">
              {grupos.map(([cat, lista]) => {
                const validos = lista.filter(contactable);
                const todos = validos.length > 0 && validos.every((c) => claves.has(clave(aDestinatario(c))));
                return (
                  <section key={cat} className="grupoContactos">
                    <label className="checkrow compacto grupoTitulo">
                      <input type="checkbox" checked={todos} disabled={!validos.length} onChange={() => alternarGrupo(lista)} />
                      <strong>{cat}</strong><span className="small">({lista.length}) · elegir a todo el grupo</span>
                    </label>
                    {lista.map((c) => (
                      <label key={c.nombre} className={`checkrow compacto ${contactable(c) ? "" : "afInactiva"}`} title={contactable(c) ? undefined : "No tiene WhatsApp ni correo"}>
                        <input type="checkbox" disabled={!contactable(c)} checked={claves.has(clave(aDestinatario(c)))} onChange={() => alternar(c)} />
                        <span>{c.nombre} <span className="small">{[c.telefono, c.email].filter(Boolean).join(" · ") || "sin WhatsApp ni correo"}</span></span>
                      </label>
                    ))}
                  </section>
                );
              })}
              {!grupos.length && <p className="small">No hay contactos que coincidan con la búsqueda.</p>}
            </div>
          )}
        </div>

        <div className="nuevoDestinatario">
          <strong>O escribe a alguien nuevo</strong>
          <div className="filaNuevo">
            <input placeholder="Nombre" maxLength={120} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
            <input placeholder="WhatsApp" inputMode="tel" maxLength={30} value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} />
            <input placeholder="Correo" type="email" maxLength={160} value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregarNuevo())} />
            <button type="button" onClick={agregarNuevo}>＋ Agregar</button>
          </div>
          {errorNuevo && <small className="errorCampo">{errorNuevo}</small>}
        </div>

        {elegidos.length > 0 && (
          <div className="elegidos" aria-live="polite">
            <strong>{elegidos.length} destinatario(s)</strong>
            <div className="chips">
              {elegidos.map((d) => (
                <span key={clave(d)} className="chip">{d.nombre}
                  <button type="button" aria-label={`Quitar a ${d.nombre}`} onClick={() => setElegidos((l) => l.filter((x) => clave(x) !== clave(d)))}>×</button>
                </span>
              ))}
            </div>
          </div>
        )}
        {error && <div className="afAlerta" role="alert">{error}</div>}
        <div className="row pie">
          <button type="button" onClick={cerrar} disabled={enviando}>Cancelar</button>
          <button type="button" className="primary" disabled={!elegidos.length || enviando} onClick={enviar}>
            {enviando ? "Enviando…" : `📨 Enviar a ${elegidos.length || ""} persona${elegidos.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const FILTROS: { v: "todos" | EstadoDocumento; t: string }[] = [
  { v: "todos", t: "Todos" }, { v: "completado", t: "Firmados" }, { v: "en_firma", t: "En firma" }, { v: "rechazado", t: "Rechazados" }, { v: "borrador", t: "Borradores" }, { v: "anulado", t: "Anulados" },
];

/** Historial de la plantilla: los documentos creados con ella, quién firmó y cuándo, con vista previa y descarga. */
export function HistorialPlantilla({ plantilla, recarga }: { plantilla: number; recarga: number }) {
  const [envios, setEnvios] = useState<EnvioPlantilla[] | null>(null);
  const [abierto, setAbierto] = useState(true);
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["v"]>("todos");
  const [viendo, setViendo] = useState<EnvioPlantilla | null>(null);
  useEffect(() => { plataforma.envios(plantilla).then(setEnvios).catch(() => setEnvios([])); }, [plantilla, recarga]);

  const lista = (envios ?? []).filter((e) => (filtro === "todos" || e.estado === filtro)
    && (!buscar.trim() || [e.nombre, ...e.firmantes.map((f) => f.nombre)].some((x) => x.toLowerCase().includes(buscar.trim().toLowerCase()))));
  const firmados = (envios ?? []).filter((e) => e.estado === "completado").length;

  return (
    <section className="historialPlantilla">
      <button type="button" className="historialCabecera" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <span>{abierto ? "▾" : "▸"} 📬 Enviados con esta plantilla</span>
        <span className="small">{envios ? `${envios.length} documento(s) · ${firmados} firmado(s)` : "Cargando…"}</span>
      </button>
      {abierto && envios && (
        <>
          {envios.length > 0 && (
            <div className="historialFiltros">
              <input type="search" placeholder="Buscar por nombre" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
              <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Filtrar por estado">
                {FILTROS.map((f) => <option key={f.v} value={f.v}>{f.t}</option>)}
              </select>
              {firmados > 0 && <a className="boton botonChico" href={urls.zipFirmados(plantilla)}>⬇️ Descargar firmados (ZIP)</a>}
            </div>
          )}
          {!envios.length ? (
            <p className="small">Todavía no enviaste esta plantilla. Usa «📨 Enviar a varios» o «📋 Usar esta plantilla»; cada documento que crees aparecerá aquí con su estado. (Los creados antes de esta función no se muestran.)</p>
          ) : (
            <ul className="listaEnvios">
              {lista.map((e) => (
                <li key={e.id}>
                  <Link to={`/app/d/${e.id}`} className="envioInfo" title="Abrir el documento con su historial">
                    <strong>{e.firmantes.map((f) => f.nombre).join(", ") || e.nombre}</strong>
                    <span className="small">
                      <InsigniaDoc estado={e.estado} />{" "}
                      {e.enviadoEn ? `Enviado ${fechaHora(e.enviadoEn)}` : `Creado ${fechaHora(e.creadoEn)}`}
                      {e.completadoEn && ` · Firmado ${fechaHora(e.completadoEn)}`}
                      {e.estado === "en_firma" && ` · ${e.firmantes.filter((f) => f.estado === "firmado").length} de ${e.firmantes.length} firmaron`}
                    </span>
                  </Link>
                  {e.estado === "completado" ? (
                    <div className="row accionesEnvio">
                      <button type="button" className="botonChico" onClick={() => setViendo(e)}>👁 Ver</button>
                      <a className="boton botonChico" href={urls.final(e.id, true)}>⬇️ PDF</a>
                    </div>
                  ) : <Link className="boton botonChico" to={`/app/d/${e.id}`}>Abrir</Link>}
                </li>
              ))}
              {!lista.length && <li className="small">No hay documentos con ese filtro.</li>}
            </ul>
          )}
        </>
      )}
      {viendo && <VistaPreviaPdf titulo={viendo.firmantes.map((f) => f.nombre).join(", ") || viendo.nombre} url={urls.final(viendo.id)} descarga={urls.final(viendo.id, true)} alCerrar={() => setViendo(null)} />}
    </section>
  );
}

/** Vista previa de un PDF firmado, con «Descargar PDF» dentro. */
function VistaPreviaPdf({ titulo, url, descarga, alCerrar }: { titulo: string; url: string; descarga: string; alCerrar: () => void }) {
  const { doc, error } = usarPdf(url);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState<Pagina>({ ancho: 612, alto: 792 });
  usarEscape(alCerrar);
  useEffect(() => {
    if (!doc) return;
    let vigente = true;
    doc.getPage(pagina).then((p) => { const v = p.getViewport({ scale: 1 }); if (vigente) setTamano({ ancho: v.width, alto: v.height }); });
    return () => { vigente = false; };
  }, [doc, pagina]);
  return (
    <div className="modalAf" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="modalCard vistaPreviaPdf" role="dialog" aria-modal="true" aria-label={`Documento firmado: ${titulo}`}>
        <div className="vistaPreviaCabecera">
          <h2>{titulo}</h2>
          <div className="row">
            <a className="boton primary botonChico" href={descarga}>⬇️ Descargar PDF</a>
            <button type="button" className="botonChico" onClick={alCerrar}>Cerrar</button>
          </div>
        </div>
        {error ? <div className="afAlerta">{error}</div> : (
          <>
            <NavPaginas actual={pagina} total={doc?.numPages ?? 1} alCambiar={setPagina} />
            <div className="preview"><PaginaPdf doc={doc} numero={pagina} pagina={tamano} /></div>
          </>
        )}
      </div>
    </div>
  );
}
