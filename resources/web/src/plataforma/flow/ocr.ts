import type { LineaOcr } from "../../../../shared/exTrae";

/*
 * OCR de EX-Trae con Tesseract.js, en el navegador (la foto no se sube). La librería y el idioma español se descargan
 * de jsDelivr la primera vez (luego quedan en la caché del navegador).
 */
const URL_TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";

interface PalabraT { text: string; confidence: number }
interface LineaT { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number }; words?: PalabraT[] }
interface ResultadoT { data: { text?: string; confidence?: number; blocks?: { paragraphs?: { lines?: LineaT[] }[] }[] | null } }
interface TrabajadorT {
  recognize: (img: HTMLCanvasElement, opciones?: object, salida?: object) => Promise<ResultadoT>; terminate: () => Promise<void>;
  setParameters?: (p: Record<string, string>) => Promise<unknown>;
}
interface TesseractT { createWorker: (idioma: string, oem: number, opciones: { logger: (m: { status?: string; progress?: number }) => void }) => Promise<TrabajadorT> }
declare global { interface Window { Tesseract?: TesseractT } }

let libreria: Promise<TesseractT> | null = null;
let trabajador: Promise<TrabajadorT> | null = null;
let informar: (avance: number, etapa: string) => void = () => {};
/** Tramo de la barra de avance de la lectura en curso (el «logger» del trabajador se crea una sola vez). */
let tramo: [number, number] = [0.3, 0.75];

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

interface Gris { g: Uint8Array; w: number; h: number }
const tope = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * La foto en gris, a la escala que mejor lee el OCR: las letras de una foto de webcam o de lejos miden pocos píxeles,
 * así que se amplía hasta ~2800 px de lado (máx. ×3); las fotos enormes se reducen para no agotar la memoria.
 */
function cargar(archivo: File): Promise<Gris> {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo), img = new Image();
    img.onload = () => {
      try {
        const lado = Math.max(img.naturalWidth, img.naturalHeight);
        const f = lado < 2400 ? Math.min(3, 2800 / lado) : Math.min(1, 3200 / lado);
        const w = Math.round(img.naturalWidth * f), h = Math.round(img.naturalHeight * f);
        const c = lienzo(w, h), ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        const px = ctx.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) g[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8;
        ok({ g, w, h });
      } catch (e) { mal(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo abrir la imagen.")); };
    img.src = url;
  });
}

function lienzo(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function aLienzo(v: Uint8Array, w: number, h: number) {
  const c = lienzo(w, h), ctx = c.getContext("2d")!, datos = ctx.createImageData(w, h), px = datos.data;
  for (let i = 0; i < w * h; i++) { px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v[i]; px[i * 4 + 3] = 255; }
  ctx.putImageData(datos, 0, 0);
  return c;
}

/** Solo gris con algo más de contraste (lo de siempre): sirve de respaldo si la versión adaptativa lee peor. */
function suave({ g, w, h }: Gris): Uint8Array {
  const v = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) v[i] = tope((g[i] - 128) * 1.15 + 136);
  return v;
}

/**
 * Texto negro sobre blanco aunque la foto tenga sombras, reflejos o letra clara sobre fondo oscuro (modo oscuro,
 * carteles). Por zonas: si lo minoritario y llamativo es claro (asimetría positiva), la zona se invierte; después,
 * umbral de Sauvola (media y desviación de la zona). El resultado queda en grises, no en blanco y negro puro: la red
 * de Tesseract reconoce mejor las letras con sus bordes suaves (medido: 80 % → 97 % de caracteres en un chat oscuro).
 * Las estadísticas se calculan en bloques de 4×4 px con imágenes integrales: rápido incluso en el celular.
 */
