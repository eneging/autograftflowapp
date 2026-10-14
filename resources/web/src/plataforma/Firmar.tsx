import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { formatoFecha } from "../../../shared/calculos";
import { ETIQUETA_TIPO, TIPOS_IMAGEN, leerDedo, type VistaFirmante } from "../../../shared/plataforma";
import { enlaceWhatsApp } from "../api";
import { AvisoPrivacidad } from "../componentes/Marco";
import { PantallaFirma, type TipoImagen } from "../componentes/PantallaFirma";
import { ErrorApi, plataforma, urls } from "./api";
import { compartirArchivo } from "./Documento";
import { NavPaginas, PaginaPdf, posicion, usarPdf } from "./VisorPdf";

type Campo = VistaFirmante["campos"][number];
type Valores = Record<number, string | boolean>;
const hoyIso = () => new Date().toLocaleDateString("sv");

/** Página del firmante: abre su enlace, llena sus campos, firma y envía. */
export function Firmar() {
  const { token = "" } = useParams();
  const [v, setV] = useState<VistaFirmante | null>(null);
  const [error, setError] = useState("");
  const cargar = useCallback(() => plataforma.vista(token).then(setV).catch((e) => setError(e instanceof ErrorApi && e.status === 404 ? "Este enlace no es válido." : e.message)), [token]);
  useEffect(() => { cargar(); }, [cargar]);

  if (error) return <div className="card"><div className="afAlerta">{error}</div></div>;
  if (!v) return <div className="card"><p id="loading">Cargando documento...</p></div>;
  if (v.documento.estado === "rechazado") return <Aviso v={v} token={token} titulo="Documento rechazado" texto="Uno de los firmantes rechazó este documento, así que ya no se puede firmar." />;
  if (v.yo.estado === "firmado" || v.documento.estado === "completado") return <Terminado v={v} token={token} />;
  if (v.yo.estado === "rechazado") return <Aviso v={v} token={token} titulo="Rechazaste este documento" texto="Quien te lo envió ya fue notificado." />;
  if (!v.turno) return <Aviso v={v} token={token} titulo={`Todavía no es tu turno — Firmante ${v.yo.orden}`} texto={`Este documento se firma en orden. Falta que firme ${v.esperando}. Vuelve a abrir este enlace cuando te avisen.`} />;
  return <Llenar v={v} token={token} alTerminar={cargar} />;
}

function LogoEmpresa({ v, token }: { v: VistaFirmante; token: string }) {
  return v.documento.logo ? <div className="logoEmpresa"><img src={urls.logoFirmante(token)} alt={v.documento.empresa} /></div> : null;
}

function Aviso({ v, token, titulo, texto }: { v: VistaFirmante; token: string; titulo: string; texto: string }) {
  return (
    <div className="card">
      <LogoEmpresa v={v} token={token} />
      <h1>{titulo}</h1>
      <div className="notice"><strong>{v.documento.nombre}</strong><br />{texto}</div>
    </div>
  );
}

