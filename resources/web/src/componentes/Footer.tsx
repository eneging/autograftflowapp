import { useState } from "react";
import { Link } from "react-router-dom";
import { VentanaLegal, type TipoLegal } from "./Legal";
import "./footer.css";

export function Footer() {
  const [legal, setLegal] = useState<TipoLegal | null>(null);
  return <footer className="footerAf" aria-label="Información y atención al consumidor">
    <div className="footerInterior">
      <div className="footerMarca"><Link to="/">AutograFlow<span aria-hidden>↗</span></Link><p>Menos papeles.<br />Más cosas resueltas.</p><span>Firma electrónica de documentos PDF.</span></div>
      <nav aria-label="Enlaces del producto"><h2>Tu espacio</h2><Link to="/app">Mis documentos</Link><Link to="/como-funciona">Cómo funciona</Link><Link to="/planes">Planes</Link><Link to="/referidos">Invita y gana</Link><Link to="/verificar">Verificar un PDF</Link><Link to="/reembolso">Plantilla de reembolso</Link></nav>
      <div className="footerLegal"><h2>Información legal</h2><button type="button" onClick={() => setLegal('terminos')}>Términos y condiciones</button><button type="button" onClick={() => setLegal('privacidad')}>Política de privacidad</button><button type="button" onClick={() => setLegal('firmantes')}>Términos para firmantes</button><Link to="/libro-de-reclamaciones">Atención al consumidor</Link></div>
      <div className="footerLibro"><Link to="/libro-de-reclamaciones" className="avisoLibro"><svg viewBox="0 0 32 26" width="40" height="34" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M16 5C11 2 5 2 2 3v19c5-2 10-1 14 1 4-2 9-3 14-1V3c-3-1-9-1-14 2v18"/><path d="M6 7h6M6 11h6M20 7h6M20 11h6"/></svg><strong>LIBRO DE<br />RECLAMACIONES</strong><span>Presenta tu reclamo o queja →</span></Link><p>Este establecimiento cuenta con un Libro de Reclamaciones a tu disposición.</p></div>
      <div className="footerBase"><span>© {new Date().getFullYear()} AutograFlow</span><span>Hecho para que sigas adelante.</span><a href="https://www.gob.pe/indecopi" target="_blank" rel="noreferrer">Orientación de Indecopi ↗</a></div>
    </div>
    {legal && <VentanaLegal tipo={legal} alCerrar={() => setLegal(null)} />}
  </footer>;
}
