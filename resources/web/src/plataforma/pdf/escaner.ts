/*
 * Escáner de documentos en el navegador: encontrar la hoja en la foto, enderezarla (quitar la perspectiva) y limpiarla
 * con un filtro. Todo con canvas, sin librerías ni servidor.
 */

export interface Punto { x: number; y: number }
/** Las 4 esquinas de la hoja en fracciones de la imagen (0 a 1): sup. izq., sup. der., inf. der., inf. izq. */
export type Esquinas = [Punto, Punto, Punto, Punto];
export const TODA: Esquinas = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
export const esToda = (e: Esquinas) => e.every((p, i) => Math.abs(p.x - TODA[i].x) < 1e-3 && Math.abs(p.y - TODA[i].y) < 1e-3);
/** Cuánto se movió la esquina que más se movió (en fracciones de la imagen). */
export const distancia = (a: Esquinas, b: Esquinas) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));

export type Filtro = "color" | "documento" | "gris" | "original";
export const FILTROS: { id: Filtro; nombre: string }[] = [
  { id: "color", nombre: "Color mejorado" },
  { id: "documento", nombre: "Blanco y negro" },
  { id: "gris", nombre: "Escala de grises" },
  { id: "original", nombre: "Original" },
];

export function lienzo(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true })!;
const tope = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export const cargarImagen = (url: string) => new Promise<HTMLImageElement>((ok, mal) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => mal(new Error("No se pudo leer una de las imágenes."));
  img.src = url;
});

export const aBlobUrl = (c: HTMLCanvasElement, calidad = 0.9) => new Promise<string>((ok, mal) =>
  c.toBlob((b) => (b ? ok(URL.createObjectURL(b)) : mal(new Error("No se pudo convertir la imagen."))), "image/jpeg", calidad));

const area = (p: Punto[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0)) / 2;

/** En sentido horario empezando por la de arriba a la izquierda. */
function ordenar(p: Punto[]): Esquinas {
  const cx = p.reduce((s, q) => s + q.x, 0) / 4, cy = p.reduce((s, q) => s + q.y, 0) / 4;
  const s = [...p].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  const k = s.reduce((m, q, i) => (q.x + q.y < s[m].x + s[m].y ? i : m), 0);
  return [s[k], s[(k + 1) % 4], s[(k + 2) % 4], s[(k + 3) % 4]];
}

const convexo = (p: Esquinas) => {
  const giros = p.map((a, i) => { const b = p[(i + 1) % 4], c = p[(i + 2) % 4]; return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x); });
  return giros.every((g) => g > 0) || giros.every((g) => g < 0);
};

/**
 * Busca la hoja en la foto: primero por sus bordes rectos (bordesPorLineas, como hacen las apps de escaneo) y, si no
 * los encuentra, por la mancha clara más grande (bordesPorBrillo). Si tampoco, null: se usa la foto entera, que se
 * puede recortar a mano.
 */
export function detectarBordes(fuente: CanvasImageSource, ancho: number, alto: number): Esquinas | null {
  if (!ancho || !alto) return null;
  return bordesPorLineas(fuente, ancho, alto) ?? bordesPorBrillo(fuente, ancho, alto);
}

/**
 * La hoja por sus 4 bordes rectos. La imagen se reduce a ~360 px y se calcula el borde en color (gradiente de Sobel en
 * el canal que más cambia: una portada morada sobre una tela marrón tiene borde aunque el brillo sea parecido). Con la
 * transformada de Hough salen las líneas rectas; cada punto vota solo por las líneas que siguen la dirección de su
 * borde, así la textura de una tela o un teclado no forma líneas. Después se prueban pares de líneas «horizontales» y
 * «verticales»: gana el cuadrilátero cuyos 4 lados están respaldados por borde real y, entre los casi tan buenos, el
 * más grande (la hoja entera, no una foto o un recuadro que tenga adentro).
 */
