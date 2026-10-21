/**
 * Visto de una casilla marcada, dibujado a escala del recuadro (no con una letra «✓», que en casillas pequeñas se
 * sale hacia abajo). Usa la misma forma y proporción que PdfFinal::palomita, así se ve igual en pantalla y en el PDF.
 */
export function MarcaCasilla() {
  return (
    <svg className="marcaCasilla" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <polyline points="18,48 42,76 86,16" fill="none" stroke="currentColor" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
