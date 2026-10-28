import type { ReactNode } from "react";
import { LogoMarca } from "./CargaLogo";

/*
 * Avatares propios de AutograFlow, estilo «sticker» de juego: cabeza grande, contorno grueso y colores vivos. Se arman
 * con piezas y se guardan como un código corto, p. ej. «f2-p1-h3-c0-a4-e0» (fondo, piel, peinado, color de pelo,
 * accesorio, expresión). El servidor solo valida el formato (Perfiles::AVATAR).
 */
export interface PiezasAvatar { f: number; p: number; h: number; c: number; a: number; e: number }

export const FONDOS = ["#7c5cff", "#2fb4ff", "#3ddc84", "#ffb020", "#ff5c8a", "#13c2c2", "#ff7a45", "#334155"];
const CAMISAS = ["#5638d6", "#1585cf", "#22a862", "#d98a00", "#d93a68", "#0e8f8f", "#d65524", "#1e293b"];
export const PIELES = ["#ffdbb4", "#f1c08f", "#d99a64", "#a96a3d", "#7a4a2a", "#9be37a"];
export const PELOS = ["#2b1d14", "#6b3e1f", "#e2b13c", "#d1492e", "#a3a8b3", "#4b6cff"];
export const PEINADOS = ["Sin pelo", "Corto", "En punta", "Largo", "Rizado", "Moño", "Cresta", "De lado"];
export const ACCESORIOS = ["Nada", "Corona", "Casco", "Lentes", "Gorra", "Audífonos", "Lentes de sol", "Vikingo"];
export const EXPRESIONES = ["Feliz", "Risa", "Guiño", "Valiente"];

const MAXIMOS: PiezasAvatar = { f: FONDOS.length, p: PIELES.length, h: PEINADOS.length, c: PELOS.length, a: ACCESORIOS.length, e: EXPRESIONES.length };
const FORMATO = /^f([0-7])-p([0-5])-h([0-7])-c([0-5])-a([0-7])-e([0-3])$/;

export function leerAvatar(codigo?: string | null): PiezasAvatar | null {
  const m = codigo ? FORMATO.exec(codigo) : null;
  return m ? { f: +m[1], p: +m[2], h: +m[3], c: +m[4], a: +m[5], e: +m[6] } : null;
}
export const codigoAvatar = (x: PiezasAvatar) => `f${x.f}-p${x.p}-h${x.h}-c${x.c}-a${x.a}-e${x.e}`;
export const avatarAlAzar = (): PiezasAvatar =>
  Object.fromEntries(Object.entries(MAXIMOS).map(([k, n]) => [k, Math.floor(Math.random() * n)])) as unknown as PiezasAvatar;

/** Personajes listos para elegir de un toque. */
export const PERSONAJES: { nombre: string; codigo: string }[] = [
  { nombre: "Realeza", codigo: "f3-p0-h3-c2-a1-e0" },
  { nombre: "Caballero", codigo: "f7-p2-h1-c0-a2-e3" },
  { nombre: "Vikinga", codigo: "f1-p1-h3-c3-a7-e1" },
  { nombre: "Gamer", codigo: "f0-p3-h2-c0-a5-e1" },
  { nombre: "Estrella", codigo: "f4-p4-h4-c0-a6-e2" },
  { nombre: "Sabia", codigo: "f5-p0-h5-c4-a3-e0" },
  { nombre: "Rebelde", codigo: "f6-p1-h6-c5-a0-e3" },
  { nombre: "Duende", codigo: "f2-p5-h7-c1-a4-e2" },
];

