/*
 * Foto de una firma o un sello en papel → tinta sobre fondo transparente. Sin dependencias del navegador: trabaja con
 * los píxeles RGBA (lo mismo que da ImageData) para poder probarse con imágenes de verdad.
 *  - detectarFirma: propone el recorte. Descarta lo impreso alrededor (renglones, recuadros, franjas, sombras).
 *  - limpiarFirma: quita el papel aunque la luz sea desigual y deja un trazo nítido.
 */

export interface ImagenRgba { data: Uint8ClampedArray; width: number; height: number }
/** Recorte en fracciones de la imagen (0 a 1). */
export interface Recorte { x: number; y: number; w: number; h: number }
/** Por dónde se arrastra el recorte: los 4 lados, las 4 esquinas o todo el marco. */
export type Asa = "mover" | "n" | "s" | "e" | "o" | "ne" | "no" | "se" | "so";

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function moverRecorte(r: Recorte, asa: Asa, dx: number, dy: number, min = 0.03): Recorte {
  if (asa === "mover") return { ...r, x: limitar(r.x + dx, 0, 1 - r.w), y: limitar(r.y + dy, 0, 1 - r.h) };
  let x1 = r.x, y1 = r.y, x2 = r.x + r.w, y2 = r.y + r.h;
  if (asa.includes("o")) x1 = limitar(x1 + dx, 0, x2 - min);
  if (asa.includes("e")) x2 = limitar(x2 + dx, x1 + min, 1);
  if (asa.includes("n")) y1 = limitar(y1 + dy, 0, y2 - min);
  if (asa.includes("s")) y2 = limitar(y2 + dy, y1 + min, 1);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** El mismo recorte después de girar la imagen 90° en el sentido del reloj. */
export const girarRecorte = (r: Recorte): Recorte => ({ x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w });

/** Cuánto más oscuro que el papel de alrededor es cada punto (0 a 1): así no importa si la luz es desigual. */
export function oscuridad(img: ImagenRgba): Float32Array {
  const { data: px, width: w, height: h } = img, n = w * h, W = w + 1;
  const gris = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3] / 255; // lo transparente cuenta como papel blanco
    gris[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) * a + 255 * (1 - a);
  }
  const r = limitar(Math.round(Math.max(w, h) / 20), 8, 80);
  // 1.ª pasada: promedio del entorno. 2.ª: promedio solo de lo claro, que es el papel sin la tinta.
  const suma = new Float64Array(W * (h + 1));
  const integrar = (valor: (i: number) => number, s: Float64Array) => {
    for (let y = 0; y < h; y++) {
      let fila = 0;
      for (let x = 0; x < w; x++) { fila += valor(y * w + x); s[(y + 1) * W + x + 1] = s[y * W + x + 1] + fila; }
    }
  };
  const caja = (s: Float64Array, x: number, y: number) => {
    const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    return s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0];
  };
  const area = (x: number, y: number) => (Math.min(w, x + r + 1) - Math.max(0, x - r)) * (Math.min(h, y + r + 1) - Math.max(0, y - r));
  integrar((i) => gris[i], suma);
  const claro = new Uint8Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) claro[y * w + x] = gris[y * w + x] >= (caja(suma, x, y) / area(x, y)) * 0.94 ? 1 : 0;
  const sumaClaro = new Float64Array(W * (h + 1)), cuentaClaro = new Float64Array(W * (h + 1));
  integrar((i) => (claro[i] ? gris[i] : 0), sumaClaro);
  integrar((i) => claro[i], cuentaClaro);
  const d = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, c = caja(cuentaClaro, x, y);
      const papel = Math.max(30, c > 0 ? caja(sumaClaro, x, y) / c : caja(suma, x, y) / area(x, y));
      d[i] = Math.max(0, 1 - gris[i] / papel);
    }
  return d;
}

