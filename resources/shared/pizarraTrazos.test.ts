import { describe, expect, it } from "vitest";
import { cajaDe, proponer, reconocerCaracter, reconocerForma, separarCaracteres, suavizar, type Trazo } from "./pizarraTrazos";

// Azar con semilla: las pruebas dan siempre lo mismo.
function azar(semilla: number) {
  let s = semilla;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

/** Pasa un trazo «ideal» (caja 0-100) a uno hecho a mano: posición, tamaño, inclinación leve, temblor y más puntos. */
function aMano(trazos: Trazo[], { x = 200, y = 100, tam = 60, temblor = 2.2, semilla = 7, inclinar = 0.06 } = {}): Trazo[] {
  const r = azar(semilla);
  return trazos.map((t) => {
    const denso: Trazo = [];
    for (let i = 0; i < t.length - 1; i++) for (let k = 0; k < 4; k++) {
      const a = t[i], b = t[i + 1];
      denso.push({ x: a.x + ((b.x - a.x) * k) / 4, y: a.y + ((b.y - a.y) * k) / 4 });
    }
    denso.push(t[t.length - 1]);
    return denso.map((p) => ({
      x: x + ((p.x + inclinar * (100 - p.y)) * tam) / 100 + (r() - 0.5) * temblor,
      y: y + (p.y * tam) / 100 + (r() - 0.5) * temblor,
    }));
  });
}
const L = (...p: [number, number][]): Trazo => p.map(([x, y]) => ({ x, y }));
const arco = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 30): Trazo =>
  Array.from({ length: n }, (_, i) => { const a = a0 + ((a1 - a0) * i) / (n - 1); return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }; });

// Cómo escribe una persona cada carácter (distinto de las plantillas: otras proporciones y trazos).
const ESCRITOS: Record<string, Trazo[]> = {
  "0": [arco(50, 50, 30, 48, -1.4, 2 * Math.PI - 1.2, 36)],
  "1": [L([34, 18], [54, 2], [54, 98])],
  "2": [L([18, 22], [35, 4], [60, 2], [80, 16], [78, 40], [55, 65], [20, 98], [88, 96])],
  "3": [L([18, 8], [45, 0], [72, 10], [74, 30], [48, 47], [78, 60], [80, 84], [52, 98], [16, 90])],
  "4": [L([60, 2], [12, 62], [90, 64]), L([64, 28], [64, 100])],
  "5": [L([78, 2], [28, 2], [22, 44], [54, 36], [80, 54], [80, 80], [54, 98], [16, 90])],
  "7": [L([12, 4], [88, 2], [42, 100])],
  "8": [[...arco(50, 26, 24, 24, Math.PI / 2, 2.5 * Math.PI, 20), ...arco(50, 74, 30, 25, -Math.PI / 2, 1.5 * Math.PI, 24)]],
  "9": [arco(48, 28, 28, 26, 0, 2 * Math.PI, 26), L([78, 20], [76, 100])],
  "+": [L([50, 4], [50, 96]), L([4, 50], [96, 52])],
  "=": [L([4, 32], [96, 30]), L([4, 70], [96, 72])],
};