const T = { stroke: "#1d1d2b", strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const ojo = (x: number) => <><ellipse cx={x} cy="55" rx="3.6" ry="4.6" fill="#1d1d2b" /><circle cx={x + 1.3} cy="53.4" r="1.3" fill="#fff" /></>;

/** Pelo que va detrás de la cabeza (solo el largo) y el que va delante. */
function pelo(h: number, color: string): { atras?: ReactNode; delante?: ReactNode } {
  const p = { ...T, fill: color };
  const corto = <path d="M24 52C22 30 38 24 50 24C64 24 79 30 76 52C70 42 60 36 50 37C40 36 30 42 24 52Z" {...p} />;
  switch (h) {
    case 1: return { delante: corto };
    case 2: return { delante: <path d="M24 50L22 34L32 38L34 24L43 33L50 19L57 33L66 24L68 38L78 34L76 50C68 40 32 40 24 50Z" {...p} /> };
    case 3: return {
      atras: <path d="M22 54C20 26 36 22 50 22C64 22 80 26 78 54L80 86L64 86L66 60L34 60L36 86L20 86Z" {...p} />,
      delante: <path d="M25 50C26 32 40 27 50 27C62 27 74 32 75 50C66 40 58 36 50 38C44 42 34 44 25 50Z" {...p} />,
    };
    case 4: return { delante: <g {...p}>{[[24, 47, 8], [76, 47, 8], [29, 35, 10], [71, 35, 10], [39, 27, 11], [61, 27, 11], [50, 24, 12], [38, 40, 7], [50, 37, 8], [62, 40, 7]].map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}</g> };
    case 5: return { delante: <><circle cx="50" cy="20" r="9" {...p} />{corto}</> };
    case 6: return { delante: <path d="M43 42L41 17L50 9L59 17L57 42C54 38 46 38 43 42Z" {...p} /> };
    case 7: return { delante: <path d="M24 52C22 28 40 22 54 24C70 26 80 36 76 52C72 44 66 40 60 38C50 46 36 48 24 52Z" {...p} /> };
    default: return {};
  }
}

function cara(e: number): ReactNode {
  const rubor = <><ellipse cx="35" cy="64" rx="4.5" ry="2.6" fill="#ff6b81" opacity=".45" /><ellipse cx="65" cy="64" rx="4.5" ry="2.6" fill="#ff6b81" opacity=".45" /></>;
  const arco = (x: number) => <path d={`M${x - 4} 56Q${x} 51 ${x + 4} 56`} fill="none" {...T} />;
  switch (e) {
    case 1: return <>{rubor}{arco(41)}{arco(59)}<path d="M41 62Q50 62 59 62Q57 73 50 73Q43 73 41 62Z" fill="#7a1f2b" {...T} strokeWidth={2.5} /><ellipse cx="50" cy="70" rx="4" ry="2.2" fill="#ff8a8a" /></>;
    case 2: return <>{rubor}{ojo(41)}{arco(59)}<path d="M43 65Q51 69 58 63" fill="none" {...T} /></>;
    case 3: return <>{rubor}{ojo(41)}{ojo(59)}<path d="M35 47L46 51M65 47L54 51" {...T} /><path d="M41 63L59 63Q57 70 50 70Q43 70 41 63Z" fill="#fff" {...T} strokeWidth={2.5} /></>;
    default: return <>{rubor}{ojo(41)}{ojo(59)}<path d="M42 64Q50 71 58 64" fill="none" {...T} /></>;
  }
}

function accesorio(a: number): ReactNode {
  switch (a) {
    case 1: return <><path d="M33 31L36 16L43 25L50 11L57 25L64 16L67 31Z" fill="#ffc83d" {...T} /><circle cx="50" cy="25" r="2.4" fill="#ff4d6d" /></>;
    case 2: return <>
      <path d="M50 21C52 10 61 5 68 7C62 11 57 16 55 22Z" fill="#e53e3e" {...T} strokeWidth={2.5} />
      <path d="M22 54C22 26 36 20 50 20C64 20 78 26 78 54L70 54L70 45L30 45L30 54Z" fill="#c3ccd6" {...T} />
      <path d="M50 21V44" stroke="#8a96a3" strokeWidth="3" /><circle cx="27" cy="50" r="1.6" fill="#1d1d2b" /><circle cx="73" cy="50" r="1.6" fill="#1d1d2b" />
    </>;
    case 3: return <g fill="rgba(255,255,255,.18)" {...T} strokeWidth={2.5}><circle cx="41" cy="55" r="7.5" /><circle cx="59" cy="55" r="7.5" /><path d="M48.5 55h3M33.5 54l-8-2M66.5 54l8-2" fill="none" /></g>;
    case 4: return <><path d="M24 45C24 26 38 22 50 22C62 22 76 26 76 45Z" fill="#ff4757" {...T} /><path d="M48 45L85 43Q91 47 83 51L50 49Z" fill="#d63045" {...T} /><circle cx="50" cy="23" r="2.5" fill="#d63045" /></>;
    case 5: return <><path d="M23 54C21 20 79 20 77 54" fill="none" stroke="#1d1d2b" strokeWidth="9" strokeLinecap="round" /><path d="M23 54C21 20 79 20 77 54" fill="none" stroke="#3d4451" strokeWidth="4" strokeLinecap="round" /><rect x="15" y="46" width="11" height="18" rx="4.5" fill="#ff6b6b" {...T} /><rect x="74" y="46" width="11" height="18" rx="4.5" fill="#ff6b6b" {...T} /></>;
    case 6: return <g {...T} strokeWidth={2.5}><rect x="32" y="50" width="16" height="10" rx="3.5" fill="#1d1d2b" /><rect x="52" y="50" width="16" height="10" rx="3.5" fill="#1d1d2b" /><path d="M48 53h4M32 53l-6-2M68 53l6-2" fill="none" /><path d="M35 52.5l5 0" stroke="#fff" strokeWidth="1.6" /><path d="M55 52.5l5 0" stroke="#fff" strokeWidth="1.6" /></g>;
    case 7: return <>
      <path d="M27 40C14 36 10 24 14 15C18 25 24 29 31 31Z" fill="#fff3d6" {...T} /><path d="M73 40C86 36 90 24 86 15C82 25 76 29 69 31Z" fill="#fff3d6" {...T} />
      <path d="M24 48C24 28 36 22 50 22C64 22 76 28 76 48Z" fill="#9aa5b1" {...T} /><rect x="23" y="43" width="54" height="7" rx="2" fill="#c08a3e" {...T} />
    </>;
    default: return null;
  }
}

/** Dibujo del avatar. Sin código válido muestra la inicial al estilo del logo (hoja, letra con serifa y trazo de firma). */
export function Avatar({ codigo, inicial = "?", tam = 22, className = "" }: { codigo?: string | null; inicial?: string; tam?: number; className?: string }) {
  const x = leerAvatar(codigo);
  if (!x) return <LogoMarca tam={tam} letra={inicial} className={`avatarInicial ${className}`} />;
  const { atras, delante } = pelo(x.h, PELOS[x.c]);
  const piel = PIELES[x.p];
  return (
    <svg className={`avatarDibujo ${className}`} viewBox="0 0 100 100" width={tam} height={tam} aria-hidden>
      <rect width="100" height="100" rx="22" fill={FONDOS[x.f]} />
      <circle cx="80" cy="20" r="26" fill="#fff" opacity=".12" />
      {atras}
      <path d="M14 100C16 81 32 75 50 75C68 75 84 81 86 100Z" fill={CAMISAS[x.f]} {...T} />
      <circle cx="24" cy="57" r="6" fill={piel} {...T} /><circle cx="76" cy="57" r="6" fill={piel} {...T} />
      <circle cx="50" cy="54" r="26" fill={piel} {...T} />
      {delante}
      {cara(x.e)}
      {accesorio(x.a)}
    </svg>
  );
}
