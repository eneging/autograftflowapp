import { useCallback, useEffect, useRef, useState } from "react";
import { DEDOS, type Dedo, type Mano } from "../../../shared/plataforma";
import { textoDedoEn, usarIdioma, usarT } from "./idioma";

/*
 * Huella (igual que el prototipo v43): consejos antes de tomar la foto, dibujo de las manos con el dedo pedido y
 * una guía ovalada donde se encaja la foto del dedo (arrastrar, pellizcar o barra de zoom, girar). La foto pasa a
 * blanco y negro y, con «optimizar», se convierte en trazo de tinta sobre fondo transparente. Solo queda lo que
 * está dentro del óvalo.
 */

export const textoDedo = (d: { mano: Mano; dedo: Dedo } | null) =>
  d ? `Huella del dedo ${DEDOS[d.dedo].toLowerCase()} de la mano ${d.mano}` : "";

/** Las dos manos vistas desde arriba, con el dedo pedido resaltado. */
export function Manos({ mano, dedo }: { mano: Mano; dedo: Dedo }) {
  const piel = "#f6dcc4", linea = "#9a6b4f", hi = "#7c3aed";
  const una = (sel: boolean) => {
    const relleno = (k: Dedo) => (sel && k === dedo ? hi : piel);
    const marca = (cx: number, cy: number) => (
      <g>
        <ellipse cx={cx} cy={cy} rx={7} ry={9} fill="#fff" opacity={0.95} />
        <ellipse cx={cx} cy={cy} rx={4.5} ry={6} fill="none" stroke={hi} strokeWidth={1.2} />
        <circle cx={cx} cy={cy} r={12} fill="none" stroke="#f59e0b" strokeWidth={3}>
          <animate attributeName="r" values="11;17;11" dur="1.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;.35;1" dur="1.4s" repeatCount="indefinite" />
        </circle>
      </g>
    );
    const dedos: [Dedo, number, number][] = [["indice", 50, 34], ["medio", 74, 22], ["anular", 98, 32], ["menique", 122, 52]];
    return (
      <g opacity={sel ? 1 : 0.5}>
        <rect x={62} y={166} width={64} height={32} rx={9} fill={piel} stroke={linea} strokeWidth={2} />
        <g transform="rotate(-30 45 160)">
          <rect x={34} y={104} width={22} height={62} rx={11} fill={relleno("pulgar")} stroke={linea} strokeWidth={2} />
          {sel && dedo === "pulgar" && marca(45, 116)}
        </g>
        {dedos.map(([k, x, y]) => <rect key={k} x={x} y={y} width={20} height={112 - y} rx={10} fill={relleno(k)} stroke={linea} strokeWidth={2} />)}
        <rect x={44} y={90} width={100} height={88} rx={30} fill={piel} stroke={linea} strokeWidth={2} />
        {dedos.map(([k, x, y]) => (
          <g key={k}>
            <rect x={x} y={y} width={20} height={100 - y} rx={10} fill={relleno(k)} stroke={linea} strokeWidth={2} />
            {sel && dedo === k && marca(x + 10, y + 12)}
          </g>
        ))}
      </g>
    );
  };
  const t = usarT(), idioma = usarIdioma();
  const izq = mano === "izquierda";
  const rotulo = (x: number, t: string, sel: boolean) => (
    <text x={x} y={218} textAnchor="middle" fontFamily="system-ui, Arial, sans-serif" fontSize={13} fontWeight={sel ? 800 : 500} fill={sel ? hi : "#6b7280"}>{t}{sel ? " ✓" : ""}</text>
  );
  return (
    <svg viewBox="0 0 360 226" role="img" aria-label={textoDedoEn(idioma, { mano, dedo })} className="manosSvg">
      <g transform="translate(170,0) scale(-1,1)">{una(izq)}</g>
      <g transform="translate(190,0)">{una(!izq)}</g>
      {rotulo(85, t("Mano izquierda"), izq)}
      {rotulo(275, t("Mano derecha"), !izq)}
    </svg>
  );
}

