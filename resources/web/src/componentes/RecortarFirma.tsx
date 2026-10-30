import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LIMITES } from "../../../shared/esquema";
import { detectarFirma, girarRecorte, limpiarFirma, moverRecorte, type Asa, type Recorte } from "../../../shared/firmaImagen";
import { cargarImagen, girar } from "./Huella";
import { usarT } from "./idioma";

const ASAS: Exclude<Asa, "mover">[] = ["n", "s", "e", "o", "no", "ne", "so", "se"];
const TODA: Recorte = { x: 0, y: 0, w: 1, h: 1 };
const AL_CENTRO: Recorte = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };

/** PNG que entra en el límite de una firma: si pesa de más se reduce, sin tocar sus colores. */
function aPng(c: HTMLCanvasElement): string {
  let png = c.toDataURL("image/png"), actual = c;
  while (png.length >= LIMITES.firmaBytes * 1.37 && actual.width > 120) {
    const menor = document.createElement("canvas");
    menor.width = Math.round(actual.width * 0.8);
    menor.height = Math.round(actual.height * 0.8);
    menor.getContext("2d")!.drawImage(actual, 0, 0, menor.width, menor.height);
    actual = menor;
    png = actual.toDataURL("image/png");
  }
  return png;
}

/** Recorta el espacio vacío alrededor de lo dibujado y limita el tamaño del PNG. */
export function recortar(origen: HTMLCanvasElement, margen = 6): string {
  const ctx = origen.getContext("2d")!;
  const { width: w, height: h } = origen;
  const px = ctx.getImageData(0, 0, w, h).data;
  let x1 = w, y1 = h, x2 = -1, y2 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 10) {
        if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      }
  if (x2 < 0) return aPng(origen);
  x1 = Math.max(0, x1 - margen); y1 = Math.max(0, y1 - margen); x2 = Math.min(w - 1, x2 + margen); y2 = Math.min(h - 1, y2 + margen);
  const k = Math.min(1, 900 / (x2 - x1 + 1));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round((x2 - x1 + 1) * k));
  out.height = Math.max(1, Math.round((y2 - y1 + 1) * k));
  out.getContext("2d")!.drawImage(origen, x1, y1, x2 - x1 + 1, y2 - y1 + 1, 0, 0, out.width, out.height);
  return aPng(out);
}

