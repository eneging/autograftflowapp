import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { enlaceWhatsApp } from "../api";
import { ErrorApi, plataforma, type Contacto, type FilaDocumento } from "./api";
import { fechaHora } from "./Panel";

type Periodo = "semana" | "mes" | "anio";
const DIAS: Record<Periodo, number> = { semana: 7, mes: 30, anio: 365 };

/** Barras simples en SVG (igual que los paneles del prototipo, sin librerías). */
function Barras({ valores, etiquetas }: { valores: number[]; etiquetas: string[] }) {
  const w = 320, h = 150, pad = 22, max = Math.max(1, ...valores), bw = (w - pad * 2) / Math.max(1, valores.length);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="grafico" role="img" aria-label="Documentos enviados por periodo">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} className="ejeGrafico" />
      {valores.map((v, i) => {
        const bh = (h - pad * 2) * (v / max), x = pad + i * bw + bw * 0.15;
        return (
          <g key={i}>
            <rect x={x} y={h - pad - bh} width={bw * 0.7} height={bh} rx={4} fill="url(#gradBarras)"><title>{`${etiquetas[i]}: ${v}`}</title></rect>
            {v > 0 && <text x={x + bw * 0.35} y={h - pad - bh - 4} textAnchor="middle" className="valorGrafico">{v}</text>}
            <text x={x + bw * 0.35} y={h - 6} textAnchor="middle" className="etiquetaGrafico">{etiquetas[i]}</text>
          </g>
        );
      })}
      <defs><linearGradient id="gradBarras" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7c3aed" /><stop offset="1" stopColor="#4d148c" /></linearGradient></defs>
    </svg>
  );
}