/** Umbral de Otsu entre tinta y restos de papel, sin contar lo que es claramente papel. */
export function umbralTinta(d: Float32Array): number {
  const hist = new Float64Array(256);
  let total = 0, suma = 0;
  for (let i = 0; i < d.length; i++) {
    if (d[i] < 0.05) continue;
    const b = Math.min(255, Math.floor(d[i] * 255));
    hist[b]++; total++; suma += b;
  }
  if (!total) return 0.2;
  let pesoA = 0, sumaA = 0, mejor = -1, umbral = 51;
  for (let t = 0; t < 256; t++) {
    pesoA += hist[t];
    if (!pesoA || pesoA === total) continue;
    sumaA += t * hist[t];
    const v = pesoA * (total - pesoA) * (sumaA / pesoA - (suma - sumaA) / (total - pesoA)) ** 2;
    if (v > mejor) { mejor = v; umbral = t; }
  }
  return limitar(umbral / 255, 0.12, 0.4);
}

/** Quita las manchas macizas (franjas impresas, sombras, la mesa): un trazo de bolígrafo nunca es tan ancho. */
function quitarManchas(m: Uint8Array, w: number, h: number, lado: number) {
  const W = w + 1, s = new Int32Array(W * (h + 1)), marcas = new Int32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) { fila += m[y * w + x]; s[(y + 1) * W + x + 1] = s[y * W + x + 1] + fila; }
  }
  for (let y = 0; y + lado <= h; y++)
    for (let x = 0; x + lado <= w; x++)
      if (s[(y + lado) * W + x + lado] - s[y * W + x + lado] - s[(y + lado) * W + x] + s[y * W + x] === lado * lado) {
        marcas[y * W + x]++; marcas[y * W + x + lado]--; marcas[(y + lado) * W + x]--; marcas[(y + lado) * W + x + lado]++;
      }
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += marcas[y * W + x];
      if (y > 0) marcas[y * W + x] = fila + marcas[(y - 1) * W + x]; else marcas[y * W + x] = fila;
      if (marcas[y * W + x] > 0) m[y * w + x] = 0;
    }
  }
}

/**
 * Quita las rectas largas (renglones, recuadros), aunque la foto esté algo inclinada. Una mano nunca traza tan recto:
 * la firma queda. Donde un trazo cruza la recta se conserva el punto (su grosor ahí es mayor que el de la recta), de
 * modo que una firma hecha sobre el renglón no queda cortada.
 * largoBorde: si se da, una recta que llega al borde de la imagen ya cuenta desde ese largo (lo impreso se sale del
 * recorte; un trazo de la firma, no).
 */
function quitarRectas(m: Uint8Array, w: number, h: number, largoH: number, largoV: number, largoBorde = Infinity) {
  const borrar = new Uint8Array(w * h), visto = new Uint8Array(w * h);
  const grosor = Math.max(3, Math.round(Math.max(w, h) * 0.012));
  const tinta = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
  for (const vertical of [false, true]) {
    const largo = vertical ? largoV : largoH, px = vertical ? 1 : 0, py = vertical ? 0 : 1;
    for (let grados = -12; grados <= 12; grados += 1.5) {
      const rad = (grados * Math.PI) / 180;
      const dx = vertical ? -Math.sin(rad) : Math.cos(rad), dy = vertical ? Math.cos(rad) : Math.sin(rad);
      visto.fill(0);
      for (let i = 0; i < w * h; i++) {
        if (!m[i] || visto[i]) continue;
        const x0 = i % w, y0 = (i - x0) / w, trazo: number[] = [i];
        let tMin = 0, tMax = 0;
        visto[i] = 1;
        for (const sentido of [1, -1]) {
          let t = 0, hueco = 0, desvio = 0;
          while (hueco <= 2) {
            t += sentido;
            const x = Math.round(x0 + t * dx), y = Math.round(y0 + t * dy);
            let hallado = false;
            for (const d of [desvio, desvio + 1, desvio - 1]) {
              if (Math.abs(d) > 2 || !tinta(x + px * d, y + py * d)) continue;
              desvio = d; hallado = true;
              const j = (y + py * d) * w + x + px * d;
              trazo.push(j); visto[j] = 1;
              break;
            }
            if (hallado) { hueco = 0; if (sentido > 0) tMax = t; else tMin = t; } else hueco++;
          }
        }
        const fin = (t: number) => { const x = x0 + t * dx, y = y0 + t * dy; return x < w * 0.03 || y < h * 0.03 || x > w * 0.97 || y > h * 0.97; };
        if (tMax - tMin < largo && !(tMax - tMin >= largoBorde * (vertical ? h : w) && (fin(tMin) || fin(tMax)))) continue;
        for (const j of trazo) {
          const x = j % w, y = (j - x) / w;
          let a = 0, b = 0;
          while (a <= grosor && tinta(x - px * (a + 1), y - py * (a + 1))) a++;
          while (b <= grosor && tinta(x + px * (b + 1), y + py * (b + 1))) b++;
          if (a + b + 1 > grosor) continue;
          for (let k = -a; k <= b; k++) borrar[(y + py * k) * w + x + px * k] = 1;
        }
      }
    }
  }
  for (let i = 0; i < w * h; i++) if (borrar[i]) m[i] = 0;
}

