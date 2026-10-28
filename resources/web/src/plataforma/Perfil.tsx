import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { formatoPrecio } from "../../../shared/planes";
import {
  ACCESORIOS, Avatar, EXPRESIONES, FONDOS, PEINADOS, PELOS, PERSONAJES, PIELES, avatarAlAzar, codigoAvatar, leerAvatar, type PiezasAvatar,
} from "../componentes/Avatar";
import { ErrorApi, plataforma, type Facturacion, type Perfil } from "./api";
import { fechaHora } from "./Panel";
import { usarSesion } from "./sesion";
import "./perfil.css";

const BASE: PiezasAvatar = { f: 0, p: 1, h: 1, c: 0, a: 0, e: 0 };
const VACIA: Facturacion = { tipo: "boleta", documentoTipo: "DNI", documento: "", nombre: "", direccion: "", correo: "" };

/** Dígito verificador del RUC (módulo 11 de SUNAT); el servidor lo vuelve a comprobar. */
export function rucValido(ruc: string) {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const suma = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((s, p, i) => s + Number(ruc[i]) * p, 0);
  return (11 - (suma % 11)) % 10 === Number(ruc[10]);
}

/** Lo que falta o está mal en los datos de facturación (vacío si están bien). */
function revisar(f: Facturacion): Partial<Record<keyof Facturacion, string>> {
  const e: Partial<Record<keyof Facturacion, string>> = {};
  const doc = f.documento.replace(/\s+/g, "").toUpperCase();
  if (f.tipo === "factura") {
    if (!rucValido(doc)) e.documento = "El RUC no es válido: son 11 dígitos y empieza con 10, 15, 16, 17 o 20.";
    if (f.nombre.trim().length < 3) e.nombre = "Escribe la razón social tal como figura en SUNAT.";
    if (f.direccion.trim().length < 5) e.direccion = "La factura necesita la dirección fiscal.";
  } else {
    const ok = f.documentoTipo === "DNI" ? /^\d{8}$/.test(doc) : f.documentoTipo === "CE" ? /^[A-Z0-9]{9,12}$/.test(doc) : /^[A-Z0-9]{6,12}$/.test(doc);
    if (!ok) e.documento = f.documentoTipo === "DNI" ? "El DNI tiene 8 dígitos." : "Revisa el número de documento.";
    if (f.nombre.trim().length < 3) e.nombre = "Escribe tus nombres y apellidos.";
  }
  if (f.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo.trim())) e.correo = "Revisa el correo.";
  return e;
}

