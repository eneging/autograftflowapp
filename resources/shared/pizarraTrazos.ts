/*
 * Trazo asistido de la Pizarra (Flow Tools). Recibe los trazos hechos a mano (ratón, dedo o lápiz) y propone una
 * versión más legible:
 *  1. Formas de un trazo: línea, rectángulo, triángulo y círculo/elipse; flecha con dos trazos (línea + punta).
 *  2. Números y símbolos (0-9 + − × =): los dígitos con una red entrenada con escritura real (pizarraDigitos.ts); los
 *     símbolos de rectas, por su estructura. Un grupo («3+4=7») se separa en caracteres y solo se convierte si TODOS
 *     se reconocen: así no se cambian palabras a medias. Dentro de una cuenta se pide menos confianza a cada dígito.
 *  3. Lo demás (letras, dibujos): se suaviza el temblor sin cambiar la forma.
 * Sin dependencias del navegador, para poder probarlo.
 */
import { reconocerDigito } from "./pizarraDigitos";

export interface Punto { x: number; y: number }
export type Trazo = Punto[];
export interface Caja { x: number; y: number; w: number; h: number }

export type Forma =
  | { forma: "linea"; a: Punto; b: Punto }
  | { forma: "flecha"; a: Punto; b: Punto }
  | { forma: "rect"; caja: Caja }
  | { forma: "elipse"; caja: Caja }
  | { forma: "triangulo"; puntos: [Punto, Punto, Punto] };

/** Un carácter reconocido: su texto y la caja de los trazos que lo forman. */
export interface Glifo { c: string; caja: Caja }

export type Propuesta =
  | { tipo: "forma"; forma: Forma }
  | { tipo: "glifos"; glifos: Glifo[]; caja: Caja }
  | { tipo: "suavizado"; trazos: Trazo[] };

export type ModoAsistencia = "completo" | "formas" | "suavizar" | "apagado";

// ---------------------------------------------------------------- geometría básica

const dist = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);

export function largo(t: Trazo): number {
  let l = 0;
  for (let i = 1; i < t.length; i++) l += dist(t[i - 1], t[i]);
  return l;
}

export function cajaDe(trazos: Trazo[]): Caja {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of trazos) for (const p of t) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Reparte n puntos a igual distancia a lo largo del trazo. */
export function remuestrear(t: Trazo, n: number): Trazo {
  if (t.length === 0) return [];
  if (t.length === 1 || largo(t) === 0) return Array.from({ length: n }, () => ({ ...t[0] }));
  const paso = largo(t) / (n - 1);
  const src = t.map((p) => ({ ...p }));
  const res: Trazo = [{ ...src[0] }];
  let acum = 0;
  for (let i = 1; i < src.length; i++) {
    const d = dist(src[i - 1], src[i]);
    if (acum + d >= paso && d > 0) {
      const k = (paso - acum) / d;
      const q = { x: src[i - 1].x + k * (src[i].x - src[i - 1].x), y: src[i - 1].y + k * (src[i].y - src[i - 1].y) };
      res.push(q);
      src.splice(i, 0, q);
      acum = 0;
    } else acum += d;
  }
  while (res.length < n) res.push({ ...src[src.length - 1] });
  return res.slice(0, n);
}

/** Ramer–Douglas–Peucker: deja solo los puntos que marcan el contorno (esquinas). */
export function simplificar(t: Trazo, eps: number): Trazo {
  if (t.length < 3) return t.slice();
  const [a, b] = [t[0], t[t.length - 1]];
  let max = 0, idx = 0;
  for (let i = 1; i < t.length - 1; i++) {
    const d = distanciaASegmento(t[i], a, b);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...simplificar(t.slice(0, idx + 1), eps).slice(0, -1), ...simplificar(t.slice(idx), eps)];
}

export function distanciaASegmento(p: Punto, a: Punto, b: Punto): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (!l2) return dist(p, a);
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy));
}