/** «Mis estadísticas y directorio»: indicadores calculados con los documentos de la cuenta y las personas a las que se envió. */
export function Estadisticas() {
  const [docs, setDocs] = useState<FilaDocumento[] | null>(null);
  const [contactos, setContactos] = useState<Contacto[] | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [buscar, setBuscar] = useState("");
  // Contacto que se está creando (id null) o editando.
  const [editando, setEditando] = useState<Pick<Contacto, "id" | "nombre" | "telefono" | "email"> | null>(null);
  const cargarContactos = () => plataforma.contactos().then(setContactos).catch(() => setContactos([]));
  useEffect(() => {
    plataforma.documentos().then((d) => setDocs(d.filter((x) => !x.esPlantilla))).catch(() => setDocs([]));
    cargarContactos();
  }, []);
  async function eliminarContacto(c: Contacto) {
    if (!c.id || !confirm(`¿Eliminar a «${c.nombre}» de tu Directorio?${c.documentos ? " Seguirá apareciendo con los datos de los documentos que ya le enviaste." : ""}`)) return;
    try { await plataforma.eliminarContacto(c.id); } catch (e) { alert(e instanceof ErrorApi ? e.message : "No se pudo eliminar."); }
    cargarContactos();
  }

  const k = useMemo(() => {
    if (!docs) return null;
    const desde = Date.now() - DIAS[periodo] * 86400000;
    const en = (iso: string | null) => !!iso && new Date(iso).getTime() >= desde;
    const preparados = docs.filter((d) => en(d.creadoEn));
    const enviados = docs.filter((d) => en(d.enviadoEn));
    const completados = docs.filter((d) => en(d.completadoEn));
    const tiempos = completados.filter((d) => d.enviadoEn).map((d) => (new Date(d.completadoEn!).getTime() - new Date(d.enviadoEn!).getTime()) / 3600000);
    const promedio = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : null;
    // Barras: enviados por día (semana), por semana (mes) o por mes (año).
    const n = periodo === "semana" ? 7 : periodo === "mes" ? 5 : 12;
    const paso = periodo === "semana" ? 1 : periodo === "mes" ? 7 : 30.42;
    const valores = Array(n).fill(0), etiquetas: string[] = [];
    for (let i = 0; i < n; i++) {
      const fin = Date.now() - (n - 1 - i) * paso * 86400000, ini = fin - paso * 86400000;
      const f = new Date(fin);
      etiquetas.push(periodo === "semana" ? f.toLocaleDateString("es", { weekday: "short" }).slice(0, 2) : periodo === "mes" ? `S${i + 1}` : f.toLocaleDateString("es", { month: "short" }).slice(0, 3));
      valores[i] = docs.filter((d) => d.enviadoEn && new Date(d.enviadoEn).getTime() > ini && new Date(d.enviadoEn).getTime() <= fin).length;
    }
    return {
      preparados: preparados.length, enviados: enviados.length, completados: completados.length,
      tasa: enviados.length ? Math.round((enviados.filter((d) => d.estado === "completado").length / enviados.length) * 100) : 0,
      pendientes: docs.filter((d) => d.estado === "en_firma").length, promedio, valores, etiquetas,
    };
  }, [docs, periodo]);

  const lista = (contactos ?? []).filter((c) => !buscar.trim() || `${c.nombre} ${c.telefono} ${c.email}`.toLowerCase().includes(buscar.trim().toLowerCase()));
  const horas = (h: number | null) => (h === null ? "—" : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} días`);
  return (
    <>
      <div className="card">
        <div className="sidePanelHead"><div><h1>📈 Mis estadísticas y directorio</h1><p className="small">Calculadas con tus documentos reales.</p></div></div>
        <div className="tabBar">
          {(["semana", "mes", "anio"] as Periodo[]).map((p) => (
            <button type="button" key={p} className={periodo === p ? "active" : ""} onClick={() => setPeriodo(p)}>{p === "semana" ? "Semana" : p === "mes" ? "Mes" : "Año"}</button>
          ))}
        </div>
        {!k ? <p id="loading">Cargando…</p> : (
          <>
            <div className="kpiGrid">
              <div className="kpiCard"><div className="kpiVal">{k.preparados}</div><div className="kpiLbl">Preparados</div></div>
              <div className="kpiCard"><div className="kpiVal">{k.enviados}</div><div className="kpiLbl">Enviados</div></div>
              <div className="kpiCard"><div className="kpiVal">{k.completados}</div><div className="kpiLbl">Firmados por todos</div></div>
              <div className="kpiCard"><div className="kpiVal">{k.tasa}%</div><div className="kpiLbl">Tasa de finalización</div></div>
              <div className="kpiCard"><div className="kpiVal">{horas(k.promedio)}</div><div className="kpiLbl">Tiempo prom. de firma</div></div>
              <div className="kpiCard"><div className="kpiVal">{k.pendientes}</div><div className="kpiLbl">Esperando firmas ahora</div></div>
            </div>
            <div className="kpiCard"><strong>Documentos enviados</strong><Barras valores={k.valores} etiquetas={k.etiquetas} /></div>
          </>
        )}
      </div>

      <div className="card afDir">
        <div className="afDirHead">
          <h2>📇 Directorio</h2>
          <span className="small">{contactos ? `${contactos.length} contacto${contactos.length === 1 ? "" : "s"}` : ""}</span>
          <input type="search" placeholder="Buscar por nombre, número o correo" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          <button type="button" className="primary" onClick={() => setEditando({ id: null, nombre: "", telefono: "", email: "" })}>＋ Nuevo contacto</button>
        </div>
        <p className="small">Agrega contactos con su WhatsApp o correo, o deja que se agreguen solos al enviar documentos. Al preparar uno nuevo, escribe su nombre y se completan su WhatsApp y su correo.</p>
        <div className="tabla-envoltura">
          <table className="dataTable">
            <thead><tr><th>Nombre</th><th>WhatsApp</th><th>Correo</th><th className="num">Documentos</th><th className="num">Firmó</th><th>Último</th><th aria-label="Acciones"></th></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.nombre}>
                  <td><b>{c.nombre}</b>{c.id && <span className="insignia contactoGuardado" title="Contacto guardado en tu Directorio">Guardado</span>}</td>
                  <td>{c.telefono ? <a href={enlaceWhatsApp(`Hola ${c.nombre}`, c.telefono)} target="_blank" rel="noopener noreferrer">💬 {c.telefono}</a> : <span className="small">—</span>}</td>
                  <td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="small">—</span>}</td>
                  <td className="num">{c.documentos}</td>
                  <td className="num">{c.firmados}</td>
                  <td>{c.ultimo ? fechaHora(c.ultimo).slice(0, 10) : <span className="small">—</span>}</td>
                  <td className="accionesContacto">
                    <button type="button" title="Editar contacto" onClick={() => setEditando({ id: c.id, nombre: c.nombre, telefono: c.telefono, email: c.email })}>Editar</button>
                    {c.id && <button type="button" className="danger" title="Eliminar contacto" onClick={() => eliminarContacto(c)}>Eliminar</button>}
                  </td>
                </tr>
              ))}
              {contactos && lista.length === 0 && (
                <tr><td colSpan={7} className="small centro">{contactos.length ? "No hay contactos que coincidan con la búsqueda." : <>Aún no tienes contactos. <a href="#" onClick={(e) => { e.preventDefault(); setEditando({ id: null, nombre: "", telefono: "", email: "" }); }}>Crea uno</a> o se agregarán solos cuando envíes un documento. <Link to="/app">Preparar uno</Link></>}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {editando && <VentanaContacto inicial={editando} alCerrar={() => setEditando(null)} alGuardar={() => { setEditando(null); cargarContactos(); }} />}
    </>
  );
}

/** Crear o editar un contacto del Directorio: nombre y, al menos, su WhatsApp o su correo. */
function VentanaContacto({ inicial, alCerrar, alGuardar }: { inicial: Pick<Contacto, "id" | "nombre" | "telefono" | "email">; alCerrar: () => void; alGuardar: () => void }) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [telefono, setTelefono] = useState(inicial.telefono);
  const [email, setEmail] = useState(inicial.email);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [alCerrar]);
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const n = nombre.trim(), t = telefono.trim(), m = email.trim(), err: Record<string, string> = {};
    if (n.length < 2) err.nombre = "Escribe el nombre del contacto.";
    if (t && !/^[+\d][\d\s()-]{6,}$/.test(t)) err.telefono = "El número de WhatsApp no parece válido. Escríbelo con al menos 7 dígitos; si no es de Perú, incluye el código de país.";
    if (m && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)) err.email = "El correo electrónico no parece válido.";
    if (!t && !m && !err.telefono) err.telefono = "Escribe su WhatsApp o su correo para poder enviarle documentos.";
    setErrores(err);
    setError("");
    if (Object.keys(err).length) return;
    setGuardando(true);
    try {
      // Si el contacto venía de un documento (sin id), se guarda como contacto propio con estos datos.
      await plataforma.guardarContacto({ id: inicial.id, nombre: n, telefono: t, email: m });
      alGuardar();
    } catch (ex) {
      if (ex instanceof ErrorApi) { setErrores(ex.campos); setError(Object.keys(ex.campos).length ? "" : ex.message); } else setError("No se pudo guardar el contacto.");
      setGuardando(false);
    }
  }
  return (
    <div className="nicknameEditor" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <form className="nicknameEditorCard" role="dialog" aria-modal="true" aria-label={inicial.id || inicial.nombre ? "Editar contacto" : "Nuevo contacto"} onSubmit={guardar} noValidate>
        <h2>{inicial.id || inicial.nombre ? "Editar contacto" : "Nuevo contacto"}</h2>
        <p>Con su WhatsApp o su correo podrás enviarle documentos directamente. Al preparar un documento, escribe su nombre y se completan solos.</p>
        <div className="nicknameEditorFields">
          <label>Nombre
            <input value={nombre} maxLength={120} autoFocus autoComplete="off" placeholder="Ej. Juan Pérez" onChange={(e) => setNombre(e.target.value)} aria-invalid={!!errores.nombre} />
            {errores.nombre && <small className="errorCampo">{errores.nombre}</small>}
          </label>
          <div className="nicknameContactWrap">
            <label>WhatsApp
              <input inputMode="tel" maxLength={30} value={telefono} placeholder="Ej. 987 654 321 o +51 987 654 321" onChange={(e) => setTelefono(e.target.value)} aria-invalid={!!errores.telefono} />
              {errores.telefono && <small className="errorCampo">{errores.telefono}</small>}
            </label>
            <label>Correo electrónico
              <input type="email" maxLength={160} value={email} placeholder="nombre@correo.com" onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errores.email} />
              {errores.email && <small className="errorCampo">{errores.email}</small>}
            </label>
            <small className="nicknameContactHint">Necesitas al menos uno de los dos. Si no es un número de Perú, incluye el código de país (ej. +34).</small>
          </div>
          <small className="small">Guarda solo datos de personas que te los dieron o que esperan recibir tus documentos.</small>
        </div>
        {error && <div className="afAlerta">{error}</div>}
        <div className="nicknameEditorActions">
          <button type="button" onClick={alCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar contacto"}</button>
        </div>
      </form>
    </div>
  );
}
