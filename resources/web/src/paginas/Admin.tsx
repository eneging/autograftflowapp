import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatoMonto } from "../../../shared/calculos";
import type { Estado } from "../../../shared/esquema";
import { api, ErrorApi, urlPdf, type FilaAdmin } from "../api";
import { EstadoInsignia, fechaHora } from "../componentes/Estado";
import { PLANES, type IdPlan } from "../../../shared/planes";

const CLAVE = "reembolso-admin";
const leerClave = () => {
  try { return sessionStorage.getItem(CLAVE) ?? ""; } catch { return ""; }
};

/** Panel para quien recopila las solicitudes: lista, filtra y abre los PDF. */
export function Admin() {
  const [clave, setClave] = useState(leerClave);
  const [entrada, setEntrada] = useState("");
  const [filas, setFilas] = useState<FilaAdmin[] | null>(null);
  const [estado, setEstado] = useState<Estado | "">("");
  const [buscar, setBuscar] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clave) return;
    const t = setTimeout(async () => {
      try {
        setFilas(await api.listar(clave, { estado, buscar }));
        setError("");
        try { sessionStorage.setItem(CLAVE, clave); } catch { /* sin almacenamiento */ }
      } catch (e) {
        if (e instanceof ErrorApi && e.status === 401) {
          setClave("");
          try { sessionStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
        }
        setError((e as Error).message);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [clave, estado, buscar]);

  if (!clave)
    return (
      <form className="tarjeta angosta" onSubmit={(e: FormEvent) => { e.preventDefault(); setClave(entrada); }}>
        <h1>Panel de solicitudes</h1>
        <label className="campo ancho-completo">
          <span className="campo-etiqueta">Contraseña</span>
          <input type="password" value={entrada} onChange={(e) => setEntrada(e.target.value)} autoFocus autoComplete="current-password" />
        </label>
        {error && <div className="alerta error-bloque">{error}</div>}
        <div className="acciones"><button className="boton-principal">Entrar</button></div>
      </form>
    );

  const total = (filas ?? []).filter((f) => f.estado !== "rechazada").reduce((a, f) => a + f.totalCentavos, 0);

  return (
    <>
      <div className="titulo-pagina">
        <h1>Solicitudes</h1>
        <p>{filas ? `${filas.length} solicitud${filas.length === 1 ? "" : "es"} · total no rechazado ${formatoMonto(total)}` : "Cargando…"}</p>
      </div>
      <div className="filtros">
        <input type="search" placeholder="Buscar por nombre, estaca, barrio o factura" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <select value={estado} onChange={(e) => setEstado(e.target.value as Estado | "")}>
          <option value="">Todas</option>
          <option value="pendiente">Pendientes</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option>
        </select>
        <button type="button" className="boton-texto" onClick={() => { setClave(""); try { sessionStorage.removeItem(CLAVE); } catch { /* */ } }}>Salir</button>
      </div>
      {error && <div className="alerta error-bloque">{error}</div>}
      <div className="tarjeta tabla-envoltura">
        <table>
          <thead>
            <tr><th>Factura</th><th>Beneficiario</th><th>Estaca / Barrio</th><th>Firmada</th><th>Estado</th><th className="num">Total</th><th /></tr>
          </thead>
          <tbody>
            {filas?.map((f) => (
              <tr key={f.token}>
                <td><Link to={`/s/${f.token}`}>{f.numeroFactura}</Link></td>
                <td>{f.nombre}</td>
                <td>{f.estaca} / {f.barrio}</td>
                <td>{fechaHora(f.firmadoEn)}</td>
                <td><EstadoInsignia estado={f.estado} />{f.aprobadorNombre && <div className="nota">{f.aprobadorNombre}</div>}</td>
                <td className="num">{formatoMonto(f.totalCentavos)}</td>
                <td><a href={urlPdf(f.token)} target="_blank" rel="noopener">PDF</a></td>
              </tr>
            ))}
            {filas?.length === 0 && <tr><td colSpan={7} className="nota">No hay solicitudes.</td></tr>}
          </tbody>
        </table>
      </div>
      <CuentasAdmin clave={clave} />
    </>
  );
}

interface FilaCuenta {
  id: number; nombre: string; email: string | null; plan: string; nombrePlan: string; vence: string | null;
  creditos: number; documentos: number; usadosMes: number; usuarios: number; pagado: number; creadoEn: string;
}

/** Clientes de la plataforma: plan, uso y activación manual de planes (pagos por transferencia, Yape, Plin…). */
function CuentasAdmin({ clave }: { clave: string }) {
  const [cuentas, setCuentas] = useState<FilaCuenta[] | null>(null);
  const [error, setError] = useState("");
  const [eleccion, setEleccion] = useState<Record<number, string>>({});
  const cargar = async () => {
    try {
      const r = await fetch("/api/admin/cuentas", { headers: { "x-admin-password": clave } });
      if (!r.ok) throw new Error((await r.json()).error);
      setCuentas(await r.json());
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => { cargar(); }, [clave]);

  async function activar(c: FilaCuenta) {
    const producto = eleccion[c.id] ?? "profesional";
    const p = PLANES[producto as IdPlan]?.nombre ?? producto;
    if (!confirm(`¿Activar el plan ${p} a ${c.nombre}? Hazlo solo si ya recibiste el pago.`)) return;
    const r = await fetch(`/api/admin/cuentas/${c.id}/activar`, {
      method: "POST", headers: { "x-admin-password": clave, "Content-Type": "application/json", "X-AutograFlow": "1" }, body: JSON.stringify({ producto }),
    });
    if (!r.ok) return alert((await r.json()).error);
    cargar();
  }

  return (
    <>
      <div className="titulo-pagina"><h1>Cuentas de AutograFlow</h1><p>{cuentas ? `${cuentas.length} cliente(s)` : "Cargando…"}</p></div>
      {error && <div className="alerta error-bloque">{error}</div>}
      <div className="tarjeta tabla-envoltura">
        <table>
          <thead><tr><th>Cliente</th><th>Plan</th><th className="num">Usuarios</th><th className="num">Este mes</th><th className="num">Créditos</th><th className="num">Pagado</th><th>Activar manualmente</th></tr></thead>
          <tbody>
            {cuentas?.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.nombre}</strong><div className="nota">{c.email} · desde {fechaHora(c.creadoEn)}</div></td>
                <td>{c.nombrePlan}{c.vence && <div className="nota">vence {fechaHora(c.vence)}</div>}</td>
                <td className="num">{c.usuarios}</td>
                <td className="num">{c.usadosMes}</td>
                <td className="num">{c.creditos}</td>
                <td className="num">{c.pagado.toFixed(2)}</td>
                <td>
                  <select value={eleccion[c.id] ?? "profesional"} onChange={(e) => setEleccion({ ...eleccion, [c.id]: e.target.value })}>
                    {Object.values(PLANES).filter((p) => p.precio > 0).map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.dias ? `${p.dias} días` : `+${p.creditos} documentos`})</option>)}
                  </select>{" "}
                  <button type="button" className="boton-texto" onClick={() => activar(c)}>Activar</button>
                </td>
              </tr>
            ))}
            {cuentas?.length === 0 && <tr><td colSpan={7} className="nota">Todavía no hay cuentas.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