/**
 * Quita los puntos que están más cerca que «paso» del último que se dejó. El ratón y las pantallas táctiles entregan
 * muchos puntos casi encima unos de otros, con un serrucho de 1-2 píxeles que infla el largo del trazo: sin limpiarlo,
 * una raya recta no parece recta.
 */
export function limpiar(t: Trazo, paso: number): Trazo {
  if (t.length < 3) return t.slice();
  const res: Trazo = [t[0]];
  for (const p of t.slice(1, -1)) if (dist(p, res[res.length - 1]) >= paso) res.push(p);
  const u = t[t.length - 1];
  if (dist(u, res[res.length - 1]) < paso / 2 && res.length > 1) res.pop();
  res.push(u);
  return res;
}

/** Cuánto se aparta el trazo, como máximo, de la recta entre sus extremos. */
function desvioDeRecta(t: Trazo): number {
  let max = 0;
  for (const p of t) max = Math.max(max, distanciaASegmento(p, t[0], t[t.length - 1]));
  return max;
}

/**
 * Hace el trazo más prolijo sin cambiar lo que es: quita el temblor (más en trazos largos) y endereza los tramos que
 * ya eran casi rectos (la base de un «2», el palo de un «4»), conservando las esquinas y los extremos.
 */
export function suavizar(t: Trazo, ventana?: number): Trazo {
  if (t.length < 4) return t.slice();
  const l = largo(t);
  const n = Math.max(8, Math.min(500, Math.round(l / 2.5)));
  const r = remuestrear(t, n);
  // Ventana proporcional al largo: unos 2-3 % del trazo a cada lado, entre 2 y 7 puntos.
  const v = ventana ?? Math.max(2, Math.min(7, Math.round(n * 0.025)));
  const suave = r.map((p, i) => {
    if (i === 0) return { ...t[0] };
    if (i === r.length - 1) return { ...t[t.length - 1] };
    const w = Math.min(v, i, r.length - 1 - i);
    let sx = 0, sy = 0;
    for (let j = i - w; j <= i + w; j++) { sx += r[j].x; sy += r[j].y; }
    return { x: sx / (2 * w + 1), y: sy / (2 * w + 1) };
  });
  // Tramos casi rectos entre esquinas: se dibujan rectos.
  const c = cajaDe([suave]);
  const tol = Math.max(1.5, 0.035 * Math.hypot(c.w, c.h));
  const claves = indicesEsquinas(suave, Math.max(2, 0.05 * Math.hypot(c.w, c.h)));
  const res: Trazo = [];
  for (let k = 0; k < claves.length - 1; k++) {
    const tramo = suave.slice(claves[k], claves[k + 1] + 1);
    const recto = tramo.length > 2 && desvioDeRecta(tramo) < tol && dist(tramo[0], tramo[tramo.length - 1]) > 4 * tol;
    res.push(...(recto ? [tramo[0]] : tramo.slice(0, -1)));
  }
  res.push(suave[suave.length - 1]);
  return res;
}

