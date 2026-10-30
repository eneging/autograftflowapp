import { useEffect, useRef, useState, type PointerEvent as EventoPuntero, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FILTROS, vistaPrevia, type Filtro } from "./escaner";
import type { Foto, TamanoHoja } from "./operaciones";
import "./revision-escaneo.css";

/*
 * Revisar lo escaneado, a pantalla completa y al estilo de Adobe Scan: la página en grande, las miniaturas, la barra de
 * herramientas (repetir, recortar, rotar, filtros, mover, eliminar) y, abajo, escanear más, compartir y guardar.
 */

const t = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICONOS: Record<string, ReactNode> = {
  atras: <path d="m14 5-7 7 7 7" {...t} />,
  sig: <path d="m10 5 7 7-7 7" {...t} />,
  repetir: <><path d="M4 9h2.5L8 6.5h6L15.5 9H20v10H4z" {...t} /><path d="M9 14a3 3 0 1 0 1-2.2M9 10.5V12h1.5" {...t} /></>,
  recortar: <path d="M7 3v14h14M3 7h14v14" {...t} />,
  rotar: <><path d="M19 12a7 7 0 1 1-2.1-5" {...t} /><path d="M19 3v4.5h-4.5" {...t} /></>,
  filtros: <><circle cx="9" cy="10" r="5.5" {...t} /><circle cx="15" cy="10" r="5.5" {...t} /><circle cx="12" cy="15" r="5.5" {...t} /></>,
  antes: <path d="M20 12H5m6-6-6 6 6 6" {...t} />,
  despues: <path d="M4 12h15m-6-6 6 6-6 6" {...t} />,
  eliminar: <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" {...t} />,
  mas: <><path d="M4 9h2.5L8 6.5h6L15.5 9H20v10H4z" {...t} /><path d="M12 11v5m-2.5-2.5h5" {...t} /></>,
  compartir: <><circle cx="17" cy="5.5" r="2.5" {...t} /><circle cx="6" cy="12" r="2.5" {...t} /><circle cx="17" cy="18.5" r="2.5" {...t} /><path d="m8.2 10.7 6.6-3.9M8.2 13.3l6.6 3.9" {...t} /></>,
  arriba: <path d="m6 15 6-6 6 6" {...t} />,
  abajo: <path d="m6 9 6 6 6-6" {...t} />,
};
const Icono = ({ n, tam = 22 }: { n: keyof typeof ICONOS; tam?: number }) => <svg viewBox="0 0 24 24" width={tam} height={tam} aria-hidden>{ICONOS[n]}</svg>;

