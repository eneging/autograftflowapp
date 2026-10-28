import { useEffect, useRef, useState, type PointerEvent as EventoPuntero, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  aBlobUrl, cargarImagen, componerCarnet, detectarBordes, detectarTexto, distancia, enderezar, esToda, lienzo, FILTROS, TODA,
  type Esquinas, type Filtro,
} from "./escaner";
import "./escaner.css";

/** Lo que entrega la cámara: la foto tal cual y la hoja ya enderezada. */
export interface Captura { original: string; url: string; esquinas: Esquinas; carnet?: boolean }

type Modo = "documento" | "carnet";

/** Mientras está abierta, la página de atrás no se desplaza y Esc la cierra. */
function usarPantallaCompleta(alSalir: () => void) {
  const salir = useRef(alSalir);
  salir.current = alSalir;
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") salir.current(); };
    window.addEventListener("keydown", tecla);
    return () => { document.body.style.overflow = antes; window.removeEventListener("keydown", tecla); };
  }, []);
}

/**
 * Cámara a pantalla completa: busca la hoja en vivo y la marca; al disparar (o sola, con «Automática») la recorta y la
 * endereza. En modo carnet toma el anverso y el reverso y los junta en una página.
 * «unaFoto» (EX-Trae): sin modos ni pila de páginas; quien la abre la cierra al recibir la captura.
 */
