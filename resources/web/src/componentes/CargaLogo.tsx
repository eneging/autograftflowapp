/*
 * Marca de AutograFlow y su versión «cargando». Van en un archivo aparte (sin dependencias) para poder usarlas desde el
 * visor de PDF y la API sin importar el Marco, que a su vez importa la plataforma.
 */

/** Marca: una hoja con sombra sólida (bloque blanco con borde negro) y una «A» con serifa sobre un trazo de firma. */
export function LogoMarca({ tam = 26 }: { tam?: number }) {
  return (
    <svg className="logoF" viewBox="0 0 64 64" width={tam} height={tam} aria-hidden>
      <rect x="10" y="10" width="48" height="48" rx="10" className="logoTinta" />
      <rect x="5" y="5" width="48" height="48" rx="10" className="logoPapel" strokeWidth="3.6" />
      <text x="29" y="38" textAnchor="middle" className="logoLetra" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="29">A</text>
      <path d="M14.5 45.5c5-4.2 8.6 2.4 13.2-.8 4.2-3 7.6-4.6 12.3-.6" fill="none" className="logoTrazo" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * El logo animado (el trazo de firma se dibuja una y otra vez) mientras algo carga. Con avance (de 0 a 1) muestra el
 * porcentaje y una barra; sin él, solo la animación.
 */
export function CargaLogo({ avance = null, texto, tam = 56 }: { avance?: number | null; texto?: string; tam?: number }) {
  const pct = avance == null ? null : Math.round(Math.min(1, Math.max(0, avance)) * 100);
  return (
    <div className="cargaLogo" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label={texto || "Cargando"}>
      <span className="cargaLogoMarca"><LogoMarca tam={tam} /></span>
      {pct != null && <strong className="cargaLogoPct">{pct}%</strong>}
      {pct != null && <span className="cargaLogoBarra"><span style={{ width: `${pct}%` }} /></span>}
      {texto && <span className="cargaLogoTexto">{texto}</span>}
    </div>
  );
}

/** CargaLogo a pantalla completa, sobre todo lo demás (p. ej. mientras se sube un PDF). */
export const CargaLogoPantalla = (props: Parameters<typeof CargaLogo>[0]) => (
  <div className="cargaLogoPantalla"><CargaLogo {...props} /></div>
);