function adaptativa({ g, w, h }: Gris, pendiente = 2, base = 190): Uint8Array {
  const r = 4, bw = Math.ceil(w / r), bh = Math.ceil(h / r), nb = bw * bh;
  const s1 = new Float64Array(nb), s2 = new Float64Array(nb), s3 = new Float64Array(nb), n = new Float64Array(nb);
  for (let y = 0; y < h; y++) {
    const fila = ((y / r) | 0) * bw;
    for (let x = 0; x < w; x++) {
      const b = fila + ((x / r) | 0), p = g[y * w + x];
      s1[b] += p; s2[b] += p * p; s3[b] += p * p * p; n[b]++;
    }
  }
  // Imágenes integrales de los bloques: la suma de cualquier rectángulo en 4 lecturas.
  const integral = (s: Float64Array) => {
    const I = new Float64Array((bw + 1) * (bh + 1));
    for (let y = 0; y < bh; y++) {
      let fila = 0;
      for (let x = 0; x < bw; x++) { fila += s[y * bw + x]; I[(y + 1) * (bw + 1) + x + 1] = I[y * (bw + 1) + x + 1] + fila; }
    }
    return I;
  };
  const [I1, I2, I3, IN] = [integral(s1), integral(s2), integral(s3), integral(n)];
  const suma = (I: Float64Array, x0: number, y0: number, x1: number, y1: number) =>
    I[y1 * (bw + 1) + x1] - I[y0 * (bw + 1) + x1] - I[y1 * (bw + 1) + x0] + I[y0 * (bw + 1) + x0];
  // Ventana de Sauvola ≈ 2-3 renglones; la de polaridad, 3 veces más grande (abarca un globo de chat o un cartel).
  const rs = Math.max(3, Math.round(Math.min(w, h) / 55 / r)), rp = rs * 3;
  const media = new Float32Array(nb), desv = new Float32Array(nb), invertir = new Uint8Array(nb);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let x0 = Math.max(0, bx - rs), y0 = Math.max(0, by - rs), x1 = Math.min(bw, bx + rs + 1), y1 = Math.min(bh, by + rs + 1);
      let c = suma(IN, x0, y0, x1, y1), m = suma(I1, x0, y0, x1, y1) / c;
      media[by * bw + bx] = m;
      desv[by * bw + bx] = Math.sqrt(Math.max(0, suma(I2, x0, y0, x1, y1) / c - m * m));
      x0 = Math.max(0, bx - rp); y0 = Math.max(0, by - rp); x1 = Math.min(bw, bx + rp + 1); y1 = Math.min(bh, by + rp + 1);
      c = suma(IN, x0, y0, x1, y1); m = suma(I1, x0, y0, x1, y1) / c;
      const v = Math.max(1, suma(I2, x0, y0, x1, y1) / c - m * m), sd = Math.sqrt(v);
      const asimetria = (suma(I3, x0, y0, x1, y1) / c - 3 * m * v - m * m * m) / (v * sd);
      // Asimetría clara: decide ella. Dudosa: un fondo oscuro casi siempre lleva letra clara.
      invertir[by * bw + bx] = sd > 12 && (asimetria > 0.35 || (asimetria > -0.35 && m < 100)) ? 1 : 0;
    }
  }
  const salida = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const fila = ((y / r) | 0) * bw;
    for (let x = 0; x < w; x++) {
      const b = fila + ((x / r) | 0), s = desv[b];
      if (s < 7) { salida[y * w + x] = 255; continue; } // zona lisa: fondo
      const inv = invertir[b], p = inv ? 255 - g[y * w + x] : g[y * w + x], m = inv ? 255 - media[b] : media[b];
      const umbral = m * (1 + 0.2 * (s / 128 - 1));
      salida[y * w + x] = tope(base + (p - umbral) * pendiente);
    }
  }
  return salida;
}

/**
 * Inclinación de los renglones en grados (± 15°), sobre la imagen ya en blanco y negro: se proyectan los píxeles de
 * tinta sobre el eje vertical girado y gana el ángulo en que se apilan en franjas más marcadas (renglones derechos).
 */
function inclinacion(v: Uint8Array, w: number, h: number): number {
  const xs: number[] = [], ys: number[] = [];
  const paso = Math.max(1, Math.round(Math.sqrt((w * h) / 120_000))); // ~120 000 muestras como máximo
  for (let y = 0; y < h; y += paso) for (let x = 0; x < w; x += paso) if (v[y * w + x] < 110) { xs.push(x); ys.push(y); }
  if (xs.length < 200) return 0;
  const franja = 2, desplazamiento = w, bins = new Float64Array(Math.ceil((w + h * 2) / franja) + 2);
  const puntuar = (grados: number) => {
    const a = (grados * Math.PI) / 180, s = Math.sin(a), c = Math.cos(a);
    bins.fill(0);
    for (let i = 0; i < xs.length; i++) bins[((ys[i] * c - xs[i] * s + desplazamiento) / franja) | 0]++;
    let total = 0;
    for (let i = 0; i < bins.length; i++) total += bins[i] * bins[i];
    return total;
  };
  let mejor = 0, puntos = puntuar(0);
  for (let g = -15; g <= 15; g += 1) { const p = puntuar(g); if (p > puntos) { puntos = p; mejor = g; } }
  for (let g = mejor - 0.75; g <= mejor + 0.75; g += 0.25) { const p = puntuar(g); if (p > puntos) { puntos = p; mejor = g; } }
  return Math.abs(mejor) < 0.5 ? 0 : mejor;
}

/** La imagen como lienzo, girada para que los renglones queden horizontales (las esquinas nuevas, en blanco). */
function derecha(v: Uint8Array, w: number, h: number, grados: number) {
  const c = aLienzo(v, w, h);
  if (!grados) return c;
  const a = (-grados * Math.PI) / 180, s = Math.abs(Math.sin(a)), co = Math.abs(Math.cos(a));
  const r = lienzo(Math.round(w * co + h * s), Math.round(w * s + h * co)), ctx = r.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, r.width, r.height);
  ctx.translate(r.width / 2, r.height / 2);
  ctx.rotate(a);
  ctx.drawImage(c, -w / 2, -h / 2);
  return r;
}