describe("reconocer números y símbolos", () => {
  for (const [c, trazos] of Object.entries(ESCRITOS)) {
    it(`reconoce «${c}» escrito a mano`, () => {
      for (const semilla of [3, 11, 29]) {
        const r = reconocerCaracter(aMano(trazos, { semilla }));
        expect(r.c, `semilla ${semilla}`).toBe(c);
        expect(r.puntaje).toBeGreaterThan(0.65);
      }
    });
  }

  it("una operación completa se convierte carácter por carácter", () => {
    const fila = (c: string, i: number) => aMano(ESCRITOS[c], { x: 100 + i * 75, semilla: 5 + i });
    const p = proponer([...fila("3", 0), ...fila("+", 1), ...fila("4", 2), ...fila("=", 3), ...fila("7", 4)]);
    expect(p?.tipo).toBe("glifos");
    expect(p?.tipo === "glifos" && p.glifos.map((g) => g.c).join("")).toBe("3+4=7");
  });

  it("cuentas apretadas: la barra del «+» o del «−» que invade el número de al lado no los junta", () => {
    // Como en la pizarra: «1+2=1» y «1+2−1» con los símbolos pegados y barras largas que se meten en el «2».
    const en = (c: string, x: number, semilla: number, tam = 60) => aMano(ESCRITOS[c] ?? [], { x, semilla, tam });
    const masLargo = aMano([L([50, 10], [50, 90]), L([-10, 50], [125, 52])], { x: 150, semilla: 4 });
    const p1 = proponer([...en("1", 100, 1), ...masLargo, ...en("2", 205, 2), ...en("=", 262, 3), ...en("1", 318, 5)]);
    expect(p1?.tipo === "glifos" && p1.glifos.map((g) => g.c).join("")).toBe("1+2=1");
    const menos = aMano([L([-15, 52], [120, 48])], { x: 270, semilla: 6 });
    const p2 = proponer([...en("1", 100, 7), ...en("+", 150, 8), ...en("2", 200, 9), ...menos, ...en("1", 320, 10)]);
    expect(p2?.tipo === "glifos" && p2.glifos.map((g) => g.c).join("")).toBe("1+2−1");
  });

  it("números grandes y separados también se convierten", () => {
    const p = proponer([...aMano(ESCRITOS["4"], { x: 100, tam: 180, semilla: 2 }), ...aMano(ESCRITOS["7"], { x: 330, tam: 170, semilla: 9 })]);
    expect(p?.tipo === "glifos" && p.glifos.map((g) => g.c).join("")).toBe("47");
  });

  it("una palabra no se convierte aunque tenga letras parecidas a números («sol»)", () => {
    const s = [L([80, 10], [50, 0], [20, 15], [30, 40], [70, 55], [80, 80], [50, 100], [15, 90])];
    const o = [arco(50, 50, 40, 48, -Math.PI / 2, 1.5 * Math.PI, 30)];
    const l = [L([50, 0], [48, 100])];
    // Como se escribe: «s» y «o» a media altura (misma línea base), la «l» sube hasta arriba.
    expect(proponer([...aMano(s, { x: 100, y: 128, tam: 32 }), ...aMano(o, { x: 145, y: 128, tam: 32 }), ...aMano(l, { x: 190 })])?.tipo).toBe("suavizado");
  });

  it("separa los caracteres por columnas aunque uno tenga varios trazos", () => {
    const g = separarCaracteres([...aMano(ESCRITOS["4"]), ...aMano(ESCRITOS["1"], { x: 290 })]);
    expect(g.map((x) => x.length)).toEqual([2, 1]);
  });

  it("no convierte un garabato ni una palabra en números", () => {
    const r = azar(42);
    const garabato: Trazo = Array.from({ length: 80 }, (_, i) => ({ x: 200 + i * 2 + r() * 40, y: 100 + Math.sin(i / 3) * 30 + r() * 30 }));
    expect(proponer([garabato])?.tipo).toBe("suavizado");
    // «ma» en cursiva: ondas que no son dígitos.
    const ondas: Trazo = Array.from({ length: 120 }, (_, i) => ({ x: 100 + i * 1.5, y: 120 - Math.abs(Math.sin(i / 9)) * 30 }));
    expect(proponer([ondas])?.tipo).toBe("suavizado");
  });
});

describe("formas", () => {
  it("línea, rectángulo, triángulo y círculo", () => {
    expect(reconocerForma(aMano([L([0, 0], [100, 40])], { tam: 200 })[0])?.forma).toBe("linea");
    expect(reconocerForma(aMano([L([0, 0], [100, 0], [100, 60], [0, 60], [0, 2])], { tam: 200, inclinar: 0 })[0])?.forma).toBe("rect");
    expect(reconocerForma(aMano([L([50, 0], [100, 90], [0, 90], [49, 2])], { tam: 200, inclinar: 0 })[0])?.forma).toBe("triangulo");
    expect(reconocerForma(aMano([arco(50, 50, 50, 50, 0, 2 * Math.PI - 0.1, 40)], { tam: 200, inclinar: 0 })[0])?.forma).toBe("elipse");
  });

  it("un círculo grande es forma; un óvalo pequeño y alto en una cuenta es un cero", () => {
    expect(proponer(aMano([arco(50, 50, 50, 50, 0, 2 * Math.PI - 0.1, 40)], { tam: 240, inclinar: 0 }))?.tipo).toBe("forma");
    const cero = proponer(aMano(ESCRITOS["0"], { tam: 70 }));
    expect(cero?.tipo === "glifos" && cero.glifos[0].c).toBe("0");
  });

  it("flecha de dos trazos (línea y punta)", () => {
    const p = proponer(aMano([L([0, 50], [100, 50]), L([80, 35], [100, 50], [80, 65])], { tam: 200, inclinar: 0 }));
    expect(p?.tipo === "forma" && p.forma.forma).toBe("flecha");
  });

  it("un trazo abierto y curvo no es forma", () => {
    expect(reconocerForma(aMano([arco(50, 50, 50, 50, 0, Math.PI, 30)], { tam: 200 })[0])).toBeNull();
  });
});