function bajar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** «Mi perfil»: avatar, nombre, datos para boleta o factura y comprobantes de los pagos. Solo con cuenta. */
export function PerfilPagina() {
  const { usuario, recargar } = usarSesion();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [nombre, setNombre] = useState("");
  const [avatar, setAvatar] = useState<PiezasAvatar | null>(null);
  const [conFactura, setConFactura] = useState(false);
  const [fact, setFact] = useState<Facturacion>(VACIA);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [emitiendo, setEmitiendo] = useState<number | null>(null);
  const [intento, setIntento] = useState(false);

  function cargar(p: Perfil) {
    setPerfil(p);
    setNombre(p.nombre);
    setAvatar(leerAvatar(p.avatar));
    setConFactura(!!p.facturacion);
    setFact(p.facturacion ?? { ...VACIA, nombre: p.nombre, correo: p.email });
  }
  useEffect(() => {
    if (usuario && !usuario.invitado) plataforma.perfil().then(cargar).catch((e) => setEstado({ tipo: "error", texto: (e as Error).message }));
  }, [usuario?.id]);
  // Desde «Mi Plan» se llega con #pfComprobantes: se baja hasta ahí cuando ya cargó.
  const { hash } = useLocation();
  const cargado = !!perfil;
  useEffect(() => { if (cargado && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" }); }, [cargado, hash]);

  if (usuario?.invitado) return (
    <div className="card"><h1>Mi perfil</h1><p>El perfil es para cuentas registradas. <Link to="/registro">Crea tu cuenta</Link> para elegir tu avatar y guardar tus datos de facturación.</p></div>
  );
  if (!perfil) return <div className="card">{estado ? <div className="afAlerta">{estado.texto}</div> : <p id="loading">Cargando…</p>}</div>;

  const codigo = avatar ? codigoAvatar(avatar) : null;
  const local = conFactura ? revisar(fact) : {};
  const ver = (k: keyof Facturacion) => (intento ? local[k] : undefined) ?? errores[`facturacion.${k}`];
  const facturacionGuardada = JSON.stringify(perfil.facturacion);
  const cambios = nombre.trim() !== perfil.nombre || codigo !== perfil.avatar || JSON.stringify(conFactura ? fact : null) !== facturacionGuardada;
  const pieza = (k: keyof PiezasAvatar, v: number) => setAvatar((a) => ({ ...(a ?? BASE), [k]: v }));
  const cambiarFact = (d: Partial<Facturacion>) => { setFact((f) => ({ ...f, ...d })); setEstado(null); };

  async function guardar() {
    setIntento(true);
    if (nombre.trim().length < 2 || Object.keys(local).length) { setEstado({ tipo: "error", texto: "Revisa los datos marcados." }); return; }
    setGuardando(true); setErrores({}); setEstado(null);
    try {
      const p = await plataforma.guardarPerfil({ nombre: nombre.trim(), avatar: codigo, facturacion: conFactura ? { ...fact, documento: fact.documento.replace(/\s+/g, "").toUpperCase() } : null });
      cargar(p);
      setIntento(false);
      await recargar();
      setEstado({ tipo: "ok", texto: "✓ Perfil guardado." });
    } catch (e) {
      setErrores(e instanceof ErrorApi ? e.campos : {});
      setEstado({ tipo: "error", texto: (e as Error).message });
    } finally { setGuardando(false); }
  }
  async function comprobante(id: number, numero: string | null) {
    setEmitiendo(id); setEstado(null);
    try {
      bajar(await plataforma.comprobante(id), `comprobante-${numero ?? `AF-${String(id).padStart(8, "0")}`}.pdf`);
      if (!numero) cargar(await plataforma.perfil());
    } catch (e) { setEstado({ tipo: "error", texto: (e as Error).message }); }
    finally { setEmitiendo(null); }
  }

  const campo = (k: keyof Facturacion, etiqueta: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className={`pfCampo ${ver(k) ? "conError" : ""}`}>{etiqueta}
      <input value={fact[k]} onChange={(e) => cambiarFact({ [k]: e.target.value })} aria-invalid={!!ver(k)} {...props} />
      {ver(k) && <small className="pfError">{ver(k)}</small>}
    </label>
  );

  return (
    <div className="pfPagina">
      <header className="card pfCabecera">
        <Avatar codigo={codigo} inicial={(nombre.trim()[0] || "A").toUpperCase()} tam={84} className="pfAvatarGrande" />
        <div>
          <h1>{nombre.trim() || "Mi perfil"}</h1>
          <p>{perfil.email} · {perfil.cuenta}</p>
        </div>
      </header>

      <section className="card pfSeccion" aria-labelledby="pfAvatar">
        <div className="pfSeccionCabecera">
          <h2 id="pfAvatar">Tu avatar</h2>
          <span className="pfBotones">
            <button type="button" onClick={() => setAvatar(avatarAlAzar())}>🎲 Sorpréndeme</button>
            {avatar && <button type="button" onClick={() => setAvatar(null)}>Usar mi inicial</button>}
          </span>
        </div>
        <div className="pfPersonajes" role="radiogroup" aria-label="Personajes">
          {PERSONAJES.map((x) => (
            <button key={x.codigo} type="button" role="radio" aria-checked={codigo === x.codigo} className={codigo === x.codigo ? "activo" : ""} onClick={() => setAvatar(leerAvatar(x.codigo))}>
              <Avatar codigo={x.codigo} tam={56} /><span>{x.nombre}</span>
            </button>
          ))}
        </div>
        <div className="pfArmar">
          <Fila titulo="Fondo">{FONDOS.map((c, i) => <Muestra key={c} color={c} activa={avatar?.f === i} nombre={`Fondo ${i + 1}`} alElegir={() => pieza("f", i)} />)}</Fila>
          <Fila titulo="Piel">{PIELES.map((c, i) => <Muestra key={c} color={c} activa={avatar?.p === i} nombre={`Tono ${i + 1}`} alElegir={() => pieza("p", i)} />)}</Fila>
          <Fila titulo="Peinado">{PEINADOS.map((n, i) => <Opcion key={n} nombre={n} activa={avatar?.h === i} codigo={codigoAvatar({ ...(avatar ?? BASE), h: i, a: 0 })} alElegir={() => pieza("h", i)} />)}</Fila>
          <Fila titulo="Color de pelo">{PELOS.map((c, i) => <Muestra key={c} color={c} activa={avatar?.c === i} nombre={`Color ${i + 1}`} alElegir={() => pieza("c", i)} />)}</Fila>
          <Fila titulo="Accesorio">{ACCESORIOS.map((n, i) => <Opcion key={n} nombre={n} activa={avatar?.a === i} codigo={codigoAvatar({ ...(avatar ?? BASE), a: i })} alElegir={() => pieza("a", i)} />)}</Fila>
          <Fila titulo="Expresión">{EXPRESIONES.map((n, i) => <Opcion key={n} nombre={n} activa={avatar?.e === i} codigo={codigoAvatar({ ...(avatar ?? BASE), e: i })} alElegir={() => pieza("e", i)} />)}</Fila>
        </div>
      </section>

      <section className="card pfSeccion" aria-labelledby="pfDatos">
        <h2 id="pfDatos">Datos personales</h2>
        <div className="pfRejilla">
          <label className={`pfCampo ${intento && nombre.trim().length < 2 ? "conError" : ""}`}>Nombre
            <input value={nombre} onChange={(e) => { setNombre(e.target.value); setEstado(null); }} maxLength={120} autoComplete="name" />
            {intento && nombre.trim().length < 2 && <small className="pfError">Escribe tu nombre.</small>}
          </label>
          <label className="pfCampo">Correo de acceso<input value={perfil.email} disabled /><small>Es el correo con el que ingresas; no se puede cambiar aquí.</small></label>
        </div>
      </section>

      <section className="card pfSeccion" aria-labelledby="pfFact">
        <div className="pfSeccionCabecera">
          <div>
            <h2 id="pfFact">Datos para tu comprobante</h2>
            <p className="small">Con estos datos se emite el comprobante de cada pago. Elige boleta (persona) o factura (empresa con RUC).</p>
          </div>
        </div>
        <label className="pfCheck"><input type="checkbox" checked={conFactura} onChange={(e) => { setConFactura(e.target.checked); setEstado(null); }} /> Quiero guardar mis datos de facturación</label>
        {conFactura && <>
          <div className="pfTipo" role="radiogroup" aria-label="Tipo de comprobante">
            {(["boleta", "factura"] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={fact.tipo === t} className={fact.tipo === t ? "activo" : ""}
                onClick={() => cambiarFact(t === "factura" ? { tipo: t, documentoTipo: "RUC" } : { tipo: t, documentoTipo: "DNI" })}>
                <strong>{t === "boleta" ? "🧾 Boleta" : "🏢 Factura"}</strong><small>{t === "boleta" ? "Para personas: DNI, CE o pasaporte" : "Para empresas o negocios con RUC"}</small>
              </button>
            ))}
          </div>
          <div className="pfRejilla">
            {fact.tipo === "boleta" && <label className="pfCampo">Tipo de documento
              <select value={fact.documentoTipo} onChange={(e) => cambiarFact({ documentoTipo: e.target.value as Facturacion["documentoTipo"] })}>
                <option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="PASAPORTE">Pasaporte</option>
              </select>
            </label>}
            {campo("documento", fact.tipo === "factura" ? "RUC" : "Número de documento", { inputMode: fact.documentoTipo === "DNI" || fact.tipo === "factura" ? "numeric" : "text", maxLength: fact.tipo === "factura" ? 11 : 12, autoComplete: "off" })}
            {campo("nombre", fact.tipo === "factura" ? "Razón social" : "Nombres y apellidos", { maxLength: 200 })}
            {campo("direccion", fact.tipo === "factura" ? "Dirección fiscal" : "Dirección (opcional)", { maxLength: 250, autoComplete: "street-address" })}
            {campo("correo", "Correo para el comprobante (opcional)", { type: "email", maxLength: 160, autoComplete: "email" })}
          </div>
        </>}
      </section>

      <div className="pfBarra">
        <span className="pfBarraNota">{estado ? <span className={estado.tipo === "ok" ? "pfOk" : "pfError"} role="status">{estado.texto}</span> : cambios ? "Tienes cambios sin guardar." : "Todo guardado."}</span>
        <button type="button" className="primary" disabled={guardando || !cambios} onClick={guardar}>{guardando ? "Guardando…" : "Guardar perfil"}</button>
      </div>

      <section className="card pfSeccion" aria-labelledby="pfComprobantes">
        <h2 id="pfComprobantes">Comprobantes de pago</h2>
        {perfil.pagos.length === 0 ? <p className="small">Aún no tienes pagos aprobados. Cuando compres un plan, aquí podrás generar su comprobante. <Link to="/app/cuenta">Ver planes</Link></p> : <>
          {!perfil.facturacion && <div className="notice">Guarda tus datos para boleta o factura arriba para poder generar tus comprobantes.</div>}
          <ul className="pfPagos">
            {perfil.pagos.map((p) => (
              <li key={p.id}>
                <span><strong>{p.titulo}</strong><small>{fechaHora(p.aplicadoEn ?? p.creadoEn)} · {formatoPrecio(p.monto, p.moneda)}</small></span>
                {p.comprobante && <span className="pfNumero">{p.comprobante}</span>}
                <button type="button" className={p.comprobante ? "" : "primary"} disabled={emitiendo !== null || (!p.comprobante && (!perfil.facturacion || cambios))}
                  title={!p.comprobante && cambios ? "Guarda tus cambios primero" : undefined} onClick={() => comprobante(p.id, p.comprobante)}>
                  {emitiendo === p.id ? "Generando…" : p.comprobante ? "⬇️ Descargar" : "📄 Generar comprobante"}
                </button>
              </li>
            ))}
          </ul>
          <p className="small pfNota">El comprobante se emite una sola vez con los datos guardados en ese momento. Es una constancia de pago; no es un comprobante electrónico validado por SUNAT.</p>
        </>}
      </section>
    </div>
  );
}

const Fila = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <div className="pfFila"><span className="pfFilaTitulo">{titulo}</span><div className="pfFilaOpciones" role="radiogroup" aria-label={titulo}>{children}</div></div>
);
const Muestra = ({ color, activa, nombre, alElegir }: { color: string; activa: boolean; nombre: string; alElegir: () => void }) => (
  <button type="button" role="radio" aria-checked={activa} aria-label={nombre} className={`pfMuestra ${activa ? "activo" : ""}`} style={{ background: color }} onClick={alElegir} />
);
const Opcion = ({ nombre, codigo, activa, alElegir }: { nombre: string; codigo: string; activa: boolean; alElegir: () => void }) => (
  <button type="button" role="radio" aria-checked={activa} title={nombre} aria-label={nombre} className={`pfOpcion ${activa ? "activo" : ""}`} onClick={alElegir}><Avatar codigo={codigo} tam={44} /></button>
);