interface Pieza { x1: number; y1: number; x2: number; y2: number; area: number }

/** Piezas de tinta conectadas (8 vecinos). `etiquetas` da, para cada punto, 1 + el índice de su pieza. */
function piezas(m: Uint8Array, w: number, h: number) {
  const etiquetas = new Int32Array(w * h), lista: Pieza[] = [], pila = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!m[i] || etiquetas[i]) continue;
    const id = lista.length + 1, p: Pieza = { x1: w, y1: h, x2: -1, y2: -1, area: 0 };
    let tope = 0;
    pila[tope++] = i; etiquetas[i] = id;
    while (tope) {
      const j = pila[--tope], x = j % w, y = (j - x) / w;
      p.area++;
      if (x < p.x1) p.x1 = x; if (x > p.x2) p.x2 = x; if (y < p.y1) p.y1 = y; if (y > p.y2) p.y2 = y;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
          const k = yy * w + xx;
          if (m[k] && !etiquetas[k]) { etiquetas[k] = id; pila[tope++] = k; }
        }
    }
    lista.push(p);
  }
  return { etiquetas, lista };
}

function engrosar(m: Uint8Array, w: number, h: number) {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) o[yy * w + xx] = 1;
    }
  return o;
}

/**
 * Busca la firma en la foto y devuelve dónde recortar (null si no encuentra nada que lo parezca).
 * Parte de la pieza de tinta más grande que no toca el borde y le suma las piezas vecinas (otra palabra, un punto).
 * esFirma = false (sello): no se quitan rectas ni manchas, porque el borde del sello forma parte de él.
 * Pásale la imagen reducida (unos 1000 px por lado): es un cálculo por píxel.
 */
export function detectarFirma(img: ImagenRgba, esFirma = true): Recorte | null {
  const { width: w, height: h } = img, lado = Math.max(w, h);
  const d = oscuridad(img), umbral = umbralTinta(d);
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = d[i] > umbral ? 1 : 0;
  if (esFirma) {
    quitarManchas(m, w, h, Math.max(5, Math.round(lado * 0.035)));
    quitarRectas(m, w, h, w * 0.25, h * 0.2);
  }
  const borde = Math.round(lado * 0.008);
  const validas = piezas(engrosar(m, w, h), w, h).lista.filter((p) => {
    const pw = p.x2 - p.x1 + 1, ph = p.y2 - p.y1 + 1;
    const tocaBorde = p.x1 <= borde || p.y1 <= borde || p.x2 >= w - 1 - borde || p.y2 >= h - 1 - borde;
    return !tocaBorde && p.area >= 6 && (!esFirma || Math.max(pw, ph) / Math.min(pw, ph) < 14);
  });
  if (!validas.length) return null;
  const semilla = validas.reduce((a, b) => (b.area > a.area ? b : a));
  if (Math.max(semilla.x2 - semilla.x1, semilla.y2 - semilla.y1) < lado * 0.04 || semilla.area < w * h * 0.0002) return null;
  const caja = { ...semilla };
  const altoSemilla = semilla.y2 - semilla.y1 + 1;
  const huecoX = Math.max(altoSemilla * 0.6, lado * 0.012), huecoY = Math.max(altoSemilla * 0.3, lado * 0.012);
  const pendientes = new Set(validas.filter((p) => p !== semilla));
  for (let cambio = true; cambio;) {
    cambio = false;
    for (const p of pendientes) {
      const gx = Math.max(p.x1 - caja.x2, caja.x1 - p.x2), gy = Math.max(p.y1 - caja.y2, caja.y1 - p.y2);
      if (gx > huecoX || gy > huecoY) continue;
      caja.x1 = Math.min(caja.x1, p.x1); caja.y1 = Math.min(caja.y1, p.y1); caja.x2 = Math.max(caja.x2, p.x2); caja.y2 = Math.max(caja.y2, p.y2);
      pendientes.delete(p); cambio = true;
    }
  }
  const margen = Math.max(lado * 0.01, Math.max(caja.x2 - caja.x1, caja.y2 - caja.y1) * 0.06);
  const x1 = Math.max(0, caja.x1 - margen), y1 = Math.max(0, caja.y1 - margen), x2 = Math.min(w, caja.x2 + 1 + margen), y2 = Math.min(h, caja.y2 + 1 + margen);
  return { x: x1 / w, y: y1 / h, w: (x2 - x1) / w, h: (y2 - y1) / h };
}