describe("suavizado y modos", () => {
  it("suavizar quita temblor y conserva los extremos", () => {
    const r = azar(5);
    const t: Trazo = Array.from({ length: 200 }, (_, i) => { const k = i / 199; return { x: 100 + k * 200 + (r() - 0.5) * 6, y: 100 + (k < 0.5 ? k : 1 - k) * 320 + (r() - 0.5) * 6 }; });
    const s = suavizar(t);
    expect(s[0]).toEqual(t[0]);
    expect(s[s.length - 1]).toEqual(t[t.length - 1]);
    // Rugosidad: cuánto más largo es el trazo que su versión de 10 puntos (el temblor alarga el recorrido).
    const largoDe = (u: Trazo) => u.slice(1).reduce((l, p, i) => l + Math.hypot(p.x - u[i].x, p.y - u[i].y), 0);
    const rugosidad = (u: Trazo) => largoDe(u) / largoDe(Array.from({ length: 10 }, (_, i) => u[Math.round((i * (u.length - 1)) / 9)]));
    expect(rugosidad(s)).toBeLessThan(rugosidad(t) - 0.05);
  });

  it("los modos limitan la ayuda", () => {
    const siete = aMano(ESCRITOS["7"]);
    expect(proponer(siete, "apagado")).toBeNull();
    expect(proponer(siete, "suavizar")?.tipo).toBe("suavizado");
    expect(proponer(siete, "formas")?.tipo).toBe("suavizado");
    expect(proponer(siete, "completo")?.tipo).toBe("glifos");
    const caja = cajaDe(siete);
    expect(caja.h).toBeGreaterThan(50);
  });
});

// Trazos copiados de capturas reales de la pizarra (líneas a mano con ratón).
const Lr = (...p: [number, number][]): Trazo => {
  const t: Trazo = [];
  for (let i = 0; i < p.length - 1; i++) for (let k = 0; k < 8; k++) t.push({ x: p[i][0] + ((p[i + 1][0] - p[i][0]) * k) / 8, y: p[i][1] + ((p[i + 1][1] - p[i][1]) * k) / 8 });
  t.push({ x: p[p.length - 1][0], y: p[p.length - 1][1] });
  return t;
};
const CAPTURA_1 = [ // «1+2=3»: «1» con gancho, «+» con la barra corrida, «2» de base larga
  Lr([285, 172], [300, 140], [322, 112], [330, 262]), Lr([432, 112], [425, 240]), Lr([400, 162], [490, 178]),
  Lr([500, 132], [525, 118], [552, 128], [560, 150], [548, 180], [540, 205], [575, 212], [640, 200]),
  Lr([665, 145], [725, 145]), Lr([685, 188], [750, 190]),
  Lr([782, 106], [820, 112], [850, 140], [862, 175], [858, 200], [872, 225], [858, 255], [805, 285]),
];
const CAPTURA_2 = [ // «1+2=…»: «1» con gancho largo (estilo latinoamericano)
  Lr([30, 355], [50, 330], [62, 322], [72, 435]), Lr([145, 318], [140, 458]), Lr([105, 390], [165, 395]),
  Lr([178, 342], [205, 340], [220, 365], [230, 420], [240, 448], [318, 440]), Lr([348, 380], [380, 386]), Lr([352, 428], [395, 430]),
];
/** Como el ratón: muchos puntos a 1-2 px, con un serrucho de ±1 px y redondeados al píxel. */
const conSerrucho = (t: Trazo, semilla = 9): Trazo => {
  const r = azar(semilla);
  const res: Trazo = [];
  for (let i = 0; i < t.length - 1; i++) {
    const n = Math.max(1, Math.round(Math.hypot(t[i + 1].x - t[i].x, t[i + 1].y - t[i].y) / 1.5));
    for (let k = 0; k < n; k++) {
      const p = { x: Math.round(t[i].x + ((t[i + 1].x - t[i].x) * k) / n + (r() - 0.5) * 2), y: Math.round(t[i].y + ((t[i + 1].y - t[i].y) * k) / n + (r() - 0.5) * 2) };
      res.push(p, { ...p });
    }
  }
  res.push(t[t.length - 1]);
  return res;
};
const texto = (p: ReturnType<typeof proponer>) => (p?.tipo === "glifos" ? p.glifos.map((g) => g.c).join("") : p?.tipo);

describe("escritura real de la pizarra", () => {
  it("lee las cuentas de las capturas", () => {
    expect(texto(proponer(CAPTURA_1))).toBe("1+2=3");
    expect(texto(proponer(CAPTURA_2))).toBe("1+2=");
  });

  it("con el serrucho del ratón da lo mismo", () => {
    expect(texto(proponer(CAPTURA_1.map((t, i) => conSerrucho(t, i + 1))))).toBe("1+2=3");
    expect(proponer([conSerrucho(Lr([100, 100], [400, 160]))])?.tipo).toBe("forma");
  });

  it("da lo mismo con cualquier zoom (se analiza en píxeles de pantalla)", () => {
    for (const zoom of [0.25, 0.6, 1, 4]) {
      // Lo mismo escrito en pantalla, guardado en unidades de la pizarra a ese zoom.
      const enPizarra = CAPTURA_1.map((t, i) => conSerrucho(t, i + 3).map((p) => ({ x: p.x / zoom, y: p.y / zoom })));
      const p = proponer(enPizarra, "completo", zoom);
      expect(texto(p), `zoom ${zoom}`).toBe("1+2=3");
      // Y el resultado vuelve en unidades de la pizarra.
      if (p?.tipo === "glifos") expect(p.caja.x).toBeCloseTo(285 / zoom, -1);
    }
  });
});
