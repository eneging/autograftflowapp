import type { LineaOcr } from "../../../../shared/exTrae";

/*
 * OCR de EX-Trae con Tesseract.js, en el navegador (la foto no se sube). La librería y el idioma español se descargan
 * de jsDelivr la primera vez (luego quedan en la caché del navegador).
 */
const URL_TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";

interface PalabraT { text: string; confidence: number }
interface LineaT { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; words?: PalabraT[] }
interface ResultadoT { data: { text?: string; confidence?: number; blocks?: { paragraphs?: { lines?: LineaT[] }[] }[] | null } }
interface TrabajadorT { recognize: (img: HTMLCanvasElement, opciones?: object, salida?: object) => Promise<ResultadoT>; terminate: () => Promise<void> }
interface TesseractT { createWorker: (idioma: string, oem: number, opciones: { logger: (m: { status?: string; progress?: number }) => void }) => Promise<TrabajadorT> }
declare global { interface Window { Tesseract?: TesseractT } }

let libreria: Promise<TesseractT> | null = null;
let trabajador: Promise<TrabajadorT> | null = null;
let informar: (avance: number, etapa: string) => void = () => {};

function cargarLibreria(): Promise<TesseractT> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  libreria ??= new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = URL_TESSERACT;
    s.async = true;
    s.onload = () => (window.Tesseract ? ok(window.Tesseract) : mal(new Error("No se pudo iniciar el lector de texto.")));
    s.onerror = () => { libreria = null; mal(new Error("No se pudo descargar el lector de texto. Revisa tu conexión a internet.")); };
    document.head.appendChild(s);
  });
  return libreria;
}

const ETAPAS: Record<string, string> = {
  "loading tesseract core": "Preparando el lector…", "initializing tesseract": "Preparando el lector…",
  "loading language traineddata": "Descargando el idioma español (solo la primera vez)…", "initializing api": "Preparando el lector…",
  "recognizing text": "Leyendo el texto…",
};

/** Foto lista para leer: tamaño cómodo para el OCR y en gris con algo más de contraste. */
function preparar(archivo: File): Promise<HTMLCanvasElement> {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo), img = new Image();
    img.onload = () => {
      try {
        const lado = Math.max(img.naturalWidth, img.naturalHeight);
        // Amplía fotos pequeñas; limita las grandes para no agotar la memoria del celular.
        const f = lado < 1200 ? Math.min(2, 2200 / lado) : Math.min(1, 2600 / lado);
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * f);
        c.height = Math.round(img.naturalHeight * f);
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const datos = ctx.getImageData(0, 0, c.width, c.height), px = datos.data;
        for (let i = 0; i < px.length; i += 4) {
          const v = Math.max(0, Math.min(255, (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] - 128) * 1.15 + 136));
          px[i] = px[i + 1] = px[i + 2] = v;
        }
        ctx.putImageData(datos, 0, 0);
        ok(c);
      } catch (e) { mal(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo abrir la imagen.")); };
    img.src = url;
  });
}

/**
 * Lee la foto y devuelve sus líneas con su confianza y su caja. Dentro de cada línea se quitan las palabras que el OCR
 * casi no pudo leer (suelen ser trazos de un logo o un dibujo).
 */
export async function leerImagen(archivo: File, alAvance: (avance: number, etapa: string) => void): Promise<LineaOcr[]> {
  informar = alAvance;
  alAvance(0.02, "Preparando la imagen…");
  const [T, lienzo] = await Promise.all([cargarLibreria(), preparar(archivo)]);
  trabajador ??= T.createWorker("spa", 1, {
    logger: (m) => { if (typeof m.progress === "number") informar(m.status === "recognizing text" ? 0.3 + m.progress * 0.7 : m.progress * 0.3, ETAPAS[m.status ?? ""] ?? "Leyendo…"); },
  }).catch((e) => { trabajador = null; throw e; });
  const w = await trabajador;
  const r = await w.recognize(lienzo, {}, { text: true, blocks: true });
  const lineas: LineaOcr[] = [];
  for (const b of r.data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
    const palabras = l.words?.filter((x) => x.confidence >= 35).map((x) => x.text);
    const texto = (palabras ? palabras.join(" ") : l.text).trim();
    if (texto) lineas.push({ texto, confianza: l.confidence, x: l.bbox.x0, y: l.bbox.y0, alto: l.bbox.y1 - l.bbox.y0 });
  }
  // Sin detalle por líneas (otra versión de la librería): el texto plano con la confianza general.
  if (!lineas.length && r.data.text) {
    r.data.text.split("\n").forEach((t, i) => t.trim() && lineas.push({ texto: t.trim(), confianza: r.data.confidence ?? 70, x: 0, y: i * 20, alto: 14 }));
  }
  alAvance(1, "Listo");
  return lineas;
}
