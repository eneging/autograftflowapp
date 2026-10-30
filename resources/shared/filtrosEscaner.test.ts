import { describe, expect, it } from "vitest";
import { enfocar, filtrarPixeles, FILTROS } from "./filtrosEscaner";

const pixel = (d: Uint8ClampedArray, w: number, x: number, y: number) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

/** Hoja de papel algo cálida, con sombra de izquierda a derecha, un bloque azul impreso y una raya de tinta. */
function hoja(w = 600, h = 800) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, luzHoja = 1 - (x / w) * 0.3;
    let c = [232, 226, 214];
    if (x > 80 && x < 400 && y > 80 && y < 240) c = [85, 160, 215]; // bloque azul
    if (y > 400 && y < 406 && x > 60 && x < 540) c = [40, 40, 45]; // texto
    d[i] = c[0] * luzHoja; d[i + 1] = c[1] * luzHoja; d[i + 2] = c[2] * luzHoja; d[i + 3] = 255;
  }
  return d;
}

/** Foto sin papel: portada con fondo beige, una figura y un degradado violeta. */
function foto(w = 600, h = 800) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, cx = (x - 300) / 170, cy = (y - 400) / 230, fig = cx * cx + cy * cy < 1;
    d[i] = fig ? 235 : y < 350 ? 214 : 110 + y / 12; d[i + 1] = fig ? 170 : y < 350 ? 170 : 40; d[i + 2] = fig ? 140 : y < 350 ? 125 : 120 + x / 12; d[i + 3] = 255;
  }
  return d;
}
const filtrado = (d: Uint8ClampedArray, f: Parameters<typeof filtrarPixeles>[3], w = 600, h = 800) => { const c = d.slice(); filtrarPixeles(c, w, h, f); return c; };
const croma = ([r, g, b]: number[]) => Math.max(r, g, b) - Math.min(r, g, b);

describe("Color automático", () => {
  it("el papel queda blanco aunque tenga sombra y tinte", () => {
    const c = filtrado(hoja(), "color");
    for (const [x, y] of [[30, 500], [300, 600], [570, 500]]) {
      const p = pixel(c, 600, x, y);
      expect(Math.min(...p)).toBeGreaterThan(235);
      expect(croma(p)).toBeLessThan(16);
    }
  });
  it("un bloque de color impreso no se lava: sigue siendo azul (el error de antes)", () => {
    const [r, g, b] = pixel(filtrado(hoja(), "color"), 600, 240, 160);
    expect(b).toBeGreaterThan(r + 60);
    expect(g).toBeGreaterThan(r);
    expect(r).toBeLessThan(170);
  });
  it("la tinta sigue oscura", () => expect(Math.max(...pixel(filtrado(hoja(), "color"), 600, 300, 403))).toBeLessThan(70));
});

describe("una foto sin papel no se quema ni se mancha", () => {
  it("Color automático: se parece al original y una zona pareja sigue pareja", () => {
    const o = foto(), c = filtrado(o, "color");
    let suma = 0;
    for (let i = 0; i < o.length; i += 4) suma += Math.abs(c[i] - o[i]) + Math.abs(c[i + 1] - o[i + 1]) + Math.abs(c[i + 2] - o[i + 2]);
    expect(suma / (o.length / 4) / 3).toBeLessThan(25);
    // El fondo beige no se convierte en blanco, y es igual a ambos lados.
    const a = pixel(c, 600, 40, 100), b = pixel(c, 600, 560, 200);
    expect(Math.min(...a)).toBeLessThan(200);
    a.forEach((v, k) => expect(Math.abs(v - b[k])).toBeLessThan(4));
  });
  it.each(["texto", "documento"] as const)("%s: sin halos junto a los bordes", (f) => {
    const c = filtrado(foto(), f);
    // Fondo violeta pegado a la figura y lejos de ella: el mismo tono (ignorando el degradado horizontal).
    const cerca = pixel(c, 600, 300, 640), lejos = pixel(c, 600, 300, 760);
    expect(Math.abs(cerca[0] + cerca[1] + cerca[2] - lejos[0] - lejos[1] - lejos[2])).toBeLessThan(60);
  });
});