/** Ventana de consejos antes de subir o fotografiar la huella. */
export function ConsejosHuella({ dedo, alEmpezar }: { dedo: { mano: Mano; dedo: Dedo } | null; alEmpezar: () => void }) {
  const [ejemplo, setEjemplo] = useState(false);
  const t = usarT(), idioma = usarIdioma();
  return (
    <div className="fpFitModal">
      <div className="fpFitCard fpTipsCard" role="dialog" aria-modal="true" aria-label={t("Antes de poner tu huella")}>
        <h2>{t("📸 Antes de poner tu huella")}</h2>
        <ol>
          <li>
            {t("Toma una foto")} <b>{t("(en modo macro)")}</b> {t("de la huella dactilar que te solicitaron.")}{dedo && <b> ({textoDedoEn(idioma, dedo)})</b>}
            {dedo && (
              <div className="fpTipsEx">
                <button type="button" onClick={() => setEjemplo(!ejemplo)}>{t(ejemplo ? "Ocultar ejemplo" : "👀 Ver un ejemplo")}</button>
                {ejemplo && <div className="fpTipsHands"><Manos {...dedo} /><p>{textoDedoEn(idioma, dedo)}</p></div>}
              </div>
            )}
          </li>
          <li>{t("Vuelve aquí y sube la foto desde tu galería con")} <b>{t("«🖼️ Subir huella»")}</b>.</li>
        </ol>
        <div className="fpTipsNote">{t("💡 También puedes usar")} <b>{t("«📷 Fotografiar huella»")}</b>{t(", pero quizá la cámara no use el modo macro. Si no sabes cómo encontrarlo, toma la foto de cerca, con buena luz y enfocando bien la yema del dedo.")}</div>
        <div className="fpFitActions"><button type="button" className="primary" onClick={alEmpezar}>{t("Empezar")}</button></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- procesamiento de la foto

const OVALO = 1.3; // alto / ancho de la guía

export const cargarImagen = (archivo: File) => new Promise<HTMLImageElement>((ok, mal) => {
  const url = URL.createObjectURL(archivo), i = new Image();
  i.onload = () => { URL.revokeObjectURL(url); ok(i); };
  i.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo abrir la imagen.")); };
  i.src = url;
});

/** Blanco y negro con un estirado suave del contraste (ignora el 1 % más claro y más oscuro). Máximo 1800 px por lado. */
function enGris(im: HTMLImageElement | HTMLCanvasElement) {
  const w0 = im instanceof HTMLImageElement ? im.naturalWidth : im.width, h0 = im instanceof HTMLImageElement ? im.naturalHeight : im.height;
  const k = Math.min(1, 1800 / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(im, 0, 0, w, h);
  const img = x.getImageData(0, 0, w, h), d = img.data, n = w * h, hist = new Uint32Array(256), g = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const v = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]); g[i] = v; hist[v]++; }
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.01) { hi = v; break; } }
  const rango = Math.max(40, hi - lo);
  for (let i = 0; i < n; i++) { const v = Math.max(0, Math.min(255, Math.round(((g[i] - lo) * 255) / rango))); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  return c;
}

export function girar(src: HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = src.height; c.height = src.width;
  const x = c.getContext("2d")!;
  x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(src, 0, 0);
  return c;
}

/**
 * «Optimizar»: la huella como si fuera de tinta. Cada punto se compara con su entorno (contraste local), así las
 * líneas del dedo resaltan aunque la luz sea desigual. pol = 1: lo claro de la foto (las crestas iluminadas) pasa a
 * trazo oscuro; -1, al revés. nivel 1 a 5: intensidad. Fondo transparente.
 */
