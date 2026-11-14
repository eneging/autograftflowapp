#!/usr/bin/env node
/*
 * Entrena la red de dígitos de la Pizarra (resources/shared/pizarraDigitos.ts) con MNIST y escribe sus pesos en
 * resources/shared/pizarraDigitosModelo.ts. Sin dependencias: JavaScript puro.
 *
 *   node scripts/entrenar-digitos.mjs <carpeta-mnist> [épocas]
 *
 * <carpeta-mnist>: los 4 archivos de MNIST descomprimidos (train-images-idx3-ubyte, train-labels-idx1-ubyte,
 * t10k-images-idx3-ubyte, t10k-labels-idx1-ubyte), p. ej. de https://storage.googleapis.com/cvdf-datasets/mnist/
 * MNIST: Yann LeCun, Corinna Cortes y Christopher J. C. Burges, licencia CC BY-SA 3.0.
 *
 * Red: 14×14 → 128 (ReLU) → 10 (softmax). Para que tolere estilos de escritura distintos, cada época deforma las
 * imágenes al azar (rotación, inclinación, escala, desplazamiento y grosor del trazo).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [carpeta, epocasArg] = process.argv.slice(2);
if (!carpeta) { console.error("Uso: node scripts/entrenar-digitos.mjs <carpeta-mnist> [épocas]"); process.exit(1); }
const EPOCAS = Number(epocasArg ?? 14);
const L = 28, R = 14, E = R * R, H = 128;

function leer(nombre) {
  const b = readFileSync(join(carpeta, nombre));
  return b;
}
const imgTrain = leer("train-images-idx3-ubyte").subarray(16), lblTrain = leer("train-labels-idx1-ubyte").subarray(8);
const imgTest = leer("t10k-images-idx3-ubyte").subarray(16), lblTest = leer("t10k-labels-idx1-ubyte").subarray(8);
const nTrain = lblTrain.length, nTest = lblTest.length;

// Azar con semilla (resultados repetibles).
let semilla = 12345;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);

function reducir(img) {
  const r = new Float32Array(E);
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const i = 2 * y * L + 2 * x;
    r[y * R + x] = (img[i] + img[i + 1] + img[i + L] + img[i + L + 1]) / 4;
  }
  return r;
}

/** Deformación al azar de una imagen 28×28 (0 a 1), con muestreo bilineal. */
function deformar(src) {
  const ang = (azar() - 0.5) * 0.4, inc = (azar() - 0.5) * 0.5, sx = 0.8 + azar() * 0.35, sy = 0.85 + azar() * 0.25;
  const tx = (azar() - 0.5) * 3, ty = (azar() - 0.5) * 3;
  const c = Math.cos(ang), s = Math.sin(ang);
  // Matriz directa A = Rot · Inclinación · Escala; se recorre el destino con su inversa.
  const a = c * sx, b = (c * inc - s) * sy, d = s * sx, e = (s * inc + c) * sy;
  const det = a * e - b * d;
  const ia = e / det, ib = -b / det, id = -d / det, ie = a / det;
  const dst = new Float32Array(L * L);
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
    const u = x - 14 - tx, v = y - 14 - ty;
    const X = ia * u + ib * v + 14, Y = id * u + ie * v + 14;
    const x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0;
    const at = (xx, yy) => (xx >= 0 && yy >= 0 && xx < L && yy < L ? src[yy * L + xx] : 0);
    dst[y * L + x] = at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
  }
  // Grosor: a veces se adelgaza (los trazos de la pizarra suelen ser más finos que MNIST) o se engrosa.
  const g = azar();
  if (g < 0.3) for (let i = 0; i < dst.length; i++) dst[i] = Math.max(0, (dst[i] - 0.35) / 0.65);
  else if (g > 0.85) {
    const copia = dst.slice();
    for (let y = 1; y < L - 1; y++) for (let x = 1; x < L - 1; x++) {
      const i = y * L + x;
      dst[i] = Math.max(copia[i], 0.7 * Math.max(copia[i - 1], copia[i + 1], copia[i - L], copia[i + L]));
    }
  }
  return dst;
}

const original = (img, k) => Float32Array.from(img.subarray(k * L * L, (k + 1) * L * L), (v) => v / 255);

// Pesos (He) y momentos.
const W1 = new Float32Array(H * E), B1 = new Float32Array(H), W2 = new Float32Array(10 * H), B2 = new Float32Array(10);
const gauss = () => Math.sqrt(-2 * Math.log(azar() + 1e-12)) * Math.cos(2 * Math.PI * azar());
for (let i = 0; i < W1.length; i++) W1[i] = gauss() * Math.sqrt(2 / E);
for (let i = 0; i < W2.length; i++) W2[i] = gauss() * Math.sqrt(2 / H);
const V = [W1, B1, W2, B2].map((w) => new Float32Array(w.length));
const G = [W1, B1, W2, B2].map((w) => new Float32Array(w.length));

