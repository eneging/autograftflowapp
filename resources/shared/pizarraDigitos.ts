/*
 * Reconocimiento de dígitos escritos a mano (0-9) con una red neuronal pequeña entrenada con MNIST (60 000 dígitos
 * escritos por personas reales; LeCun, Cortes y Burges, licencia CC BY-SA 3.0). Tolera estilos muy distintos (un «2»
 * con la base larga, un «1» con gancho, un «7» con barra…), a diferencia de comparar contra plantillas.
 *
 * Los trazos se dibujan como en MNIST: el dígito ocupa una caja de 20 × 20 píxeles (conservando su proporción),
 * centrado por su centro de masa en una imagen de 28 × 28, que se reduce a 14 × 14 para la red.
 * El modelo se entrena con scripts/entrenar-digitos.mjs (ver allí); los pesos están en pizarraDigitosModelo.ts.
 */
import { MODELO } from "./pizarraDigitosModelo";

export interface P { x: number; y: number }
export const LADO = 28, REDUCIDO = 14;

function distSeg(px: number, py: number, a: P, b: P): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const k = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
  return Math.hypot(px - (a.x + k * dx), py - (a.y + k * dy));
}

function pintar(trazos: P[][], dx: number, dy: number): Float32Array {
  const img = new Float32Array(LADO * LADO);
  // Trazo de unos 2,5 px de ancho con borde suave, como los dígitos de MNIST.
  const radio = 1.15;
  const segs: [P, P][] = [];
  for (const t of trazos) {
    if (t.length === 1) segs.push([t[0], t[0]]);
    for (let i = 1; i < t.length; i++) segs.push([t[i - 1], t[i]]);
  }
  for (let y = 0; y < LADO; y++) for (let x = 0; x < LADO; x++) {
    const px = x + 0.5 - dx, py = y + 0.5 - dy;
    let d = Infinity;
    for (const [a, b] of segs) { d = Math.min(d, distSeg(px, py, a, b)); if (d <= radio) break; }
    img[y * LADO + x] = Math.max(0, Math.min(1, radio + 0.8 - d));
  }
  return img;
}

/** Imagen 28 × 28 (0 a 1) del dígito, como las de MNIST. */
export function rasterizar(trazos: P[][]): Float32Array {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of trazos) for (const p of t) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const s = 20 / Math.max(x1 - x0, y1 - y0, 1e-6);
  const w = (x1 - x0) * s, h = (y1 - y0) * s;
  const pts = trazos.map((t) => t.map((p) => ({ x: (p.x - x0) * s + (LADO - w) / 2, y: (p.y - y0) * s + (LADO - h) / 2 })));
  // Centro de masa al centro de la imagen (como MNIST).
  const primera = pintar(pts, 0, 0);
  let m = 0, mx = 0, my = 0;
  for (let i = 0; i < primera.length; i++) { const v = primera[i]; m += v; mx += v * ((i % LADO) + 0.5); my += v * (Math.floor(i / LADO) + 0.5); }
  return m ? pintar(pts, LADO / 2 - mx / m, LADO / 2 - my / m) : primera;
}

/** 28 × 28 → 14 × 14 promediando de a 2 × 2 (lo mismo se hace con MNIST al entrenar). */
export function reducir(img: Float32Array | Uint8Array, escala = 1): Float32Array {
  const r = new Float32Array(REDUCIDO * REDUCIDO);
  for (let y = 0; y < REDUCIDO; y++) for (let x = 0; x < REDUCIDO; x++) {
    const i = 2 * y * LADO + 2 * x;
    r[y * REDUCIDO + x] = (img[i] + img[i + 1] + img[i + LADO] + img[i + LADO + 1]) / (4 * escala);
  }
  return r;
}

let pesos: { w1: Float32Array; w2: Float32Array } | null = null;
function cargar() {
  if (pesos) return pesos;
  const bin = Uint8Array.from(atob(MODELO.pesos), (c) => c.charCodeAt(0)); // atob: navegador y Node 16+
  const q = new Int8Array(bin.buffer, bin.byteOffset, bin.byteLength);
  const n1 = MODELO.entrada * MODELO.oculta;
  const w1 = new Float32Array(n1), w2 = new Float32Array(MODELO.oculta * 10);
  for (let i = 0; i < n1; i++) w1[i] = q[i] * MODELO.escala1;
  for (let i = 0; i < w2.length; i++) w2[i] = q[n1 + i] * MODELO.escala2;
  return (pesos = { w1, w2 });
}

/** Probabilidad de cada dígito (0 a 9) para una entrada de 14 × 14. */
export function probabilidades(x: Float32Array): number[] {
  const { w1, w2 } = cargar();
  const H = MODELO.oculta, E = MODELO.entrada;
  const h = new Float32Array(H);
  for (let j = 0; j < H; j++) {
    let s = MODELO.b1[j];
    for (let i = 0; i < E; i++) s += x[i] * w1[j * E + i];
    h[j] = s > 0 ? s : 0;
  }
  const z = Array.from({ length: 10 }, (_, k) => { let s = MODELO.b2[k]; for (let j = 0; j < H; j++) s += h[j] * w2[k * H + j]; return s; });
  const max = Math.max(...z), e = z.map((v) => Math.exp(v - max)), suma = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / suma);
}

/** El dígito más probable y su probabilidad. */
export function reconocerDigito(trazos: P[][]): { c: string; prob: number } {
  const p = probabilidades(reducir(rasterizar(trazos)));
  let k = 0;
  for (let i = 1; i < 10; i++) if (p[i] > p[k]) k = i;
  return { c: String(k), prob: p[k] };
}
