import { corregirConfusiones, esNumerica, quitarIconos, type LineaOcr, type PalabraOcr } from "../../../../shared/exTrae";

/*
 * OCR de EX-Trae con Tesseract.js, en el navegador (la foto no se sube). La librería y el idioma español se descargan
 * de jsDelivr la primera vez (luego quedan en la caché del navegador).
 */
const URL_TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";

interface Caja { x0: number; y0: number; x1: number; y1: number }
interface PalabraT { text: string; confidence: number; bbox?: Caja }
interface LineaT { text: string; confidence: number; bbox: Caja; words?: PalabraT[] }
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

/** La foto en gris y en color (al mismo tamaño): el OCR lee el gris; el color sirve para reconocer emojis e iconos. */
interface Gris { g: Uint8Array; w: number; h: number; color: HTMLCanvasElement }
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
        ok({ g, w, h, color: c });
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
 * Para fotos malas (poca luz, poca nitidez): quita el grano y luego recupera el borde de las letras. Se usa solo si la
 * lectura normal salió dudosa: en una foto nítida no aporta y haría más lenta la lectura.
 */
function mejorarFotoMala({ g, w, h }: Gris): Uint8Array {
  const caja = (v: Uint8Array | Float32Array, r: number) => {
    const W = w + 1, I = new Float64Array(W * (h + 1)), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { let f = 0; for (let x = 0; x < w; x++) { f += v[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + f; } }
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1); o[y * w + x] = (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((x1 - x0) * (y1 - y0)); }
    }
    return o;
  };
  const r = Math.max(1, Math.round(Math.max(w, h) / 1400));
  const suavizada = caja(g, r), ancha = caja(suavizada, r * 3), salida = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) salida[i] = tope(suavizada[i] + (suavizada[i] - ancha[i]) * 1.6);
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
  return girado(aLienzo(v, w, h), grados);
}
function girado(c: HTMLCanvasElement, grados: number) {
  const { width: w, height: h } = c;
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
  // La misma foto en color y con el mismo giro: las cajas de las palabras coinciden con ella.
  const enColor = girado(gris.color, grados), medidor = enColor.getContext("2d", { willReadFrequently: true })!;
  /** psm 3: página con bloques y columnas; 11: texto suelto (chats, carteles, etiquetas). */
  const leer = async (img: HTMLCanvasElement, psm: "3" | "11") => {
    // Respeta los espacios entre palabras y evita que adivine la resolución de una foto.
    await w.setParameters?.({ tessedit_pageseg_mode: psm, preserve_interword_spaces: "1", user_defined_dpi: "300", tessedit_char_whitelist: "" }).catch(() => {});
    const r = await w.recognize(img, {}, { text: true, blocks: true });
    return { ...lineasDe(r, medidor), r, img, psm };
  };
  // Se lee de las dos formas y gana la que más palabras seguras dio: la confianza general de Tesseract engaña (en un
  // chat, «página» puede dar 93 % de confianza y leer peor que «texto suelto»).
  tramo = [0.3, 0.65];
  let mejor = await leer(imagen, "11");
  tramo = [0.65, 0.95];
  const pagina = await leer(imagen, "3");
  if (pagina.puntaje > mejor.puntaje) mejor = pagina;
  // Lectura dudosa (foto con grano o poco nítida): otra vez, con la foto mejorada.
  if (mejor.confianza < 88) {
    tramo = [0.9, 0.95];
    const otra = await leer(derecha(adaptativa({ ...gris, g: mejorarFotoMala(gris) }), gris.w, gris.h, grados), mejor.psm);
    // Debe leer casi lo mismo o más, y con la misma seguridad: unas pocas palabras «seguras» no valen más que una lectura completa.
    if (otra.puntaje > mejor.puntaje && otra.confianza >= mejor.confianza && largo(otra.lineas) >= largo(mejor.lineas) * 0.9) mejor = otra;
  }
  // Último recurso, si casi no se leyó nada: la foto sin invertir (por si el arreglo borró algo, p. ej. letra de color).
  if (mejor.puntaje < 15) {
    tramo = [0.95, 1];
    const original = await leer(derecha(suave(gris), gris.w, gris.h, grados), "11");
    if (original.puntaje > mejor.puntaje) mejor = original;
  }
  alAvance(0.97, "Revisando los números…");
  await releerNumeros(mejor.r, mejor.img, w);
  const final = lineasDe(mejor.r, medidor);
  alAvance(1, "Listo");
  return final.lineas;
}

const largo = (lineas: LineaOcr[]) => lineas.reduce((n, l) => n + l.texto.length, 0);

/**
 * Vuelve a leer cada número dudoso, solo él, con el recorte ampliado y permitiendo únicamente cifras: sin letras
 * posibles, el OCR no puede confundir un 0 con una O ni un 6 con una «€». La nueva lectura se queda si está más segura.
 */