/** Índices de las esquinas (Ramer–Douglas–Peucker), incluidos el primero y el último. */
function indicesEsquinas(t: Trazo, eps: number): number[] {
  const res = new Set<number>([0, t.length - 1]);
  const rdp = (i: number, j: number) => {
    let max = 0, idx = -1;
    for (let k = i + 1; k < j; k++) { const d = distanciaASegmento(t[k], t[i], t[j]); if (d > max) { max = d; idx = k; } }
    if (idx >= 0 && max > eps) { res.add(idx); rdp(i, idx); rdp(idx, j); }
  };
  rdp(0, t.length - 1);
  return [...res].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- formas de un trazo

/** Recto si no se aparta más del 6 % de su largo de la línea entre sus extremos (no depende del serrucho del ratón). */
function esRecta(t: Trazo): boolean {
  if (t.length < 2) return false;
  const d = dist(t[0], t[t.length - 1]);
  return d > 0 && desvioDeRecta(t) < 0.06 * d;
}

function esCerrado(t: Trazo): boolean {
  const c = cajaDe([t]);
  const diag = Math.hypot(c.w, c.h);
  return diag > 0 && dist(t[0], t[t.length - 1]) < Math.max(0.22 * diag, 6) && largo(t) > 1.8 * diag;
}

/** Desvío promedio respecto de la elipse inscrita en la caja (0 = elipse perfecta). */
function desvioElipse(t: Trazo): number {
  const c = cajaDe([t]);
  const rx = c.w / 2, ry = c.h / 2;
  if (rx < 1 || ry < 1) return Infinity;
  const cx = c.x + rx, cy = c.y + ry;
  const r = remuestrear(t, 64);
  return r.reduce((s, p) => s + Math.abs(Math.hypot((p.x - cx) / rx, (p.y - cy) / ry) - 1), 0) / r.length;
}

/** Esquinas de un trazo cerrado (sin repetir la de cierre). */
function esquinas(t: Trazo): Punto[] {
  const c = cajaDe([t]);
  const v = simplificar(remuestrear(t, 96), 0.09 * Math.hypot(c.w, c.h));
  // El primer y último punto son casi el mismo (trazo cerrado): se quedan uno.
  const pts = dist(v[0], v[v.length - 1]) < 0.15 * Math.hypot(c.w, c.h) ? v.slice(0, -1) : v;
  // Une esquinas muy próximas (el cierre suele dejar una de más).
  const res: Punto[] = [];
  for (const p of pts) if (!res.length || dist(res[res.length - 1], p) > 0.12 * Math.hypot(c.w, c.h)) res.push(p);
  if (res.length > 2 && dist(res[0], res[res.length - 1]) < 0.12 * Math.hypot(c.w, c.h)) res.pop();
  return res;
}

export function reconocerForma(t: Trazo): Forma | null {
  const c = cajaDe([t]);
  if (Math.max(c.w, c.h) < 12 || t.length < 3) return null;
  if (esRecta(t)) return { forma: "linea", a: { ...t[0] }, b: { ...t[t.length - 1] } };
  if (!esCerrado(t)) return null;
  const v = esquinas(t);
  const elipse = desvioElipse(t);
  if (v.length === 3) return { forma: "triangulo", puntos: [v[0], v[1], v[2]] };
  if (v.length === 4 && elipse > 0.1) {
    // Rectángulo: ángulos casi rectos. Se endereza a los ejes (lo habitual en una pizarra).
    const rectos = v.every((p, i) => {
      const a = v[(i + 3) % 4], b = v[(i + 1) % 4];
      const u = { x: a.x - p.x, y: a.y - p.y }, w = { x: b.x - p.x, y: b.y - p.y };
      const cos = Math.abs(u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y) || 1);
      return cos < 0.35;
    });
    if (rectos) return { forma: "rect", caja: c };
  }
  if (elipse < 0.13) return { forma: "elipse", caja: c };
  return null;
}

/** Flecha de dos trazos: una línea y una «V» cuyo vértice queda en un extremo de la línea. */
function reconocerFlecha(trazos: Trazo[]): Forma | null {
  if (trazos.length !== 2) return null;
  for (const [l, v] of [[trazos[0], trazos[1]], [trazos[1], trazos[0]]]) {
    if (!esRecta(l) || esRecta(v) || esCerrado(v)) continue;
    const s = simplificar(v, 0.15 * Math.max(1, Math.hypot(cajaDe([v]).w, cajaDe([v]).h)));
    if (s.length !== 3) continue;
    const vertice = s[1], a = l[0], b = l[l.length - 1];
    const lado = largo(l);
    if (largo(v) > 1.4 * lado) continue;
    if (dist(vertice, b) < 0.25 * lado) return { forma: "flecha", a: { ...a }, b: { ...b } };
    if (dist(vertice, a) < 0.25 * lado) return { forma: "flecha", a: { ...b }, b: { ...a } };
  }
  return null;
}