/**
 * Lee la foto y devuelve sus líneas con su confianza y su caja. Dentro de cada línea se quitan las palabras que el OCR
 * casi no pudo leer (suelen ser trazos de un logo o un dibujo).
 */
export async function leerImagen(archivo: File, alAvance: (avance: number, etapa: string) => void): Promise<LineaOcr[]> {
  // Cada lectura ocupa un tramo de la barra de avance (ver abajo).
  tramo = [0.3, 0.65];
  informar =(avance, etapa) => alAvance(avance, etapa);
  alAvance(0.02, "Preparando la imagen…");
  const [T, gris] = await Promise.all([cargarLibreria(), cargar(archivo)]);
  trabajador ??= T.createWorker("spa", 1, {
    logger: (m) => {
      if (typeof m.progress !== "number") return;
      if (m.status === "recognizing text") informar(tramo[0] + m.progress * (tramo[1] - tramo[0]), tramo[0] > 0.3 ? "Probando otra forma de leer…" : "Leyendo el texto…");
      else informar(m.progress * 0.3, ETAPAS[m.status ?? ""] ?? "Leyendo…");
    },
  }).catch((e) => { trabajador = null; throw e; });
  const w = await trabajador;
  alAvance(0.3, "Mejorando la imagen…");
  const limpia = adaptativa(gris), grados = inclinacion(limpia, gris.w, gris.h);
  const imagen = derecha(limpia, gris.w, gris.h, grados);
  /** psm 3: página con bloques y columnas; 11: texto suelto (chats, carteles, etiquetas). */
  const leer = async (img: HTMLCanvasElement, psm: "3" | "11") => {
    // Respeta los espacios entre palabras y evita que adivine la resolución de una foto.
    await w.setParameters?.({ tessedit_pageseg_mode: psm, preserve_interword_spaces: "1", user_defined_dpi: "300" }).catch(() => {});
    return lineasDe(await w.recognize(img, {}, { text: true, blocks: true }));
  };
  // Se lee de las dos formas y gana la que más palabras seguras dio: la confianza general de Tesseract engaña (en un
  // chat, «página» puede dar 93 % de confianza y leer peor que «texto suelto»).
  tramo = [0.3, 0.65];
  let mejor = await leer(imagen, "11");
  tramo = [0.65, 0.95];
  const pagina = await leer(imagen, "3");
  if (pagina.puntaje > mejor.puntaje) mejor = pagina;
  // Último recurso, si casi no se leyó nada: la foto sin invertir (por si el arreglo borró algo, p. ej. letra de color).
  if (mejor.puntaje < 15) {
    tramo = [0.95, 1];
    const original = await leer(derecha(suave(gris), gris.w, gris.h, grados), "11");
    if (original.puntaje > mejor.puntaje) mejor = original;
  }
  alAvance(1, "Listo");
  return mejor.lineas;
}

/**
 * Las líneas leídas y cuánto texto seguro dieron: cada palabra legible (2+ letras o cifras, confianza 60+) suma sus
 * caracteres por su confianza al cuadrado, así pesa más lo que el OCR leyó con seguridad.
 */
function lineasDe(r: ResultadoT): { lineas: LineaOcr[]; puntaje: number } {
  const lineas: LineaOcr[] = [];
  let puntaje = 0;
  for (const b of r.data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
    for (const x of l.words ?? []) {
      const t = x.text.replace(/[^\p{L}\p{N}]/gu, "");
      if (t.length >= 2 && x.confidence >= 60) puntaje += t.length * (x.confidence / 100) ** 2;
    }
    // Fuera solo lo dudoso que no parece palabra (rayas, «|», «€» de un logo): con letra chica, muchas palabras bien
    // leídas salen con poca confianza, y quitarlas costaba hasta un 20 % del texto.
    const palabras = l.words?.filter((x) => x.confidence >= 35 || x.text.replace(/[^\p{L}\p{N}]/gu, "").length >= 2).map((x) => x.text);
    const texto = (palabras ? palabras.join(" ") : l.text).trim();
    if (texto) lineas.push({ texto, confianza: l.confidence, x: l.bbox.x0, y: l.bbox.y0, alto: l.bbox.y1 - l.bbox.y0 });
  }
  // Sin detalle por líneas (otra versión de la librería): el texto plano con la confianza general.
  if (!lineas.length && r.data.text) {
    r.data.text.split("\n").forEach((t, i) => t.trim() && lineas.push({ texto: t.trim(), confianza: r.data.confidence ?? 70, x: 0, y: i * 20, alto: 14 }));
    puntaje = (r.data.text.replace(/\s/g, "").length * (r.data.confidence ?? 0)) / 100;
  }
  return { lineas, puntaje };
}
