import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as PE } from "react";
import { Link } from "react-router-dom";
import { cajaDe, proponer, type Caja, type ModoAsistencia, type Punto } from "../../../../../shared/pizarraTrazos";
import { PLANES } from "../../../../../shared/planes";
import { CargaLogo } from "../../../componentes/CargaLogo";
import { usarSesion } from "../../sesion";
import * as almacen from "./almacen";
import type { Camara, Pizarra, ResumenPizarra } from "./almacen";
import { ALTO, ANCHO, COLORES, COLORES_NOTA, cajaElemento, caminoSuave, mover, seCruzan, toca, type Elemento } from "./modelo";
import "./pizarra.css";

/*
 * Pizarra (Flow Tools): notas, escritura a mano, formas, texto e imágenes en una pizarra grande, guardada solo en este
 * navegador. «Trazo asistido»: al dejar de escribir un momento, lo escrito se vuelve más legible (formas perfectas,
 * números y símbolos con letra clara, o el trazo suavizado). Ctrl+Z vuelve al trazo original.
 * Compartir con colaboradores (archivo de la pizarra o de la selección) es parte de los planes de pago.
 */
type Herramienta = "seleccion" | "mano" | "lapiz" | "resaltador" | "borrador" | "nota" | "texto";
const HERRAMIENTAS: { id: Herramienta; icono: string; nombre: string; tecla: string }[] = [
  { id: "seleccion", icono: "↖", nombre: "Seleccionar y mover", tecla: "V" },
  { id: "mano", icono: "✋", nombre: "Desplazar la pizarra", tecla: "H" },
  { id: "lapiz", icono: "✏️", nombre: "Lápiz (con trazo asistido)", tecla: "P" },
  { id: "resaltador", icono: "🖍️", nombre: "Resaltador", tecla: "M" },
  { id: "borrador", icono: "🧽", nombre: "Borrador", tecla: "E" },
  { id: "nota", icono: "🗒️", nombre: "Nota adhesiva", tecla: "N" },
  { id: "texto", icono: "T", nombre: "Texto", tecla: "T" },
];
const MODOS: { id: ModoAsistencia; nombre: string; ayuda: string }[] = [
  { id: "completo", nombre: "Formas y números", ayuda: "Formas perfectas, números y símbolos (+ − × =) con letra clara; lo demás, suavizado." },
  { id: "formas", nombre: "Solo formas", ayuda: "Líneas, flechas, rectángulos, triángulos y círculos; lo demás, suavizado." },
  { id: "suavizar", nombre: "Solo suavizar", ayuda: "Quita el temblor del trazo sin cambiar lo que escribiste." },
  { id: "apagado", nombre: "Apagado", ayuda: "El trazo queda tal cual." },
];
const GROSORES = [2, 4, 8, 14];
/** Pausa tras soltar el trazo antes de mejorarlo (si se sigue escribiendo cerca, se espera al grupo completo). */
const ESPERA_MS = 900;
const ZOOM_MIN = 0.08, ZOOM_MAX = 4;
const leerPref = <T,>(clave: string, def: T): T => { try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) as T : def; } catch { return def; } };
const guardarPref = (clave: string, v: unknown) => { try { localStorage.setItem(clave, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const id = almacen.nuevoId;

export default function PizarraApp() {
  const { usuario } = usarSesion();
  const [lista, setLista] = useState<ResumenPizarra[] | null>(null);
  const [actual, setActual] = useState<Pizarra | null>(null);
  const [error, setError] = useState("");
  const usuarioId = usuario?.id ?? 0;

  const recargarLista = useCallback(() => almacen.listar(usuarioId).then(setLista), [usuarioId]);
  useEffect(() => {
    if (!("indexedDB" in window)) return setError("Este navegador no permite guardar pizarras en el dispositivo.");
    (async () => {
      let l = await almacen.listar(usuarioId);
      if (!l.length) { await almacen.crear(usuarioId, "Mi primera pizarra", bienvenida()); l = await almacen.listar(usuarioId); }
      setLista(l);
      const ultima = leerPref<string>(`af.pizarra.${usuarioId}`, l[0].id);
      setActual((await almacen.leer(l.find((p) => p.id === ultima)?.id ?? l[0].id)) ?? null);
    })().catch(() => setError("No se pudo abrir el almacenamiento del navegador (¿modo privado?)."));
  }, [usuarioId]);

  if (error) return <div className="card"><div className="afAlerta">{error}</div></div>;
  if (!lista || !actual) return <div className="ftCargando"><CargaLogo tam={48} texto="Abriendo tus pizarras…" /></div>;
  return (
    <Lienzo key={actual.id} inicial={actual} lista={lista} usuarioId={usuarioId} pago={!!usuario && !usuario.invitado && !PLANES[usuario.plan]?.marcaAgua}
      alAbrir={async (pid) => { const p = await almacen.leer(pid); if (p) { guardarPref(`af.pizarra.${usuarioId}`, pid); setActual(p); } }}
      alCambiarLista={recargarLista} />
  );
}

/** La primera pizarra trae una nota que explica cómo se usa. */
function bienvenida(): Elemento[] {
  const cx = ANCHO / 2, cy = ALTO / 2;
  return [
    { id: id(), tipo: "nota", color: COLORES_NOTA[0], x: cx - 420, y: cy - 200, w: 380, h: 300,
      texto: "¡Bienvenido a tu pizarra!\n\n✏️ Escribe con el lápiz: al dejar de escribir, las formas se vuelven perfectas y los números se ven claros.\n\n↩️ Ctrl+Z vuelve a tu trazo original.\n\n🖼️ Pega o arrastra imágenes.\n\n💾 Se guarda solo en este dispositivo." },
    { id: id(), tipo: "texto", color: COLORES[0], x: cx + 20, y: cy - 190, texto: "Prueba a escribir aquí: 3 + 4 = 7", tam: 30 },
  ];
}

function Lienzo({ inicial, lista, usuarioId, pago, alAbrir, alCambiarLista }: {
  inicial: Pizarra; lista: ResumenPizarra[]; usuarioId: number; pago: boolean;
  alAbrir: (id: string) => void; alCambiarLista: () => Promise<void>;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [nombre, setNombre] = useState(inicial.nombre);
  const [elementos, setElementosEstado] = useState<Elemento[]>(inicial.elementos);
  const elementosRef = useRef(elementos);
  const [cam, setCam] = useState<Camara>(inicial.camara);
  const camRef = useRef(cam);
  camRef.current = cam;
  const [herramienta, setHerramienta] = useState<Herramienta>("lapiz");
  const [color, setColor] = useState(() => leerPref("af.pizarra.color", COLORES[0]));
  const [grosor, setGrosor] = useState(() => leerPref("af.pizarra.grosor", 4));
  const [modo, setModo] = useState<ModoAsistencia>(() => leerPref("af.pizarra.modo", "completo"));
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [enCurso, setEnCurso] = useState<Punto[] | null>(null);
  const [marco, setMarco] = useState<Caja | null>(null);
  const [arrastre, setArrastre] = useState<{ dx: number; dy: number } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; deshacer?: boolean } | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<null | "compartir" | "pizarras">(null);
  const [tam, setTam] = useState({ w: 800, h: 600 });
  const pasado = useRef<Elemento[][]>([]), futuro = useRef<Elemento[][]>([]);
  const pendientes = useRef<string[]>([]), temporizador = useRef<number | undefined>(undefined);
  const punteros = useRef(new Map<number, Punto>());
  const gesto = useRef<null | { tipo: string; [k: string]: unknown }>(null);
  const lapizVisto = useRef(false);
  const espacio = useRef(false);

  // ------------------------------------------------------------ pantalla completa (para presentar o compartir pantalla)
  // «nativa»: la del navegador. «simulada»: ocupa toda la ventana donde el navegador no la permite (iPhone).
  const app = useRef<HTMLDivElement>(null);
  const [completa, setCompleta] = useState<false | "nativa" | "simulada">(false);
  useEffect(() => {
    const cambio = () => setCompleta((c) => (document.fullscreenElement === app.current ? "nativa" : c === "nativa" ? false : c));
    document.addEventListener("fullscreenchange", cambio);
    return () => document.removeEventListener("fullscreenchange", cambio);
  }, []);
  const alternarCompleta = useCallback(async () => {
    if (document.fullscreenElement) { await document.exitFullscreen().catch(() => {}); return; }
    if (completa === "simulada") { setCompleta(false); return; }
    try {
      const el = app.current as HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> };
      await (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.() ?? Promise.reject());
    } catch { setCompleta("simulada"); }
  }, [completa]);

  useEffect(() => guardarPref("af.pizarra.color", color), [color]);
  useEffect(() => guardarPref("af.pizarra.grosor", grosor), [grosor]);
  useEffect(() => guardarPref("af.pizarra.modo", modo), [modo]);

  // ------------------------------------------------------------ elementos con historial
  const setElementos = useCallback((nuevos: Elemento[], historial = true) => {
    if (historial) { pasado.current.push(elementosRef.current); if (pasado.current.length > 150) pasado.current.shift(); futuro.current = []; }
    elementosRef.current = nuevos;
    setElementosEstado(nuevos);
  }, []);
  const deshacer = useCallback(() => {
    const prev = pasado.current.pop();
    if (!prev) return;
    futuro.current.push(elementosRef.current);
    pendientes.current = [];
    elementosRef.current = prev;
    setElementosEstado(prev);
    setAviso(null);
  }, []);
  const rehacer = useCallback(() => {
    const sig = futuro.current.pop();
    if (!sig) return;
    pasado.current.push(elementosRef.current);
    elementosRef.current = sig;
    setElementosEstado(sig);
  }, []);

  // ------------------------------------------------------------ guardado automático (solo en este navegador)
  useEffect(() => {
    const t = setTimeout(() => {
      almacen.guardar({ ...inicial, nombre, elementos, camara: cam }).catch(() => setAviso({ texto: "⚠️ No se pudo guardar: el navegador no tiene espacio." }));
    }, 500);
    return () => clearTimeout(t);
  }, [elementos, cam, nombre, inicial]);
  useEffect(() => { const t = setTimeout(() => { if (nombre !== inicial.nombre) alCambiarLista(); }, 800); return () => clearTimeout(t); }, [nombre, inicial.nombre, alCambiarLista]);

  // ------------------------------------------------------------ imágenes (Blob en IndexedDB → URL local)
  useEffect(() => {
    const faltan = elementos.filter((e) => e.tipo === "imagen" && !urls[e.imagen]).map((e) => (e as { imagen: string }).imagen);
    if (!faltan.length) return;
    Promise.all(faltan.map(async (i) => [i, await almacen.leerImagen(i)] as const)).then((rs) =>
      setUrls((u) => ({ ...u, ...Object.fromEntries(rs.filter(([, b]) => b).map(([i, b]) => [i, URL.createObjectURL(b!)])) })));
  }, [elementos, urls]);
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  useEffect(() => () => Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u)), []);

  // ------------------------------------------------------------ tamaño de la vista y primera posición
  useEffect(() => {
    const el = contenedor.current!;
    const ro = new ResizeObserver(() => setTam({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setTam({ w: el.clientWidth, h: el.clientHeight });
    // Pizarra nueva (cámara en 0,0): se abre en el centro, donde está la nota de bienvenida.
    if (inicial.camara.x === 0 && inicial.camara.y === 0) setCam({ x: ANCHO / 2 - el.clientWidth / 2, y: ALTO / 2 - el.clientHeight / 2, zoom: 1 });
    return () => ro.disconnect();
  }, [inicial.camara]);

  const aPizarra = useCallback((cx: number, cy: number): Punto => {
    const r = svg.current!.getBoundingClientRect(), c = camRef.current;
    return { x: (cx - r.left) / c.zoom + c.x, y: (cy - r.top) / c.zoom + c.y };
  }, []);
  const limitar = useCallback((c: Camara): Camara => {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom));
    const vw = tam.w / z, vh = tam.h / z;
    return { zoom: z, x: Math.min(ANCHO - vw * 0.3, Math.max(-vw * 0.7, c.x)), y: Math.min(ALTO - vh * 0.3, Math.max(-vh * 0.7, c.y)) };
  }, [tam]);
  const zoomEn = useCallback((factor: number, cx?: number, cy?: number) => {
    const r = svg.current!.getBoundingClientRect();
    const px = cx ?? r.left + r.width / 2, py = cy ?? r.top + r.height / 2;
    setCam((c) => {
      const p = { x: (px - r.left) / c.zoom + c.x, y: (py - r.top) / c.zoom + c.y };
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom * factor));
      return limitar({ zoom: z, x: p.x - (px - r.left) / z, y: p.y - (py - r.top) / z });
    });
  }, [limitar]);

  // Rueda: desplaza; con Ctrl (o el pellizco del trackpad), acerca.
  useEffect(() => {
    const el = svg.current!;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomEn(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      else setCam((c) => limitar({ ...c, x: c.x + e.deltaX / c.zoom, y: c.y + e.deltaY / c.zoom }));
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, [zoomEn, limitar]);

  // ------------------------------------------------------------ trazo asistido
  const mejorarPendientes = useCallback(() => {
    clearTimeout(temporizador.current);
    const ids = pendientes.current;
    pendientes.current = [];
    if (!ids.length || modo === "apagado") return;
    const actuales = elementosRef.current;
    const trazos = ids.map((i) => actuales.find((e) => e.id === i)).filter((e): e is Extract<Elemento, { tipo: "trazo" }> => e?.tipo === "trazo");
    if (!trazos.length) return;
    // Se analiza en píxeles de pantalla (con el zoom actual): da igual cuánto zoom haya.
    let p = proponer(trazos.map((t) => t.puntos), modo, camRef.current.zoom);
    if (!p) return;
    const quitar = new Set(trazos.map((t) => t.id));
    const { color: c, grosor: g } = trazos[0];
    let nuevos: Elemento[];
    let texto = "";
    const caja = cajaDe(trazos.map((t) => t.puntos));
    // Números ya convertidos en el mismo renglón, cerca de lo escrito: lo nuevo toma su tamaño y su línea base.
    const renglon = actuales.find((x): x is Extract<Elemento, { tipo: "glifo" }> => x.tipo === "glifo" && !quitar.has(x.id)
      && caja.y + caja.h > x.base - x.tam * 0.9 && caja.y < x.base + x.tam * 0.3
      && caja.x < x.x + x.tam * 2.5 && caja.x + caja.w > x.x - x.tam * 2.5);
    // Una raya o un palito sueltos junto a números son «−» o «1», no una línea.
    if (p.tipo === "forma" && p.forma.forma === "linea" && renglon && Math.hypot(caja.w, caja.h) < renglon.tam * 1.3) {
      const c1 = caja.w > caja.h * 2.5 ? "−" : caja.h > caja.w * 2.5 ? "1" : null;
      if (c1) p = { tipo: "glifos", glifos: [{ c: c1, caja }], caja };
    }
    if (p.tipo === "forma") {
      nuevos = [{ id: id(), tipo: "forma", color: c, grosor: g, forma: p.forma }];
      texto = { linea: "una línea recta", flecha: "una flecha", rect: "un rectángulo", elipse: "un círculo", triangulo: "un triángulo" }[p.forma.forma];
    } else if (p.tipo === "glifos") {
      const digitos = p.glifos.filter((x) => /\d/.test(x.c));
      const ref = digitos.length ? digitos : p.glifos;
      const tam = renglon?.tam ?? Math.max(...ref.map((x) => x.caja.h), 12) / 0.72;
      const base = renglon?.base ?? Math.max(...ref.map((x) => x.caja.y + x.caja.h));
      nuevos = p.glifos.map((x) => ({ id: id(), tipo: "glifo" as const, color: c, c: x.c, x: x.caja.x + x.caja.w / 2, base, tam }));
      texto = `«${p.glifos.map((x) => x.c).join("")}»`;
    } else {
      const porId = new Map(trazos.map((t, i) => [t.id, p.trazos[i]]));
      setElementos(actuales.map((e) => (porId.has(e.id) ? { ...e, puntos: porId.get(e.id)! } as Elemento : e)));
      return;
    }
    // Lo nuevo va donde estaba el primer trazo (respeta lo que esté encima).
    const primero = actuales.findIndex((e) => quitar.has(e.id));
    const resto = actuales.filter((e) => !quitar.has(e.id));
    resto.splice(Math.min(primero, resto.length), 0, ...nuevos);
    setElementos(resto);
    setAviso({ texto: `✨ Convertido en ${texto}`, deshacer: true });
  }, [modo, setElementos]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 4000); return () => clearTimeout(t); }, [aviso]);

  // ------------------------------------------------------------ punteros
  function abajo(e: PE<SVGSVGElement>) {
    if (editando) setEditando(null);
    svg.current!.setPointerCapture(e.pointerId);
    const p = aPizarra(e.clientX, e.clientY);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === "pen") lapizVisto.current = true;
    // Dos dedos: pellizcar para acercar y arrastrar para desplazar (cancela el trazo empezado).
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      gesto.current = { tipo: "pellizco", d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam: camRef.current };
      setEnCurso(null);
      return;
    }
    const desplazar = herramienta === "mano" || e.button === 1 || espacio.current || (e.pointerType === "touch" && lapizVisto.current);
    if (desplazar) { gesto.current = { tipo: "mover", x: e.clientX, y: e.clientY, cam: camRef.current }; return; }
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const tol = 6 / camRef.current.zoom;
    if (herramienta === "lapiz" || herramienta === "resaltador") {
      // Empezar a escribir lejos de lo pendiente: lo anterior ya está terminado.
      if (pendientes.current.length) {
        const caja = cajaDe(pendientes.current.map((i) => elementosRef.current.find((x) => x.id === i)).filter((x) => x?.tipo === "trazo").map((x) => (x as { puntos: Punto[] }).puntos));
        const margen = Math.max(50 / camRef.current.zoom, caja.h * 1.2); // 50 px de pantalla, con cualquier zoom
        if (p.x < caja.x - margen || p.x > caja.x + caja.w + margen || p.y < caja.y - margen || p.y > caja.y + caja.h + margen) mejorarPendientes();
        else clearTimeout(temporizador.current);
      }
      gesto.current = { tipo: "trazo" };
      setEnCurso([p]);
    } else if (herramienta === "borrador") {
      gesto.current = { tipo: "borrar", antes: elementosRef.current };
      borrarEn(p, tol);
    } else if (herramienta === "nota") {
      const n: Elemento = { id: id(), tipo: "nota", color: COLORES_NOTA[Math.floor(Math.random() * COLORES_NOTA.length)], x: p.x - 110, y: p.y - 80, w: 220, h: 160, texto: "" };
      setElementos([...elementosRef.current, n]);
      setSeleccion(new Set([n.id])); setEditando(n.id); setHerramienta("seleccion");
    } else if (herramienta === "texto") {
      const t: Elemento = { id: id(), tipo: "texto", color, x: p.x, y: p.y - 14, texto: "", tam: 28 };
      setElementos([...elementosRef.current, t]);
      setSeleccion(new Set([t.id])); setEditando(t.id); setHerramienta("seleccion");
    } else if (herramienta === "seleccion") {
      const unico = seleccion.size === 1 ? elementosRef.current.find((x) => seleccion.has(x.id)) : undefined;
      if (unico && (unico.tipo === "imagen" || unico.tipo === "nota")) {
        const c = cajaElemento(unico);
        if (Math.hypot(p.x - (c.x + c.w), p.y - (c.y + c.h)) < 14 / camRef.current.zoom) { gesto.current = { tipo: "redimensionar", id: unico.id, inicio: p, caja: c }; return; }
      }
      const tocado = [...elementosRef.current].reverse().find((x) => toca(x, p, tol));
      if (tocado) {
        const nueva = e.shiftKey ? new Set(seleccion).add(tocado.id) : seleccion.has(tocado.id) ? seleccion : new Set([tocado.id]);
        setSeleccion(nueva);
        gesto.current = { tipo: "arrastrar", inicio: p };
        if (e.detail === 2 && (tocado.tipo === "nota" || tocado.tipo === "texto")) { setEditando(tocado.id); gesto.current = null; }
      } else {
        if (!e.shiftKey) setSeleccion(new Set());
        gesto.current = { tipo: "marco", inicio: p };
        setMarco({ x: p.x, y: p.y, w: 0, h: 0 });
      }
    }
  }

  function borrarEn(p: Punto, tol: number) {
    const quedan = elementosRef.current.filter((x) => !toca(x, p, tol * 2));
    if (quedan.length !== elementosRef.current.length) { elementosRef.current = quedan; setElementosEstado(quedan); }
  }

  function moverPuntero(e: PE<SVGSVGElement>) {
    if (punteros.current.has(e.pointerId)) punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesto.current;
    if (!g) return;
    if (g.tipo === "pellizco" && punteros.current.size >= 2) {
      const [a, b] = [...punteros.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const c0 = g.cam as Camara, m0 = g.m as Punto, r = svg.current!.getBoundingClientRect();
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c0.zoom * (d / (g.d as number))));
      const fijo = { x: (m0.x - r.left) / c0.zoom + c0.x, y: (m0.y - r.top) / c0.zoom + c0.y };
      setCam(limitar({ zoom: z, x: fijo.x - (m.x - r.left) / z, y: fijo.y - (m.y - r.top) / z }));
      return;
    }
    if (g.tipo === "mover") {
      const c0 = g.cam as Camara;
      setCam(limitar({ ...c0, x: c0.x - (e.clientX - (g.x as number)) / c0.zoom, y: c0.y - (e.clientY - (g.y as number)) / c0.zoom }));
      return;
    }
    const eventos = (e.nativeEvent.getCoalescedEvents?.() ?? []).length ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    const p = aPizarra(e.clientX, e.clientY);
    if (g.tipo === "trazo") setEnCurso((t) => (t ? [...t, ...eventos.map((ev) => aPizarra(ev.clientX, ev.clientY))] : t));
    else if (g.tipo === "borrar") borrarEn(p, 6 / camRef.current.zoom);
    else if (g.tipo === "arrastrar") { const i = g.inicio as Punto; setArrastre({ dx: p.x - i.x, dy: p.y - i.y }); }
    else if (g.tipo === "marco") { const i = g.inicio as Punto; setMarco({ x: Math.min(i.x, p.x), y: Math.min(i.y, p.y), w: Math.abs(p.x - i.x), h: Math.abs(p.y - i.y) }); }
    else if (g.tipo === "redimensionar") {
      const c = g.caja as Caja, i = g.inicio as Punto;
      const w = Math.max(40, c.w + p.x - i.x);
      setElementos(elementosRef.current.map((x) => {
        if (x.id !== g.id || (x.tipo !== "imagen" && x.tipo !== "nota")) return x;
        // Las imágenes conservan su proporción.
        return { ...x, w, h: x.tipo === "imagen" ? (w * c.h) / c.w : Math.max(60, c.h + p.y - i.y) };
      }), false);
    }
  }

  function arriba(e: PE<SVGSVGElement>) {
    punteros.current.delete(e.pointerId);
    const g = gesto.current;
    if (g?.tipo === "pellizco") { if (punteros.current.size === 0) gesto.current = null; return; }
    gesto.current = null;
    if (!g) return;
    if (g.tipo === "trazo" && enCurso) {
      const t: Elemento = herramienta === "resaltador"
        ? { id: id(), tipo: "trazo", color, grosor: grosor * 4, puntos: enCurso, resaltador: true }
        : { id: id(), tipo: "trazo", color, grosor, puntos: enCurso };
      setElementos([...elementosRef.current, t]);
      setEnCurso(null);
      if (herramienta === "lapiz" && modo !== "apagado") {
        pendientes.current.push(t.id);
        clearTimeout(temporizador.current);
        temporizador.current = window.setTimeout(mejorarPendientes, ESPERA_MS);
      }
    } else if (g.tipo === "borrar") {
      const antes = g.antes as Elemento[];
      if (antes.length !== elementosRef.current.length) { pasado.current.push(antes); futuro.current = []; }
    } else if (g.tipo === "arrastrar" && arrastre) {
      setElementos(elementosRef.current.map((x) => (seleccion.has(x.id) ? mover(x, arrastre.dx, arrastre.dy) : x)));
      setArrastre(null);
    } else if (g.tipo === "marco" && marco) {
      const dentroMarco = elementosRef.current.filter((x) => seCruzan(cajaElemento(x), marco)).map((x) => x.id);
      setSeleccion((s) => new Set([...(e.shiftKey ? s : []), ...dentroMarco]));
      setMarco(null);
    } else if (g.tipo === "redimensionar") {
      pasado.current.push(elementosRef.current); futuro.current = [];
    }
  }

  // ------------------------------------------------------------ teclado, pegar y soltar imágenes
  const agregarImagen = useCallback(async (archivo: Blob, en?: Punto) => {
    if (!archivo.type.startsWith("image/")) return;
    if (archivo.size > 15 * 1024 * 1024) return setAviso({ texto: "La imagen pesa más de 15 MB." });
    const bmp = await createImageBitmap(archivo).catch(() => null);
    if (!bmp) return setAviso({ texto: "No se pudo leer la imagen." });
    const k = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
    const w = bmp.width * k, h = bmp.height * k;
    bmp.close();
    const imagen = await almacen.guardarImagen(archivo);
    const c = camRef.current;
    const centro = en ?? { x: c.x + tam.w / c.zoom / 2, y: c.y + tam.h / c.zoom / 2 };
    const el: Elemento = { id: id(), tipo: "imagen", color: "", x: centro.x - w / 2, y: centro.y - h / 2, w, h, imagen };
    setElementos([...elementosRef.current, el]);
    setSeleccion(new Set([el.id])); setHerramienta("seleccion");
  }, [setElementos, tam]);

  useEffect(() => {
    const escribiendo = () => { const a = document.activeElement; return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || (a as HTMLElement)?.isContentEditable; };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === " " && !escribiendo()) { espacio.current = e.type === "keydown"; if (e.type === "keydown") e.preventDefault(); return; }
      if (e.type !== "keydown" || escribiendo()) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); return e.shiftKey ? rehacer() : deshacer(); }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); return rehacer(); }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); return setSeleccion(new Set(elementosRef.current.map((x) => x.id))); }
      if ((e.key === "Delete" || e.key === "Backspace") && seleccion.size) {
        setElementos(elementosRef.current.filter((x) => !seleccion.has(x.id))); setSeleccion(new Set()); return;
      }
      if (e.key === "Escape") { if (completa === "simulada") setCompleta(false); setSeleccion(new Set()); return; }
      if (mod) return;
      if (e.key.toLowerCase() === "f") { alternarCompleta(); return; }
      const h = HERRAMIENTAS.find((x) => x.tecla.toLowerCase() === e.key.toLowerCase());
      if (h) setHerramienta(h.id);
    };
    const pegar = (e: ClipboardEvent) => {
      if (escribiendo()) return;
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (img) { e.preventDefault(); agregarImagen(img); }
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("keyup", tecla);
    window.addEventListener("paste", pegar);
    return () => { window.removeEventListener("keydown", tecla); window.removeEventListener("keyup", tecla); window.removeEventListener("paste", pegar); };
  }, [seleccion, deshacer, rehacer, setElementos, agregarImagen, completa, alternarCompleta]);

  // Al cambiar de herramienta o salir, lo pendiente se mejora ya.
  useEffect(() => { mejorarPendientes(); }, [herramienta]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ pizarras: nueva, renombrar, borrar
  async function nueva() {
    const p = await almacen.crear(usuarioId, `Pizarra ${lista.length + 1}`);
    await alCambiarLista();
    alAbrir(p.id);
  }
  async function borrarPizarra() {
    if (lista.length < 2) return setAviso({ texto: "Debe quedar al menos una pizarra." });
    if (!confirm(`¿Borrar «${nombre}»? Se elimina de este dispositivo y no se puede recuperar.`)) return;
    await almacen.borrar(inicial.id);
    await alCambiarLista();
    alAbrir(lista.find((p) => p.id !== inicial.id)!.id);
  }

  // ------------------------------------------------------------ exportar PNG, compartir y abrir archivos
  const cajaDeElementos = (els: Elemento[]): Caja | null => {
    if (!els.length) return null;
    const cs = els.map(cajaElemento);
    const x0 = Math.min(...cs.map((c) => c.x)), y0 = Math.min(...cs.map((c) => c.y));
    return { x: x0 - 30, y: y0 - 30, w: Math.max(...cs.map((c) => c.x + c.w)) - x0 + 60, h: Math.max(...cs.map((c) => c.y + c.h)) - y0 + 60 };
  };
  const elegidos = () => (seleccion.size ? elementos.filter((x) => seleccion.has(x.id)) : elementos);

  async function exportarPng() {
    const els = elegidos(), caja = cajaDeElementos(els);
    if (!caja) return setAviso({ texto: "La pizarra está vacía." });
    const capa = svg.current!.querySelector<SVGGElement>(".pzContenido")!.cloneNode(true) as SVGGElement;
    capa.removeAttribute("transform");
    if (seleccion.size) capa.querySelectorAll("[data-id]").forEach((n) => { if (!seleccion.has(n.getAttribute("data-id")!)) n.remove(); });
    capa.querySelectorAll(".pzSoloPantalla").forEach((n) => n.remove());
    for (const img of capa.querySelectorAll("image")) {
      const blob = await fetch(img.getAttribute("href")!).then((r) => r.blob());
      img.setAttribute("href", await new Promise<string>((ok) => { const f = new FileReader(); f.onload = () => ok(f.result as string); f.readAsDataURL(blob); }));
    }
    const escala = Math.min(2, 8000 / Math.max(caja.w, caja.h));
    const fuente = getComputedStyle(document.body).fontFamily;
    const texto = `<svg xmlns="http://www.w3.org/2000/svg" width="${caja.w * escala}" height="${caja.h * escala}" viewBox="${caja.x} ${caja.y} ${caja.w} ${caja.h}" style="font-family:${fuente.replace(/"/g, "'")}"><rect x="${caja.x}" y="${caja.y}" width="${caja.w}" height="${caja.h}" fill="#ffffff"/>${new XMLSerializer().serializeToString(capa)}</svg>`;
    const url = URL.createObjectURL(new Blob([texto], { type: "image/svg+xml" }));
    const im = new Image();
    im.onload = () => {
      const c = Object.assign(document.createElement("canvas"), { width: caja.w * escala, height: caja.h * escala });
      c.getContext("2d")!.drawImage(im, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob((b) => {
        if (!b) return setAviso({ texto: "No se pudo crear la imagen." });
        descargar(b, `${nombre || "pizarra"}.png`);
        setAviso({ texto: `⬇️ Se descargó «${nombre || "pizarra"}.png» en tu carpeta de descargas.` });
      }, "image/png");
    };
    im.onerror = () => { URL.revokeObjectURL(url); setAviso({ texto: "No se pudo crear la imagen." }); };
    im.src = url;
  }

  async function compartir(soloSeleccion: boolean) {
    const els = soloSeleccion ? elementos.filter((x) => seleccion.has(x.id)) : elementos;
    if (!els.length) return setAviso({ texto: "No hay nada que compartir." });
    const imagenes: Record<string, string> = {};
    for (const e of els) if (e.tipo === "imagen" && !imagenes[e.imagen]) {
      const b = await almacen.leerImagen(e.imagen);
      if (b) imagenes[e.imagen] = await new Promise<string>((ok) => { const f = new FileReader(); f.onload = () => ok(f.result as string); f.readAsDataURL(b); });
    }
    const archivo = new File([JSON.stringify({ formato: "autograflow-pizarra", version: 1, nombre: soloSeleccion ? `${nombre} (parte)` : nombre, elementos: els, imagenes })],
      `${(nombre || "pizarra").replace(/[\\/:*?"<>|]/g, "")}.pizarra.json`, { type: "application/json" });
    setPanel(null);
    if (navigator.canShare?.({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo], title: nombre, text: "Te comparto mi pizarra de AutograFlow. Ábrela en Flow Tools → Pizarra → Abrir archivo." }); return; }
      catch (e) { if ((e as DOMException).name === "AbortError") return; }
    }
    descargar(archivo, archivo.name);
    setAviso({ texto: "📤 Archivo descargado: envíalo a tu colaborador para que lo abra en su pizarra." });
  }

  async function abrirArchivo(f?: File) {
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d?.formato !== "autograflow-pizarra" || !Array.isArray(d.elementos)) throw new Error();
      const nuevosIds: Record<string, string> = {};
      for (const [viejo, dataUrl] of Object.entries(d.imagenes ?? {})) nuevosIds[viejo] = await almacen.guardarImagen(await (await fetch(dataUrl as string)).blob());
      const els = (d.elementos as Elemento[]).map((e) => ({ ...e, id: id(), ...(e.tipo === "imagen" ? { imagen: nuevosIds[e.imagen] ?? e.imagen } : {}) }) as Elemento);
      const p = await almacen.crear(usuarioId, `Compartida: ${String(d.nombre ?? "pizarra").slice(0, 60)}`, els);
      const c = cajaDeElementos(els);
      if (c) await almacen.guardar({ ...p, camara: { x: c.x + c.w / 2 - tam.w / 2, y: c.y + c.h / 2 - tam.h / 2, zoom: 1 } });
      await alCambiarLista();
      alAbrir(p.id);
    } catch {
      setAviso({ texto: "Ese archivo no es una pizarra de AutograFlow." });
    }
  }

  // ------------------------------------------------------------ dibujo
  const z = cam.zoom;
  const vista = { x: cam.x, y: cam.y, w: tam.w / z, h: tam.h / z };
  const visibles = useMemo(() => elementos.filter((x) => seCruzan(cajaElemento(x), { x: vista.x - 200, y: vista.y - 200, w: vista.w + 400, h: vista.h + 400 })),
    [elementos, vista.x, vista.y, vista.w, vista.h]);
  const editado = editando ? elementos.find((x) => x.id === editando) : undefined;
  const cajaSel = seleccion.size ? cajaDeElementos(elementos.filter((x) => seleccion.has(x.id))) : null;
  const unicoRedimensionable = seleccion.size === 1 ? elementos.find((x) => seleccion.has(x.id) && (x.tipo === "imagen" || x.tipo === "nota")) : undefined;

  return (
    <div className={`pzApp ${completa === "simulada" ? "pzSimulada" : ""} ${completa ? "pzCompleta" : ""}`} ref={app}>
      <div className="pzBarra">
        <button type="button" className="botonChico" onClick={() => setPanel(panel === "pizarras" ? null : "pizarras")} aria-expanded={panel === "pizarras"}>📚 Mis pizarras ▾</button>
        <input className="pzNombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre de la pizarra" />
        <span className="pzGuardado" title="Las pizarras se guardan solo en este navegador">💾 En este dispositivo</span>
        <span className="pzSeparador" />
        <label className="pzAsistencia" title={MODOS.find((m) => m.id === modo)?.ayuda}>
          ✨ Trazo asistido
          <select value={modo} onChange={(e) => setModo(e.target.value as ModoAsistencia)}>{MODOS.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
        </label>
        <button type="button" className="botonChico" onClick={exportarPng}
          title={seleccion.size ? "Descargar solo lo seleccionado como imagen PNG" : "Descargar toda la pizarra como imagen PNG"}>
          ⬇️ Descargar {seleccion.size ? "selección" : "imagen"} (PNG)
        </button>
        <button type="button" className="botonChico" onClick={alternarCompleta} title={completa ? "Salir de pantalla completa (Esc)" : "Ideal para presentar o compartir tu pantalla (F)"}>
          {completa ? "🗗 Salir de pantalla completa" : "⛶ Pantalla completa"}
        </button>
        <button type="button" className="botonChico primary" onClick={() => setPanel(panel === "compartir" ? null : "compartir")}>👥 Compartir</button>
      </div>

      {panel === "pizarras" && (
        <div className="pzPanel" role="dialog" aria-label="Mis pizarras">
          <ul>{lista.map((p) => <li key={p.id}><button type="button" className={p.id === inicial.id ? "activa" : ""} onClick={() => { setPanel(null); if (p.id !== inicial.id) alAbrir(p.id); }}>{p.id === inicial.id ? nombre : p.nombre}<small>{new Date(p.actualizada).toLocaleString()}</small></button></li>)}</ul>
          <div className="row">
            <button type="button" className="botonChico primary" onClick={nueva}>＋ Nueva pizarra</button>
            <label className="boton botonChico">📂 Abrir archivo<input type="file" accept=".json,application/json" hidden onChange={(e) => { abrirArchivo(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <button type="button" className="botonChico danger" onClick={borrarPizarra}>Borrar esta</button>
          </div>
          <p className="small">Tus pizarras se guardan solo en este navegador. Si borras los datos del sitio o cambias de equipo, no estarán: usa «Compartir» o «PNG» para tener una copia.</p>
        </div>
      )}
      {panel === "compartir" && (
        <div className="pzPanel" role="dialog" aria-label="Compartir">
          {pago ? <>
            <strong>Compartir con un colaborador</strong>
            <p className="small">Se crea un archivo con lo que elijas (incluye sus imágenes). Tu colaborador lo abre en Flow Tools → Pizarra → Mis pizarras → Abrir archivo, y tendrá su propia copia.</p>
            <div className="row">
              <button type="button" className="botonChico primary" onClick={() => compartir(false)}>Toda la pizarra</button>
              <button type="button" className="botonChico" disabled={!seleccion.size} onClick={() => compartir(true)}>Solo la selección{seleccion.size ? ` (${seleccion.size})` : ""}</button>
            </div>
            {!seleccion.size && <p className="small">Para compartir una parte, selecciónala primero con ↖ (arrastra un recuadro).</p>}
          </> : <>
            <strong>👥 Compartir es parte de los planes de pago</strong>
            <p className="small">Con el plan <strong>Básico</strong> ({PLANES.basico.pruebaDias} días gratis la primera vez) puedes compartir tu pizarra completa o solo una parte con tus colaboradores. Mientras tanto, puedes exportarla como imagen PNG y abrir pizarras que te compartan.</p>
            <div className="row"><Link className="boton botonChico primary" to="/app/cuenta">Ver planes</Link><button type="button" className="botonChico" onClick={() => setPanel(null)}>Ahora no</button></div>
          </>}
        </div>
      )}

      <div className="pzZona" ref={contenedor} onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/")); if (f) agregarImagen(f, aPizarra(e.clientX, e.clientY)); }}>
        <div className="pzHerramientas" role="toolbar" aria-label="Herramientas">
          {HERRAMIENTAS.map((h) => (
            <button key={h.id} type="button" className={herramienta === h.id ? "activa" : ""} aria-pressed={herramienta === h.id} title={`${h.nombre} (${h.tecla})`} onClick={() => setHerramienta(h.id)}>{h.icono}</button>
          ))}
          <label className="pzBotonImagen" title="Agregar imagen (también puedes pegarla o arrastrarla)">🖼️<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) agregarImagen(f); e.target.value = ""; }} /></label>
          <span className="pzLinea" />
          <button type="button" title="Deshacer (Ctrl+Z)" onClick={deshacer}>↩️</button>
          <button type="button" title="Rehacer (Ctrl+Y)" onClick={rehacer}>↪️</button>
          {seleccion.size > 0 && <button type="button" title="Borrar selección (Supr)" onClick={() => { setElementos(elementos.filter((x) => !seleccion.has(x.id))); setSeleccion(new Set()); }}>🗑️</button>}
        </div>

        {(herramienta === "lapiz" || herramienta === "resaltador" || herramienta === "texto") && (
          <div className="pzEstilo" role="toolbar" aria-label="Color y grosor">
            {COLORES.map((c) => <button key={c} type="button" className={`pzColor ${color === c ? "activa" : ""}`} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => setColor(c)} />)}
            {herramienta !== "texto" && <><span className="pzLinea" />{GROSORES.map((g) => (
              <button key={g} type="button" className={`pzGrosor ${grosor === g ? "activa" : ""}`} aria-label={`Grosor ${g}`} onClick={() => setGrosor(g)}><span style={{ width: g + 2, height: g + 2 }} /></button>
            ))}</>}
          </div>
        )}

        <svg ref={svg} className={`pzLienzo pz-${herramienta}`} onPointerDown={abajo} onPointerMove={moverPuntero} onPointerUp={arriba} onPointerCancel={arriba}
          onContextMenu={(e) => e.preventDefault()}>
          <defs>
            <pattern id="pzPuntos" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1.3" className="pzPunto" /></pattern>
            <marker id="pzPunta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke" /></marker>
          </defs>
          <g className="pzContenido" transform={`matrix(${z} 0 0 ${z} ${-cam.x * z} ${-cam.y * z})`}>
            <rect className="pzFondo pzSoloPantalla" x={0} y={0} width={ANCHO} height={ALTO} />
            <rect className="pzSoloPantalla" x={0} y={0} width={ANCHO} height={ALTO} fill="url(#pzPuntos)" />
            {visibles.map((x) => <Dibujo key={x.id} e={x} url={x.tipo === "imagen" ? urls[x.imagen] : undefined} oculto={x.id === editando}
              desplazado={arrastre && seleccion.has(x.id) ? arrastre : null} />)}
            {enCurso && <path className="pzSoloPantalla" d={caminoSuave(enCurso)} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round"
              strokeWidth={herramienta === "resaltador" ? grosor * 4 : grosor} strokeOpacity={herramienta === "resaltador" ? 0.35 : 1} />}
            {cajaSel && <rect className="pzSeleccion pzSoloPantalla" x={cajaSel.x + 20 + (arrastre?.dx ?? 0)} y={cajaSel.y + 20 + (arrastre?.dy ?? 0)} width={cajaSel.w - 40} height={cajaSel.h - 40} strokeWidth={1.5 / z} />}
            {unicoRedimensionable && !arrastre && (() => { const c = cajaElemento(unicoRedimensionable); return <rect className="pzAsa pzSoloPantalla" x={c.x + c.w - 6 / z} y={c.y + c.h - 6 / z} width={12 / z} height={12 / z} strokeWidth={1.5 / z} />; })()}
            {marco && <rect className="pzMarco pzSoloPantalla" x={marco.x} y={marco.y} width={marco.w} height={marco.h} strokeWidth={1 / z} />}
          </g>
        </svg>

        {editado && (editado.tipo === "nota" || editado.tipo === "texto") && (
          <textarea className={`pzEditor ${editado.tipo}`} autoFocus value={editado.texto} placeholder={editado.tipo === "nota" ? "Escribe tu nota…" : "Escribe…"}
            style={{
              left: (editado.x - cam.x) * z, top: (editado.y - cam.y) * z,
              width: editado.tipo === "nota" ? editado.w * z : Math.max(160, cajaElemento(editado).w * z + 40),
              height: editado.tipo === "nota" ? editado.h * z : cajaElemento(editado).h * z + 12,
              fontSize: (editado.tipo === "nota" ? 18 : editado.tam) * z, color: editado.tipo === "texto" ? editado.color : undefined,
              background: editado.tipo === "nota" ? editado.color : undefined,
            }}
            onChange={(ev) => setElementos(elementos.map((x) => (x.id === editado.id ? { ...x, texto: ev.target.value } as Elemento : x)), false)}
            onBlur={() => {
              // Un texto vacío no queda en la pizarra.
              if (editado.tipo === "texto" && !editado.texto.trim()) setElementos(elementosRef.current.filter((x) => x.id !== editado.id), false);
              setEditando(null);
            }}
            onKeyDown={(ev) => { if (ev.key === "Escape") (ev.target as HTMLTextAreaElement).blur(); }} />
        )}

        <div className="pzZoom">
          <button type="button" aria-label="Alejar" onClick={() => zoomEn(1 / 1.25)}>−</button>
          <button type="button" className="pzZoomValor" title="Volver al 100 %" onClick={() => setCam((c) => limitar({ ...c, zoom: 1 }))}>{Math.round(z * 100)}%</button>
          <button type="button" aria-label="Acercar" onClick={() => zoomEn(1.25)}>＋</button>
          <button type="button" title="Encuadrar todo lo dibujado" aria-label="Encuadrar todo lo dibujado" onClick={() => {
            const c = cajaDeElementos(elementos);
            if (!c) return;
            const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(tam.w / c.w, tam.h / c.h) * 0.9));
            setCam(limitar({ zoom: nz, x: c.x + c.w / 2 - tam.w / nz / 2, y: c.y + c.h / 2 - tam.h / nz / 2 }));
          }}>🔍</button>
          <button type="button" className={completa ? "activa" : ""} aria-pressed={!!completa} onClick={alternarCompleta}
            title={completa ? "Salir de pantalla completa (Esc)" : "Pantalla completa (F)"} aria-label={completa ? "Salir de pantalla completa" : "Pantalla completa"}>
            {completa ? "🗗" : "⛶"}
          </button>
        </div>
        <Minimapa vista={vista} elementos={elementos} alIr={(p) => setCam((c) => limitar({ ...c, x: p.x - tam.w / c.zoom / 2, y: p.y - tam.h / c.zoom / 2 }))} />

        {aviso && <div className="pzAviso" role="status">{aviso.texto}{aviso.deshacer && <button type="button" className="enlace" onClick={deshacer}>Deshacer</button>}</div>}
      </div>
    </div>
  );
}