// ---------------------------------------------------------------- $P: números y símbolos

type Direccion = "h" | "v" | "sube" | "baja";
/** Dirección de un trazo recto, o null si no es recto. */
function direccion(t: Trazo): { d: Direccion; a: Punto; b: Punto; l: number } | null {
  const l = largo(t);
  if (t.length < 2 || l === 0 || desvioDeRecta(t) > 0.1 * dist(t[0], t[t.length - 1])) return null;
  const a = t[0], b = t[t.length - 1], dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  const d: Direccion = dy < 0.4 * dx ? "h" : dx < 0.4 * dy ? "v" : (b.x - a.x) * (b.y - a.y) > 0 ? "baja" : "sube";
  return { d, a, b, l: dist(a, b) };
}
function seCortan(p: Punto, q: Punto, r: Punto, s: Punto, holgura: number): boolean {
  const cruz = (a: Punto, b: Punto, c: Punto) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = cruz(r, s, p), d2 = cruz(r, s, q), d3 = cruz(p, q, r), d4 = cruz(p, q, s);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  // Casi se tocan (el trazo se quedó corto): también vale.
  return Math.min(distanciaASegmento(p, r, s), distanciaASegmento(q, r, s), distanciaASegmento(r, p, q), distanciaASegmento(s, p, q)) < holgura;
}

/**
 * Símbolos hechos con rectas (− 1 + = ×), por su estructura y no por su silueta: así no importa si la barra del «+»
 * es más larga o está corrida, que es lo habitual a mano.
 */
function simboloRecto(trazos: Trazo[]): string | null {
  const r = trazos.map(direccion);
  if (r.some((x) => !x)) return null;
  const [a, b] = r as NonNullable<ReturnType<typeof direccion>>[];
  if (r.length === 1) return a.d === "h" ? "−" : a.d === "v" ? "1" : null;
  if (r.length !== 2) return null;
  const holgura = 0.15 * Math.max(a.l, b.l);
  const tipos = [a.d, b.d].sort().join("");
  if (tipos === "hv" && seCortan(a.a, a.b, b.a, b.b, holgura)) return "+";
  if (tipos === "bajasube" && seCortan(a.a, a.b, b.a, b.b, holgura)) return "×";
  if (tipos === "hh") {
    // «=»: dos barras una encima de la otra, que comparten buena parte de su ancho.
    const separacion = Math.abs((a.a.y + a.b.y) / 2 - (b.a.y + b.b.y) / 2);
    const [ax0, ax1] = [Math.min(a.a.x, a.b.x), Math.max(a.a.x, a.b.x)], [bx0, bx1] = [Math.min(b.a.x, b.b.x), Math.max(b.a.x, b.b.x)];
    const comun = Math.min(ax1, bx1) - Math.max(ax0, bx0);
    if (separacion > 0.12 * Math.max(a.l, b.l) && separacion < 1.1 * Math.max(a.l, b.l) && comun > 0.5 * Math.min(a.l, b.l)) return "=";
  }
  return null;
}

/**
 * «1» con gancho (como se escribe en Latinoamérica): un trazo que sube en diagonal corta y baja en un palo vertical
 * largo. La red, entrenada con escritura estadounidense (el «1» casi sin gancho), a veces lo lee como «7»: en el «7»
 * el primer tramo es horizontal y largo; en el «1», sube y es corto.
 */