/** La foto elegida, en un lienzo de hasta 3000 px por lado (de ahí sale el recorte con todo su detalle). */
export async function cargarFoto(archivo: File): Promise<HTMLCanvasElement> {
  const img = await cargarImagen(archivo);
  const k = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext("2d", { willReadFrequently: true })!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Un PNG se usa como viene: sin quitar fondo ni retocar. Solo se descartan los márgenes transparentes. */
export const pngSinRetoques = async (archivo: File) => recortar(await cargarFoto(archivo));

/** Copia de un trozo de la foto, escalada para que el lado mayor mida `lado` (como mucho `maxK` veces el original). */
function trozo(foto: HTMLCanvasElement, r: Recorte, lado: number, maxK: number) {
  const sx = r.x * foto.width, sy = r.y * foto.height, sw = Math.max(1, r.w * foto.width), sh = Math.max(1, r.h * foto.height);
  const k = Math.min(maxK, lado / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(foto, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return { c, ctx };
}

/** Recorta y quita el fondo. Se amplía antes de limpiar: el borde del trazo sale liso aunque la firma ocupe poco en la foto. */
function procesar(foto: HTMLCanvasElement, r: Recorte, esFirma: boolean): string | null {
  const { c, ctx } = trozo(foto, r, 1400, 3);
  const { imagen, tinta } = limpiarFirma(ctx.getImageData(0, 0, c.width, c.height), esFirma);
  if (!tinta) return null;
  ctx.putImageData(new ImageData(imagen.data as Uint8ClampedArray<ArrayBuffer>, imagen.width, imagen.height), 0, 0);
  return recortar(c, 10);
}

interface Props {
  /** Foto original. */
  foto: HTMLCanvasElement;
  /** Recorte anterior; sin él se busca la firma en la foto. */
  recorte: Recorte | null;
  tipo: "firma" | "sello";
  alUsar: (png: string, foto: HTMLCanvasElement, recorte: Recorte) => void;
  alCancelar: () => void;
}

/** Ajuste del área de una foto: marco con asas en las 4 esquinas y los 4 lados, sobre la foto completa. */
export function RecortarFirma({ foto, recorte, tipo, alUsar, alCancelar }: Props) {
  const t = usarT();
  const esFirma = tipo === "firma";
  const [lienzo, setLienzo] = useState(foto);
  const [r, setR] = useState<Recorte>(recorte ?? AL_CENTRO);
  const [aviso, setAviso] = useState(t("Arrastra las esquinas o los lados del marco hasta dejar dentro solo lo que quieres usar."));
  const [ocupado, setOcupado] = useState(false);
  const escena = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const arrastre = useRef<{ asa: Asa; x: number; y: number; r: Recorte } | null>(null);
  const vista = useMemo(() => trozo(lienzo, TODA, 1400, 1).c.toDataURL("image/jpeg", 0.85), [lienzo]);

  function detectar(c: HTMLCanvasElement) {
    const { c: chica, ctx } = trozo(c, TODA, 1000, 1);
    const hallado = detectarFirma(ctx.getImageData(0, 0, chica.width, chica.height), esFirma);
    setR(hallado ?? AL_CENTRO);
    setAviso(t(hallado
      ? (esFirma ? "Marcamos tu firma. Si hace falta, ajusta el marco por las esquinas o los lados." : "Marcamos tu sello. Si hace falta, ajusta el marco por las esquinas o los lados.")
      : (esFirma ? "No pudimos ubicar la firma: arrastra las esquinas o los lados del marco hasta dejarla dentro." : "No pudimos ubicar el sello: arrastra las esquinas o los lados del marco hasta dejarlo dentro.")));
  }
  useEffect(() => { if (!recorte) detectar(foto); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // La foto ocupa todo lo posible sin deformarse.
  useLayoutEffect(() => {
    const e = escena.current!;
    const ajustar = () => {
      const k = Math.min(e.clientWidth / lienzo.width, e.clientHeight / lienzo.height);
      setTam({ w: lienzo.width * k, h: lienzo.height * k });
    };
    ajustar();
    const obs = new ResizeObserver(ajustar);
    obs.observe(e);
    return () => obs.disconnect();
  }, [lienzo]);

  function usar() {
    setOcupado(true);
    // Se deja pintar el «Procesando…» antes del cálculo, que toma un momento en el celular.
    setTimeout(() => {
      const png = procesar(lienzo, r, esFirma);
      setOcupado(false);
      if (png) alUsar(png, lienzo, r);
      else setAviso(t("No encontramos ningún trazo dentro del marco. Amplía el marco o prueba con otra foto."));
    }, 30);
  }

  const marco = { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` };
  return (
    <div className="rfPantalla" role="dialog" aria-modal="true" aria-label={t(esFirma ? "Recortar firma" : "Recortar sello")}>
      <div className="rfAviso" role="status">{aviso}</div>
      <div ref={escena} className="rfEscena">
        <div className="rfFoto" style={{ width: tam.w, height: tam.h }}>
          <img src={vista} alt={t("Foto para recortar")} draggable={false} />
          <div className="rfSombra"><div style={marco} /></div>
          <div
            className="rfMarco" style={marco}
            onPointerDown={(ev) => {
              ev.preventDefault();
              ev.currentTarget.setPointerCapture(ev.pointerId);
              arrastre.current = { asa: ((ev.target as HTMLElement).dataset.asa as Asa | undefined) ?? "mover", x: ev.clientX, y: ev.clientY, r };
            }}
            onPointerMove={(ev) => {
              const a = arrastre.current;
              if (a) setR(moverRecorte(a.r, a.asa, (ev.clientX - a.x) / tam.w, (ev.clientY - a.y) / tam.h));
            }}
            onPointerUp={() => (arrastre.current = null)}
            onPointerCancel={() => (arrastre.current = null)}
          >
            {ASAS.map((a) => <span key={a} className={`rfAsa rfAsa-${a}`} data-asa={a} />)}
          </div>
        </div>
      </div>
      <div className="rfHerramientas">
        <button type="button" disabled={ocupado} onClick={() => detectar(lienzo)}>{t(esFirma ? "🔍 Detectar firma" : "🔍 Detectar sello")}</button>
        <button type="button" disabled={ocupado} onClick={() => setR(TODA)}>{t("⛶ Toda la foto")}</button>
        <button type="button" disabled={ocupado} onClick={() => { setLienzo(girar(lienzo)); setR(girarRecorte(r)); }}>{t("↻ Girar 90°")}</button>
      </div>
      <div className="rfPie">
        <button type="button" disabled={ocupado} onClick={alCancelar}>{t("Cancelar")}</button>
        <button type="button" className="primary" disabled={ocupado} onClick={usar}>{t(ocupado ? "Procesando la imagen…" : "✂️ Recortar y quitar fondo")}</button>
      </div>
    </div>
  );
}