/** Color parejo de tinta a partir de lo que se ve en la foto: el negro queda negro; el azul o el rojo, más intensos. */
function colorDeTinta(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === 0 || (max - min) / max < 0.16) return [20, 20, 26];
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  const intensa = [r, g, b].map((c) => l + (c - l) * 1.5);
  const k = Math.min(1, 75 / Math.max(1, l));
  return [limitar(intensa[0] * k, 0, 255), limitar(intensa[1] * k, 0, 255), limitar(intensa[2] * k, 0, 255)];
}

/**
 * Deja solo la tinta sobre fondo transparente, con borde nítido; `tinta` dice cuántos puntos quedaron (0: no había nada).
 * esFirma: se quitan rectas, manchas y lo que entra por el borde del recorte, y todo el trazo sale de un solo color.
 * En un sello se conservan sus bordes y sus colores (puede traer la fecha en otro).
 */
export function limpiarFirma(img: ImagenRgba, esFirma = true): { imagen: ImagenRgba; tinta: number } {
  const { data: px, width: w, height: h } = img, n = w * h, lado = Math.max(w, h);
  const d = oscuridad(img), umbral = umbralTinta(d), bajo = umbral * 0.65, alto = umbral * 1.3;
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = d[i] > bajo ? 1 : 0;
  if (esFirma) {
    quitarManchas(m, w, h, Math.max(9, Math.round(lado * 0.04)));
    quitarRectas(m, w, h, w * 0.7, h * 0.7, 0.2);
  }
  const { etiquetas, lista } = piezas(m, w, h);
  // Sin motas: cada pieza debe tener tamaño y al menos un punto claramente de tinta.
  const fuerte = new Uint8Array(lista.length + 1);
  for (let i = 0; i < n; i++) if (etiquetas[i] && d[i] > umbral) fuerte[etiquetas[i]] = 1;
  const minimo = Math.max(4, (lado / 280) ** 2);
  const mayor = lista.reduce((a, p) => Math.max(a, p.area), 0);
  const seQueda = lista.map((p, k) => {
    const tocaBorde = p.x1 === 0 || p.y1 === 0 || p.x2 === w - 1 || p.y2 === h - 1;
    return fuerte[k + 1] === 1 && p.area >= minimo && !(esFirma && tocaBorde && p.area < mayor * 0.3);
  });
  let sr = 0, sg = 0, sb = 0, nucleo = 0, tinta = 0;
  const salida = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    if (!etiquetas[i] || !seQueda[etiquetas[i] - 1]) continue;
    const t = limitar((d[i] - bajo) / (alto - bajo), 0, 1), alfa = t * t * (3 - 2 * t);
    salida[i * 4 + 3] = Math.round(alfa * 255);
    tinta++;
    if (alfa > 0.9) { sr += px[i * 4]; sg += px[i * 4 + 1]; sb += px[i * 4 + 2]; nucleo++; }
    if (!esFirma) { salida[i * 4] = px[i * 4] * 0.8; salida[i * 4 + 1] = px[i * 4 + 1] * 0.8; salida[i * 4 + 2] = px[i * 4 + 2] * 0.8; }
  }
  if (esFirma && nucleo) {
    const [r, g, b] = colorDeTinta(sr / nucleo, sg / nucleo, sb / nucleo);
    for (let i = 0; i < n; i++) if (salida[i * 4 + 3]) { salida[i * 4] = r; salida[i * 4 + 1] = g; salida[i * 4 + 2] = b; }
  }
  return { imagen: { data: salida, width: w, height: h }, tinta };
}