function bordesPorLineas(fuente: CanvasImageSource, ancho: number, alto: number): Esquinas | null {
  const e = 360 / Math.max(ancho, alto);
  const w = Math.max(32, Math.round(ancho * e)), h = Math.max(32, Math.round(alto * e)), n = w * h;
  const c = lienzo(w, h), ctx = ctx2d(c);
  ctx.filter = "blur(1.2px)";
  ctx.drawImage(fuente, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  // Borde (magnitud) y su dirección (de 0 a π: la normal de la línea).
  const mag = new Float32Array(n), dir = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let mejor = 0, gxm = 0, gym = 0;
      for (let k = 0; k < 3; k++) {
        const p = (yy: number, xx: number) => px[(yy * w + xx) * 4 + k];
        const gx = p(y - 1, x + 1) + 2 * p(y, x + 1) + p(y + 1, x + 1) - p(y - 1, x - 1) - 2 * p(y, x - 1) - p(y + 1, x - 1);
        const gy = p(y + 1, x - 1) + 2 * p(y + 1, x) + p(y + 1, x + 1) - p(y - 1, x - 1) - 2 * p(y - 1, x) - p(y - 1, x + 1);
        const m = gx * gx + gy * gy;
        if (m > mejor) { mejor = m; gxm = gx; gym = gy; }
      }
      const i = y * w + x;
      mag[i] = Math.sqrt(mejor);
      let a = Math.atan2(gym, gxm);
      if (a < 0) a += Math.PI;
      dir[i] = a >= Math.PI ? 0 : a;
    }
  }
  // Umbral bajo: el borde de una hoja oscura sobre un fondo oscuro de otro color es suave pero continuo; el ruido que
  // pasa lo descartan la orientación (Hough) y el respaldo a lo largo de cada lado.
  const muestra: number[] = [];
  for (let i = 0; i < n; i += 7) muestra.push(mag[i]);
  muestra.sort((a, b) => a - b);
  const umbral = Math.max(32, (muestra[Math.floor(muestra.length * 0.9)] ?? 0) * 0.4);
  const borde = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (mag[i] >= umbral) borde[i] = 1;

  // Hough: θ en grados (normal de la línea), ρ en píxeles; x·cosθ + y·sinθ = ρ.
  const T = 180, R = Math.ceil(Math.hypot(w, h)), filas = 2 * R + 1, votos = new Uint16Array(T * filas);
  const cos = new Float32Array(T), sin = new Float32Array(T);
  for (let t = 0; t < T; t++) { cos[t] = Math.cos((t * Math.PI) / 180); sin[t] = Math.sin((t * Math.PI) / 180); }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!borde[i]) continue;
      const t0 = Math.round((dir[i] * 180) / Math.PI);
      for (let d = -6; d <= 6; d++) {
        const t = (t0 + d + T) % T;
        votos[t * filas + Math.round(x * cos[t] + y * sin[t]) + R]++;
      }
    }
  }
  // Picos: máximos locales con votos suficientes para un lado de hoja; sin repetir líneas casi iguales.
  const minimo = Math.max(12, Math.round(Math.min(w, h) * 0.12));
  const picos: { t: number; r: number; v: number }[] = [];
  for (let t = 0; t < T; t++) {
    for (let r = 1; r < filas - 1; r++) {
      const v = votos[t * filas + r];
      if (v < minimo) continue;
      let maximo = true;
      for (let dt = -2; dt <= 2 && maximo; dt++) for (let dr = -2; dr <= 2; dr++) {
        const tt = (t + dt + T) % T, rr = r + dr;
        if ((dt || dr) && rr >= 0 && rr < filas && votos[tt * filas + rr] > v) { maximo = false; break; }
      }
      if (maximo) picos.push({ t, r: r - R, v });
    }
  }
  picos.sort((a, b) => b.v - a.v);
  const lineas: { t: number; r: number }[] = [];
  for (const p of picos) {
    if (lineas.length >= 60) break;
    if (lineas.some((l) => { const dt = Math.min(Math.abs(l.t - p.t), T - Math.abs(l.t - p.t)); return dt < 6 && Math.abs(l.r - p.r) < 8; })) continue;
    lineas.push(p);
  }
  const enX = (l: { t: number; r: number }, y: number) => (Math.abs(cos[l.t]) < 1e-6 ? Infinity : (l.r - y * sin[l.t]) / cos[l.t]);
  const enY = (l: { t: number; r: number }, x: number) => (Math.abs(sin[l.t]) < 1e-6 ? Infinity : (l.r - x * cos[l.t]) / sin[l.t]);
  /**
   * Las líneas a probar: las 8 con más votos y, además, las 3 de cada extremo. Los bordes de la hoja suelen ser las
   * líneas más de afuera, y en una portada a rayas las rayas acaparan los votos (sin esto, no entraban).
   */
  const elegir = (grupo: { t: number; r: number }[], posicion: (l: { t: number; r: number }) => number) => {
    const orden = [...grupo].sort((a, b) => posicion(a) - posicion(b));
    return [...new Set([...grupo.slice(0, 8), ...orden.slice(0, 3), ...orden.slice(-3)])];
  };
  // «Horizontales»: su normal apunta hacia arriba o abajo (θ cerca de 90°). Hasta ±35°: las diagonales (p. ej. las
  // costuras de una tela acolchada, a 45°) no son lados de una hoja.
  const horizontales = elegir(lineas.filter((l) => Math.abs(l.t - 90) < 35), (l) => enY(l, w / 2));
  const verticales = elegir(lineas.filter((l) => Math.abs(l.t - 90) > 55), (l) => enX(l, h / 2));
  if (horizontales.length < 2 || verticales.length < 2) return null;

  const corte = (a: { t: number; r: number }, b: { t: number; r: number }): Punto | null => {
    const det = cos[a.t] * sin[b.t] - sin[a.t] * cos[b.t];
    if (Math.abs(det) < 1e-6) return null;
    return { x: (a.r * sin[b.t] - b.r * sin[a.t]) / det, y: (b.r * cos[a.t] - a.r * cos[b.t]) / det };
  };
  /**
   * Qué tan respaldado está el lado A→B por borde real (cerca y con la misma orientación): en todo el largo y en cada
   * punta. Un lado que se pasa de la esquina de verdad (porque la línea de arriba es el marco de un cuadro o la veta
   * de la mesa) tiene una punta sin borde: ahí está la diferencia entre la hoja y algo más grande que la contiene.
   */
  const respaldo = (a: Punto, b: Punto) => {
    const largo = Math.hypot(b.x - a.x, b.y - a.y), pasos = Math.max(16, Math.round(largo / 2));
    let normal = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
    normal = ((normal % Math.PI) + Math.PI) % Math.PI;
    const nx = Math.cos(normal), ny = Math.sin(normal), marcas: number[] = [];
    for (let k = 0; k <= pasos; k++) {
      const x = Math.round(a.x + ((b.x - a.x) * k) / pasos), y = Math.round(a.y + ((b.y - a.y) * k) / pasos);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue; // fuera de la foto: ni a favor ni en contra
      // Se busca borde hasta 2 px a cada lado, en perpendicular: la línea de Hough va en pasos de 1° y, en una hoja un
      // poco girada, se separa unos píxeles del borde real hacia las esquinas. Cuenta cuánto del borde cruza el lado
      // (su componente perpendicular): en las esquinas de un estampado (rayas, cuadros) el borde va en diagonal.
      let si = 0;
      for (let o = -2; o <= 2; o++) {
        const xx = Math.round(x + o * nx), yy = Math.round(y + o * ny);
        if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue;
        const i = yy * w + xx;
        if (mag[i] * Math.abs(Math.cos(dir[i] - normal)) >= umbral) { si = 1; break; }
      }
      marcas.push(si);
    }
    if (marcas.length < 8) return { todo: 0, puntas: 0 };
    const parte = (desde: number, hasta: number) => {
      const s = marcas.slice(Math.floor(desde * marcas.length), Math.ceil(hasta * marcas.length));
      return s.length ? s.reduce((x, y) => x + y, 0) / s.length : 0;
    };
    return { todo: parte(0, 1), puntas: Math.min(parte(0, 0.2), parte(0.8, 1)) };
  };
  // Un lado depende solo de su línea y de las dos que lo cortan: se calcula una vez y se reutiliza en todas las
  // combinaciones que lo comparten (así probar más líneas no vuelve lenta la cámara).
  const ids = new Map<object, number>();
  [...horizontales, ...verticales].forEach((l, i) => ids.set(l, i));
  const memo = new Map<string, number>();
  /** Cada lado vale por su respaldo total y por el de su punta más floja (las esquinas tienen que ser de verdad). */
  const lado = (linea: object, c1: object, c2: object, a: Punto, b: Punto) => {
    const clave = `${ids.get(linea)}:${ids.get(c1)}:${ids.get(c2)}`;
    let v = memo.get(clave);
    // Una punta casi sin borde: ese lado se pasa de la esquina de verdad (no vale, por más grande que sea).
    if (v === undefined) { const r = respaldo(a, b); v = r.puntas < 0.2 ? 0 : 0.5 * r.todo + 0.5 * r.puntas; memo.set(clave, v); }
    return v;
  };

  let candidatos: { q: Esquinas; puntaje: number; area: number }[] = [];
  for (let i = 0; i < horizontales.length; i++) for (let j = i + 1; j < horizontales.length; j++) {
    let [arriba, abajo] = [horizontales[i], horizontales[j]];
    if (enY(arriba, w / 2) > enY(abajo, w / 2)) [arriba, abajo] = [abajo, arriba];
    if (enY(abajo, w / 2) - enY(arriba, w / 2) < h * 0.15) continue;
    for (let k = 0; k < verticales.length; k++) for (let l = k + 1; l < verticales.length; l++) {
      let [izq, der] = [verticales[k], verticales[l]];
      if (enX(izq, h / 2) > enX(der, h / 2)) [izq, der] = [der, izq];
      if (enX(der, h / 2) - enX(izq, h / 2) < w * 0.15) continue;
      const q = [corte(arriba, izq), corte(arriba, der), corte(abajo, der), corte(abajo, izq)];
      if (q.some((p) => !p || p.x < -0.06 * w || p.x > 1.06 * w || p.y < -0.06 * h || p.y > 1.06 * h)) continue;
      const esq = q as Esquinas;
      if (!convexo(esq)) continue;
      // Ángulos razonables (una hoja vista en perspectiva, no un rombo).
      const angulosOk = esq.every((p, m) => {
        const a = esq[(m + 3) % 4], b = esq[(m + 1) % 4];
        const v1 = Math.atan2(a.y - p.y, a.x - p.x), v2 = Math.atan2(b.y - p.y, b.x - p.x);
        let d = Math.abs(v1 - v2); if (d > Math.PI) d = 2 * Math.PI - d;
        return d > (50 * Math.PI) / 180 && d < (130 * Math.PI) / 180;
      });
      if (!angulosOk) continue;
      const ar = area(esq) / (w * h);
      if (ar < 0.12) continue;
      // Lado por lado, y se abandona en cuanto uno no alcanza.
      const lados: number[] = [];
      for (const [linea, c1, c2, a, b] of [
        [arriba, izq, der, esq[0], esq[1]], [der, arriba, abajo, esq[1], esq[2]], [abajo, izq, der, esq[3], esq[2]], [izq, arriba, abajo, esq[0], esq[3]],
      ] as const) {
        const v = lado(linea, c1, c2, a, b);
        if (v < 0.3) break;
        lados.push(v);
      }
      if (lados.length < 4) continue;
      const peor = Math.min(...lados);
      candidatos.push({ q: esq, puntaje: 0.5 * peor + 0.5 * (lados.reduce((s, x) => s + x, 0) / 4), area: ar });
    }
  }
  if (!candidatos.length) return null;
  const mejor = Math.max(...candidatos.map((x) => x.puntaje));
  if (mejor < 0.5) return null;
  // Entre los casi tan buenos, el más grande: la hoja entera y no la foto o el recuadro de su portada.
  candidatos = candidatos.filter((x) => x.puntaje >= mejor * 0.75);
  const elegido = candidatos.reduce((a, b) => (b.area > a.area ? b : a));
  return elegido.q.map((p) => ({ x: Math.min(1, Math.max(0, p.x / w)), y: Math.min(1, Math.max(0, p.y / h)) })) as Esquinas;
}

