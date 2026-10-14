import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { copiar } from "../compartir";
import { ErrorApi, plataforma, type Equipo as DatosEquipo } from "./api";

/** «Mi Equipo» (plan Empresarial): código de la organización, plazas y usuarios. */
export function Equipo() {
  const [e, setE] = useState<DatosEquipo | null>(null);
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState(false);
  const cargar = () => plataforma.equipo().then(setE).catch((x) => setAviso(x.message));
  useEffect(() => { cargar(); }, []);
  if (!e) return <div className="card">{aviso ? <div className="afAlerta">{aviso}</div> : <p id="loading">Cargando…</p>}</div>;

  if (!e.activo)
    return (
      <div className="card angosta">
        <h1>🏢 Mi Equipo</h1>
        <p>Con el plan <strong>Empresarial</strong> tu organización tiene un código para que se unan hasta 5 usuarios. Todos comparten los documentos, el cupo y las estadísticas.</p>
        <Link className="boton primary" to="/planes">Ver el plan Empresarial</Link>
      </div>
    );

  const mensaje = `Únete a «${e.nombre}» en AutograFlow: crea tu cuenta en ${location.origin}/registro, marca «Unirme a una organización» y escribe el código ${e.codigo}`;
  return (
    <>
      <div className="card">
        <div className="sidePanelHead"><div><h1>🏢 Mi Organización</h1><p className="small">Usuarios, plazas y código para unirse.</p></div></div>
        <div className="kpiGrid">
          <div className="kpiCard"><div className="kpiVal">{e.nombre}</div><div className="kpiLbl">Organización</div></div>
          <div className="kpiCard"><div className="kpiVal">{e.codigo ?? "—"}</div><div className="kpiLbl">Código para unirse</div></div>
          <div className="kpiCard"><div className="kpiVal">{e.miembros.length} / {e.plazas}</div><div className="kpiLbl">Usuarios</div></div>
        </div>
        {e.soyTitular && e.codigo && (
          <div className="row">
            <button type="button" className="primary" onClick={async () => { if (await copiar(mensaje)) { setCopiado(true); setTimeout(() => setCopiado(false), 2000); } }}>
              {copiado ? "✓ Invitación copiada" : "📋 Copiar invitación"}
            </button>
            <a className="boton green" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}>💬 Invitar por WhatsApp</a>
            <button type="button" onClick={async () => {
              if (!confirm("¿Crear un código nuevo? El anterior dejará de servir (quienes ya se unieron siguen en el equipo).")) return;
              await plataforma.nuevoCodigoEquipo(); cargar();
            }}>🔄 Cambiar código</button>
          </div>
        )}
        {!e.soyTitular && <p className="small">Solo el titular de la organización puede invitar o quitar usuarios.</p>}
        {aviso && <div className="afAlerta">{aviso}</div>}
      </div>
      <div className="card">
        <h2>Miembros</h2>
        <div className="tabla-envoltura">
          <table className="dataTable">
            <thead><tr><th>Usuario</th><th>Rol</th><th className="num">Documentos enviados</th><th></th></tr></thead>
            <tbody>
              {e.miembros.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.nombre}</b>{m.yo && " (tú)"}<div className="small">{m.email}</div></td>
                  <td>{m.titular ? "👑 Titular" : "Miembro"}</td>
                  <td className="num">{m.documentos}</td>
                  <td>{e.soyTitular && !m.titular && (
                    <button type="button" className="danger botonChico" onClick={async () => {
                      if (!confirm(`¿Quitar a ${m.nombre} de la organización? Conservará su usuario con una cuenta Gratis propia.`)) return;
                      try { await plataforma.quitarMiembro(m.id); cargar(); } catch (x) { setAviso(x instanceof ErrorApi ? x.message : "No se pudo quitar."); }
                    }}>Quitar</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