function enTinta(src: HTMLCanvasElement, pol: number, nivel: number) {
  const w = src.width, h = src.height, dat = src.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const bl = new Float32Array(w * h), W1 = w + 1, I = new Float64Array(W1 * (h + 1)), I2 = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; s += dat[(yy * w + xx) * 4]; n++; } }
      bl[y * w + x] = s / n;
    }
  for (let y = 0; y < h; y++) {
    let s = 0, s2 = 0;
    for (let x = 0; x < w; x++) { const v = bl[y * w + x]; s += v; s2 += v * v; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + s; I2[(y + 1) * W1 + x + 1] = I2[y * W1 + x + 1] + s2; }
  }
  const r = Math.max(3, Math.round(Math.min(w, h) / 110)), t = 0.4 - nivel * 0.14, k = 1.8;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const cx = c.getContext("2d")!, img = cx.createImageData(w, h), o = img.data;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r), n = (x1 - x0 + 1) * (y1 - y0 + 1);
      const a = (y1 + 1) * W1 + x1 + 1, b = y0 * W1 + x1 + 1, cc = (y1 + 1) * W1 + x0, dd = y0 * W1 + x0;
      const m = (I[a] - I[b] - I[cc] + I[dd]) / n, sd = Math.sqrt(Math.max(0, (I2[a] - I2[b] - I2[cc] + I2[dd]) / n - m * m));
      const z = (pol * (bl[y * w + x] - m)) / (sd + 6), i = (y * w + x) * 4;
      o[i] = 22; o[i + 1] = 22; o[i + 2] = 28; o[i + 3] = Math.max(0, Math.min(255, Math.round((z - t) * k * 255)));
    }
  }
  cx.putImageData(img, 0, 0);
  return c;
}

interface Estado { gris: HTMLCanvasElement; tinta: HTMLCanvasElement | null; pol: number; nivel: number; optimizar: boolean }

/**
 * Encaja la foto del dedo en el óvalo y devuelve un PNG (solo el óvalo, fondo transparente).
 * deDni: la huella sale del reverso del DNI, que ya está impresa: no se optimiza como tinta (se conservan sus tonos).
 */
