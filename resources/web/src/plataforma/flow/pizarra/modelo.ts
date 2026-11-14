import { distanciaASegmento, type Caja, type Forma, type Punto } from "../../../../../shared/pizarraTrazos";

/*
 * Elementos de la pizarra. Coordenadas en unidades de la pizarra (no de la pantalla): la cámara (desplazamiento y zoom)
 * las lleva a la vista. La pizarra no es infinita: mide ANCHO × ALTO, de sobra para trabajar con comodidad.
 */
export const ANCHO = 16000, ALTO = 10000;

interface Base { id: string; color: string }
export type Elemento =
  | Base & { tipo: "trazo"; puntos: Punto[]; grosor: number; resaltador?: boolean }
  | Base & { tipo: "forma"; forma: Forma; grosor: number }
  /** Carácter reconocido (número o símbolo): se dibuja con letra clara en el lugar y tamaño en que se escribió. */
  | Base & { tipo: "glifo"; c: string; x: number; base: number; tam: number }
  | Base & { tipo: "nota"; x: number; y: number; w: number; h: number; texto: string }
  | Base & { tipo: "texto"; x: number; y: number; texto: string; tam: number }
  | Base & { tipo: "imagen"; x: number; y: number; w: number; h: number; imagen: string };

export const COLORES = ["#1f2328", "#d1242f", "#1f6feb", "#1a7f37", "#8250df", "#bc4c00"];
export const COLORES_NOTA = ["#fff3a3", "#ffd6e0", "#cdeffd", "#d3f5d3", "#e8dcff"];

export function cajaElemento(e: Elemento): Caja {
  switch (e.tipo) {
    case "trazo": {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of e.puntos) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      const m = e.grosor / 2;
      return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
    }
    case "forma": {
      const f = e.forma;
      if (f.forma === "linea" || f.forma === "flecha") {
        const m = e.grosor * 3;
        return { x: Math.min(f.a.x, f.b.x) - m, y: Math.min(f.a.y, f.b.y) - m, w: Math.abs(f.a.x - f.b.x) + 2 * m, h: Math.abs(f.a.y - f.b.y) + 2 * m };
      }
      if (f.forma === "triangulo") {
        const xs = f.puntos.map((p) => p.x), ys = f.puntos.map((p) => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      return f.caja;
    }
    case "glifo": return { x: e.x - e.tam * 0.32, y: e.base - e.tam * 0.75, w: e.tam * 0.64, h: e.tam * 0.8 };
    case "texto": {
      const lineas = e.texto.split("\n");
      return { x: e.x, y: e.y, w: Math.max(...lineas.map((l) => l.length), 1) * e.tam * 0.56, h: lineas.length * e.tam * 1.25 };
    }
    default: return { x: e.x, y: e.y, w: e.w, h: e.h };
  }
}

export const dentro = (p: Punto, c: Caja, m = 0) => p.x >= c.x - m && p.x <= c.x + c.w + m && p.y >= c.y - m && p.y <= c.y + c.h + m;
export const seCruzan = (a: Caja, b: Caja) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** ¿El punto toca el elemento? Los trazos y líneas se miden por su recorrido, no por su caja. */
export function toca(e: Elemento, p: Punto, tolerancia: number): boolean {
  if (e.tipo === "trazo") {
    const t = tolerancia + e.grosor / 2;
    if (!dentro(p, cajaElemento(e), t)) return false;
    if (e.puntos.length === 1) return Math.hypot(p.x - e.puntos[0].x, p.y - e.puntos[0].y) <= t;
    for (let i = 1; i < e.puntos.length; i++) if (distanciaASegmento(p, e.puntos[i - 1], e.puntos[i]) <= t) return true;
    return false;
  }
  if (e.tipo === "forma") {
    const f = e.forma, t = tolerancia + e.grosor;
    if (f.forma === "linea" || f.forma === "flecha") return distanciaASegmento(p, f.a, f.b) <= t;
    if (f.forma === "triangulo") return f.puntos.some((a, i) => distanciaASegmento(p, a, f.puntos[(i + 1) % 3]) <= t) || dentroTriangulo(p, f.puntos);
    return dentro(p, f.caja, t);
  }
  return dentro(p, cajaElemento(e), tolerancia);
}

function dentroTriangulo(p: Punto, [a, b, c]: [Punto, Punto, Punto]) {
  const s = (u: Punto, v: Punto, w: Punto) => (u.x - w.x) * (v.y - w.y) - (v.x - w.x) * (u.y - w.y);
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** Mueve un elemento (devuelve una copia). */
export function mover(e: Elemento, dx: number, dy: number): Elemento {
  const m = (p: Punto) => ({ x: p.x + dx, y: p.y + dy });
  switch (e.tipo) {
    case "trazo": return { ...e, puntos: e.puntos.map(m) };
    case "glifo": return { ...e, x: e.x + dx, base: e.base + dy };
    case "forma": {
      const f = e.forma;
      if (f.forma === "linea" || f.forma === "flecha") return { ...e, forma: { ...f, a: m(f.a), b: m(f.b) } };
      if (f.forma === "triangulo") return { ...e, forma: { ...f, puntos: [m(f.puntos[0]), m(f.puntos[1]), m(f.puntos[2])] } };
      return { ...e, forma: { ...f, caja: { ...f.caja, x: f.caja.x + dx, y: f.caja.y + dy } } };
    }
    default: return { ...e, x: e.x + dx, y: e.y + dy };
  }
}

/** Camino SVG suave que pasa por los puntos (curvas por los puntos medios). */
export function caminoSuave(pts: Punto[]): string {
  if (!pts.length) return "";
  if (pts.length < 3) return `M${pts[0].x} ${pts[0].y}` + pts.slice(1).map((p) => `L${p.x} ${p.y}`).join("") + (pts.length === 1 ? "l0.01 0" : "");
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    d += `Q${pts[i].x} ${pts[i].y} ${mx} ${my}`;
  }
  const u = pts[pts.length - 1];
  return d + `L${u.x} ${u.y}`;
}