describe("Texto claro", () => {
  it("oscurece mucho la tinta, conserva el papel y el color del bloque", () => {
    const o = hoja(), c = filtrado(o, "texto");
    expect(Math.max(...pixel(c, 600, 300, 403))).toBeLessThan(25);
    const papel = pixel(c, 600, 300, 600), antes = pixel(o, 600, 300, 600);
    expect(papel[0]).toBeGreaterThanOrEqual(antes[0]); // algo más claro
    expect(papel[0]).toBeLessThan(250); // pero no blanco
    const [r, , b] = pixel(c, 600, 240, 160);
    expect(b).toBeGreaterThan(r + 60);
  });
});

describe("un color impreso no es tinta", () => {
  /** Hoja con una franja azul angosta (como «LISTA»), bordes algo borrosos y texto oscuro encima. */
  function franja(w = 600, h = 800) {
    const d = hoja(w, h);
    for (let y = 300; y < 340; y++) for (let x = 100; x < 400; x++) {
      const i = (y * w + x) * 4, borde = Math.min(1, Math.min(y - 300, 339 - y, x - 100, 399 - x) / 4);
      const texto = y > 312 && y < 328 && x > 230 && x < 270 && (x - 230) % 8 < 3;
      const c = texto ? [35, 45, 60] : [85 + (232 - 85) * (1 - borde), 160 + (226 - 160) * (1 - borde), 215 + (214 - 215) * (1 - borde)];
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
    return d;
  }
  it.each(["texto", "documento"] as const)("%s: la franja no sale como una barra negra y su texto se distingue", (f) => {
    const c = filtrado(franja(), f);
    const fondo = pixel(c, 600, 160, 320), borde = pixel(c, 600, 160, 302), letra = pixel(c, 600, 231, 320);
    expect(Math.max(...fondo)).toBeGreaterThan(120);
    expect(Math.max(...borde)).toBeGreaterThan(120);
    expect(Math.max(...letra)).toBeLessThan(70);
  });
  it("un bolígrafo azul oscuro sí se toma por tinta", () => {
    const d = hoja();
    for (let y = 500; y < 506; y++) for (let x = 100; x < 500; x++) { const i = (y * 600 + x) * 4; d[i] = 25; d[i + 1] = 40; d[i + 2] = 95; }
    expect(Math.max(...pixel(filtrado(d, "texto"), 600, 300, 503))).toBeLessThan(45);
  });
});

describe("Escala de grises y Blanco y negro", () => {
  it("gris: sin color; el bloque es un gris medio", () => {
    const c = filtrado(hoja(), "gris");
    expect(croma(pixel(c, 600, 240, 160))).toBe(0);
    expect(pixel(c, 600, 240, 160)[0]).toBeGreaterThan(90);
    expect(pixel(c, 600, 240, 160)[0]).toBeLessThan(215);
  });
  it("blanco y negro: papel blanco puro y texto negro, también con sombra", () => {
    const c = filtrado(hoja(), "documento");
    expect(pixel(c, 600, 30, 600)[0]).toBe(255);
    expect(pixel(c, 600, 570, 600)[0]).toBe(255);
    expect(pixel(c, 600, 60 + 5, 403)[0]).toBeLessThan(60);
    expect(pixel(c, 600, 530, 403)[0]).toBeLessThan(60);
  });
});

describe("Color original y nitidez", () => {
  it("el original no se toca", () => { const o = hoja(), c = filtrado(o, "original"); expect(o.every((v, i) => v === c[i])).toBe(true); });
  it("hay 5 filtros con su nombre, entre ellos Texto claro", () => {
    expect(FILTROS.map((f) => f.nombre)).toEqual(["Color original", "Color automático", "Texto claro", "Escala de grises", "Blanco y negro"]);
  });
  it("enfocar resalta los bordes y deja lo parejo igual", () => {
    const w = 100, h = 100, d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, v = x < 50 ? 60 : 200; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    const c = d.slice();
    enfocar(c, w, h);
    expect(c[(50 * w + 49) * 4]).toBeLessThan(60); // lado oscuro del borde, más oscuro
    expect(c[(50 * w + 50) * 4]).toBeGreaterThan(200); // lado claro, más claro
    expect(c[(50 * w + 10) * 4]).toBe(60);
    expect(c[(50 * w + 90) * 4]).toBe(200);
  });
  it("enfocar no amplifica el ruido suave del papel", () => {
    const w = 60, h = 60, d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { const v = 220 + (i % 2); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    const c = d.slice();
    enfocar(c, w, h);
    expect(c).toEqual(d);
  });
});