/**
 * La hoja como la mancha clara más grande (respaldo cuando no hay bordes rectos claros): la imagen se reduce a ~240 px,
 * se separa lo claro de lo oscuro (umbral de Otsu) y los puntos extremos de la mancha son las esquinas. Funciona con
 * la hoja sobre un fondo más oscuro.
 */
function bordesPorBrillo(fuente: CanvasImageSource, ancho: number, alto: number): Esquinas | null {
  if (!ancho || !alto) return null;
  const e = 240 / Math.max(ancho, alto);
  const w = Math.max(16, Math.round(ancho * e)), h = Math.max(16, Math.round(alto * e)), n = w * h;
  const c = lienzo(w, h), ctx = ctx2d(c);
  ctx.filter = "blur(1px)"; // borra el texto y el ruido; donde no se admite no pasa nada
  ctx.drawImage(fuente, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const gris = new Uint8Array(n), hist = new Float64Array(256);
  for (let i = 0; i < n; i++) { const v = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8; gris[i] = v; hist[v]++; }

  let suma = 0;
  for (let v = 0; v < 256; v++) suma += v * hist[v];
  let sumaB = 0, pesoB = 0, mejor = 0, umbral = 0, oscuro = 0, claro = 0;
  for (let t = 0; t < 256; t++) {
    pesoB += hist[t];
    if (!pesoB) continue;
    const pesoF = n - pesoB;
    if (!pesoF) break;
    sumaB += t * hist[t];
    const mB = sumaB / pesoB, mF = (suma - sumaB) / pesoF, entre = pesoB * pesoF * (mB - mF) ** 2;
    if (entre > mejor) { mejor = entre; umbral = t; oscuro = mB; claro = mF; }
  }
  if (claro - oscuro < 35) return null; // hoja y fondo casi del mismo tono

  // Mancha clara más grande (vecinos de 4 lados).
  const marca = new Int32Array(n), pila = new Int32Array(n);
  let id = 0, mejorId = 0, mejorTam = 0;
  for (let i = 0; i < n; i++) {
    if (gris[i] <= umbral || marca[i]) continue;
    id++;
    let tam = 0, alto2 = 0;
    pila[alto2++] = i;
    marca[i] = id;
    while (alto2) {
      const k = pila[--alto2], x = k % w;
      tam++;
      if (x > 0 && !marca[k - 1] && gris[k - 1] > umbral) { marca[k - 1] = id; pila[alto2++] = k - 1; }
      if (x < w - 1 && !marca[k + 1] && gris[k + 1] > umbral) { marca[k + 1] = id; pila[alto2++] = k + 1; }
      if (k >= w && !marca[k - w] && gris[k - w] > umbral) { marca[k - w] = id; pila[alto2++] = k - w; }
      if (k < n - w && !marca[k + w] && gris[k + w] > umbral) { marca[k + w] = id; pila[alto2++] = k + w; }
    }
    if (tam > mejorTam) { mejorTam = tam; mejorId = id; }
  }
  if (mejorTam < n * 0.1 || mejorTam > n * 0.97) return null;

  // Extremos en diagonal (hoja casi derecha) y en los ejes (hoja girada ~45°): gana el cuadrilátero más grande.
  const ext = { sMin: [0, 0, Infinity], sMax: [0, 0, -Infinity], dMin: [0, 0, Infinity], dMax: [0, 0, -Infinity], xMin: [0, 0, Infinity], xMax: [0, 0, -Infinity], yMin: [0, 0, Infinity], yMax: [0, 0, -Infinity] };
  for (let k = 0; k < n; k++) {
    if (marca[k] !== mejorId) continue;
    const x = k % w, y = (k - x) / w, s = x + y, d = x - y;
    if (s < ext.sMin[2]) ext.sMin = [x, y, s];
    if (s > ext.sMax[2]) ext.sMax = [x, y, s];
    if (d < ext.dMin[2]) ext.dMin = [x, y, d];
    if (d > ext.dMax[2]) ext.dMax = [x, y, d];
    if (x < ext.xMin[2]) ext.xMin = [x, y, x];
    if (x > ext.xMax[2]) ext.xMax = [x, y, x];
    if (y < ext.yMin[2]) ext.yMin = [x, y, y];
    if (y > ext.yMax[2]) ext.yMax = [x, y, y];
  }
  const punto = ([x, y]: number[]) => ({ x: Math.min(1, Math.max(0, (x + 0.5) / w)), y: Math.min(1, Math.max(0, (y + 0.5) / h)) });
  const diagonal = ordenar([ext.sMin, ext.dMax, ext.sMax, ext.dMin].map(punto));
  const ejes = ordenar([ext.yMin, ext.xMax, ext.yMax, ext.xMin].map(punto));
  const q = area(ejes) > area(diagonal) * 1.05 ? ejes : diagonal;
  // Si 3 o 4 esquinas caen en el borde de la foto, lo claro es el fondo (una pared, la mesa), no una hoja.
  const enBorde = q.filter((p) => p.x < 0.02 || p.x > 0.98 || p.y < 0.02 || p.y > 0.98).length;
  return area(q) >= 0.1 && convexo(q) && enBorde < 3 ? q : null;
}

/**
 * ¿Hay texto en la imagen? (para la cámara de EX-Trae; es mucho más rápido que leerlo). La imagen se reduce a ~320 px
 * y se divide en celdas de 10 px: una celda «parece texto» si tiene muchos bordes horizontales y verticales a la vez,
 * pero no tantos como una textura (tela, teclado). Hay texto si al menos dos filas tienen 3 o más de esas celdas
 * seguidas, como renglones. Devuelve la caja que las encierra, o null.
 */
export function detectarTexto(fuente: CanvasImageSource, ancho: number, alto: number): Esquinas | null {
  if (!ancho || !alto) return null;
  const e = 320 / Math.max(ancho, alto);
  const w = Math.max(40, Math.round(ancho * e)), h = Math.max(40, Math.round(alto * e)), lado = 10;
  const c = lienzo(w, h), ctx = ctx2d(c);
  ctx.drawImage(fuente, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8;
  const cols = Math.floor(w / lado), filas = Math.floor(h / lado), texto = new Uint8Array(cols * filas);
  for (let fy = 0; fy < filas; fy++) {
    for (let fx = 0; fx < cols; fx++) {
      let bx = 0, by = 0;
      for (let y = fy * lado + 1; y < (fy + 1) * lado - 1; y++) {
        for (let x = fx * lado + 1; x < (fx + 1) * lado - 1; x++) {
          const i = y * w + x;
          if (Math.abs(g[i + 1] - g[i - 1]) > 40) bx++;
          if (Math.abs(g[i + w] - g[i - w]) > 40) by++;
        }
      }
      const n = (lado - 2) * (lado - 2), dx = bx / n, dy = by / n;
      texto[fy * cols + fx] = dx > 0.1 && dy > 0.05 && dx < 0.55 && dy < 0.55 ? 1 : 0;
    }
  }
  // Renglones: tramos de 3 o más celdas seguidas en una fila.
  let renglones = 0, x0 = cols, x1 = -1, y0 = filas, y1 = -1;
  for (let fy = 0; fy < filas; fy++) {
    let tramo = 0, hay = false;
    for (let fx = 0; fx <= cols; fx++) {
      if (fx < cols && texto[fy * cols + fx]) { tramo++; continue; }
      if (tramo >= 3) {
        hay = true;
        x0 = Math.min(x0, fx - tramo); x1 = Math.max(x1, fx - 1);
      }
      tramo = 0;
    }
    if (hay) { renglones++; y0 = Math.min(y0, fy); y1 = Math.max(y1, fy); }
  }
  if (renglones < 2) return null;
  const X0 = (x0 * lado) / w, X1 = ((x1 + 1) * lado) / w, Y0 = (y0 * lado) / h, Y1 = ((y1 + 1) * lado) / h;
  return [{ x: X0, y: Y0 }, { x: X1, y: Y0 }, { x: X1, y: Y1 }, { x: X0, y: Y1 }];
}

/** Homografía que lleva los 4 puntos «de» a los 4 puntos «a» (8 coeficientes + 1). */
function homografia(de: Punto[], a: Punto[]): number[] {
  const m: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = de[i], { x: u, y: v } = a[i];
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k < 9; k++) m[r][k] -= f * m[c][k];
    }
  }
  return [...m.map((r, i) => r[8] / r[i]), 1];
}