function unoConGancho(trazos: Trazo[]): boolean {
  if (trazos.length !== 1) return false;
  const t = trazos[0], c = cajaDe([t]);
  const v = simplificar(t, 0.08 * Math.hypot(c.w, c.h));
  if (v.length !== 3) return false;
  const [a, b, d] = v;
  const gancho = { x: b.x - a.x, y: b.y - a.y }, palo = { x: d.x - b.x, y: d.y - b.y };
  const lGancho = Math.hypot(gancho.x, gancho.y), lPalo = Math.hypot(palo.x, palo.y);
  return palo.y > 0 && Math.abs(palo.x) < 0.35 * palo.y && lPalo > 0.75 * c.h // palo casi vertical que baja casi todo el alto
    && gancho.y < 0 && Math.abs(gancho.y) > 0.4 * Math.abs(gancho.x) && lGancho < 0.65 * lPalo; // gancho corto que sube
}

/**
 * El carácter más probable y su puntaje (0 a 1): los símbolos de rectas (+ − = × y el «1» de palo) por su estructura;
 * los dígitos, con la red entrenada con escritura real (pizarraDigitos.ts).
 */
export function reconocerCaracter(trazos: Trazo[]): { c: string; puntaje: number } {
  const recto = simboloRecto(trazos);
  if (recto) return { c: recto, puntaje: 0.95 };
  if (unoConGancho(trazos)) return { c: "1", puntaje: 0.95 };
  // Un garabato recorre mucho para su tamaño; ningún dígito pasa de ~3,5 veces la diagonal de su caja (el «8»).
  // La red siempre elige algún dígito, así que esto se descarta antes.
  const c = cajaDe(trazos);
  if (trazos.reduce((s, t) => s + largo(t), 0) > 4.2 * Math.max(Math.hypot(c.w, c.h), 1)) return { c: "", puntaje: 0 };
  const d = reconocerDigito(trazos);
  return { c: d.c, puntaje: d.prob };
}

/** Separación simple por columnas (trazos que se superponen en horizontal van juntos). El reconocimiento usa una más fina. */
export function separarCaracteres(trazos: Trazo[]): Trazo[][] {
  const items = trazos.map((t) => ({ t, c: cajaDe([t]) })).sort((a, b) => a.c.x - b.c.x);
  const grupos: { trazos: Trazo[]; x0: number; x1: number }[] = [];
  for (const it of items) {
    const g = grupos[grupos.length - 1];
    // Se superponen (con un margen del 15 % del ancho del más angosto): mismo carácter.
    const margen = 0.15 * Math.min(it.c.w, g ? g.x1 - g.x0 : it.c.w);
    if (g && it.c.x <= g.x1 + margen) { g.trazos.push(it.t); g.x1 = Math.max(g.x1, it.c.x + it.c.w); }
    else grupos.push({ trazos: [it.t], x0: it.c.x, x1: it.c.x + it.c.w });
  }
  return grupos.map((g) => g.trazos);
}

/**
 * Confianza pedida a cada dígito: sola, alta (un garabato o una letra no deben volverse un número); dentro de una
 * cuenta (hay un operador u otros dígitos) puede ser menor, porque el contexto ya dice que son números.
 */
const UMBRAL = 0.85, UMBRAL_EN_CUENTA = 0.5, PROMEDIO_EN_CUENTA = 0.72, UMBRAL_SOLO_DIGITOS = 0.8;
/** Penalización por cada trazo de más en un mismo dígito: casi todos se escriben de 1 o 2 trazos. */
const PENA_TRAZO_EXTRA = 0.35;
/** Trazos que puede tener un carácter (4, +, =, 5 con la barra aparte… llegan a 2; un 1 con base, a 3). */
const MAX_TRAZOS = 3;

/**
 * Separa y reconoce a la vez: prueba todas las formas de partir los trazos (ordenados de izquierda a derecha) en
 * caracteres de 1 a 3 trazos y se queda con la que mejor se lee. Así una barra del «+» que roza el «2» no los junta.
 * Reglas para partir: dos caracteres seguidos no pueden superponerse mucho en horizontal (un «+» no se parte en «1» y
 * «−»), y los trazos de un mismo carácter tienen que tocarse o estar muy cerca.
 */
