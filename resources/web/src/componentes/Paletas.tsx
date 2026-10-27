import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PALETAS, cambiarApariencia, fondoOscuro, usarApariencia, type IdPaleta } from "./apariencia";
import "./paletas.css";

/** «🎨 Cambiar tema» (barra lateral, sobre «Tema claro/oscuro»): abre la ventana de paletas. */
export function BotonPaletas() {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" className="navItem" onClick={() => setAbierta(true)} aria-haspopup="dialog">
        <span className="iconoPaleta" aria-hidden>🎨</span><span>Cambiar tema</span>
      </button>
      {/* En <body>: dentro de la barra lateral (sticky, con su propio z-index) el editor y la guía quedaban encima. */}
      {abierta && createPortal(<VentanaPaletas alCerrar={() => setAbierta(false)} />, document.body)}
    </>
  );
}

/**
 * Paletas predefinidas (cada una con versión clara y oscura) y una propia: fondo y color de los botones a elección.
 * Los cambios se ven al instante y se guardan en este navegador.
 */
function VentanaPaletas({ alCerrar }: { alCerrar: () => void }) {
  const a = usarApariencia();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [alCerrar]);
  const elegir = (paleta: IdPaleta) => cambiarApariencia({ paleta });
  return (
    <div className="nicknameEditor capaPaletas" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <section className="nicknameEditorCard ventanaPaletas" role="dialog" aria-modal="true" aria-labelledby="paletasTitulo">
        <h2 id="paletasTitulo">🎨 Cambiar tema</h2>
        <p>Elige una paleta de colores para el fondo y los botones. Solo cambia cómo ves AutograFlow en este navegador: tus documentos y lo que ven tus firmantes no cambian.</p>

        <div className="paletasModo" role="group" aria-label="Claro u oscuro">
          <button type="button" className={a.tema === "light" ? "activa" : ""} aria-pressed={a.tema === "light"} onClick={() => cambiarApariencia({ tema: "light" })}>☀️ Claro</button>
          <button type="button" className={a.tema === "dark" ? "activa" : ""} aria-pressed={a.tema === "dark"} onClick={() => cambiarApariencia({ tema: "dark" })}>🌙 Oscuro</button>
        </div>

        <div className="paletasLista" role="radiogroup" aria-label="Paleta de colores">
          {PALETAS.map((p) => (
            <button type="button" key={p.id} role="radio" aria-checked={a.paleta === p.id} className={`paletaOpcion ${a.paleta === p.id ? "elegida" : ""}`} onClick={() => elegir(p.id)}>
              <span className="paletaMuestras" aria-hidden>{p.muestras.map((c) => <i key={c} style={{ background: c }} />)}</span>
              <span className="paletaNombre">{a.paleta === p.id ? "✓ " : ""}{p.nombre}</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={a.paleta === "propia"} className={`paletaOpcion ${a.paleta === "propia" ? "elegida" : ""}`} onClick={() => elegir("propia")}>
            <span className="paletaMuestras" aria-hidden><i style={{ background: a.fondo }} /><i style={{ background: a.boton }} /></span>
            <span className="paletaNombre">{a.paleta === "propia" ? "✓ " : ""}Personalizada</span>
          </button>
        </div>

        <fieldset className="paletaPropia" disabled={a.paleta !== "propia"}>
          <legend>Personalizada</legend>
          <label><input type="color" value={a.fondo} onChange={(e) => cambiarApariencia({ fondo: e.target.value })} /><span>Fondo<small>{a.fondo.toUpperCase()} · tema {fondoOscuro(a.fondo) ? "oscuro" : "claro"}</small></span></label>
          <label><input type="color" value={a.boton} onChange={(e) => cambiarApariencia({ boton: e.target.value })} /><span>Botones<small>{a.boton.toUpperCase()}</small></span></label>
          <div className="paletaVista" aria-hidden><button type="button" className="primary" tabIndex={-1}>Botón principal</button><button type="button" tabIndex={-1}>Secundario</button><a>Enlace</a></div>
          {a.paleta !== "propia" && <small>Elige «Personalizada» para escoger tus colores.</small>}
        </fieldset>
        <p className="small">Los textos se ajustan solos para que se lean bien sobre el fondo y los botones que elijas.</p>

        <div className="nicknameEditorActions">
          <button type="button" onClick={() => cambiarApariencia({ paleta: "autograflow" })}>Restablecer</button>
          <button type="button" className="primary" onClick={alCerrar}>Listo</button>
        </div>
      </section>
    </div>
  );
}
