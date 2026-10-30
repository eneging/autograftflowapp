import { useEffect, useRef, useState, type PointerEvent as EventoPuntero, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  aBlobUrl, cargarImagen, componerCarnet, detectarBordes, detectarTexto, distancia, enderezarSuave, esToda, TODA,
  type Esquinas,
} from "./escaner";
import {
  abrirCamara, abrirLente, ajustar, buscarLenteConLuz, enfocarEn, leerCapacidades, lentesPorProbar, miniatura, prepararPista,
  textoDiagnostico, tieneLuz, tomarFoto, zonaVisible, type Capacidades, type LenteConLuz, type Luz,
} from "./camara";
import "./escaner.css";

/** Lo que entrega la cámara: la foto tal cual y la hoja ya enderezada. */
export interface Captura { original: string; url: string; esquinas: Esquinas; carnet?: boolean }

type Modo = "documento" | "carnet";

/** Fotos esperando a procesarse: con más, el disparador espera (cada una ocupa memoria). */
const MAX_EN_COLA = 3;
const NOMBRE_LUZ: Record<Luz, string> = { apagada: "Linterna apagada", linterna: "Linterna encendida" };

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
 * Las páginas se procesan en cola, en orden: apenas el sensor entrega la foto ya se puede tomar la siguiente.
 * «unaFoto» (EX-Trae): sin modos ni pila de páginas; quien la abre la cierra al recibir la captura.
 * alPendientes: avisa cuántas fotos entran (+1) o salen (-1) de la cola; pueden terminar con la cámara ya cerrada.
 */