function reconocerNumeros(trazos: Trazo[]): Propuesta | null {
  const total = cajaDe(trazos);
  const items = trazos.map((t) => ({ t, c: cajaDe([t]) })).sort((a, b) => (a.c.x + a.c.w / 2) - (b.c.x + b.c.w / 2));
  const n = items.length;
  if (n > 40) return null;
  const alto = Math.max(total.h, 10);
  const juntos = (desde: number, hasta: number) => {
    const s = items.slice(desde, hasta).map((x) => x.c).sort((a, b) => a.x - b.x);
    let fin = s[0].x + s[0].w;
    for (const c of s.slice(1)) { if (c.x > fin + 0.18 * alto) return false; fin = Math.max(fin, c.x + c.w); }
    return true;
  };
  // Se superponen si el centro del más angosto cae dentro del ancho del otro (con un 8 % de margen hacia adentro):
  // la barra vertical del «+» queda dentro de la horizontal; un «1» que roza el «2» de al lado, no.
  const superpuestos = (a: Caja, b: Caja) => {
    const [angosto, ancho] = a.w <= b.w ? [a, b] : [b, a];
    const centro = angosto.x + angosto.w / 2, m = 0.08 * ancho.w;
    return centro > ancho.x + m && centro < ancho.x + ancho.w - m;
  };
  type Estado = { valor: number; previo: number; c: string; caja: Caja } | null;
  const mejor: Estado[] = [{ valor: 0, previo: -1, c: "", caja: { x: -Infinity, y: 0, w: 0, h: 0 } }];
  const memo = new Map<string, { c: string; puntaje: number }>();
  const memoDe = (desde: number, hasta: number) => memo.get(`${desde}-${hasta}`)?.puntaje ?? 0;
  for (let i = 1; i <= n; i++) {
    mejor[i] = null;
    for (let k = 1; k <= Math.min(MAX_TRAZOS, i); k++) {
      const antes = mejor[i - k];
      if (!antes || (k > 1 && !juntos(i - k, i))) continue;
      const seg = items.slice(i - k, i);
      const caja = cajaDe(seg.map((x) => x.t));
      if (i - k > 0 && superpuestos(antes.caja, caja)) continue;
      const clave = `${i - k}-${i}`;
      const r = memo.get(clave) ?? reconocerCaracter(seg.map((x) => x.t));
      memo.set(clave, r);
      if (r.puntaje < UMBRAL_EN_CUENTA) continue;
      if (/\d/.test(r.c) && caja.h < 0.45 * total.h) continue; // un dígito no puede ser mucho más bajo que el renglón
      const valor = antes.valor + r.puntaje * k - (/\d/.test(r.c) ? PENA_TRAZO_EXTRA * (k - 1) : 0);
      if (!mejor[i] || valor > mejor[i]!.valor) mejor[i] = { valor, previo: i - k, c: r.c, caja };
    }
  }
  if (!mejor[n]) return null;
  const glifos: (Glifo & { puntaje: number })[] = [];
  for (let i = n; i > 0; i = mejor[i]!.previo) glifos.unshift({ c: mejor[i]!.c, caja: mejor[i]!.caja, puntaje: memoDe(mejor[i]!.previo, i) });
  // «−» sola de un trazo ya es una línea: como carácter solo vale dentro de una operación.
  if (glifos.length === 1 && glifos[0].c === "−") return null;
  const digitos = glifos.filter((g) => /\d/.test(g.c));
  const conOperador = glifos.some((g) => /[+−×=]/.test(g.c));
  if (conOperador) {
    // En una cuenta: cada dígito con confianza mínima y, en promedio, razonable (el operador ya dice que son números).
    if (digitos.length && digitos.reduce((a, g) => a + g.puntaje, 0) / digitos.length < PROMEDIO_EN_CUENTA) return null;
  } else if (digitos.length >= 2) {
    // Solo dígitos («2026»): más confianza, y alturas parecidas (en una palabra no: en «sol» la «l» es el doble de alta).
    const altoMax = Math.max(...digitos.map((g) => g.caja.h));
    if (digitos.some((g) => g.puntaje < UMBRAL_SOLO_DIGITOS || g.caja.h < 0.6 * altoMax)) return null;
  } else if (glifos.some((g) => g.puntaje < UMBRAL)) return null;
  return { tipo: "glifos", glifos: glifos.map(({ c, caja }) => ({ c, caja })), caja: total };
}