async function releerNumeros(r: ResultadoT, img: HTMLCanvasElement, w: TrabajadorT) {
  const dudosas: PalabraT[] = [];
  for (const b of r.data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) for (const x of l.words ?? []) {
    if (x.bbox && esNumerica(x.text) && (x.confidence < 92 || /[^\d.,:/-]/.test(x.text))) dudosas.push(x);
  }
  if (!dudosas.length || !w.setParameters) return;
  await w.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789.,:/-" }).catch(() => {});
  // Con un tope: en un documento lleno de números no debe tardar demasiado.
  for (const x of dudosas.slice(0, 40)) {
    const b = x.bbox!, m = Math.round((b.y1 - b.y0) * 0.35);
    const ancho = b.x1 - b.x0 + 2 * m, alto = b.y1 - b.y0 + 2 * m, k = Math.max(1, Math.min(3, 110 / alto));
    const c = lienzo(Math.round(ancho * k), Math.round(alto * k)), ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, b.x0 - m, b.y0 - m, ancho, alto, 0, 0, c.width, c.height);
    try {
      const d = (await w.recognize(c, {}, { text: true })).data, nuevo = d.text?.trim() ?? "";
      const leidas = nuevo.replace(/\D/g, "");
      // Mismo largo (no inventa ni pierde cifras) y más seguro que antes. Solo cambian las cifras: las barras, puntos y
      // guiones se quedan como estaban (si no, «08/06/2026» podía volverse «08062026»).
      if (leidas.length === x.text.replace(/[^\p{L}\p{N}]/gu, "").length && (d.confidence ?? 0) >= x.confidence) {
        let k = 0;
        x.text = x.text.replace(/[\p{L}\p{N}]/gu, () => leidas[k++]);
        x.confidence = d.confidence ?? x.confidence;
      }
    } catch { /* se queda la lectura anterior */ }
  }
  await w.setParameters({ tessedit_char_whitelist: "" }).catch(() => {});
}

/** Mide en la foto en color qué hay dentro de la caja de una palabra. */
function medir(p: PalabraT, ctx: CanvasRenderingContext2D): PalabraOcr {
  const { x0, y0, x1, y1 } = p.bbox!, w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
  const px = ctx.getImageData(Math.round(x0), Math.round(y0), w, h).data, n = w * h;
  const luz = (i: number) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  // El fondo se mide AFUERA de la caja, en un marco alrededor: la caja queda ajustada a la tinta, y en una «E» o una «D»
  // casi todo su borde es tinta (tomarlo por fondo hacía parecer maciza a la palabra «DE», que se perdía).
  const m = Math.max(2, Math.round(h * 0.2)), X0 = Math.max(0, Math.round(x0) - m), Y0 = Math.max(0, Math.round(y0) - m);
  const W = Math.min(ctx.canvas.width - X0, w + 2 * m), H = Math.min(ctx.canvas.height - Y0, h + 2 * m);
  const ext = ctx.getImageData(X0, Y0, Math.max(1, W), Math.max(1, H)).data, hist = new Uint32Array(52);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x >= m && x < m + w && y >= m && y < m + h) continue;
    const i = (y * W + x) * 4;
    hist[((0.299 * ext[i] + 0.587 * ext[i + 1] + 0.114 * ext[i + 2]) / 5) | 0]++;
  }
  const fondo = hist.indexOf(Math.max(...hist)) * 5 + 2;
  let vivos = 0, tinta = 0;
  for (let i = 0; i < n * 4; i += 4) {
    const max = Math.max(px[i], px[i + 1], px[i + 2]), min = Math.min(px[i], px[i + 1], px[i + 2]);
    if (max - min > 70 && (max - min) / Math.max(1, max) > 0.3) vivos++;
    if (Math.abs(luz(i) - fondo) > 45) tinta++;
  }
  return { texto: p.text, confianza: p.confidence, x0, x1, y0, y1, color: vivos / n, solidez: tinta / n };
}

/**
 * Las líneas leídas y cuánto texto seguro dieron: cada palabra legible (2+ letras o cifras, confianza 60+) suma sus
 * caracteres por su confianza al cuadrado, así pesa más lo que el OCR leyó con seguridad.
 */
function lineasDe(r: ResultadoT, medidor: CanvasRenderingContext2D): { lineas: LineaOcr[]; puntaje: number; confianza: number } {
  const lineas: LineaOcr[] = [];
  let puntaje = 0, sumaConf = 0, sumaPeso = 0;
  for (const b of r.data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
    for (const x of l.words ?? []) {
      const t = x.text.replace(/[^\p{L}\p{N}]/gu, "");
      if (t.length >= 2 && x.confidence >= 60) puntaje += t.length * (x.confidence / 100) ** 2;
      if (t.length >= 2) { sumaConf += t.length * x.confidence; sumaPeso += t.length; }
    }
    // Fuera solo lo dudoso que no parece palabra (rayas, «|», «€» de un logo): con letra chica, muchas palabras bien
    // leídas salen con poca confianza, y quitarlas costaba hasta un 20 % del texto.
    const palabras = l.words?.filter((x) => x.confidence >= 35 || x.text.replace(/[^\p{L}\p{N}]/gu, "").length >= 2);
    const texto = (palabras ? (palabras.every((x) => x.bbox) ? quitarIconos(palabras.map((x) => medir(x, medidor))) : palabras.map((x) => x.text).join(" ")) : l.text).trim();
    const corregido = corregirConfusiones(texto);
    // Los números que siguen sin estar claros: se avisa para revisarlos, porque un número mal leído no se nota al leerlo.
    const dudas = l.words?.filter((x) => esNumerica(x.text) && x.confidence < 80).map((x) => corregirConfusiones(x.text)).filter((d) => corregido.includes(d));
    if (corregido) lineas.push({ texto: corregido, confianza: l.confidence, x: l.bbox.x0, y: l.bbox.y0, alto: l.bbox.y1 - l.bbox.y0, ...(dudas?.length ? { dudas } : {}) });
  }
  // Sin detalle por líneas (otra versión de la librería): el texto plano con la confianza general.
  if (!lineas.length && r.data.text) {
    r.data.text.split("\n").forEach((t, i) => t.trim() && lineas.push({ texto: t.trim(), confianza: r.data.confidence ?? 70, x: 0, y: i * 20, alto: 14 }));
    puntaje = (r.data.text.replace(/\s/g, "").length * (r.data.confidence ?? 0)) / 100;
  }
  return { lineas, puntaje, confianza: sumaPeso ? sumaConf / sumaPeso : (r.data.confidence ?? 0) };
}
