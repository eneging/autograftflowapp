import { describe, expect, it } from "vitest";
import { detectarFirma, girarRecorte, limpiarFirma, moverRecorte, type ImagenRgba, type Recorte } from "./firmaImagen";

/** Hoja de papel gris claro sobre la que se dibuja tinta. */
function hoja(w: number, h: number, papel = 225) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = papel; data[i * 4 + 3] = 255; }
  const punto = (x: number, y: number, c: number[]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (Math.round(y) * w + Math.round(x)) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
  };
  const img: ImagenRgba = { data, width: w, height: h };
  return { img, punto };
}

const NEGRO = [35, 35, 40], AZUL = [40, 60, 150];

/** Trazo curvo de mano, en la caja (x, y, ancho, alto). */
function firma(punto: (x: number, y: number, c: number[]) => void, x: number, y: number, ancho: number, alto: number, c = NEGRO) {
  for (let t = 0; t <= 1; t += 0.0005) {
    const px = x + ancho * t, py = y + alto / 2 + (alto / 2 - 2) * Math.sin(t * Math.PI * 7) * (0.5 + 0.5 * Math.cos(t * 3));
    for (let g = 0; g < 3; g++) for (let k = 0; k < 3; k++) punto(px + g, py + k, c);
  }
}
const rect = (punto: (x: number, y: number, c: number[]) => void, x1: number, y1: number, x2: number, y2: number, c = NEGRO) => {
  for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) punto(x, y, c);
};
const adentro = (r: Recorte, w: number, h: number, x1: number, y1: number, x2: number, y2: number) =>
  r.x * w <= x1 && r.y * h <= y1 && (r.x + r.w) * w >= x2 && (r.y + r.h) * h >= y2;

describe("moverRecorte", () => {
  const r = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
  it("un lado mueve solo ese lado", () => {
    const n = moverRecorte(r, "e", 0.1, 0.3);
    expect(n.x).toBeCloseTo(0.2); expect(n.w).toBeCloseTo(0.5); expect(n.y).toBeCloseTo(0.2); expect(n.h).toBeCloseTo(0.4);
  });
  it("una esquina mueve sus dos lados y deja fija la opuesta", () => {
    const n = moverRecorte(r, "no", -0.1, -0.05);
    expect(n.x).toBeCloseTo(0.1); expect(n.y).toBeCloseTo(0.15); expect(n.x + n.w).toBeCloseTo(0.6); expect(n.y + n.h).toBeCloseTo(0.6);
  });
  it("no se sale de la foto ni se invierte", () => {
    const fuera = moverRecorte(r, "se", 5, 5);
    expect(fuera.x + fuera.w).toBeCloseTo(1); expect(fuera.y + fuera.h).toBeCloseTo(1);
    expect(moverRecorte(r, "o", 5, 0).w).toBeCloseTo(0.03);
  });
  it("mover conserva el tamaño y se queda dentro", () => {
    const n = moverRecorte(r, "mover", 5, -5);
    expect(n).toEqual({ x: 0.6, y: 0, w: 0.4, h: 0.4 });
  });
  it("girar 4 veces deja el mismo recorte", () => {
    const g = girarRecorte(girarRecorte(girarRecorte(girarRecorte(r))));
    expect(g.x).toBeCloseTo(r.x); expect(g.y).toBeCloseTo(r.y); expect(g.w).toBeCloseTo(r.w); expect(g.h).toBeCloseTo(r.h);
  });
});