/** La hoja enderezada: el cuadrilátero de las esquinas pasa a ser un rectángulo (lado mayor hasta maxLado). */
export function enderezar(img: HTMLImageElement | HTMLCanvasElement, esq: Esquinas, maxLado = 2200): HTMLCanvasElement {
  const W0 = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const H0 = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  if (esToda(esq)) {
    const e = Math.min(1, maxLado / Math.max(W0, H0)), c = lienzo(Math.round(W0 * e), Math.round(H0 * e));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  // La fuente se limita a 4000 px de lado para no agotar la memoria del celular.
  const ef = Math.min(1, 4000 / Math.max(W0, H0)), sw = Math.round(W0 * ef), sh = Math.round(H0 * ef);
  const fuente = lienzo(sw, sh), fctx = ctx2d(fuente);
  fctx.drawImage(img, 0, 0, sw, sh);
  const sd = fctx.getImageData(0, 0, sw, sh).data;
  const q = esq.map((p) => ({ x: p.x * sw, y: p.y * sh }));
  const d = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);
  let W = Math.max(d(q[0], q[1]), d(q[3], q[2])), H = Math.max(d(q[0], q[3]), d(q[1], q[2]));
  const e = Math.min(1, maxLado / Math.max(W, H));
  W = Math.max(1, Math.round(W * e));
  H = Math.max(1, Math.round(H * e));
  const m = homografia([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], q);
  const salida = lienzo(W, H), sctx = ctx2d(salida), od = sctx.createImageData(W, H), o = od.data;
  for (let y = 0; y < H; y++) {
    const yc = y + 0.5;
    for (let x = 0; x < W; x++) {
      const xc = x + 0.5, z = m[6] * xc + m[7] * yc + 1;
      let sx = (m[0] * xc + m[1] * yc + m[2]) / z - 0.5, sy = (m[3] * xc + m[4] * yc + m[5]) / z - 0.5;
      sx = sx < 0 ? 0 : sx > sw - 1.001 ? sw - 1.001 : sx;
      sy = sy < 0 ? 0 : sy > sh - 1.001 ? sh - 1.001 : sy;
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, j = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        o[j + c] = (sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx) * (1 - fy) + (sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx) * fy;
      }
      o[j + 3] = 255;
    }
  }
  sctx.putImageData(od, 0, 0);
  return salida;
}