const h = new Float32Array(H), z = new Float32Array(10), dh = new Float32Array(H);
function adelante(x) {
  for (let j = 0; j < H; j++) { let s = B1[j]; const o = j * E; for (let i = 0; i < E; i++) s += x[i] * W1[o + i]; h[j] = s > 0 ? s : 0; }
  let max = -Infinity;
  for (let k = 0; k < 10; k++) { let s = B2[k]; const o = k * H; for (let j = 0; j < H; j++) s += h[j] * W2[o + j]; z[k] = s; if (s > max) max = s; }
  let suma = 0;
  for (let k = 0; k < 10; k++) { z[k] = Math.exp(z[k] - max); suma += z[k]; }
  for (let k = 0; k < 10; k++) z[k] /= suma;
}

function exactitud(imgs, lbls, n) {
  let ok = 0;
  for (let k = 0; k < n; k++) {
    adelante(reducir(original(imgs, k)));
    let m = 0; for (let c = 1; c < 10; c++) if (z[c] > z[m]) m = c;
    if (m === lbls[k]) ok++;
  }
  return ok / n;
}

const LOTE = 32, MOMENTO = 0.9;
const orden = Array.from({ length: nTrain }, (_, i) => i);
for (let ep = 0; ep < EPOCAS; ep++) {
  const lr = 0.05 * Math.pow(0.8, ep);
  for (let i = orden.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [orden[i], orden[j]] = [orden[j], orden[i]]; }
  let perdida = 0;
  for (let ini = 0; ini < nTrain; ini += LOTE) {
    G.forEach((g) => g.fill(0));
    const fin = Math.min(nTrain, ini + LOTE);
    for (let t = ini; t < fin; t++) {
      const k = orden[t];
      const img = original(imgTrain, k);
      const x = reducir(azar() < 0.75 ? deformar(img) : img);
      adelante(x);
      const y = lblTrain[k];
      perdida -= Math.log(z[y] + 1e-9);
      // Retropropagación.
      dh.fill(0);
      for (let c = 0; c < 10; c++) {
        const dz = z[c] - (c === y ? 1 : 0);
        G[3][c] += dz;
        const o = c * H;
        for (let j = 0; j < H; j++) { G[2][o + j] += dz * h[j]; dh[j] += dz * W2[o + j]; }
      }
      for (let j = 0; j < H; j++) {
        if (h[j] <= 0) continue;
        const g = dh[j], o = j * E;
        G[1][j] += g;
        for (let i = 0; i < E; i++) G[0][o + i] += g * x[i];
      }
    }
    const n = fin - ini;
    [W1, B1, W2, B2].forEach((w, a) => { const v = V[a], g = G[a]; for (let i = 0; i < w.length; i++) { v[i] = MOMENTO * v[i] - (lr * g[i]) / n; w[i] += v[i]; } });
  }
  console.log(`Época ${ep + 1}/${EPOCAS}: pérdida ${(perdida / nTrain).toFixed(4)} · exactitud en prueba ${(100 * exactitud(imgTest, lblTest, nTest)).toFixed(2)} %`);
}

// Pesos cuantizados a 8 bits (una escala por capa); los sesgos, en decimal.
const cuantizar = (w) => { const m = w.reduce((a, v) => Math.max(a, Math.abs(v)), 0); return { escala: m / 127, q: Int8Array.from(w, (v) => Math.round((v / m) * 127)) }; };
const c1 = cuantizar(W1), c2 = cuantizar(W2);
const bytes = Buffer.concat([Buffer.from(c1.q.buffer), Buffer.from(c2.q.buffer)]);
const redondear = (a) => Array.from(a, (v) => Number(v.toFixed(5)));
// Exactitud con los pesos ya cuantizados (lo que usará la página).
W1.set(Float32Array.from(c1.q, (v) => v * c1.escala)); W2.set(Float32Array.from(c2.q, (v) => v * c2.escala));
const final = exactitud(imgTest, lblTest, nTest);
console.log(`Con pesos de 8 bits: ${(100 * final).toFixed(2)} %`);

const salida = new URL("../resources/shared/pizarraDigitosModelo.ts", import.meta.url);
writeFileSync(salida, `/*
 * Pesos de la red de dígitos de la Pizarra (14×14 → ${H} → 10), generados por scripts/entrenar-digitos.mjs con MNIST
 * (LeCun, Cortes y Burges, CC BY-SA 3.0). Exactitud en las 10 000 imágenes de prueba de MNIST: ${(100 * final).toFixed(2)} %.
 * No editar a mano: volver a entrenar.
 */
export const MODELO = {
  entrada: ${E}, oculta: ${H},
  escala1: ${c1.escala}, escala2: ${c2.escala},
  b1: ${JSON.stringify(redondear(B1))},
  b2: ${JSON.stringify(redondear(B2))},
  /** Pesos de las dos capas en int8 (primero ${E}×${H}, después ${H}×10), en base64. */
  pesos: "${bytes.toString("base64")}",
};
`);
console.log(`Escrito ${salida.pathname} (${(bytes.length / 1024).toFixed(1)} KB de pesos)`);