function descargar(b: Blob, nombre: string) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: nombre });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Corta el texto de una nota en renglones que entran en su ancho (aproximado por el ancho medio de las letras). */
function renglones(texto: string, ancho: number, tam: number): string[] {
  const max = Math.max(4, Math.floor(ancho / (tam * 0.55)));
  return texto.split("\n").flatMap((parrafo) => {
    const res: string[] = [];
    let linea = "";
    for (const palabra of parrafo.split(" ")) {
      if ((linea + " " + palabra).trim().length > max && linea) { res.push(linea); linea = palabra; } else linea = (linea + " " + palabra).trim();
    }
    res.push(linea);
    return res;
  });
}

function Dibujo({ e, url, oculto, desplazado }: { e: Elemento; url?: string; oculto: boolean; desplazado: { dx: number; dy: number } | null }) {
  const t = desplazado ? `translate(${desplazado.dx} ${desplazado.dy})` : undefined;
  const comun = { "data-id": e.id, transform: t, opacity: oculto ? 0 : undefined };
  switch (e.tipo) {
    case "trazo":
      return <path {...comun} d={caminoSuave(e.puntos)} fill="none" stroke={e.color} strokeWidth={e.grosor} strokeLinecap="round" strokeLinejoin="round"
        strokeOpacity={e.resaltador ? 0.35 : 1} style={e.resaltador ? { mixBlendMode: "multiply" } : undefined} />;
    case "forma": {
      const f = e.forma, s = { fill: "none", stroke: e.color, strokeWidth: e.grosor, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
      if (f.forma === "linea" || f.forma === "flecha") return <line {...comun} {...s} x1={f.a.x} y1={f.a.y} x2={f.b.x} y2={f.b.y} markerEnd={f.forma === "flecha" ? "url(#pzPunta)" : undefined} />;
      if (f.forma === "rect") return <rect {...comun} {...s} x={f.caja.x} y={f.caja.y} width={f.caja.w} height={f.caja.h} rx={4} />;
      if (f.forma === "elipse") return <ellipse {...comun} {...s} cx={f.caja.x + f.caja.w / 2} cy={f.caja.y + f.caja.h / 2} rx={f.caja.w / 2} ry={f.caja.h / 2} />;
      return <polygon {...comun} {...s} points={f.puntos.map((p) => `${p.x},${p.y}`).join(" ")} />;
    }
    case "glifo":
      return <text {...comun} className="pzGlifo" x={e.x} y={e.base} fontSize={e.tam} fill={e.color} textAnchor="middle">{e.c}</text>;
    case "texto":
      return <text {...comun} x={e.x} y={e.y} fontSize={e.tam} fill={e.color}>
        {e.texto.split("\n").map((l, i) => <tspan key={i} x={e.x} dy={i ? e.tam * 1.25 : e.tam}>{l || " "}</tspan>)}
      </text>;
    case "nota":
      return <g {...comun}>
        <rect x={e.x + 3} y={e.y + 5} width={e.w} height={e.h} rx={6} fill="rgba(0,0,0,.12)" />
        <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={6} fill={e.color} />
        <text x={e.x + 14} y={e.y + 10} fontSize={18} fill="#1f2328">
          {renglones(e.texto, e.w - 28, 18).slice(0, Math.max(1, Math.floor((e.h - 20) / 23))).map((l, i) => <tspan key={i} x={e.x + 14} dy={23}>{l || " "}</tspan>)}
        </text>
      </g>;
    case "imagen":
      return url ? <image {...comun} href={url} x={e.x} y={e.y} width={e.w} height={e.h} preserveAspectRatio="none" />
        : <rect {...comun} x={e.x} y={e.y} width={e.w} height={e.h} className="pzImagenCargando" />;
  }
}

/** Vista completa de la pizarra en pequeño: muestra dónde estás y lleva a otra zona con un toque. */
function Minimapa({ vista, elementos, alIr }: { vista: Caja; elementos: Elemento[]; alIr: (p: Punto) => void }) {
  const W = 160, k = W / ANCHO, H = ALTO * k;
  const cajas = useMemo(() => elementos.map(cajaElemento), [elementos]);
  return (
    <svg className="pzMinimapa" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa de la pizarra"
      onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); alIr({ x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }); }}>
      {cajas.map((c, i) => <rect key={i} x={c.x * k} y={c.y * k} width={Math.max(1, c.w * k)} height={Math.max(1, c.h * k)} className="pzMiniElemento" />)}
      <rect x={vista.x * k} y={vista.y * k} width={vista.w * k} height={vista.h * k} className="pzMiniVista" />
    </svg>
  );
}