export function CamaraEscaner({ paginas = 0, ultima, alCapturar, alGaleria, alTerminar, alPendientes, unaFoto = false }: {
  paginas?: number; ultima?: string; alCapturar: (c: Captura) => void; alGaleria: (f: File[]) => void; alTerminar: () => void; alPendientes?: (cambio: number) => void; unaFoto?: boolean;
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
  const [luz, setLuz] = useState<Luz>("apagada");
  const [avisoLuz, setAvisoLuz] = useState("");
  // Si el lente abierto no tiene linterna pero otro sí: se cambia a ese solo mientras está encendida.
  const [lenteLuz, setLenteLuz] = useState<LenteConLuz | null>(null);
  const principal = useRef<string | undefined>(undefined);
  const [buscandoLinterna, setBuscandoLinterna] = useState(false);
  const [lentesProbados, setLentesProbados] = useState<string[]>([]);
  const [sinLinterna, setSinLinterna] = useState(false);
  const [deteccion, setDeteccion] = useState<Esquinas | null>(null);
  const [destello, setDestello] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [enCola, setEnCola] = useState(0);
  const [miniaturaLocal, setMiniaturaLocal] = useState<string | null>(null);
  const [fallo, setFallo] = useState("");
  const diagnostico = new URLSearchParams(location.search).get("camara") === "diagnostico";
  const [ultimaFoto, setUltimaFoto] = useState("");
  const [frente, setFrente] = useState<HTMLCanvasElement | null>(null);
  const [capacidades, setCapacidades] = useState<Capacidades | null>(null);
  const [zoom, setZoom] = useState(1);
  const [foco, setFoco] = useState<{ x: number; y: number; n: number } | null>(null);
  usarPantallaCompleta(alTerminar);

  // Estado de la detección entre vueltas: cuántas seguidas quieta y si hay que esperar a que cambie la hoja.
  const ocupado = useRef(false);
  const anterior = useRef<Esquinas | null>(null);
  const quietas = useRef(0); // desde cuándo (performance.now) la detección está quieta
  const espera = useRef<Esquinas | null>(null);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const pendientes = useRef(0);
  const montada = useRef(false);

  /** Pone este video en el visor y devuelve lo que permite ajustar. */
  async function conectar(s: MediaStream) {
    flujo.current = s;
    const v = video.current!;
    v.srcObject = s;
    await v.play().catch(() => {});
    const pista = s.getVideoTracks()[0];
    if (!pista) return null;
    await prepararPista(pista);
    const c = await leerCapacidades(pista);
    setCapacidades(c);
    return c;
  }

  useEffect(() => {
    let cancelado = false;
    montada.current = true;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(window.isSecureContext ? "Este navegador no permite usar la cámara desde la página." : "La cámara solo se puede usar en una conexión segura (https).");
        return;
      }
      try {
        const s = await abrirCamara();
        if (cancelado) { s.getTracks().forEach((t) => t.stop()); return; }
        let c = await conectar(s);
        const pista = s.getVideoTracks()[0];
        principal.current = pista?.getSettings().deviceId;
        // Hay equipos que informan la luz un rato después de abrir.
        if (pista && !tieneLuz(c)) {
          await new Promise((ok) => setTimeout(ok, 700));
          if (cancelado) return;
          c = await leerCapacidades(pista);
          setCapacidades(c);
        }
        let lente: LenteConLuz | null = null;
        if (pista && !tieneLuz(c)) {
          const otros = await lentesPorProbar(principal.current).catch(() => []);
          if (otros.length && !cancelado) {
            setBuscandoLinterna(true);
            s.getTracks().forEach((t) => t.stop());
            lente = await buscarLenteConLuz(otros, (fila) => setLentesProbados((l) => [...l, fila]));
            if (cancelado) return;
            const otra = await (principal.current ? abrirLente(principal.current) : abrirCamara());
            if (cancelado) { otra.getTracks().forEach((t) => t.stop()); return; }
            c = await conectar(otra);
            setLenteLuz(lente);
            setBuscandoLinterna(false);
          }
        }
        if (cancelado) return;
        setLista(true);
      } catch (e) {
        const n = (e as DOMException)?.name;
        setError(n === "NotAllowedError" ? "No hay permiso para usar la cámara. Actívalo en los permisos del sitio (el candado junto a la dirección) o usa la cámara del sistema."
          : n === "NotFoundError" || n === "OverconstrainedError" ? "No encontramos una cámara en este dispositivo."
          : n === "NotReadableError" ? "Otra aplicación está usando la cámara. Ciérrala e inténtalo de nuevo."
          : "No se pudo abrir la cámara.");
      }
    })();
    return () => { cancelado = true; montada.current = false; flujo.current?.getTracks().forEach((t) => t.stop()); flujo.current = null; };
  }, []);

  /** De la foto a la página: encontrar la hoja, enderezarla y comprimir. */
  async function aPagina(foto: HTMLCanvasElement): Promise<Captura> {
    // EX-Trae lee la foto completa: recortar a una «hoja» puede dejar fuera el texto (p. ej. si toma una pared clara).
    const esquinas = unaFoto ? TODA : detectarBordes(foto, foto.width, foto.height) ?? TODA;
    // Para leer texto, sin compresión que se note: el JPG ensucia el borde de las letras.
    const original = await aBlobUrl(foto, unaFoto ? 0.97 : 0.92);
    return { original, url: esToda(esquinas) ? original : await aBlobUrl(await enderezarSuave(foto, esquinas)), esquinas };
  }

  async function disparar() {
    const v = video.current;
    if (!v?.videoWidth || ocupado.current || pendientes.current >= MAX_EN_COLA) return;
    ocupado.current = true;
    setOcupada(true);
    setDestello(true);
    setTimeout(() => setDestello(false), 220);
    setFallo("");
    const enCarnet = modo === "carnet", seguidas = !unaFoto && !enCarnet;
    // Se ve al instante, sin esperar a la foto: la pila ya cuenta la página.
    if (seguidas) {
      setMiniaturaLocal(miniatura(v));
      pendientes.current++;
      setEnCola(pendientes.current);
      alPendientes?.(1);
    }
    // La automática no vuelve a disparar hasta que cambie la hoja (o, en EX-Trae, el texto a la vista).
    espera.current = anterior.current ?? TODA;
    quietas.current = performance.now();
    try {
      // Foto del sensor (más nítida que el video); EX-Trae, solo lo que se veía en pantalla.
      const tomada = await tomarFoto(flujo.current?.getVideoTracks()[0], v, unaFoto, capacidades, luz);
      if (seguidas) {
        cola.current = cola.current.then(async () => {
          try {
            const foto = await tomada.revelar();
            if (diagnostico) setUltimaFoto(`${foto.width}×${foto.height} · ${tomada.detalle.origen} · ${Math.round(tomada.detalle.peso / 1024)} KB`);
            alCapturar(await aPagina(foto));
          } catch { setFallo("No se pudo guardar una de las fotos. Tómala de nuevo."); }
          finally {
            pendientes.current--;
            setEnCola(pendientes.current);
            alPendientes?.(-1);
          }
        });
        return;
      }
      const foto = await tomada.revelar();
      if (diagnostico) setUltimaFoto(`${foto.width}×${foto.height} · ${tomada.detalle.origen} · ${Math.round(tomada.detalle.peso / 1024)} KB`);
      if (enCarnet) {
        const esquinas = detectarBordes(foto, foto.width, foto.height) ?? TODA;
        const hoja = await enderezarSuave(foto, esquinas);
        if (!frente) { setFrente(hoja); return; }
        const url = await aBlobUrl(componerCarnet([frente, hoja]));
        setFrente(null);
        alCapturar({ original: url, url, esquinas: TODA, carnet: true });
        return;
      }
      alCapturar(await aPagina(foto));
    } catch { setFallo("No se pudo guardar la foto. Inténtalo de nuevo."); }
    finally {
      ocupado.current = false;
      setOcupada(false);
    }
  }
  const dispararAhora = useRef(disparar);
  dispararAhora.current = disparar;
  const automatica = useRef(auto);
  automatica.current = auto;

  // Busca la hoja unas 4 veces por segundo (menos si el equipo tarda: espera al menos el doble de lo que tardó la
  // última búsqueda, para no trabar un celular modesto); con «Automática», dispara cuando lleva ~1 s quieta.
  useEffect(() => {
    if (!lista) return;
    let t = 0, vivo = true;
    const buscar = () => {
      if (!vivo) return;
      const v = video.current, inicio = performance.now();
      // Con fotos en cola no se busca: el celular ya está ocupado y la cola termina enseguida.
      if (v?.videoWidth && !ocupado.current && !pendientes.current) {
        // EX-Trae busca texto (renglones); el escáner, los bordes de la hoja.
        const d = (unaFoto ? detectarTexto : detectarBordes)(v, v.videoWidth, v.videoHeight);
        const prev = anterior.current;
        anterior.current = d;
        if (!(d && prev && distancia(d, prev) < (unaFoto ? 0.04 : 0.015))) quietas.current = performance.now();
        if (espera.current && (!d || distancia(d, espera.current) > 0.08)) espera.current = null;
        setDeteccion((antes) => (d && antes ? d.map((p, i) => ({ x: antes[i].x * 0.4 + p.x * 0.6, y: antes[i].y * 0.4 + p.y * 0.6 })) as Esquinas : d));
        if (automatica.current && d && performance.now() - quietas.current >= 950 && !espera.current) dispararAhora.current();
      }
      t = window.setTimeout(buscar, Math.max(240, (performance.now() - inicio) * 2));
    };
    buscar();
    return () => { vivo = false; clearTimeout(t); };
  }, [lista]);

  // La linterna solo se ofrece si este equipo la tiene (en el lente abierto o en otro) y solo la enciende el usuario.
  const hayLinterna = tieneLuz(lenteLuz?.capacidades ?? capacidades);
  /** Enciende o apaga la linterna; si está en otro lente, cambia a ese y, al apagarla, vuelve al principal. */
  async function ponerLuz(nueva: Luz, antes: Luz, lente: LenteConLuz | null) {
    if (lente && (nueva === "apagada") !== (antes === "apagada")) {
      const id = nueva === "apagada" ? principal.current : lente.id;
      if (id) {
        ocupado.current = true;
        try {
          flujo.current?.getTracks().forEach((t) => t.stop());
          const s = await abrirLente(id);
          // Si cerró la cámara mientras cambiaba de lente, no se deja encendida.
          if (!montada.current) { s.getTracks().forEach((t) => t.stop()); return; }
          await conectar(s);
          setZoom(1);
        } finally { ocupado.current = false; }
      }
    }
    const pista = flujo.current?.getVideoTracks()[0];
    if (!pista) return;
    if (nueva === "linterna") await ajustar(pista, { torch: true });
    else if (antes === "linterna") await ajustar(pista, { torch: false });
    setLuz(nueva);
  }
  async function cambiarLuz() {
    if (!hayLinterna) { setSinLinterna(true); return; }
    const siguiente: Luz = luz === "apagada" ? "linterna" : "apagada";
    try {
      await ponerLuz(siguiente, luz, lenteLuz);
      setAvisoLuz(NOMBRE_LUZ[siguiente]);
      setTimeout(() => setAvisoLuz((a) => (a === NOMBRE_LUZ[siguiente] ? "" : a)), 1500);
    } catch {
      setCapacidades((c) => (c ? { ...c, linterna: false } : c));
      setLenteLuz(null);
      setLuz("apagada");
    }
  }

  async function cambiarZoom(z: number) {
    const pista = flujo.current?.getVideoTracks()[0];
    if (!pista) return;
    try { await ajustar(pista, { zoom: z }); setZoom(z); } catch { setCapacidades((c) => (c ? { ...c, zoom: null } : c)); }
  }

  /** Tocar el video enfoca ahí (si el equipo lo permite) y muestra un aro donde se tocó. */
  function tocarEscena(ev: EventoPuntero<HTMLDivElement>) {
    const v = video.current, pista = flujo.current?.getVideoTracks()[0];
    if (!v || !pista || ev.target !== v) return;
    const r = v.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, z = zonaVisible(v);
    if (capacidades?.enfoqueTactil) enfocarEn(pista, z.x + (px / r.width) * z.ancho, z.y + (py / r.height) * z.alto);
    setFoco({ x: px, y: py, n: Date.now() });
  }

  const cambiarModo = (m: Modo) => { setModo(m); setFrente(null); espera.current = null; };
  const pista = !lista ? (error ? "" : buscandoLinterna ? "Buscando la linterna de tu celular…" : "Abriendo la cámara…")
    : fallo || avisoLuz || (ocupada && (unaFoto || modo === "carnet") ? "Procesando…"
    : modo === "carnet" ? (frente ? "✓ Anverso listo. Voltea el carnet y toma el reverso" : "Toma el anverso del carnet")
    : deteccion ? (auto ? "Mantén quieto: se tomará solo" : unaFoto ? "Texto a la vista: toma la foto" : "Documento detectado")
    : unaFoto ? "Acerca la cámara al texto y enfócalo"
    : ocupada || enCola ? ""
    : "Buscando el documento…");
  const archivos = (ref: RefObject<HTMLInputElement | null>, capture?: boolean) => (
    <input ref={ref} type="file" accept="image/*" multiple={!capture && !unaFoto} capture={capture ? "environment" : undefined} hidden
      onChange={(ev) => { alGaleria([...(ev.target.files ?? [])]); ev.target.value = ""; }} />
  );

  return createPortal(
    <div className="esPantalla" role="dialog" aria-modal="true" aria-label="Escanear con la cámara">
      <div className="esArriba">
        <button type="button" className="esIcono" onClick={alTerminar} aria-label="Cerrar la cámara">✕</button>
        {lista && <button type="button" className={`esChip ${auto ? "activo" : ""}`} aria-pressed={auto} onClick={() => setAuto(!auto)}>
          {auto ? (unaFoto ? "✨ Automática al ver texto" : "✨ Captura automática") : "✋ Captura manual"}
        </button>}
        {/* En el celular siempre está: si el navegador no da acceso a la linterna, explica qué hacer. En un ordenador, solo si la hay. */}
        {lista && (hayLinterna || matchMedia("(pointer: coarse)").matches)
          ? <button type="button" className={`esIcono ${luz !== "apagada" ? "activo" : "esLuzApagada"}`} onClick={cambiarLuz} aria-pressed={luz === "linterna"} aria-label={NOMBRE_LUZ[luz]} title={NOMBRE_LUZ[luz]}>🔦</button>
          : <span className="esIcono" aria-hidden />}
      </div>

      <div className="esEscena esEnVivo" onPointerDown={tocarEscena}>
        <video ref={video} playsInline muted autoPlay onLoadedMetadata={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
          onResize={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} />
        {/* «slice» recorta igual que «object-fit: cover» del video: el marco coincide con lo que se ve. */}
        {dims && deteccion && <svg className="esCapa" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
          <polygon className={`esMarco ${unaFoto ? "texto" : ""}`} points={deteccion.map((p) => `${p.x * dims.w},${p.y * dims.h}`).join(" ")} />
        </svg>}
        {foco && <span key={foco.n} className="esFoco" style={{ left: foco.x, top: foco.y }} aria-hidden />}
        {capacidades?.zoom && <div className="esZoom" role="radiogroup" aria-label="Zoom">
          {[1, Math.min(2, capacidades.zoom.max)].map((z) => (
            <button key={z} type="button" role="radio" aria-checked={zoom === z} className={zoom === z ? "activo" : ""} onClick={() => cambiarZoom(z)}>{z}×</button>
          ))}
        </div>}
        {pista && <div className="esPista" role="status">{pista}</div>}
        {diagnostico && <pre className="esDiagnostico">{textoDiagnostico(flujo.current?.getVideoTracks()[0], capacidades, video.current, ultimaFoto, lentesProbados)}</pre>}
        {sinLinterna && <div className="esSinLinterna" role="dialog" aria-modal="true" aria-label="Linterna no disponible">
          <span aria-hidden>🔦</span>
          <p>Tu navegador no nos da acceso a la linterna de este celular. Si necesitas más luz, usa la cámara del sistema: al terminar, la foto vuelve aquí.</p>
          <div className="esErrorBotones">
            <button type="button" className="primary" onClick={() => { setSinLinterna(false); sistema.current?.click(); }}>📷 Usar la cámara del sistema</button>
            <button type="button" onClick={() => setSinLinterna(false)}>Seguir sin linterna</button>
          </div>
          <pre>{textoDiagnostico(flujo.current?.getVideoTracks()[0], capacidades, video.current, ultimaFoto, lentesProbados)}</pre>
        </div>}
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
        <button type="button" className={`esDisparador ${ocupada ? "ocupado" : ""}`} disabled={!lista || ocupada || enCola >= MAX_EN_COLA} onClick={disparar} aria-label="Tomar foto" />
        {unaFoto
          ? <span className="esIcono grande" aria-hidden />
          : <button type="button" className="esPila" disabled={!(paginas + enCola)} onClick={alTerminar} aria-label={paginas + enCola ? `Revisar ${paginas + enCola} página${paginas + enCola === 1 ? "" : "s"}` : "Aún no hay páginas"}>
            {miniaturaLocal ?? ultima ? <img src={(miniaturaLocal ?? ultima)!} alt="" /> : <span className="esPilaVacia" />}
            {paginas + enCola > 0 && <span className="esPilaNumero">{paginas + enCola}</span>}
          </button>}
      </div>
      {archivos(galeria)}
      {archivos(sistema, true)}
    </div>,
    document.body,
  );
}

/** Ajustar las esquinas de la hoja, arrastrando cada una. */
export function EditorPagina({ original, esquinas, alAplicar, alCancelar }: {
  original: string; esquinas: Esquinas; alAplicar: (esquinas: Esquinas) => void; alCancelar: () => void;
}) {
  const capa = useRef<SVGSVGElement>(null);
  const [esq, setEsq] = useState<Esquinas>(esquinas);
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
        <strong>Recortar</strong>
        <span className="esIcono" aria-hidden />
      </div>
      <div className="esEscena">
        <img src={original} alt="Página para recortar" draggable={false} onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        {dims && <svg ref={capa} className="esCapa editable" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet"
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
      <div className="esHerramientas">
        <button type="button" onClick={detectar}>🔍 Detectar bordes</button>
        <button type="button" onClick={() => setEsq(TODA)}>⛶ Toda la foto</button>
      </div>
      <div className="esPie">
        <button type="button" onClick={alCancelar}>Cancelar</button>
        <button type="button" className="primary" onClick={() => alAplicar(esq)}>Aplicar</button>
      </div>
    </div>,
    document.body,
  );
}