/** Una página con su filtro y su giro, tal como saldrá en el PDF. Mantiene la imagen anterior hasta tener la nueva. */
function VistaPagina({ foto, filtro = foto.filtro, lado, alt }: { foto: Foto; filtro?: Filtro; lado: number; alt: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [lista, setLista] = useState(false);
  useEffect(() => {
    let vivo = true;
    vistaPrevia(foto.url, filtro, lado, foto.giro).then((c) => {
      const d = lienzo.current;
      if (!vivo || !d) return;
      d.width = c.width;
      d.height = c.height;
      d.getContext("2d")!.drawImage(c, 0, 0);
      setLista(true);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [foto.url, filtro, foto.giro, lado]);
  return <canvas ref={lienzo} role="img" aria-label={alt} className={lista ? "lista" : ""} />;
}

interface Props {
  fotos: Foto[];
  procesando: number;
  nombre: string;
  tamano: TamanoHoja;
  margen: boolean;
  /** Mensaje y avance mientras se crea el PDF. */
  proceso: { texto: string; avance: number } | null;
  error: string;
  /** Hay otra pantalla encima (la cámara o el recorte): las teclas no son para esta. */
  tapada: boolean;
  /** Propiedades para ordenar arrastrando cada miniatura. */
  arrastre: (i: number) => object;
  sobre: number | null;
  alNombre: (n: string) => void;
  alTamano: (t: TamanoHoja) => void;
  alMargen: (m: boolean) => void;
  alFiltro: (i: number, f: Filtro) => void;
  alFiltroTodas: (f: Filtro) => void;
  alRotar: (i: number) => void;
  alMover: (desde: number, hasta: number) => void;
  alEliminar: (i: number) => void;
  alRepetir: (i: number) => void;
  alRecortar: (i: number) => void;
  alEscanearMas: () => void;
  alGaleria: () => void;
  alGuardar: () => void;
  alFirmar: () => void;
  alCompartir?: () => void;
  alDescartar: () => void;
}

export function RevisionEscaneo(p: Props) {
  const { fotos } = p;
  const [i, setI] = useState(fotos.length - 1);
  const [panel, setPanel] = useState<"herramientas" | "filtros">("herramientas");
  const [verMiniaturas, setVerMiniaturas] = useState(true);
  const [menu, setMenu] = useState(false);
  const [confirmar, setConfirmar] = useState<"eliminar" | "descartar" | null>(null);
  const inicioGesto = useRef<number | null>(null);
  const cuantas = useRef(fotos.length);
  const actual = Math.min(i, fotos.length - 1), foto = fotos[actual];

  // Al sumar páginas se va a la última, como al volver de la cámara.
  useEffect(() => {
    if (fotos.length > cuantas.current) setI(fotos.length - 1);
    cuantas.current = fotos.length;
  }, [fotos.length]);
  // La miniatura elegida siempre a la vista.
  const tira = useRef<HTMLOListElement>(null);
  useEffect(() => { tira.current?.children[actual]?.scrollIntoView({ block: "nearest", inline: "center" }); }, [actual, verMiniaturas, panel]);

  const ir = (n: number) => setI(Math.max(0, Math.min(fotos.length - 1, n)));
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = antes; };
  }, []);
  useEffect(() => {
    if (p.tapada) return;
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
      else if (e.key === "ArrowRight") setI((n) => Math.min(fotos.length - 1, n + 1));
      else if (e.key === "Escape") { if (menu) setMenu(false); else if (confirmar) setConfirmar(null); else setConfirmar("descartar"); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [p.tapada, fotos.length, menu, confirmar]);

  /** Deslizar a los lados cambia de página. */
  const alSoltar = (ev: EventoPuntero) => {
    const dx = inicioGesto.current === null ? 0 : ev.clientX - inicioGesto.current;
    inicioGesto.current = null;
    if (Math.abs(dx) > 50) ir(actual + (dx < 0 ? 1 : -1));
  };

  const herramienta = (icono: keyof typeof ICONOS, texto: string, accion: () => void, opciones: { desactivada?: boolean; activa?: boolean } = {}) => (
    <button type="button" className={`rvHerramienta ${opciones.activa ? "activa" : ""}`} disabled={opciones.desactivada} onClick={accion}><Icono n={icono} /><span>{texto}</span></button>
  );

  return createPortal(
    <div className="rvPantalla" role="dialog" aria-modal="true" aria-label="Revisar el escaneo">
      <header className="rvArriba">
        <button type="button" className="rvIcono" onClick={() => setConfirmar("descartar")} aria-label="Salir del escaneo"><Icono n="atras" /></button>
        <input className="rvTitulo" value={p.nombre} maxLength={80} aria-label="Nombre del PDF" onChange={(ev) => p.alNombre(ev.target.value)} />
        <span className="rvIcono" aria-hidden />
      </header>

      <div className="rvEscena" onPointerDown={(ev) => { inicioGesto.current = ev.clientX; }} onPointerUp={alSoltar} onPointerCancel={() => { inicioGesto.current = null; }}>
        <VistaPagina key={foto.id} foto={foto} lado={1400} alt={`Página ${actual + 1}`} />
        {foto.carnet && <span className="rvEtiqueta">Carnet</span>}
      </div>

      <nav className="rvNavegar" aria-label="Páginas">
        <button type="button" className="rvIcono" disabled={actual === 0} onClick={() => ir(actual - 1)} aria-label="Página anterior"><Icono n="atras" /></button>
        <button type="button" className="rvPaginas" aria-expanded={verMiniaturas} onClick={() => setVerMiniaturas(!verMiniaturas)}>
          Página {actual + 1} de {fotos.length} <Icono n={verMiniaturas ? "abajo" : "arriba"} tam={18} />
        </button>
        <button type="button" className="rvIcono" disabled={actual === fotos.length - 1} onClick={() => ir(actual + 1)} aria-label="Página siguiente"><Icono n="sig" /></button>
      </nav>
      {p.procesando > 0 && <p className="rvAviso" role="status">Procesando {p.procesando === 1 ? "una foto" : `${p.procesando} fotos`}…</p>}
      {p.error && <p className="rvAviso rvError" role="alert">{p.error}</p>}

      {panel === "filtros" ? (
        <section className="rvFiltros" aria-label="Filtros">
          <div className="rvFiltrosLista" role="radiogroup" aria-label="Filtro de esta página">
            {FILTROS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={foto.filtro === f.id} className={foto.filtro === f.id ? "activo" : ""} onClick={() => p.alFiltro(actual, f.id)}>
                <span className="rvFiltroVista"><VistaPagina foto={foto} filtro={f.id} lado={220} alt="" /></span>
                <span>{f.nombre}</span>
              </button>
            ))}
          </div>
          <div className="rvFiltrosPie">
            {fotos.length > 1 && <button type="button" onClick={() => p.alFiltroTodas(foto.filtro)}>Aplicar a todas las páginas</button>}
            <button type="button" className="rvListo" onClick={() => setPanel("herramientas")}>Listo</button>
          </div>
        </section>
      ) : <>
        {verMiniaturas && (
          <ol ref={tira} className="rvMiniaturas" aria-label="Miniaturas. Arrastra para ordenar.">
            {fotos.map((f, k) => (
              <li key={f.id} className={`${k === actual ? "activa" : ""} ${p.sobre === k ? "sobre" : ""}`} {...p.arrastre(k)}>
                <button type="button" onClick={() => setI(k)} aria-label={`Ir a la página ${k + 1}`} aria-current={k === actual}>
                  <VistaPagina foto={f} lado={200} alt="" /><span className="rvNumero">{k + 1}</span>
                </button>
              </li>
            ))}
            <li className="rvMiniaturaMas"><button type="button" onClick={p.alEscanearMas} aria-label="Escanear otra página"><Icono n="mas" tam={26} /></button></li>
          </ol>
        )}
        <div className="rvHerramientas" role="toolbar" aria-label="Editar la página">
          {herramienta("repetir", "Repetir", () => p.alRepetir(actual))}
          {!foto.carnet && herramienta("recortar", "Recortar", () => p.alRecortar(actual))}
          {herramienta("rotar", "Rotar", () => p.alRotar(actual))}
          {herramienta("filtros", "Filtros", () => setPanel("filtros"))}
          {fotos.length > 1 && herramienta("antes", "Mover antes", () => { p.alMover(actual, actual - 1); setI(actual - 1); }, { desactivada: actual === 0 })}
          {fotos.length > 1 && herramienta("despues", "Mover después", () => { p.alMover(actual, actual + 1); setI(actual + 1); }, { desactivada: actual === fotos.length - 1 })}
          {herramienta("eliminar", "Eliminar", () => setConfirmar("eliminar"))}
        </div>
      </>}

      <footer className="rvPie">
        <button type="button" className="rvRedondo" onClick={p.alEscanearMas} aria-label="Escanear más páginas" title="Escanear más"><Icono n="mas" /></button>
        {p.alCompartir && <button type="button" className="rvRedondo" disabled={p.procesando > 0} onClick={p.alCompartir} aria-label="Compartir el PDF" title="Compartir"><Icono n="compartir" /></button>}
        <div className="rvGuardar">
          <button type="button" disabled={p.procesando > 0} onClick={p.alGuardar}>Guardar PDF</button>
          <button type="button" aria-haspopup="menu" aria-expanded={menu} aria-label="Más opciones de guardado" onClick={() => setMenu(!menu)}><Icono n="arriba" tam={20} /></button>
        </div>
      </footer>

      {menu && (
        <div className="rvFondo" onClick={() => setMenu(false)}>
          <div className="rvHoja" role="menu" onClick={(ev) => ev.stopPropagation()}>
            <label>Tamaño de hoja
              <select value={p.tamano} onChange={(ev) => p.alTamano(ev.target.value as TamanoHoja)}><option value="a4">A4</option><option value="carta">Carta</option><option value="imagen">Igual a la foto</option></select>
            </label>
            {p.tamano !== "imagen" && <label className="rvCheck"><input type="checkbox" checked={p.margen} onChange={(ev) => p.alMargen(ev.target.checked)} /> Dejar margen alrededor</label>}
            <button type="button" disabled={p.procesando > 0} onClick={() => { setMenu(false); p.alFirmar(); }}>✍️ Preparar para firmar</button>
            <button type="button" onClick={() => { setMenu(false); p.alGaleria(); }}>🖼️ Agregar imágenes de la galería</button>
            <button type="button" onClick={() => { setMenu(false); setConfirmar("descartar"); }}>Empezar de nuevo</button>
          </div>
        </div>
      )}

      {confirmar && (
        <div className="rvFondo" onClick={() => setConfirmar(null)}>
          <div className="rvHoja" role="alertdialog" aria-modal="true" onClick={(ev) => ev.stopPropagation()}>
            <strong>{confirmar === "eliminar" ? `¿Eliminar la página ${actual + 1}?` : "¿Descartar este escaneo?"}</strong>
            <p>{confirmar === "eliminar" ? "No se podrá recuperar." : `Se perderán ${fotos.length === 1 ? "la página escaneada" : `las ${fotos.length} páginas escaneadas`} si no guardaste el PDF.`}</p>
            <div className="rvHojaBotones">
              <button type="button" onClick={() => setConfirmar(null)}>Cancelar</button>
              <button type="button" className="rvPeligro" onClick={() => {
                const que = confirmar;
                setConfirmar(null);
                if (que === "eliminar") p.alEliminar(actual); else p.alDescartar();
              }}>{confirmar === "eliminar" ? "Eliminar" : "Descartar"}</button>
            </div>
          </div>
        </div>
      )}

      {p.proceso && (
        <div className="rvFondo rvCentro" role="status">
          <div className="rvProceso"><strong>{p.proceso.texto}</strong><progress max={1} value={p.proceso.avance} /></div>
        </div>
      )}
    </div>,
    document.body,
  );
}