export function EncajarHuella({ archivo, alUsar, alCancelar, deDni = false }: { archivo: File; alUsar: (png: string) => void; alCancelar: () => void; deDni?: boolean }) {
  const t = usarT();
  const lienzo = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [e, setE] = useState<Estado | null>(null);
  const [error, setError] = useState("");
  // ang: giro fino en grados (el botón «↻ Girar» gira la foto 90°).
  const vista = useRef({ zoom: 1, tx: 0, ty: 0, ang: 0, W: 320, H: 400, dpr: 1 });
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const pellizco = useRef<{ d: number; z: number; mx?: number; my?: number } | null>(null);
  const [zoom, setZoomUI] = useState(1);
  const [angulo, setAnguloUI] = useState(0);

  useEffect(() => {
    cargarImagen(archivo).then((im) => { const gris = enGris(im); setE({ gris, tinta: deDni ? null : enTinta(gris, 1, 3), pol: 1, nivel: 3, optimizar: !deDni }); })
      .catch((x) => setError(x.message));
  }, [archivo, deDni]);

  const geom = () => { const { W, H } = vista.current, ow = Math.round(W * 0.6), oh = Math.round(ow * OVALO); return { W, H, ow, oh, ox: (W - ow) / 2, oy: (H - oh) / 2 }; };
  const fuente = (s: Estado) => (s.optimizar && s.tinta ? s.tinta : s.gris);
  const base = (s: Estado) => { const g = geom(), f = s.gris; return Math.max(g.ow / f.width, g.oh / f.height); };
  const pintar = (ctx: CanvasRenderingContext2D, s: Estado) => {
    const g = geom(), f = fuente(s), k = base(s) * vista.current.zoom;
    ctx.save(); ctx.translate(g.W / 2 + vista.current.tx, g.H / 2 + vista.current.ty); ctx.rotate((vista.current.ang * Math.PI) / 180); ctx.scale(k, k);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(f, -f.width / 2, -f.height / 2); ctx.restore();
  };
  const dibujar = useCallback(() => {
    const c = lienzo.current;
    if (!c || !e) return;
    const ctx = c.getContext("2d")!, g = geom();
    ctx.setTransform(vista.current.dpr, 0, 0, vista.current.dpr, 0, 0);
    ctx.clearRect(0, 0, g.W, g.H);
    ctx.fillStyle = e.optimizar ? "#fff" : "#111"; ctx.fillRect(0, 0, g.W, g.H);
    pintar(ctx, e);
    // Afuera del óvalo se oscurece: es lo que se eliminará.
    ctx.beginPath(); ctx.rect(0, 0, g.W, g.H); ctx.ellipse(g.W / 2, g.H / 2, g.ow / 2, g.oh / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8,10,18,.72)"; ctx.fill("evenodd");
    ctx.beginPath(); ctx.ellipse(g.W / 2, g.H / 2, g.ow / 2, g.oh / 2, 0, 0, Math.PI * 2);
    ctx.setLineDash([7, 6]); ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.setLineDash([]);
  }, [e]);

  useEffect(() => {
    const ajustar = () => {
      const c = lienzo.current, st = caja.current;
      if (!c || !st) return;
      const W = Math.max(220, Math.min(440, Math.floor(st.clientWidth || 320))), H = Math.min(Math.round(W * 1.25), Math.max(260, Math.floor(innerHeight * 0.55)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      Object.assign(vista.current, { W, H, dpr });
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = `${W}px`; c.style.height = `${H}px`;
      dibujar();
    };
    ajustar();
    addEventListener("resize", ajustar);
    return () => removeEventListener("resize", ajustar);
  }, [dibujar]);

  const fijarZoom = (z: number, cx?: number, cy?: number) => {
    const v = vista.current, viejo = v.zoom;
    z = Math.max(1, Math.min(8, z));
    if (cx !== undefined && cy !== undefined) { const g = geom(), px = cx - g.W / 2, py = cy - g.H / 2; v.tx = px - ((px - v.tx) * z) / viejo; v.ty = py - ((py - v.ty) * z) / viejo; }
    v.zoom = z; setZoomUI(z); dibujar();
  };
  const local = (ev: { clientX: number; clientY: number }) => { const r = lienzo.current!.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };

  function resultado() {
    const g = geom(), ancho = 420, f = ancho / g.ow, c = document.createElement("canvas");
    c.width = ancho; c.height = Math.round(ancho * OVALO);
    const x = c.getContext("2d")!;
    x.beginPath(); x.ellipse(c.width / 2, c.height / 2, c.width / 2 - 1, c.height / 2 - 1, 0, 0, Math.PI * 2); x.clip();
    x.setTransform(f, 0, 0, f, -g.ox * f, -g.oy * f);
    pintar(x, e!);
    if (e!.optimizar) {
      // Borde difuminado para que la huella no termine en un corte.
      x.setTransform(1, 0, 0, OVALO, 0, 0);
      const cx = c.width / 2, cy = c.height / 2 / OVALO, rad = c.width / 2, gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.8, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      x.globalCompositeOperation = "destination-in"; x.fillStyle = gr; x.fillRect(0, 0, c.width, c.height / OVALO);
    }
    return c.toDataURL("image/png");
  }
  const cambiar = (cambio: Partial<Estado>) => setE((s) => {
    if (!s) return s;
    const n = { ...s, ...cambio };
    if (cambio.gris || cambio.pol !== undefined || cambio.nivel !== undefined || (cambio.optimizar && !n.tinta)) n.tinta = enTinta(n.gris, n.pol, n.nivel);
    return n;
  });
  const fijarAngulo = (a: number) => { vista.current.ang = a; setAnguloUI(a); dibujar(); };

  return (
    <div className="fpFitModal">
      <div className="fpFitCard" role="dialog" aria-modal="true" aria-label={t("Encaja tu dedo en el óvalo")}>
        <h2>{t(deDni ? "Ajusta el área de la huella del DNI" : "Encaja tu dedo en el óvalo")}</h2>
        <p>{t(deDni
          ? "Mueve y amplía la foto del reverso hasta que la huella impresa llene el óvalo. Puedes pellizcar para ampliar, arrastrar para centrar y girar poco a poco. Solo se usará lo que quede dentro."
          : "Arrastra la foto y acércala (pellizca con dos dedos o usa la barra) hasta que la yema llene el óvalo. Solo se usará lo que quede dentro.")}</p>
        {error ? <div className="afAlerta">{t(error)}</div> : !e ? <p id="loading">{t("Procesando la foto…")}</p> : null}
        <div ref={caja} className="fpFitStage">
          <canvas
            ref={lienzo} className="fpFitCanvas"
            onPointerDown={(ev) => {
              ev.preventDefault(); lienzo.current!.setPointerCapture(ev.pointerId); dedos.current.set(ev.pointerId, local(ev));
              if (dedos.current.size === 2) { const [a, b] = [...dedos.current.values()]; pellizco.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: vista.current.zoom }; }
            }}
            onPointerMove={(ev) => {
              if (!dedos.current.has(ev.pointerId)) return;
              const antes = dedos.current.get(ev.pointerId)!, ahora = local(ev);
              dedos.current.set(ev.pointerId, ahora);
              if (dedos.current.size === 1) { vista.current.tx += ahora.x - antes.x; vista.current.ty += ahora.y - antes.y; dibujar(); return; }
              const pz = pellizco.current;
              if (dedos.current.size === 2 && pz) {
                const [a, b] = [...dedos.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                if (pz.d > 4) fijarZoom((pz.z * d) / pz.d, mx, my);
                if (pz.mx !== undefined && pz.my !== undefined) { vista.current.tx += mx - pz.mx; vista.current.ty += my - pz.my; dibujar(); }
                pz.mx = mx; pz.my = my;
              }
            }}
            onPointerUp={(ev) => { dedos.current.delete(ev.pointerId); if (dedos.current.size < 2) pellizco.current = null; }}
            onPointerCancel={(ev) => { dedos.current.delete(ev.pointerId); if (dedos.current.size < 2) pellizco.current = null; }}
            onWheel={(ev) => { const p = local(ev); fijarZoom(vista.current.zoom * Math.exp(-ev.deltaY * 0.0015), p.x, p.y); }}
          />
        </div>
        <div className="fpFitZoomRow"><span>🔍−</span><input type="range" min={1} max={8} step={0.01} value={zoom} aria-label="Zoom" onChange={(ev) => { const g = geom(); fijarZoom(Number(ev.target.value), g.W / 2, g.H / 2); }} /><span>🔍+</span></div>
        <div className="fpFitZoomRow"><span>{t("Giro fino")}</span><input type="range" min={-15} max={15} step={0.25} value={angulo} aria-label={t("Giro fino de la huella, en grados")} onChange={(ev) => fijarAngulo(Number(ev.target.value))} /><output>{angulo}°</output></div>
        {e && (
          <div className="fpFitOptRow">
            <label className="checkrow compacto"><input type="checkbox" checked={e.optimizar} onChange={(ev) => cambiar({ optimizar: ev.target.checked })} /><strong>{t("Optimizar como tinta")}</strong></label>
            {e.optimizar && <>
              <label>{t("Intensidad")} <input type="range" min={1} max={5} step={1} value={e.nivel} onChange={(ev) => cambiar({ nivel: Number(ev.target.value) })} /></label>
              <button type="button" title={t("Úsalo si las líneas del dedo salen al revés")} onClick={() => cambiar({ pol: -e.pol })}>{t("⇄ Invertir")}</button>
            </>}
          </div>
        )}
        <div className="fpFitActions">
          <button type="button" onClick={alCancelar}>{t("Cancelar")}</button>
          <button type="button" disabled={!e} onClick={() => { vista.current = { ...vista.current, zoom: 1, tx: 0, ty: 0, ang: 0 }; setZoomUI(1); setAnguloUI(0); cambiar({ gris: girar(e!.gris) }); }}>{t("↻ Girar 90°")}</button>
          <button type="button" className="primary" disabled={!e} onClick={() => alUsar(resultado())}>{t("✓ Usar huella")}</button>
        </div>
      </div>
    </div>
  );
}
