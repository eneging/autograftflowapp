import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import * as pdfjs from "pdfjs-dist";
import trabajador from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Pagina } from "../../../shared/plataforma";

pdfjs.GlobalWorkerOptions.workerSrc = trabajador;
type DocPdf = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

/** Carga un PDF (con la sesión o el enlace del firmante) para dibujar sus páginas. */
export function usarPdf(url: string | null) {
  const [doc, setDoc] = useState<DocPdf | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!url) return;
    let cancelado = false;
    const tarea = pdfjs.getDocument({ url, withCredentials: true });
    tarea.promise.then((d) => !cancelado && setDoc(d)).catch(() => !cancelado && setError("No se pudo abrir el documento."));
    return () => { cancelado = true; tarea.destroy(); };
  }, [url]);
  return { doc, error };
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
}

/** Una página del PDF dibujada al ancho disponible, con los campos encima en el mismo sistema de coordenadas. */
export function PaginaPdf({ doc, numero, pagina, children, alTocar, cursor, refContenedor }: Props) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [ancho, setAncho] = useState(0);
  // Número de la última página que terminó de dibujarse: al cambiar solo el tamaño no se vuelve a mostrar «Cargando».
  const [dibujada, setDibujada] = useState(0);

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
      {dibujada !== numero && <div className="pdfCargando">Cargando página {numero}…</div>}
      {children}
    </div>
  );
}

export function NavPaginas({ actual, total, alCambiar }: { actual: number; total: number; alCambiar: (n: number) => void }) {
  if (total <= 1) return <div className="signerPageNav"><span>Página <b>1</b> de <b>1</b></span></div>;
  return (
    <div className="signerPageNav">
      <button type="button" disabled={actual <= 1} onClick={() => alCambiar(actual - 1)}>← Anterior</button>
      <span>Página <b>{actual}</b> de <b>{total}</b></span>
      <button type="button" disabled={actual >= total} onClick={() => alCambiar(actual + 1)}>Siguiente →</button>
    </div>
  );
}
