import { oscuridad, umbralTinta } from "./firmaImagen";

/*
 * Los filtros del escáner, sobre píxeles RGBA (lo mismo que da ImageData).
 * «Papel» es lo que guía casi todo: se estima solo con zonas claras y sin color, de modo que un bloque azul impreso no
 * se confunde con papel (no se lava a gris) y una foto, que no tiene papel, no se aclara por zonas (no se llena de manchas).
 */

export type Filtro = "original" | "color" | "texto" | "gris" | "documento";
export const FILTROS: { id: Filtro; nombre: string }[] = [
  { id: "original", nombre: "Color original" },
  { id: "color", nombre: "Color automático" },
  { id: "texto", nombre: "Texto claro" },
  { id: "gris", nombre: "Escala de grises" },
  { id: "documento", nombre: "Blanco y negro" },
];

const tope = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const luz = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const suave = (a: number, b: number, v: number) => { const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a); return t * t * (3 - 2 * t); };

interface MapaPapel { color: (x: number, y: number, salida: Float32Array) => void; }

/** Una cuadrícula con el color del papel en cada zona; null si la imagen no parece un documento sobre papel. */
function mapaPapel(px: Uint8ClampedArray, w: number, h: number): MapaPapel | null {
  // Color de lo más claro de la imagen: para no tomar por «color» el tinte que la luz le da al papel.
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < w * h * 4; i += 28) { hist[Math.round(luz(px[i], px[i + 1], px[i + 2]))]++; n++; }
  let corte = 255;
  for (let acum = 0; corte > 0 && acum < n * 0.2; corte--) acum += hist[corte];
  let sr = 0, sg = 0, sb = 0, cuenta = 0;
  for (let i = 0; i < w * h * 4; i += 28) if (luz(px[i], px[i + 1], px[i + 2]) >= corte) { sr += px[i]; sg += px[i + 1]; sb += px[i + 2]; cuenta++; }
  if (!cuenta) return null;
  [sr, sg, sb] = [sr / cuenta, sg / cuenta, sb / cuenta];
  const refL = luz(sr, sg, sb), maxRef = Math.max(sr, sg, sb);
  // Lo más claro ya es muy de color: no es una hoja con una luz cálida, sino una foto.
  if (maxRef < 60 || (maxRef - Math.min(sr, sg, sb)) / maxRef > 0.3) return null;
  const gr = refL / Math.max(1, sr), gg = refL / Math.max(1, sg), gb = refL / Math.max(1, sb);

  const lado = Math.max(8, Math.round(Math.max(w, h) / 32)), gw = Math.ceil(w / lado), gh = Math.ceil(h / lado);
  const canal = [new Float32Array(gw * gh), new Float32Array(gw * gh), new Float32Array(gw * gh)], valida = new Uint8Array(gw * gh);
  const paso = Math.max(1, Math.round(lado / 12)), histo = new Uint32Array(64);
  let validas = 0;
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      histo.fill(0);
      let muestras = 0, candidatas = 0;
      const y1 = Math.min(h, (cy + 1) * lado), x1 = Math.min(w, (cx + 1) * lado);
      const esPapel = (i: number) => {
        const r = px[i] * gr, g = px[i + 1] * gg, b = px[i + 2] * gb, max = Math.max(r, g, b);
        return luz(px[i], px[i + 1], px[i + 2]) >= refL * 0.55 && (max - Math.min(r, g, b)) / Math.max(1, max) < 0.16;
      };
      for (let y = cy * lado; y < y1; y += paso) for (let x = cx * lado; x < x1; x += paso) {
        const i = (y * w + x) * 4;
        muestras++;
        if (esPapel(i)) { candidatas++; histo[Math.round(luz(px[i], px[i + 1], px[i + 2])) >> 2]++; }
      }
      if (candidatas < muestras * 0.3) continue;
      // Lo más claro de lo candidato: el papel entre las letras.
      let acum = 0, b = 63;
      for (; b > 0 && acum < candidatas * 0.3; b--) acum += histo[b];
      const minimo = (b + 1) << 2;
      let r0 = 0, g0 = 0, b0 = 0, m = 0;
      for (let y = cy * lado; y < y1; y += paso) for (let x = cx * lado; x < x1; x += paso) {
        const i = (y * w + x) * 4;
        if (esPapel(i) && luz(px[i], px[i + 1], px[i + 2]) >= minimo) { r0 += px[i]; g0 += px[i + 1]; b0 += px[i + 2]; m++; }
      }
      if (!m) continue;
      const k = cy * gw + cx;
      canal[0][k] = r0 / m; canal[1][k] = g0 / m; canal[2][k] = b0 / m;
      valida[k] = 1;
      validas++;
    }
  }
  if (validas < gw * gh * 0.45) return null;

  // Las zonas sin papel (bloques de color, la mesa) toman el de sus vecinas.
  for (let faltan = gw * gh - validas; faltan > 0;) {
    const nuevas: [number, number, number, number][] = [];
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
      if (valida[cy * gw + cx]) continue;
      let r = 0, g = 0, b = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= gw || y >= gh || !valida[y * gw + x]) continue;
        const k = y * gw + x;
        r += canal[0][k]; g += canal[1][k]; b += canal[2][k]; c++;
      }
      if (c) nuevas.push([cy * gw + cx, r / c, g / c, b / c]);
    }
    if (!nuevas.length) break;
    for (const [k, r, g, b] of nuevas) { canal[0][k] = r; canal[1][k] = g; canal[2][k] = b; valida[k] = 1; faltan--; }
  }
  // Sin saltos entre zonas.
  for (const c of canal) for (let vuelta = 0; vuelta < 2; vuelta++) {
    const copia = c.slice();
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
      let s = 0, m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < gw && y < gh) { s += copia[y * gw + x]; m++; }
      }
      c[cy * gw + cx] = s / m;
    }
  }
  // El brillo sí cambia por zonas (sombras); el tinte de la luz es uno solo: si no, cada zona sale de un color distinto.
  let mr = 0, mg = 0, mb = 0;
  for (let k = 0; k < gw * gh; k++) { mr += canal[0][k]; mg += canal[1][k]; mb += canal[2][k]; }
  const ml = Math.max(1, luz(mr, mg, mb));
  const brillo = new Float32Array(gw * gh);
  for (let k = 0; k < gw * gh; k++) brillo[k] = luz(canal[0][k], canal[1][k], canal[2][k]);
  const tinte = [mr / ml, mg / ml, mb / ml];
  return {
    color(x, y, salida) {
      const fx0 = Math.min(gw - 1, Math.max(0, x / lado - 0.5)), fy0 = Math.min(gh - 1, Math.max(0, y / lado - 0.5));
      const x0 = fx0 | 0, y0 = fy0 | 0, x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1), fx = fx0 - x0, fy = fy0 - y0;
      const l = (brillo[y0 * gw + x0] * (1 - fx) + brillo[y0 * gw + x1] * fx) * (1 - fy) + (brillo[y1 * gw + x0] * (1 - fx) + brillo[y1 * gw + x1] * fx) * fy;
      salida[0] = l * tinte[0]; salida[1] = l * tinte[1]; salida[2] = l * tinte[2];
    },
  };
}