describe("detectarFirma", () => {
  it("encuentra la firma y deja fuera lo impreso alrededor", () => {
    const { img, punto } = hoja(600, 800);
    rect(punto, 0, 60, 70, 300, [120, 130, 135]); // franja impresa al borde
    rect(punto, 80, 340, 590, 343); // recuadro
    rect(punto, 80, 340, 83, 760);
    rect(punto, 80, 757, 590, 760);
    for (let k = 0; k < 12; k++) for (let a = 0; a < 6.3; a += 0.01) punto(120 + k * 38 + 12 * Math.cos(a), 700 + 12 * Math.sin(a), NEGRO); // fila de circulitos
    firma(punto, 190, 450, 260, 110);
    const r = detectarFirma(img)!;
    expect(r).not.toBeNull();
    expect(adentro(r, 600, 800, 190, 450, 450, 560)).toBe(true);
    expect((r.y + r.h) * 800).toBeLessThan(680); // sin circulitos
    expect(r.x * 600).toBeGreaterThan(90); // sin franja ni recuadro
    expect(r.y * 800).toBeGreaterThan(345);
  });
  it("una firma hecha sobre el renglón: el renglón no estira el recorte", () => {
    const { img, punto } = hoja(800, 500);
    rect(punto, 20, 300, 780, 303);
    firma(punto, 300, 220, 200, 120);
    const r = detectarFirma(img)!;
    expect(adentro(r, 800, 500, 310, 230, 490, 330)).toBe(true);
    expect(r.w).toBeLessThan(0.45);
  });
  it("suma las palabras vecinas de la firma", () => {
    const { img, punto } = hoja(800, 500);
    firma(punto, 150, 200, 220, 100);
    firma(punto, 400, 210, 120, 80);
    expect(adentro(detectarFirma(img)!, 800, 500, 150, 200, 520, 300)).toBe(true);
  });
  it("una hoja en blanco no devuelve recorte", () => expect(detectarFirma(hoja(400, 300).img)).toBeNull());
});

describe("limpiarFirma", () => {
  const alfa = (im: ImagenRgba, x: number, y: number) => im.data[(y * im.width + x) * 4 + 3];
  it("el papel queda transparente aunque la luz sea desigual, y la tinta opaca", () => {
    const { img, punto } = hoja(500, 300);
    // Sombra: el papel va de claro a bastante más oscuro.
    for (let y = 0; y < 300; y++) for (let x = 0; x < 500; x++) { const v = 240 - x * 0.2; punto(x, y, [v, v, v]); }
    firma(punto, 60, 60, 380, 180);
    const { imagen, tinta } = limpiarFirma(img);
    expect(tinta).toBeGreaterThan(500);
    let opacos = 0;
    for (let i = 0; i < 500 * 300; i++) if (imagen.data[i * 4 + 3] > 200) opacos++;
    expect(opacos).toBeGreaterThan(500);
    expect(alfa(imagen, 5, 5)).toBe(0);
    expect(alfa(imagen, 495, 295)).toBe(0);
  });
  it("conserva el color de un bolígrafo azul y el trazo sale de un solo color", () => {
    const { img, punto } = hoja(500, 300);
    firma(punto, 60, 60, 380, 180, AZUL);
    const { imagen } = limpiarFirma(img);
    const colores = new Set<string>();
    for (let i = 0; i < 500 * 300; i++) if (imagen.data[i * 4 + 3]) colores.add(`${imagen.data[i * 4]},${imagen.data[i * 4 + 1]},${imagen.data[i * 4 + 2]}`);
    expect(colores.size).toBe(1);
    const [r, , b] = [...colores][0].split(",").map(Number);
    expect(b).toBeGreaterThan(r + 40);
  });
  it("quita el renglón sin cortar la firma que lo cruza", () => {
    const { img, punto } = hoja(600, 300);
    rect(punto, 0, 150, 600, 153);
    firma(punto, 150, 80, 300, 140);
    const { imagen } = limpiarFirma(img);
    expect(alfa(imagen, 40, 151)).toBe(0); // renglón fuera de la firma
    expect(alfa(imagen, 560, 151)).toBe(0);
    let trazo = 0;
    for (let i = 0; i < 600 * 300; i++) if (imagen.data[i * 4 + 3] > 200) trazo++;
    expect(trazo).toBeGreaterThan(1000);
  });
  it("no toma por recta un trazo recto de la firma que no llega al borde", () => {
    const { img, punto } = hoja(600, 300);
    rect(punto, 120, 60, 420, 63); // raya larga dentro de la firma
    firma(punto, 80, 100, 440, 150);
    expect(alfa(limpiarFirma(img).imagen, 270, 61)).toBeGreaterThan(200);
  });
  it("sin tinta no queda nada", () => expect(limpiarFirma(hoja(300, 200).img).tinta).toBe(0));
  it("en un sello se conserva el borde recto", () => {
    const { img, punto } = hoja(400, 200);
    rect(punto, 20, 20, 380, 24, AZUL);
    rect(punto, 20, 176, 380, 180, AZUL);
    rect(punto, 20, 20, 24, 180, AZUL);
    rect(punto, 376, 20, 380, 180, AZUL);
    expect(alfa(limpiarFirma(img, false).imagen, 200, 21)).toBeGreaterThan(200);
  });
});
