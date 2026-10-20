import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Encuadre de la foto del DNI (prototipo v43, «Requerir firma y huella capturando DNI»): un marco con la proporción
 * de la tarjeta (85,6 × 54 mm); la foto se arrastra, se acerca (barra, rueda o pellizco) y se gira 90°. Devuelve
 * solo lo que queda dentro del marco, en JPG, para la hoja de evidencias del PDF.
 */

const PROPORCION = 1.586; // ancho / alto de la tarjeta
const SALIDA = 1200; // ancho en píxeles de la foto que se guarda

const cargar = (archivo: File) => new Promise<HTMLCanvasElement>((ok, mal) => {
  const url = URL.createObjectURL(archivo), i = new Image();
  i.onload = () => {
    URL.revokeObjectURL(url);
    // Se reduce a 2400 px por lado: las fotos del celular pesan mucho y no hace falta más.
    const k = Math.min(1, 2400 / Math.max(i.naturalWidth, i.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(i.naturalWidth * k));
    c.height = Math.max(1, Math.round(i.naturalHeight * k));
    c.getContext("2d")!.drawImage(i, 0, 0, c.width, c.height);
    ok(c);
  };
  i.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo abrir la foto.")); };
  i.src = url;
});

function girar(src: HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = src.height; c.height = src.width;
  const x = c.getContext("2d")!;
  x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(src, 0, 0);
  return c;
}

/** Ventana para encuadrar el frente o el reverso del DNI. */
export function EncuadrarDni({ archivo, lado, alUsar, alCancelar }: { archivo: File; lado: "frente" | "reverso"; alUsar: (jpg: string) => void; alCancelar: () => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [foto, setFoto] = useState<HTMLCanvasElement | null>(null);
  const [error, setError] = useState("");
  const vista = useRef({ zoom: 1, tx: 0, ty: 0, W: 360, H: 300, dpr: 1 });
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const pellizco = useRef<{ d: number; z: number } | null>(null);
  const [zoom, setZoomUI] = useState(1);

  useEffect(() => { cargar(archivo).then(setFoto).catch((x) => setError(x.message)); }, [archivo]);

  const marco = () => { const { W, H } = vista.current, w = Math.min(W * 0.92, H * 0.92 * PROPORCION), h = w / PROPORCION; return { x: (W - w) / 2, y: (H - h) / 2, w, h }; };
  // Con zoom 1 la foto cubre justo el marco.
  const escala = (f: HTMLCanvasElement) => { const m = marco(); return Math.max(m.w / f.width, m.h / f.height) * vista.current.zoom; };
  const pintar = (ctx: CanvasRenderingContext2D, f: HTMLCanvasElement) => {
    const { W, H, tx, ty } = vista.current, k = escala(f);
    ctx.save(); ctx.translate(W / 2 + tx, H / 2 + ty); ctx.scale(k, k);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(f, -f.width / 2, -f.height / 2); ctx.restore();
  };
  // La foto no puede dejar huecos dentro del marco.
  const limitar = (f: HTMLCanvasElement) => {
    const v = vista.current, m = marco(), k = escala(f), sx = Math.max(0, (f.width * k - m.w) / 2), sy = Math.max(0, (f.height * k - m.h) / 2);
    v.tx = Math.max(-sx, Math.min(sx, v.tx)); v.ty = Math.max(-sy, Math.min(sy, v.ty));
  };
  const dibujar = useCallback(() => {
    const c = lienzo.current;
    if (!c || !foto) return;
    const ctx = c.getContext("2d")!, { W, H, dpr } = vista.current, m = marco();
    limitar(foto);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#111"; ctx.fillRect(0, 0, W, H);
    pintar(ctx, foto);
    ctx.fillStyle = "rgba(8,10,18,.6)";
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(m.x, m.y, m.w, m.h); ctx.fill("evenodd");
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.strokeRect(m.x, m.y, m.w, m.h);
    // Guía de tercios para enderezar la tarjeta.
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.beginPath();
    for (const t of [1 / 3, 2 / 3]) { ctx.moveTo(m.x + m.w * t, m.y); ctx.lineTo(m.x + m.w * t, m.y + m.h); }
    ctx.moveTo(m.x, m.y + m.h / 2); ctx.lineTo(m.x + m.w, m.y + m.h / 2); ctx.stroke();
  }, [foto]);

  useEffect(() => {
    const ajustar = () => {
      const c = lienzo.current, st = caja.current;
      if (!c || !st) return;
      const W = Math.max(260, Math.min(560, Math.floor(st.clientWidth || 360))), H = Math.round(W * 0.78), dpr = Math.min(2, window.devicePixelRatio || 1);
      Object.assign(vista.current, { W, H, dpr });
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = `${W}px`; c.style.height = `${H}px`;
      dibujar();
    };
    ajustar();
    addEventListener("resize", ajustar);
    return () => removeEventListener("resize", ajustar);
  }, [dibujar]);

  const fijarZoom = (z: number) => { vista.current.zoom = Math.max(1, Math.min(5, z)); setZoomUI(vista.current.zoom); dibujar(); };
  const local = (ev: { clientX: number; clientY: number }) => { const r = lienzo.current!.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };

  function resultado() {
    const m = marco(), f = SALIDA / m.w, c = document.createElement("canvas");
    c.width = SALIDA; c.height = Math.round(SALIDA / PROPORCION);
    const x = c.getContext("2d")!;
    x.setTransform(f, 0, 0, f, -m.x * f, -m.y * f);
    pintar(x, foto!);
    return c.toDataURL("image/jpeg", 0.85);
  }

  return (
    <div className="fpFitModal">
      <div className="fpFitCard dniCard" role="dialog" aria-modal="true" aria-label={`Encuadra el ${lado} del DNI`}>
        <h2>Encuadra el {lado} del DNI</h2>
        <p>Acerca y arrastra la foto hasta que la tarjeta completa llene el marco. Si salió de lado, gírala.</p>
        {error ? <div className="afAlerta">{error}</div> : !foto ? <p id="loading">Procesando la foto…</p> : null}
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
              if (dedos.current.size === 2 && pz && pz.d > 4) { const [a, b] = [...dedos.current.values()]; fijarZoom((pz.z * Math.hypot(a.x - b.x, a.y - b.y)) / pz.d); }
            }}
            onPointerUp={(ev) => { dedos.current.delete(ev.pointerId); if (dedos.current.size < 2) pellizco.current = null; }}
            onPointerCancel={(ev) => { dedos.current.delete(ev.pointerId); if (dedos.current.size < 2) pellizco.current = null; }}
            onWheel={(ev) => fijarZoom(vista.current.zoom * Math.exp(-ev.deltaY * 0.0015))}
          />
        </div>
        <div className="fpFitZoomRow"><span>🔍−</span><input type="range" min={1} max={5} step={0.01} value={zoom} aria-label="Zoom" onChange={(ev) => fijarZoom(Number(ev.target.value))} /><span>🔍+</span></div>
        <div className="fpFitActions">
          <button type="button" onClick={alCancelar}>Cancelar</button>
          <button type="button" disabled={!foto} onClick={() => { Object.assign(vista.current, { zoom: 1, tx: 0, ty: 0 }); setZoomUI(1); setFoto(girar(foto!)); }}>↻ Girar 90°</button>
          <button type="button" className="primary" disabled={!foto} onClick={() => alUsar(resultado())}>✓ Usar foto del DNI</button>
        </div>
      </div>
    </div>
  );
}