/**
 * Brillo del papel en cada zona de la imagen (una cuadrícula de ~48 celdas por lado): lo que hay que aclarar para que
 * el papel quede blanco aunque tenga sombras o la luz no sea pareja.
 */
function brilloPapel(px: Uint8ClampedArray, w: number, h: number) {
  const lado = Math.max(8, Math.round(Math.max(w, h) / 48)), gw = Math.ceil(w / lado), gh = Math.ceil(h / lado);
  const celdas = new Float32Array(gw * gh), hist = new Uint32Array(64);
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      hist.fill(0);
      let cuenta = 0;
      for (let y = cy * lado; y < Math.min(h, (cy + 1) * lado); y += 2) {
        for (let x = cx * lado; x < Math.min(w, (cx + 1) * lado); x += 2) {
          const i = (y * w + x) * 4;
          hist[(px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 10]++;
          cuenta++;
        }
      }
      // El 90 % más oscuro de la celda queda por debajo: lo que sobra es papel (el texto suele ocupar menos).
      let acum = 0, b = 0;
      for (; b < 63 && acum < cuenta * 0.9; b++) acum += hist[b];
      celdas[cy * gw + cx] = b * 4 + 2;
    }
  }
  // Se toma el máximo de las vecinas (una celda llena de texto no oscurece su zona) y luego el promedio (sin saltos).
  const max = new Float32Array(gw * gh), suave = new Float32Array(gw * gh);
  const vecinas = (g: Float32Array, cx: number, cy: number, f: (a: number, b: number) => number, ini: number) => {
    let v = ini, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < gw && y < gh) { v = f(v, g[y * gw + x]); n++; }
    }
    return [v, n];
  };
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) max[cy * gw + cx] = vecinas(celdas, cx, cy, Math.max, 0)[0];
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) { const [s, n] = vecinas(max, cx, cy, (a, b) => a + b, 0); suave[cy * gw + cx] = s / n; }
  /** Brillo del papel en el píxel (x, y), interpolado entre los centros de las celdas. */
  return (x: number, y: number) => {
    const gx = Math.min(gw - 1, Math.max(0, x / lado - 0.5)), gy = Math.min(gh - 1, Math.max(0, y / lado - 0.5));
    const x0 = gx | 0, y0 = gy | 0, x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1), fx = gx - x0, fy = gy - y0;
    return (suave[y0 * gw + x0] * (1 - fx) + suave[y0 * gw + x1] * fx) * (1 - fy) + (suave[y1 * gw + x0] * (1 - fx) + suave[y1 * gw + x1] * fx) * fy;
  };
}

