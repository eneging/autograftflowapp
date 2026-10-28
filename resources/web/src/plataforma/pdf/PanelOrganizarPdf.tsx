import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { EtiquetaNueva, HERRAMIENTAS, IconoHerramienta } from "./herramientas";
import { BotonFavorito } from "../../componentes/favoritos";
import "./panel-organizar-pdf.css";

/**
 * Panel a la derecha con las herramientas de «Organizar PDF» (se abre desde «Herramientas» en la barra lateral).
 * En <body>, para quedar encima del editor y de la guía.
 */
export function PanelOrganizarPdf({ alCerrar }: { alCerrar: () => void }) {
  const primero = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    primero.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [alCerrar]);
  return createPortal(
    <div className="opFondo" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <aside className="opPanel" role="dialog" aria-modal="true" aria-labelledby="opTitulo">
        <div className="opCabecera">
          <div><h2 id="opTitulo">Organizar PDF</h2><p>Prepara tus archivos antes de firmarlos.</p></div>
          <button type="button" className="botonIcono" aria-label="Cerrar" onClick={alCerrar}>✕</button>
        </div>
        <nav className="opLista" aria-label="Herramientas de PDF">
          {HERRAMIENTAS.map((h, i) => (
            <div key={h.id} className="opFila">
              <Link ref={i === 0 ? primero : undefined} to={`/app/pdf/${h.id}`} className={`opHerramienta ${h.especial ? "especial" : ""}`} onClick={alCerrar}>
                <span className="opIcono"><IconoHerramienta id={h.id} tam={22} /></span>
                <span><strong>{h.especial ? <><span className="hrNombreEspecial">{h.nombre}</span> <EtiquetaNueva /></> : h.nombre}</strong><small>{h.resumen}</small></span>
                <span className="opFlecha" aria-hidden>›</span>
              </Link>
              <BotonFavorito acceso={`pdf:${h.id}`} />
            </div>
          ))}
        </nav>
        <p className="opPie">🔒 Se procesan en tu dispositivo: tus archivos no se suben a ningún servidor.</p>
      </aside>
    </div>,
    document.body,
  );
}