export function CamaraEscaner({ paginas = 0, ultima, alCapturar, alGaleria, alTerminar, unaFoto = false }: {
  paginas?: number; ultima?: string; alCapturar: (c: Captura) => void; alGaleria: (f: File[]) => void; alTerminar: () => void; unaFoto?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const sistema = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [lista, setLista] = useState(false);
  const [error, setError] = useState("");
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [modo, setModo] = useState<Modo>("documento");
  const [auto, setAuto] = useState(!unaFoto); // EX-Trae: manual por defecto
  const [hayLinterna, setHayLinterna] = useState(false);
  const [linterna, setLinterna] = useState(false);
  const [deteccion, setDeteccion] = useState<Esquinas | null>(null);
  const [destello, setDestello] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [frente, setFrente] = useState<HTMLCanvasElement | null>(null);
  usarPantallaCompleta(alTerminar);

  // Estado de la detección entre vueltas: cuántas seguidas quieta y si hay que esperar a que cambie la hoja.
  const ocupado = useRef(false);
  const anterior = useRef<Esquinas | null>(null);
  const quietas = useRef(0);
  const espera = useRef<Esquinas | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(window.isSecureContext ? "Este navegador no permite usar la cámara desde la página." : "La cámara solo se puede usar en una conexión segura (https).");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
        if (cancelado) { s.getTracks().forEach((t) => t.stop()); return; }
        flujo.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => {});
        const capacidades = s.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
        setHayLinterna(!!capacidades?.torch);
        setLista(true);
      } catch (e) {
        const n = (e as DOMException)?.name;
        setError(n === "NotAllowedError" ? "No hay permiso para usar la cámara. Actívalo en los permisos del sitio (el candado junto a la dirección) o usa la cámara del sistema."
          : n === "NotFoundError" || n === "OverconstrainedError" ? "No encontramos una cámara en este dispositivo."
          : n === "NotReadableError" ? "Otra aplicación está usando la cámara. Ciérrala e inténtalo de nuevo."
          : "No se pudo abrir la cámara.");
      }
    })();
    return () => { cancelado = true; flujo.current?.getTracks().forEach((t) => t.stop()); flujo.current = null; };
  }, []);

  async function disparar() {
    const v = video.current;
    if (!v?.videoWidth || ocupado.current) return;
    ocupado.current = true;
    setOcupada(true);
    setDestello(true);
    setTimeout(() => setDestello(false), 220);
    try {
      const foto = lienzo(v.videoWidth, v.videoHeight);
      foto.getContext("2d")!.drawImage(v, 0, 0);
      // EX-Trae lee la foto completa: recortar a una «hoja» puede dejar fuera el texto (p. ej. si toma una pared clara).
      const esquinas = unaFoto ? TODA : detectarBordes(foto, foto.width, foto.height) ?? TODA;
      // La automática no vuelve a disparar hasta que cambie la hoja (o, en EX-Trae, el texto a la vista).
      espera.current = unaFoto ? anterior.current ?? esquinas : esquinas;
      quietas.current = 0;
      const hoja = enderezar(foto, esquinas);
      if (modo === "carnet") {
        if (!frente) { setFrente(hoja); return; }
        const url = await aBlobUrl(componerCarnet([frente, hoja]));
        setFrente(null);
        alCapturar({ original: url, url, esquinas: TODA, carnet: true });
        return;
      }
      const original = await aBlobUrl(foto, 0.92);
      alCapturar({ original, url: esToda(esquinas) ? original : await aBlobUrl(hoja), esquinas });
    } finally {
      ocupado.current = false;
      setOcupada(false);
    }
  }
  const dispararAhora = useRef(disparar);
  dispararAhora.current = disparar;
  const automatica = useRef(auto);
  automatica.current = auto;

  // Busca la hoja unas 4 veces por segundo; con «Automática», dispara cuando lleva ~1 s quieta.
  useEffect(() => {
    if (!lista) return;
    const t = setInterval(() => {
      const v = video.current;
      if (!v?.videoWidth || ocupado.current) return;
      // EX-Trae busca texto (renglones); el escáner, los bordes de la hoja.
      const d = (unaFoto ? detectarTexto : detectarBordes)(v, v.videoWidth, v.videoHeight);
      const prev = anterior.current;
      anterior.current = d;
      quietas.current = d && prev && distancia(d, prev) < (unaFoto ? 0.04 : 0.015) ? quietas.current + 1 : 0;
      if (espera.current && (!d || distancia(d, espera.current) > 0.08)) espera.current = null;
      setDeteccion((antes) => (d && antes ? d.map((p, i) => ({ x: antes[i].x * 0.4 + p.x * 0.6, y: antes[i].y * 0.4 + p.y * 0.6 })) as Esquinas : d));
      if (automatica.current && d && quietas.current >= 4 && !espera.current) dispararAhora.current();
    }, 240);
    return () => clearInterval(t);
  }, [lista]);

  async function alternarLinterna() {
    const pista = flujo.current?.getVideoTracks()[0];
    if (!pista) return;
    try {
      await pista.applyConstraints({ advanced: [{ torch: !linterna } as unknown as MediaTrackConstraintSet] });
      setLinterna(!linterna);
    } catch { setHayLinterna(false); }
  }

  const cambiarModo = (m: Modo) => { setModo(m); setFrente(null); espera.current = null; };
  const pista = !lista ? (error ? "" : "Abriendo la cámara…")
    : ocupada ? "Procesando…"
    : modo === "carnet" ? (frente ? "✓ Anverso listo. Voltea el carnet y toma el reverso" : "Toma el anverso del carnet")
    : deteccion ? (auto ? "Mantén quieto: se tomará solo" : unaFoto ? "Texto a la vista: toma la foto" : "Documento detectado")
    : unaFoto ? "Acerca la cámara al texto y enfócalo"
    : "Buscando el documento…";
  const archivos = (ref: RefObject<HTMLInputElement | null>, capture?: boolean) => (
    <input ref={ref} type="file" accept="image/*" multiple={!capture && !unaFoto} capture={capture ? "environment" : undefined} hidden
      onChange={(ev) => { alGaleria([...(ev.target.files ?? [])]); ev.target.value = ""; }} />
  );

  return createPortal(
    <div className="esPantalla" role="dialog" aria-modal="true" aria-label="Escanear con la cámara">
      <div className="esArriba">
        <button type="button" className="esIcono" onClick={alTerminar} aria-label="Cerrar la cámara">✕</button>
        {lista && <button type="button" className={`esChip ${auto ? "activo" : ""}`} aria-pressed={auto} onClick={() => setAuto(!auto)}>
          {auto ? (unaFoto ? "⚡ Automática al ver texto" : "⚡ Captura automática") : "✋ Captura manual"}
        </button>}
        {hayLinterna
          ? <button type="button" className={`esIcono ${linterna ? "activo" : ""}`} aria-pressed={linterna} onClick={alternarLinterna} aria-label="Linterna">🔦</button>
          : <span className="esIcono" aria-hidden />}
      </div>

      <div className="esEscena">
        <video ref={video} playsInline muted autoPlay onLoadedMetadata={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
          onResize={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} />
        {dims && deteccion && <svg className="esCapa" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
          <polygon className={`esMarco ${unaFoto ? "texto" : ""}`} points={deteccion.map((p) => `${p.x * dims.w},${p.y * dims.h}`).join(" ")} />
        </svg>}
        {pista && <div className="esPista" role="status">{pista}</div>}
        {destello && <div className="esDestello" aria-hidden />}
        {error && <div className="esError" role="alert">
          <span aria-hidden>📷</span>
          <p>{error}</p>
          <div className="esErrorBotones">
            <button type="button" className="primary" onClick={() => sistema.current?.click()}>Usar la cámara del sistema</button>
            <button type="button" onClick={() => galeria.current?.click()}>Elegir imágenes</button>
          </div>
        </div>}
      </div>

      {unaFoto
        ? <div className="esModos" aria-hidden />
        : <div className="esModos" role="tablist" aria-label="Qué vas a escanear">
          <button type="button" role="tab" aria-selected={modo === "documento"} className={modo === "documento" ? "activo" : ""} onClick={() => cambiarModo("documento")}>Documento</button>
          <button type="button" role="tab" aria-selected={modo === "carnet"} className={modo === "carnet" ? "activo" : ""} onClick={() => cambiarModo("carnet")}>Carnet de identidad</button>
        </div>}

      <div className="esControles">
        <button type="button" className="esIcono grande" onClick={() => galeria.current?.click()} aria-label={unaFoto ? "Elegir una imagen de la galería" : "Elegir imágenes de la galería"}>🖼️</button>
        <button type="button" className={`esDisparador ${ocupada ? "ocupado" : ""}`} disabled={!lista || ocupada} onClick={disparar} aria-label="Tomar foto" />
        {unaFoto
          ? <span className="esIcono grande" aria-hidden />
          : <button type="button" className="esPila" disabled={!paginas} onClick={alTerminar} aria-label={paginas ? `Revisar ${paginas} página${paginas === 1 ? "" : "s"}` : "Aún no hay páginas"}>
            {ultima ? <img src={ultima} alt="" /> : <span className="esPilaVacia" />}
            {paginas > 0 && <span className="esPilaNumero">{paginas}</span>}
          </button>}
      </div>
      {archivos(galeria)}
      {archivos(sistema, true)}
    </div>,
    document.body,
  );
}