/**
 * Propuesta para un grupo de trazos terminado (el usuario dejó de escribir un momento). Null si no hay nada que hacer.
 *  - Un trazo: primero formas; un cero alto y angosto se toma como «0» si se reconocen números.
 *  - Varios: flecha; después números y símbolos; si no, suavizado.
 */
function escalarPropuesta(p: Propuesta, k: number): Propuesta {
  const pt = (q: Punto) => ({ x: q.x * k, y: q.y * k });
  const cj = (c: Caja) => ({ x: c.x * k, y: c.y * k, w: c.w * k, h: c.h * k });
  if (p.tipo === "suavizado") return { tipo: "suavizado", trazos: p.trazos.map((t) => t.map(pt)) };
  if (p.tipo === "glifos") return { tipo: "glifos", caja: cj(p.caja), glifos: p.glifos.map((g) => ({ c: g.c, caja: cj(g.caja) })) };
  const f = p.forma;
  const forma: Forma = f.forma === "linea" || f.forma === "flecha" ? { ...f, a: pt(f.a), b: pt(f.b) }
    : f.forma === "triangulo" ? { forma: "triangulo", puntos: [pt(f.puntos[0]), pt(f.puntos[1]), pt(f.puntos[2])] }
    : { ...f, caja: cj(f.caja) };
  return { tipo: "forma", forma };
}

export function proponer(trazos: Trazo[], modo: ModoAsistencia = "completo", escala = 1): Propuesta | null {
  // Se analiza en píxeles de pantalla (escala = zoom de la pizarra): así el temblor del ratón pesa lo mismo con
  // cualquier zoom, y el resultado se devuelve en unidades de la pizarra.
  if (escala !== 1 && escala > 0) {
    const p = proponer(trazos.map((t) => t.map((q) => ({ x: q.x * escala, y: q.y * escala }))), modo, 1);
    return p && escalarPropuesta(p, 1 / escala);
  }
  const conPuntos = trazos.filter((t) => t.length > 1);
  if (!conPuntos.length || modo === "apagado") return null;
  // Sin los puntos amontonados (paso de 2,5 px o 1,5 % del tamaño de lo escrito).
  const total = cajaDe(conPuntos);
  const paso = Math.max(2.5, 0.015 * Math.hypot(total.w, total.h));
  const validos = conPuntos.map((t) => limpiar(t, paso));
  const caja = cajaDe(validos);
  const conNumeros = modo === "completo";
  if (modo !== "suavizar") {
    if (validos.length === 1) {
      const f = reconocerForma(validos[0]);
      // Un óvalo alto y angosto, escrito a tamaño de letra, es un cero.
      if (f?.forma === "elipse" && conNumeros && caja.h > 1.3 * caja.w && caja.h < 220) {
        const r = reconocerCaracter(validos);
        if (r.c === "0" && r.puntaje >= UMBRAL) return { tipo: "glifos", glifos: [{ c: "0", caja }], caja };
      }
      if (f) return { tipo: "forma", forma: f };
    } else {
      const flecha = reconocerFlecha(validos);
      if (flecha) return { tipo: "forma", forma: flecha };
    }
    if (conNumeros && validos.length <= 40) {
      const n = reconocerNumeros(validos);
      if (n) return n;
    }
  }
  return { tipo: "suavizado", trazos: validos.map((t) => suavizar(t)) };
}