/** Aplica el filtro sobre el lienzo. Todos (menos «original») llevan el papel a blanco y quitan las sombras. */
export function aplicarFiltro(c: HTMLCanvasElement, filtro: Filtro) {
  if (filtro === "original") return;
  const ctx = ctx2d(c), w = c.width, h = c.height, datos = ctx.getImageData(0, 0, w, h), px = datos.data;
  const papel = brilloPapel(px, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, k = 255 / Math.max(70, papel(x, y));
      if (filtro === "color") {
        // Blanco al papel y la tinta un poco más intensa (el tono se conserva).
        for (let c2 = 0; c2 < 3; c2++) px[i + c2] = tope(255 - (255 - px[i + c2] * k) * 1.3);
      } else {
        const g = ((px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8) * k;
        // «documento»: lo claro a blanco puro y el texto a negro, como un escaneo; «gris»: solo más contraste.
        const v = filtro === "documento" ? (g > 205 ? 255 : tope(((g - 70) * 255) / 135)) : tope(255 - (255 - g) * 1.25);
        px[i] = px[i + 1] = px[i + 2] = v;
      }
    }
  }
  ctx.putImageData(datos, 0, 0);
}

/** Miniatura con el filtro ya aplicado (lado mayor «lado» px). */
export async function vistaPrevia(url: string, filtro: Filtro, lado = 320) {
  const img = await cargarImagen(url);
  const e = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
  const c = lienzo(Math.max(1, Math.round(img.naturalWidth * e)), Math.max(1, Math.round(img.naturalHeight * e)));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  aplicarFiltro(c, filtro);
  return c;
}

/** Anverso y reverso de un carnet en una sola hoja A4 (a 200 ppp), uno encima del otro y a su tamaño real. */
export function componerCarnet(caras: HTMLCanvasElement[]) {
  const W = 1654, H = 2339, caja = 680; // 85,6 mm (ancho de un carnet) a 200 ppp ≈ 674 px
  const c = lienzo(W, H), ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  caras.forEach((f, i) => {
    const e = Math.min(caja / f.width, caja / f.height), w = f.width * e, h = f.height * e;
    ctx.drawImage(f, (W - w) / 2, H * (i === 0 ? 0.27 : 0.6) - h / 2, w, h);
  });
  return c;
}