/** Sin papel (una foto, una portada): solo se estira un poco el contraste, igual en toda la imagen. */
function nivelesDeFoto(px: Uint8ClampedArray, n: number) {
  const hist = new Uint32Array(256);
  let m = 0;
  for (let i = 0; i < n * 4; i += 16) { hist[Math.round(luz(px[i], px[i + 1], px[i + 2]))]++; m++; }
  let lo = 0, hi = 255;
  for (let a = 0; lo < 255 && a < m * 0.005; lo++) a += hist[lo];
  for (let a = 0; hi > 0 && a < m * 0.005; hi--) a += hist[hi];
  const rango = Math.max(60, hi - lo);
  return (v: number) => v + (((v - lo) * 255) / rango - v) * 0.35;
}

/**
 * Cuánto de lo que se ve más oscuro que su entorno es tinta de verdad (0 a 1). Un color impreso (un bloque azul, sus
 * bordes) también es más oscuro que el papel, pero no es tinta: si se oscureciera, saldría como una barra negra que tapa
 * su texto. Lo muy oscuro sí lo es, aunque tenga color (un bolígrafo azul).
 */
function esTinta(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), sinColor = 1 - suave(0.2, 0.42, (max - Math.min(r, g, b)) / Math.max(1, max));
  return Math.max(sinColor, 1 - suave(55, 105, luz(r, g, b)));
}

