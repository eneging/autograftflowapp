/*
 * Portada: un celular que firma de verdad, en bucle (12 s), con las mismas opciones de la pantalla de firma real
 * (PantallaFirma): 1) firma con el dedo («✍️ Dibujar»); 2) o fotografía su firma hecha en papel («📷 Fotografiar firma»),
 * que se recorta y queda sin fondo; 3) «✓ Continuar» y el documento queda firmado. Todo es HTML, SVG y CSS
 * (bienvenida.css, prefijo «cf»); con «reducir movimiento» se ve solo el resultado.
 */

import "./celular-firma.css";

// Trazo de la firma (cursiva «María García» simplificada). El dedo recorre el mismo trazo con offset-path: misma escala.
const TRAZO = "M8 38 C 14 14, 22 12, 24 36 C 26 22, 32 16, 34 34 C 36 24, 42 22, 44 32 C 46 40, 52 26, 56 30 C 60 34, 62 38, 66 28 C 68 22, 72 24, 72 32 C 74 40, 82 22, 86 34 M 98 36 C 92 22, 108 10, 112 22 C 114 30, 104 38, 100 30 C 108 32, 114 30, 118 26 C 120 34, 126 34, 128 26 C 130 34, 136 34, 140 28 C 142 22, 148 24, 146 32 C 144 40, 154 36, 158 28 C 160 24, 166 26, 168 34 C 172 42, 182 30, 192 24";

export function CelularFirma() {
  return (
    <div className="cfEscena" role="img" aria-label="Animación: una persona firma un documento desde su celular, primero con el dedo y luego con una foto de su firma en papel.">
      <div className="cfCelular">
        <div className="cfMuesca" />
        <div className="cfPantalla">
          <div className="cfBarra"><span>9:41</span><span>AutograFlow</span><span>▮▮▮</span></div>
          <div className="cfDoc">
            <small>DOCUMENTO PARA FIRMAR</small>
            <strong>Acuerdo de servicios</strong>
            <i /><i /><i className="corta" />
          </div>
          <div className="cfMetodos">
            <span className="cfMetodo cfDibujar">✍️ Dibujar</span>
            <span className="cfMetodo">🖼️ Subir</span>
            <span className="cfMetodo cfFoto">📷 Fotografiar</span>
          </div>
          <div className="cfLienzo">
            <span className="cfGuia">Firma aquí</span>
            {/* 1 · Firma con el dedo: el trazo se dibuja mientras el dedo lo recorre. */}
            <svg className="cfTrazo" viewBox="0 0 200 56" width="200" height="56" aria-hidden><path d={TRAZO} pathLength={1} /></svg>
            <span className="cfDedo" aria-hidden><span /></span>
            {/* 2 · La firma fotografiada, ya recortada y sin fondo. */}
            <svg className="cfFirmaFoto" viewBox="0 0 200 56" width="200" height="56" aria-hidden><path d={TRAZO} /></svg>
          </div>
          <span className="cfContinuar">✓ Continuar</span>

          {/* Cámara: hoja con la firma en papel, encuadre y disparo. */}
          <div className="cfCamara" aria-hidden>
            <span className="cfCamaraTexto">Fotografía tu firma en papel</span>
            <div className="cfPapel"><svg viewBox="0 0 200 56" width="150" height="42"><path d={TRAZO} /></svg></div>
            <span className="cfEsquinas" />
            <span className="cfDisparador" />
            <span className="cfFlash" />
          </div>

          <div className="cfListo" aria-hidden><b>✓</b><div><strong>¡Documento firmado!</strong><small>Ya puedes descargar tu copia</small></div></div>
        </div>
      </div>
      <ol className="cfPasos" aria-hidden>
        <li className="cfPaso1">Firma con el dedo</li>
        <li className="cfPaso2">o con una foto de tu firma</li>
        <li className="cfPaso3">¡Listo, firmado!</li>
      </ol>
    </div>
  );
}