/** Ajustar las esquinas de la hoja (arrastrando cada una) y elegir el filtro de la página. */
export function EditorPagina({ original, esquinas, filtro, carnet, alAplicar, alCancelar }: {
  original: string; esquinas: Esquinas; filtro: Filtro; carnet?: boolean;
  alAplicar: (esquinas: Esquinas, filtro: Filtro) => void; alCancelar: () => void;
}) {
  const capa = useRef<SVGSVGElement>(null);
  const [esq, setEsq] = useState<Esquinas>(esquinas);
  const [filt, setFilt] = useState<Filtro>(filtro);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [aviso, setAviso] = useState("");
  const arrastre = useRef<number | null>(null);
  usarPantallaCompleta(alCancelar);

  function mover(ev: EventoPuntero<SVGSVGElement>) {
    const i = arrastre.current, svg = capa.current;
    if (i === null || !svg || !dims) return;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const x = Math.min(1, Math.max(0, p.x / dims.w)), y = Math.min(1, Math.max(0, p.y / dims.h));
    setEsq((e) => e.map((q, k) => (k === i ? { x, y } : q)) as Esquinas);
  }
  async function detectar() {
    const img = await cargarImagen(original);
    const d = detectarBordes(img, img.naturalWidth, img.naturalHeight);
    if (d) { setEsq(d); setAviso(""); } else setAviso("No encontramos la hoja: arrastra las esquinas a mano.");
  }
  const r = dims ? Math.max(dims.w, dims.h) * 0.022 : 0;
  const puntos = dims ? esq.map((p) => `${p.x * dims.w},${p.y * dims.h}`).join(" ") : "";

  return createPortal(
    <div className="esPantalla esEditor" role="dialog" aria-modal="true" aria-label="Editar página">
      <div className="esArriba">
        <button type="button" className="esIcono" onClick={alCancelar} aria-label="Cancelar">✕</button>
        <strong>{carnet ? "Filtro de la página" : "Recortar y filtro"}</strong>
        <span className="esIcono" aria-hidden />
      </div>
      <div className="esEscena">
        <img src={original} alt="Página para recortar" draggable={false} onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        {dims && !carnet && <svg ref={capa} className="esCapa editable" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet"
          onPointerMove={mover} onPointerUp={() => (arrastre.current = null)} onPointerCancel={() => (arrastre.current = null)}>
          <path className="esFuera" fillRule="evenodd" d={`M0 0H${dims.w}V${dims.h}H0Z M${puntos.replace(/ /g, " L")}Z`} />
          <polygon className="esMarco" points={puntos} />
          {esq.map((p, i) => (
            <g key={i} onPointerDown={(ev) => { ev.preventDefault(); arrastre.current = i; capa.current?.setPointerCapture(ev.pointerId); }}>
              <circle cx={p.x * dims.w} cy={p.y * dims.h} r={r * 2.2} className="esAsaZona" />
              <circle cx={p.x * dims.w} cy={p.y * dims.h} r={r} className="esAsa" />
            </g>
          ))}
        </svg>}
        {aviso && <div className="esPista" role="status">{aviso}</div>}
      </div>
      {!carnet && <div className="esHerramientas">
        <button type="button" onClick={detectar}>🔍 Detectar bordes</button>
        <button type="button" onClick={() => setEsq(TODA)}>⛶ Toda la foto</button>
      </div>}
      <div className="esFiltros" role="radiogroup" aria-label="Filtro">
        {FILTROS.map((f) => <button key={f.id} type="button" role="radio" aria-checked={filt === f.id} className={filt === f.id ? "activo" : ""} onClick={() => setFilt(f.id)}>{f.nombre}</button>)}
      </div>
      <div className="esPie">
        <button type="button" onClick={alCancelar}>Cancelar</button>
        <button type="button" className="primary" onClick={() => alAplicar(esq, filt)}>Aplicar</button>
      </div>
    </div>,
    document.body,
  );
}