function Terminado({ v, token }: { v: VistaFirmante; token: string }) {
  const completo = v.documento.estado === "completado";
  const sig = v.siguiente;
  return (
    <div className="card">
      <LogoEmpresa v={v} token={token} />
      <h1>{completo ? "✓ Documento firmado por todos" : `✓ Firmaste el documento — Firmante ${v.yo.orden}`}</h1>
      <div className="okNotice">
        <strong>{v.documento.nombre}</strong><br />
        {completo ? "Todos los firmantes completaron el documento. Ya puedes descargarlo con su certificado de firmas."
          : sig ? `Ahora le toca a ${sig.nombre} (Firmante ${v.yo.orden + 1}).` : "Tu firma quedó registrada. Cuando firmen los demás, el documento estará listo."}
      </div>
      {completo && (
        <div className="readyBar">
          <button type="button" className="success" onClick={() => compartirArchivo(urls.finalFirmante(token), `${v.documento.nombre}_firmado`.replace(/\s+/g, "_"), `Documento firmado: ${v.documento.nombre}`)}>
            💬 Enviar PDF firmado por WhatsApp
          </button>
          <a className="boton" href={urls.finalFirmante(token, true)}>⬇️ Descargar PDF firmado</a>
        </div>
      )}
      {!completo && sig && (
        <div className="siguiente">
          <strong>Firmante {v.yo.orden + 1} · {sig.nombre}</strong>
          <p>Avísale que ya puede firmar.</p>
          <a className="boton primary ancho" target="_blank" rel="noopener noreferrer"
            href={enlaceWhatsApp(`Hola ${sig.nombre}, ya firmé «${v.documento.nombre}». Ahora te toca a ti: ${urls.enlaceFirmante(sig.enlace)}`, sig.telefono)}>
            💬 Enviar al Firmante {v.yo.orden + 1} por WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}

function Llenar({ v, token, alTerminar }: { v: VistaFirmante; token: string; alTerminar: () => void }) {
  const { doc, error: errorPdf } = usarPdf(urls.originalFirmante(token));
  const mios = useMemo(() => v.campos.filter((c) => c.mio), [v]);
  const [valores, setValores] = useState<Valores>(() => {
    // Las fechas empiezan con el día de hoy (se pueden cambiar).
    const inicial: Valores = {};
    for (const c of mios) if (c.tipo === "fecha") inicial[c.id] = hoyIso();
    return inicial;
  });
  const [pagina, setPagina] = useState(() => mios[0]?.pagina ?? 1);
  const [editando, setEditando] = useState<Campo | null>(null);
  const [imagenDe, setImagenDe] = useState<Campo | null>(null);
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [revisando, setRevisando] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const p = v.documento.paginas[pagina - 1];
  const lleno = (c: Campo) => { const x = valores[c.id]; return c.tipo === "casilla" ? x === true : Boolean(x && String(x).trim()); };
  const faltantes = mios.filter((c) => c.obligatorio && !lleno(c));
  const textos = mios.filter((c) => c.tipo === "texto" || c.tipo === "fecha");
  const imagenes = mios.filter((c) => TIPOS_IMAGEN.includes(c.tipo));
  const irA = (c: Campo) => { setPagina(c.pagina); setTimeout(() => document.querySelector(`[data-campo="${c.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 120); };
  const abrir = (c: Campo) => {
    irA(c);
    if (c.tipo === "casilla") setValores((x) => ({ ...x, [c.id]: !(x[c.id] === true) }));
    else if (TIPOS_IMAGEN.includes(c.tipo)) setImagenDe(c);
    else setEditando(c);
  };

  function revisar() {
    if (faltantes.length) {
      setErrores(Object.fromEntries(faltantes.map((c) => [c.id, "Falta"])));
      alert(`Completa: ${faltantes.slice(0, 5).map((c) => c.etiqueta || ETIQUETA_TIPO[c.tipo]).join(", ")}${faltantes.length > 5 ? "…" : ""}.`);
      abrir(faltantes[0]);
      return;
    }
    setErrores({});
    setRevisando(true);
    window.scrollTo({ top: 0 });
  }

  async function enviar() {
    setEnviando(true);
    try {
      await plataforma.firmar(token, Object.fromEntries(mios.map((c) => [String(c.id), valores[c.id] ?? (c.tipo === "casilla" ? false : "")])));
      alTerminar();
    } catch (e) {
      if (e instanceof ErrorApi && e.campos) setErrores(Object.fromEntries(Object.entries(e.campos).map(([k, m]) => [Number(k), m])));
      alert("No se pudo enviar: " + (e as Error).message);
      setRevisando(false);
    } finally {
      setEnviando(false);
    }
  }

  async function rechazar() {
    if (motivo.trim().length < 3) return alert("Escribe el motivo del rechazo.");
    try { await plataforma.rechazar(token, motivo); alTerminar(); }
    catch (e) { alert((e as Error).message); }
  }

  const contenidoCampo = (c: Campo) => {
    const x = c.mio ? valores[c.id] : c.valor;
    if (TIPOS_IMAGEN.includes(c.tipo)) {
      const src = c.mio ? (typeof x === "string" && x ? x : null) : c.imagen ? urls.imagenFirmante(token, c.id) : null;
      return src ? <img src={src} alt={ETIQUETA_TIPO[c.tipo]} /> : null;
    }
    if (c.tipo === "casilla") return x === true ? <span className="marcaCasilla">✓</span> : null;
    const t = typeof x === "string" ? (c.tipo === "fecha" ? formatoFecha(x) : x) : "";
    return t ? <span className="afTextShown">{t}</span> : null;
  };

  const vistaPagina = (interactivo: boolean) => (
    <PaginaPdf doc={doc} numero={pagina} pagina={p}>
      {v.campos.filter((c) => c.pagina === pagina).map((c) => {
        const contenido = contenidoCampo(c);
        const clase = `campoFirma tipo-${c.tipo} ${c.mio ? "mio" : "otro"} ${contenido ? "filled" : ""} ${errores[c.id] ? "invalido" : ""}`;
        const estilo = { ...posicion(c, p), "--c": v.yo.color } as CSSProperties;
        return c.mio && interactivo ? (
          <button type="button" key={c.id} data-campo={c.id} className={clase} style={estilo} onClick={() => abrir(c)} title={c.etiqueta || ETIQUETA_TIPO[c.tipo]}
            data-vacio={TIPOS_IMAGEN.includes(c.tipo) ? (c.tipo === "firma" ? "FIRMA AQUÍ" : c.tipo === "sello" ? "SELLO" : "HUELLA") : (c.etiqueta || ETIQUETA_TIPO[c.tipo])}>
            {contenido}
          </button>
        ) : (
          <div key={c.id} className={clase} style={estilo}>{contenido}</div>
        );
      })}
    </PaginaPdf>
  );

  if (revisando)
    return (
      <div className="card">
        <h2 id="finishTitle">Previsualización del documento firmado</h2>
        <p>Revisa tus datos y tu firma. Al enviar, quedarán registrados con la fecha, la hora y tu dispositivo.</p>
        <NavPaginas actual={pagina} total={v.documento.paginas.length} alCambiar={setPagina} />
        <div className="signed">{vistaPagina(false)}</div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" onClick={() => setRevisando(false)} disabled={enviando}>Volver a firmar</button>
          <button type="button" className="success" onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "✓ Firmar y enviar"}</button>
        </div>
      </div>
    );

  // El botón abre primero las firmas, luego el sello y al final la huella (y su texto dice cuál).
  const tiposPendientes = new Set(imagenes.filter((c) => !lleno(c)).map((c) => c.tipo));
  const tipoPendiente = (["firma", "sello", "huella"] as const).find((t) => tiposPendientes.has(t));
  const imagenPendiente = imagenes.find((c) => c.tipo === tipoPendiente && !lleno(c));
  return (
    <>
      <div className="card">
        <h1>Documento listo para firmar — Firmante {v.yo.orden}</h1>
        <LogoEmpresa v={v} token={token} />
        <div className="notice">
          <strong>Firmante {v.yo.orden} · {v.yo.nombre}</strong>
          <br />{v.documento.remitente}{v.documento.empresa && v.documento.empresa !== v.documento.remitente ? ` (${v.documento.empresa})` : ""} te envió este documento. Revísalo y completa los campos marcados.
          {v.documento.mensaje && <><br /><em>«{v.documento.mensaje}»</em></>}
        </div>
        <h3>{v.documento.nombre}</h3>
        <AvisoPrivacidad />

        <div className="readyBar">
          {textos.length > 0 && <button type="button" className="primary" onClick={() => abrir(textos.find((c) => !lleno(c)) ?? textos[0])}>✍️ Empezar a llenar mis datos</button>}
          {imagenPendiente && (
            <button type="button" className="primary" onClick={() => abrir(imagenPendiente)}>
              {tiposPendientes.has("firma") ? "✍️ Listo para firmar" : tiposPendientes.has("sello") ? "🖋️ Listo para sellar" : "👆 Listo para colocar huella"}
            </button>
          )}
        </div>
        <div className="readyBar">
          <button type="button" className="success" onClick={revisar}>✓ Revisar y continuar</button>
          {faltantes.length > 0 && <small className="afExtraHint">Faltan {faltantes.length} campo(s) obligatorio(s).</small>}
        </div>

        <NavPaginas actual={pagina} total={v.documento.paginas.length} alCambiar={setPagina} />
        {errorPdf && <div className="afAlerta">{errorPdf}</div>}
        <div className="preview">{vistaPagina(true)}</div>
        <div className="afExtraTextRow">
          <button type="button" className="danger" onClick={() => setRechazando(true)}>✕ No estoy de acuerdo, rechazar</button>
        </div>
      </div>

      {editando && (
        <HojaTexto campos={textos} actual={editando} valores={valores} setValores={setValores}
          alMover={(c) => { setEditando(c); irA(c); }} alCerrar={() => setEditando(null)} />
      )}
      {imagenDe && (
        <PantallaFirma
          tipo={imagenDe.tipo as TipoImagen}
          titulo={`${imagenDe.tipo === "firma" ? "Firma manuscrita" : imagenDe.tipo === "sello" ? "Sello" : "Huella"} — Firmante ${v.yo.orden}`}
          inicial={typeof valores[imagenDe.id] === "string" ? (valores[imagenDe.id] as string) : null}
          bloquearDibujo={v.documento.bloquearDibujo} bloquearSello={v.documento.bloquearSello}
          dedo={imagenDe.tipo === "huella" ? leerDedo(imagenDe.etiqueta) : null}
          alTerminar={(png) => {
            if (png) {
              // La misma firma se usa en todos los campos de firma del firmante que sigan vacíos.
              setValores((x) => {
                const n = { ...x, [imagenDe.id]: png };
                for (const c of imagenes) if (c.tipo === imagenDe.tipo && !n[c.id] && (c.tipo !== "huella" || c.etiqueta === imagenDe.etiqueta)) n[c.id] = png;
                return n;
              });
            }
            setImagenDe(null);
          }}
          alCerrar={() => setImagenDe(null)}
        />
      )}
      {rechazando && (
        <div className="afSheet" onClick={(e) => e.target === e.currentTarget && setRechazando(false)}>
          <div className="afSheetCard" role="dialog" aria-label="Rechazar documento">
            <div className="afSheetHead"><div className="afSheetTitles"><strong>Rechazar documento</strong><small>Quien te lo envió verá este motivo</small></div></div>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="Motivo del rechazo" aria-label="Motivo del rechazo" />
            <div className="afSheetActions">
              <button type="button" onClick={() => setRechazando(false)}>Cancelar</button>
              <button type="button" className="danger" onClick={rechazar}>Rechazar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Panel inferior para escribir un texto o una fecha, con «Siguiente» entre los campos del firmante. */
function HojaTexto({ campos, actual, valores, setValores, alMover, alCerrar }: {
  campos: Campo[]; actual: Campo; valores: Valores; setValores: (fn: (v: Valores) => Valores) => void; alMover: (c: Campo) => void; alCerrar: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const i = campos.findIndex((c) => c.id === actual.id);
  const anterior = campos[i - 1], siguiente = campos[i + 1];
  useEffect(() => { entrada.current?.focus({ preventScroll: true }); }, [actual]);
  const valor = typeof valores[actual.id] === "string" ? (valores[actual.id] as string) : "";
  return (
    <div className="afSheet" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="afSheetCard" role="dialog" aria-label={actual.etiqueta || ETIQUETA_TIPO[actual.tipo]}>
        <div className="afSheetHead">
          <div className="afSheetTitles">
            <strong>{actual.etiqueta || ETIQUETA_TIPO[actual.tipo]}{actual.obligatorio ? " *" : ""}</strong>
            <small>Página {actual.pagina}</small>
          </div>
          <div className="afSheetNav">
            <button type="button" disabled={!anterior} onClick={() => anterior && alMover(anterior)} aria-label="Anterior">‹</button>
            <span>{i + 1} / {campos.length}</span>
            <button type="button" disabled={!siguiente} onClick={() => siguiente && alMover(siguiente)} aria-label="Siguiente">›</button>
          </div>
        </div>
        <input
          ref={entrada} value={valor} type={actual.tipo === "fecha" ? "date" : "text"} maxLength={500} aria-label={actual.etiqueta || ETIQUETA_TIPO[actual.tipo]}
          onChange={(e) => { const t = e.target.value; setValores((v) => ({ ...v, [actual.id]: t })); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); siguiente ? alMover(siguiente) : alCerrar(); } }}
        />
        <div className="afSheetActions">
          <button type="button" className="danger" onClick={() => setValores((v) => ({ ...v, [actual.id]: "" }))}>Borrar</button>
          {siguiente && <button type="button" className="primary" onClick={() => alMover(siguiente)}>Siguiente</button>}
          <button type="button" className="success" onClick={alCerrar}>✓ Listo</button>
        </div>
      </div>
    </div>
  );
}
