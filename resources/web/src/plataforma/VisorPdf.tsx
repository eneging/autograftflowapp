import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { usarT } from "../componentes/idioma";
import { CargaLogo } from "../componentes/CargaLogo";
import * as pdfjs from "pdfjs-dist";
import trabajador from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Pagina } from "../../../shared/plataforma";

pdfjs.GlobalWorkerOptions.workerSrc = trabajador;
type DocPdf = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

/** Abre un PDF ya cargado en memoria (p. ej. para leer su formulario antes de subirlo). */
export const leerPdf = (datos: Uint8Array) => pdfjs.getDocument({ data: datos }).promise;

/** Carga un PDF (con la sesión o el enlace del firmante) para dibujar sus páginas. */
export function usarPdf(url: string | null) {
  const [doc, setDoc] = useState<DocPdf | null>(null);
  const [error, setError] = useState("");
  // De 0 a 1 mientras se descarga; null si el servidor no dice cuánto pesa.
  const [avance, setAvance] = useState<number | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelado = false;
    const tarea = pdfjs.getDocument({ url, withCredentials: true });
    tarea.onProgress = ({ loaded, total }: { loaded: number; total: number }) => { if (!cancelado && total > 0) setAvance(loaded / total); };
    tarea.promise.then((d) => !cancelado && setDoc(d)).catch(() => !cancelado && setError("No se pudo abrir el documento."));
    return () => { cancelado = true; tarea.destroy(); };
  }, [url]);
  return { doc, error, avance };
}

/** Porcentajes para colocar un rectángulo (en puntos, desde arriba a la izquierda) sobre la página. */
export const posicion = (r: { x: number; y: number; w: number; h: number }, p: Pagina) => ({
  left: `${(r.x / p.ancho) * 100}%`, top: `${(r.y / p.alto) * 100}%`, width: `${(r.w / p.ancho) * 100}%`, height: `${(r.h / p.alto) * 100}%`,
});

interface Props {
  doc: DocPdf | null;
  numero: number;
  pagina: Pagina;
  children?: ReactNode;
  /** Toque sobre la página (no sobre un campo), en puntos PDF. */
  alTocar?: (punto: { x: number; y: number }, e: PointerEvent<HTMLDivElement>) => void;
  cursor?: string;
  refContenedor?: (el: HTMLDivElement | null) => void;
  /** Avance de la descarga del PDF (de usarPdf), para mostrar el porcentaje mientras llega. */
  avance?: number | null;
}

/** Una página del PDF dibujada al ancho disponible, con los campos encima en el mismo sistema de coordenadas. */
export function PaginaPdf({ doc, numero, pagina, children, alTocar, cursor, refContenedor, avance = null }: Props) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [ancho, setAncho] = useState(0);
  // Número de la última página que terminó de dibujarse: al cambiar solo el tamaño no se vuelve a mostrar «Cargando».
  const [dibujada, setDibujada] = useState(0);
  const t = usarT();

  useEffect(() => {
    const el = contenedor.current!;
    const obs = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!doc || !ancho) return;
    let cancelado = false;
    let tarea: { cancel: () => void; promise: Promise<void> } | null = null;
    const t = setTimeout(async () => {
      const p = await doc.getPage(numero);
      if (cancelado) return;
      const base = p.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const vp = p.getViewport({ scale: (ancho / base.width) * dpr });
      const c = lienzo.current!;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      tarea = p.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp });
      try {
        await tarea.promise;
        if (!cancelado) setDibujada(numero);
      } catch {
        /* render cancelado al cambiar de página o de tamaño */
      }
    }, 60);
    return () => { cancelado = true; clearTimeout(t); tarea?.cancel(); };
  }, [doc, numero, ancho]);

  return (
    <div
      ref={(el) => { contenedor.current = el; refContenedor?.(el); }}
      className="page pdfPagina" style={{ aspectRatio: `${pagina.ancho} / ${pagina.alto}`, cursor }}
      onPointerDown={alTocar ? (e) => {
        if (e.target !== e.currentTarget && e.target !== lienzo.current) return;
        const r = contenedor.current!.getBoundingClientRect();
        alTocar({ x: ((e.clientX - r.left) / r.width) * pagina.ancho, y: ((e.clientY - r.top) / r.height) * pagina.alto }, e);
      } : undefined}
    >
      <canvas ref={lienzo} className="pdfLienzo" aria-label={`Página ${numero}`} />
      {dibujada !== numero && <div className="pdfCargando">
        <CargaLogo tam={44} avance={doc ? null : avance} texto={doc ? t("Cargando página {n}…", { n: numero }) : t("Abriendo el documento…")} />
      </div>}
      {children}
    </div>
  );
}

export function NavPaginas({ actual, total, alCambiar }: { actual: number; total: number; alCambiar: (n: number) => void }) {
  const t = usarT();
  if (total <= 1) return <div className="signerPageNav"><span>{t("Página")} <b>1</b> {t("de")} <b>1</b></span></div>;
  return (
    <div className="signerPageNav">
      <button type="button" disabled={actual <= 1} onClick={() => alCambiar(actual - 1)}>{t("← Anterior")}</button>
      <span>{t("Página")} <b>{actual}</b> {t("de")} <b>{total}</b></span>
      <button type="button" disabled={actual >= total} onClick={() => alCambiar(actual + 1)}>{t("Siguiente →")}</button>
    </div>
  );
}