/** Máscara de nitidez: resalta los bordes sin amplificar el ruido del papel. */
export function enfocar(px: Uint8ClampedArray, w: number, h: number, cantidad = 0.7) {
  const r = Math.max(1, Math.min(3, Math.round(Math.max(w, h) / 900))), W = w + 1, s = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; fila += luz(px[i], px[i + 1], px[i + 2]); s[(y + 1) * W + x + 1] = s[y * W + x + 1] + fila; }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), i = (y * w + x) * 4;
      const media = (s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
      const d = luz(px[i], px[i + 1], px[i + 2]) - media;
      if (Math.abs(d) < 3) continue;
      const a = d * cantidad;
      px[i] = tope(px[i] + a); px[i + 1] = tope(px[i + 1] + a); px[i + 2] = tope(px[i + 2] + a);
    }
  }
}

/** Aplica el filtro sobre los píxeles. Se llama después de enderezar y girar. */
export function filtrarPixeles(px: Uint8ClampedArray, w: number, h: number, filtro: Filtro) {
  if (filtro === "original") return;
  const n = w * h, img = { data: px, width: w, height: h };
  const papel = mapaPapel(px, w, h);
  const niveles = papel ? null : nivelesDeFoto(px, n);
  const hoja = new Float32Array(3);

  if (filtro === "documento" && papel) {
    // Cada punto contra su entorno: el texto queda negro aunque la luz sea desigual o esté sobre un bloque de color.
    const d = oscuridad(img), t = umbralTinta(d), a = t * 0.45, b = t * 1.05;
    for (let i = 0; i < n; i++) {
      const v = 255 * (1 - suave(a, b, d[i]) * esTinta(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]));
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    }
    return;
  }
  if (filtro === "texto" && papel) {
    // Como «Texto claro» de Adobe Scan: el papel conserva su tono (solo algo más claro) y la tinta se oscurece mucho.
    const d = oscuridad(img), t = umbralTinta(d), a = t * 0.45, b = t * 1.1;
    for (let i = 0; i < n; i++) {
      const j = i * 4, k = 1 - 0.92 * suave(a, b, d[i]) * esTinta(px[j], px[j + 1], px[j + 2]);
      for (let c = 0; c < 3; c++) px[j + c] = tope(255 * (px[j + c] / 255) ** 0.85 * k);
    }
    return;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      const [r0, g0, b0] = [px[j], px[j + 1], px[j + 2]];
      let r: number, g: number, b: number;
      if (papel) {
        papel.color(x, y, hoja);
        // El papel pasa a blanco en cada canal: se va la sombra y el tinte de la luz, y los colores impresos se quedan.
        const blanco = 0.93;
        r = (r0 / Math.max(40, hoja[0]) / blanco) ** 1.2 * 255;
        g = (g0 / Math.max(40, hoja[1]) / blanco) ** 1.2 * 255;
        b = (b0 / Math.max(40, hoja[2]) / blanco) ** 1.2 * 255;
      } else {
        r = niveles!(r0); g = niveles!(g0); b = niveles!(b0);
      }
      const l = luz(r, g, b);
      // Una foto no se puede pasar a tinta sin llenarla de halos: en Blanco y negro sale en grises de buen contraste.
      if (filtro === "gris" || filtro === "documento") { px[j] = px[j + 1] = px[j + 2] = tope(filtro === "documento" ? (l - 128) * 1.25 + 128 : l); continue; }
      // Un poco más de color; en una foto, casi nada («Texto claro» de una foto: sin tocar el color).
      const sat = papel ? 1.2 : filtro === "texto" ? 1 : 1.05;
      px[j] = tope(l + (r - l) * sat); px[j + 1] = tope(l + (g - l) * sat); px[j + 2] = tope(l + (b - l) * sat);
    }
  }
}
