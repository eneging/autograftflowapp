import { useSyncExternalStore } from "react";

/*
 * Apariencia del sistema: tema (claro/oscuro) y paleta de colores. Las paletas predefinidas están en tema.css
 * ([data-paleta]); la «propia» se calcula aquí a partir del fondo y del color de los botones que elige la persona.
 * Se guarda en este navegador; app.blade.php la aplica antes de dibujar la página (sin parpadeo de colores) con las
 * mismas claves: autograflow_tema, autograflow_paleta y autograflow_paleta_vars (variables CSS ya calculadas).
 */
export type Tema = "light" | "dark";
export type IdPaleta = "autograflow" | "urban" | "frosted" | "autumn" | "propia";
export interface Apariencia { tema: Tema; paleta: IdPaleta; fondo: string; boton: string }

/** Muestras: los colores de cada paleta, para dibujarla en el selector. */
export const PALETAS: { id: Exclude<IdPaleta, "propia">; nombre: string; muestras: string[] }[] = [
  { id: "autograflow", nombre: "AutograFlow", muestras: ["#ffffff", "#f7f7f5", "#37352f", "#2383e2"] },
  { id: "urban", nombre: "Urban nocturne", muestras: ["#141414", "#444444", "#979797", "#D6D6D6", "#E2E800"] },
  { id: "frosted", nombre: "Frosted aura", muestras: ["#5C7E8F", "#A2A2A2", "#D4DDE2"] },
  { id: "autumn", nombre: "Autumn luxe", muestras: ["#E2E1EB", "#AAAAAE", "#7F7265", "#BF8440", "#322D27"] },
];

const CLAVES = { tema: "autograflow_tema", paleta: "autograflow_paleta", vars: "autograflow_paleta_vars", propia: "autograflow_paleta_propia" };
const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const esHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

function inicial(): Apariencia {
  const p = leer(CLAVES.paleta);
  let propia: { fondo?: unknown; boton?: unknown } = {};
  try { propia = JSON.parse(leer(CLAVES.propia) ?? "{}"); } catch { /* valores por defecto */ }
  return {
    tema: leer(CLAVES.tema) === "dark" ? "dark" : "light",
    paleta: p === "urban" || p === "frosted" || p === "autumn" || p === "propia" ? p : "autograflow",
    fondo: esHex(propia.fondo) ? propia.fondo : "#fdf6ec",
    boton: esHex(propia.boton) ? propia.boton : "#7c3aed",
  };
}

// ---------------------------------------------------------------- colores

const canales = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
/** a con t (0 a 1) de b. */
const mezclar = (a: string, b: string, t: number) => { const x = canales(a), y = canales(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const luminancia = (h: string) => {
  const [r, g, b] = canales(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a: string, b: string) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** El fondo es oscuro: el tema se pone oscuro para que avisos y etiquetas combinen. */
export const fondoOscuro = (fondo: string) => luminancia(fondo) < 0.18;

/** Variables del color de los botones: relleno tal cual, texto encima legible y su versión para textos y bordes. */
function varsBoton(boton: string, fondo: string, tinta: string): Record<string, string> {
  let acento = boton;
  for (let t = 0.1; contraste(acento, fondo) < 3.2 && t <= 1; t += 0.1) acento = mezclar(boton, tinta, t);
  return {
    "--accent": acento, "--accent2": acento, "--accentHover": mezclar(acento, tinta, 0.15), "--accentSuave": `${boton}33`,
    "--accentRelleno": boton, "--accentRellenoHover": mezclar(boton, tinta, 0.12),
    "--sobreAccent": contraste("#ffffff", boton) >= contraste("#141414", boton) ? "#ffffff" : "#141414",
  };
}

/**
 * Paleta propia: con el tema que corresponde a su fondo, todo el sistema de colores sale del fondo; con el otro tema
 * se mantienen los fondos del tema y solo cambian los botones.
 */
function varsPropia({ tema, fondo, boton }: Apariencia): Record<string, string> {
  if ((tema === "dark") !== fondoOscuro(fondo)) {
    const base = tema === "dark" ? "#191919" : "#ffffff";
    return varsBoton(boton, base, tema === "dark" ? "#ffffff" : "#37352f");
  }
  const oscuro = tema === "dark", tinta = oscuro ? "#ececec" : "#1f1f1f";
  const menu = mezclar(fondo, "#ffffff", oscuro ? 0.06 : 0.55);
  return {
    "--fondo": fondo, "--lateral": mezclar(fondo, tinta, 0.05), "--fondoMenu": menu, "--lienzo": mezclar(fondo, tinta, 0.08),
    "--suave": mezclar(fondo, tinta, 0.025), "--campo": menu, "--gris": mezclar(fondo, tinta, 0.07),
    "--ink": tinta, "--ink2": mezclar(tinta, fondo, 0.18), "--muted": mezclar(tinta, fondo, 0.42), "--tenue": mezclar(tinta, fondo, 0.6),
    "--line": mezclar(fondo, tinta, 0.1), "--lineFuerte": mezclar(fondo, tinta, 0.18), "--hover": mezclar(fondo, tinta, 0.06), "--hover2": mezclar(fondo, tinta, 0.1),
    "--campoBordeHover": mezclar(fondo, tinta, 0.32),
    ...varsBoton(boton, fondo, tinta),
  };
}

// ---------------------------------------------------------------- estado compartido

let actual = inicial();
let aplicadas: string[] = [];
const oyentes = new Set<() => void>();

function aplicar(a: Apariencia) {
  const html = document.documentElement;
  html.setAttribute("data-theme", a.tema);
  html.setAttribute("data-paleta", a.paleta);
  for (const v of aplicadas) html.style.removeProperty(v);
  const vars = a.paleta === "propia" ? varsPropia(a) : {};
  for (const [k, v] of Object.entries(vars)) html.style.setProperty(k, v);
  aplicadas = Object.keys(vars);
  escribir(CLAVES.tema, a.tema);
  escribir(CLAVES.paleta, a.paleta);
  escribir(CLAVES.vars, a.paleta === "propia" ? JSON.stringify(vars) : null);
  escribir(CLAVES.propia, JSON.stringify({ fondo: a.fondo, boton: a.boton }));
}
if (typeof document !== "undefined") aplicar(actual);

export function cambiarApariencia(cambio: Partial<Apariencia>) {
  actual = { ...actual, ...cambio };
  // Al elegir un fondo propio, el tema pasa a ser el que le corresponde (claro u oscuro).
  if (actual.paleta === "propia" && (cambio.fondo || cambio.paleta === "propia")) actual.tema = fondoOscuro(actual.fondo) ? "dark" : "light";
  aplicar(actual);
  oyentes.forEach((f) => f());
}

export function usarApariencia() {
  return useSyncExternalStore((f) => { oyentes.add(f); return () => oyentes.delete(f); }, () => actual);
}
