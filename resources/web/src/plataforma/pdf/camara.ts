import { lienzo } from "./escaner";

/*
 * La cámara del escáner y de EX-Trae, lo más parecida posible a la del sistema: el lente trasero principal (no el gran
 * angular) con todo el sensor (4:3), enfoque y exposición continuos, tocar para enfocar, zoom y linterna si el equipo
 * los tiene y, al disparar, una foto de verdad (ImageCapture.takePhoto, a la resolución del sensor) y no un cuadro del video.
 */

interface RangoT { min: number; max: number }
interface AjustesFotoT { imageWidth?: number; imageHeight?: number; fillLightMode?: "off" }
interface CapacidadesFotoT { fillLightMode?: string[]; imageWidth?: RangoT; imageHeight?: RangoT }
interface ImageCaptureT { takePhoto: (ajustes?: AjustesFotoT) => Promise<Blob>; getPhotoCapabilities?: () => Promise<CapacidadesFotoT> }
declare global { interface Window { ImageCapture?: new (pista: MediaStreamTrack) => ImageCaptureT } }

/** Lo que el equipo permite ajustar (lo que no está, no se muestra). */
export interface Capacidades {
  linterna: boolean;
  /** Tiene flash de foto. Nunca se usa: se sabe para pedirle expresamente que no se dispare. */
  flash: boolean;
  zoom: RangoT | null;
  enfoqueTactil: boolean;
  /** Tamaño a pedir para la foto; null: el que dé el equipo. */
  foto: { ancho: number; alto: number } | null;
}
interface CapacidadesT { torch?: boolean; zoom?: RangoT; focusMode?: string[]; exposureMode?: string[]; whiteBalanceMode?: string[] }

/** La única luz es la linterna, y solo la enciende el usuario. La cámara nunca decide encender nada por su cuenta. */
export type Luz = "apagada" | "linterna";

/** Más que esto no aporta a un documento: solo haría más lenta cada foto (hay sensores de 50 MP y más). */
const LADO_FOTO = 4032;
const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Con ImageCapture, el video es casi solo el visor (la nitidez la da la foto), aunque se usa de respaldo si la foto sale
 * desenfocada. Sin ella (Safari, Firefox) la foto es un cuadro del video, así que se pide el mayor posible. En ambos casos 4:3, que es el sensor completo: en 16:9
 * se ve un recorte, más cerrado.
 */
const video = (): MediaTrackConstraints => ({
  ...(window.ImageCapture ? { width: { ideal: 2560 }, height: { ideal: 1920 } } : { width: { ideal: 4032 }, height: { ideal: 3024 } }),
  aspectRatio: { ideal: 4 / 3 },
  frameRate: { ideal: 30 },
});

/**
 * Abre la cámara trasera. En celulares con varias, «environment» a veces da el gran angular (menos nítido): con los
 * nombres que ya se pueden leer tras el permiso, se cambia a la principal («camera2 0» en Android).
 */
export async function abrirCamara(): Promise<MediaStream> {
  let s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, ...video() } });
  try {
    const actual = s.getVideoTracks()[0]?.getSettings().deviceId;
    const traseras = (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === "videoinput" && /back|rear|trasera|posterior|environment/i.test(d.label));
    const principal = traseras.find((d) => /camera2 0\b/.test(d.label))
      ?? traseras.find((d) => !/wide|ultra|tele|macro|depth|0[.,]5/i.test(d.label));
    if (traseras.length > 1 && principal && principal.deviceId !== actual) {
      s.getTracks().forEach((t) => t.stop());
      s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: principal.deviceId }, ...video() } });
    }
  } catch { /* si algo falla, se queda con la que abrió */ }
  return s;
}

/** Abre un lente concreto, con los mismos ajustes que la cámara normal. */
export const abrirLente = (id: string) => navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: id }, ...video() } });

/** ¿Tiene una linterna que se pueda encender? */
export const tieneLuz = (c: Capacidades | null) => !!c?.linterna;

export interface LenteConLuz { id: string; capacidades: Capacidades }
// Se recuerda por celular y versión de navegador: probar los lentes apaga el visor un momento.
const CLAVE_LENTE = "af_lente_con_luz";
const leerLente = (): string | null => {
  try { const g = JSON.parse(localStorage.getItem(CLAVE_LENTE) ?? "null"); return g?.navegador === navigator.userAgent ? g.lente : null; } catch { return null; }
};
const guardarLente = (lente: string) => { try { localStorage.setItem(CLAVE_LENTE, JSON.stringify({ navegador: navigator.userAgent, lente })); } catch { /* sin almacenamiento: se volverá a probar */ } };

/** Los otros lentes traseros que vale la pena probar (ninguno si ya se probaron en este celular y no tienen luz). */
export async function lentesPorProbar(actual: string | undefined): Promise<MediaDeviceInfo[]> {
  const recordado = leerLente();
  if (recordado === "-") return [];
  const otros = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput" && d.deviceId !== actual && /back|rear|trasera|posterior|environment/i.test(d.label));
  return otros.sort((a, b) => Number(b.deviceId === recordado) - Number(a.deviceId === recordado));
}

/**
 * En celulares con varias cámaras traseras, a veces solo una informa el flash, y no siempre es la que abre el navegador.
 * Abre cada lente un instante hasta encontrar uno con luz. La cámara debe estar cerrada antes de llamar a esto.
 */
export async function buscarLenteConLuz(lentes: MediaDeviceInfo[], alProbar: (fila: string) => void): Promise<LenteConLuz | null> {
  let completo = true;
  for (const d of lentes) {
    try {
      await esperar(150);
      const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: d.deviceId }, width: { ideal: 640 } } });
      await esperar(250);
      const capacidades = await leerCapacidades(s.getVideoTracks()[0]);
      s.getTracks().forEach((t) => t.stop());
      alProbar(`${d.label}: linterna ${capacidades.linterna ? "sí" : "no"}, flash ${capacidades.flash ? "sí" : "no"}`);
      if (tieneLuz(capacidades)) { guardarLente(d.deviceId); return { id: d.deviceId, capacidades }; }
    } catch (e) {
      completo = false;
      alProbar(`${d.label}: no abrió (${(e as Error)?.name})`);
    }
  }
  if (completo) guardarLente("-");
  return null;
}

/** Enfoque, exposición y balance de blancos continuos (lo que se pueda). */
export async function prepararPista(pista: MediaStreamTrack) {
  const c = (pista.getCapabilities?.() ?? {}) as CapacidadesT;
  const ajuste: Record<string, unknown> = {};
  if (c.focusMode?.includes("continuous")) ajuste.focusMode = "continuous";
  if (c.exposureMode?.includes("continuous")) ajuste.exposureMode = "continuous";
  if (c.whiteBalanceMode?.includes("continuous")) ajuste.whiteBalanceMode = "continuous";
  if (Object.keys(ajuste).length) await ajustar(pista, ajuste).catch(() => {});
}

/** Lo que el equipo permite ajustar. Algunos lo informan un rato después de abrir: se puede volver a consultar. */
export async function leerCapacidades(pista: MediaStreamTrack): Promise<Capacidades> {
  const c = (pista.getCapabilities?.() ?? {}) as CapacidadesT;
  let foto: CapacidadesFotoT = {};
  if (window.ImageCapture) {
    try { foto = (await new window.ImageCapture(pista).getPhotoCapabilities?.()) ?? {}; } catch { /* sin datos de la foto */ }
  }
  const w = foto.imageWidth?.max ?? 0, h = foto.imageHeight?.max ?? 0, k = w && h ? Math.min(1, LADO_FOTO / Math.max(w, h)) : 0;
  return {
    linterna: !!c.torch,
    flash: !!foto.fillLightMode?.includes("flash"),
    zoom: c.zoom && c.zoom.max >= 1.5 ? { min: c.zoom.min, max: c.zoom.max } : null,
    enfoqueTactil: !!c.focusMode?.some((m) => m === "single-shot" || m === "continuous"),
    foto: k ? { ancho: Math.round(w * k), alto: Math.round(h * k) } : null,
  };
}

export const ajustar = (pista: MediaStreamTrack, ajuste: Record<string, unknown>) =>
  pista.applyConstraints({ advanced: [ajuste as unknown as MediaTrackConstraintSet] });

/** Enfoca en un punto (x, y de 0 a 1 del video) y vuelve al enfoque continuo. */
export async function enfocarEn(pista: MediaStreamTrack, x: number, y: number) {
  await ajustar(pista, { pointsOfInterest: [{ x, y }], focusMode: "single-shot" }).catch(() => {});
  setTimeout(() => ajustar(pista, { focusMode: "continuous" }).catch(() => {}), 2500);
}

/**
 * Qué parte del video se ve en pantalla (el video llena la pantalla recortando los lados, «object-fit: cover»), en
 * fracciones del video. Sirve para pasar un toque a coordenadas del video y para recortar la foto a lo que se veía.
 */
export function zonaVisible(v: HTMLVideoElement) {
  const W = v.clientWidth, H = v.clientHeight, vw = v.videoWidth, vh = v.videoHeight;
  if (!W || !H || !vw || !vh) return { x: 0, y: 0, ancho: 1, alto: 1 };
  const e = Math.max(W / vw, H / vh), ancho = Math.min(1, W / (vw * e)), alto = Math.min(1, H / (vh * e));
  return { x: (1 - ancho) / 2, y: (1 - alto) / 2, ancho, alto };
}

/**
 * Qué tan nítida está la imagen en el centro de la toma (varianza del laplaciano), a la escala de un píxel del video:
 * así se puede comparar el video con la foto del sensor aunque tengan otro tamaño.
 */
function nitidez(fuente: CanvasImageSource, fw: number, fh: number, vw: number, vh: number) {
  const lado = 360, c = lienzo(lado, lado), ctx = c.getContext("2d", { willReadFrequently: true })!;
  const ax = (lado / vw) * fw, ay = (lado / vh) * fh;
  ctx.drawImage(fuente, (fw - ax) / 2, (fh - ay) / 2, ax, ay, 0, 0, lado, lado);
  const d = ctx.getImageData(0, 0, lado, lado).data, g = new Float32Array(lado * lado);
  for (let i = 0; i < lado * lado; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let suma = 0, suma2 = 0, n = 0;
  for (let y = 1; y < lado - 1; y++) for (let x = 1; x < lado - 1; x++) {
    const i = y * lado + x, l = g[i - 1] + g[i + 1] + g[i - lado] + g[i + lado] - 4 * g[i];
    suma += l; suma2 += l * l; n++;
  }
  return suma2 / n - (suma / n) ** 2;
}

/** Qué parte de la imagen está quemada (blanco puro): lo que deja un flash pegado a la hoja. */
function quemada(fuente: CanvasImageSource, fw: number, fh: number) {
  const lado = 64, c = lienzo(lado, lado), ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(fuente, 0, 0, fw, fh, 0, 0, lado, lado);
  const d = ctx.getImageData(0, 0, lado, lado).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.min(d[i], d[i + 1], d[i + 2]) >= 250) n++;
  return n / (lado * lado);
}

/**
 * Espera a que el enfoque se asiente: la nitidez del video deja de cambiar. Disparar mientras el lente
 * todavía busca es lo que más desenfoca una foto.
 */
async function esperarFoco(v: HTMLVideoElement, maximo: number) {
  let antes = nitidez(v, v.videoWidth, v.videoHeight, v.videoWidth, v.videoHeight);
  for (let t = 0; t < maximo; t += 100) {
    await esperar(100);
    const ahora = nitidez(v, v.videoWidth, v.videoHeight, v.videoWidth, v.videoHeight);
    if (Math.abs(ahora - antes) <= Math.max(antes, ahora) * 0.08) return;
    antes = ahora;
  }
}

/**
 * La foto del sensor. null si no se puede (se usará el cuadro del video). Con la linterna apagada, el flash queda
 * prohibido en cada intento: una foto sin ese ajuste la deja a criterio del celular, que a veces lo dispara y quema la
 * hoja. Por eso, si el equipo tiene flash (o aún no se sabe) y no acepta el pedido, se usa el video y no se insiste.
 */
async function fotoDelSensor(pista: MediaStreamTrack | undefined, c: Capacidades | null, luz: Luz): Promise<Blob | null> {
  if (!pista || !window.ImageCapture) return null;
  try {
    const camara = new window.ImageCapture(pista);
    const tam: AjustesFotoT = c?.foto ? { imageWidth: c.foto.ancho, imageHeight: c.foto.alto } : {};
    const sinFlash: AjustesFotoT = luz === "apagada" && (!c || c.flash) ? { fillLightMode: "off" } : {};
    return await Promise.race([
      camara.takePhoto({ ...tam, ...sinFlash }).catch(() => camara.takePhoto(sinFlash)), // algún equipo no acepta el tamaño
      new Promise<never>((_, mal) => setTimeout(() => mal(new Error("tiempo")), 6000)),
    ]);
  } catch { return null; }
  finally {
    if (luz === "linterna") ajustar(pista, { torch: true }).catch(() => {}); // la foto la puede apagar
  }
}

/**
 * Toma la foto y termina en cuanto el sensor la entrega; `revelar` la convierte en un lienzo (sin apuro: es lo pesado y
 * se puede hacer después, ya listos para la siguiente). Mientras tanto se guarda el JPG, no la imagen descomprimida, para
 * que varias fotos seguidas no agoten la memoria. Con ImageCapture, la del sensor completo; si no se puede o sale con
 * otra orientación que el video, un cuadro del video. «soloVisible»: recortada a lo que se veía en pantalla (EX-Trae).
 */
export async function tomarFoto(pista: MediaStreamTrack | undefined, v: HTMLVideoElement, soloVisible: boolean, c: Capacidades | null, luz: Luz) {
  // Para leer texto (EX-Trae) importa más que el foco sea bueno que disparar enseguida: la letra es lo primero que se pierde.
  await esperarFoco(v, soloVisible ? 1200 : 600);
  const vw = v.videoWidth, vh = v.videoHeight, zona = soloVisible ? zonaVisible(v) : null;
  const cuadro = lienzo(vw, vh);
  cuadro.getContext("2d")!.drawImage(v, 0, 0, vw, vh);
  const blob = await fotoDelSensor(pista, c, luz);

  /** De dónde salió la foto final y por qué, para el diagnóstico. */
  const detalle = { origen: blob ? "del sensor" : "cuadro del video: no llegó la foto", peso: blob?.size ?? 0 };
  return {
    detalle,
    revelar: async (): Promise<HTMLCanvasElement> => {
      let fuente: HTMLCanvasElement | ImageBitmap = cuadro;
      if (blob) {
        try {
          const img = await createImageBitmap(blob, { imageOrientation: "from-image" });
          // Misma orientación que el video (vertical/horizontal) y más resolución: si no, mejor el cuadro del video.
          // Al tomar la foto, el navegador reinicia la cámara y a veces el enfoque no llega: si sale muy
          // desenfocada comparada con el video, o quemada (blanca) cuando el video se veía bien, vale más el cuadro del video.
          const util = (img.width > img.height) === (vw > vh) && img.width * img.height > vw * vh;
          const estropeada = quemada(img, img.width, img.height) > 0.5 && quemada(cuadro, vw, vh) < 0.2;
          const nFoto = nitidez(img, img.width, img.height, vw, vh), nVideo = nitidez(cuadro, vw, vh, vw, vh);
          const cifras = `nitidez foto ${Math.round(nFoto)} / video ${Math.round(nVideo)}`;
          // Margen amplio: solo por cambiar de escala una foto buena ya marca la mitad que el video; una desenfocada, casi nada.
          if (util && !estropeada && nFoto >= nVideo * 0.2) { fuente = img; detalle.origen = `del sensor (${cifras})`; }
          else { img.close(); detalle.origen = `cuadro del video: foto ${!util ? "más chica o de otra orientación" : estropeada ? "quemada" : "borrosa"} (${cifras})`; }
        } catch { /* se usa el cuadro del video */ }
      }
      const fw = fuente.width, fh = fuente.height;
      // La foto puede tener otra proporción que el video (el video puede ser un recorte del sensor): se recorta a su encuadre.
      const av = vw / vh;
      let sx = 0, sy = 0, sw = fw, sh = fh;
      if (Math.abs(fw / fh - av) > 0.01) { if (fw / fh > av) { sw = fh * av; sx = (fw - sw) / 2; } else { sh = fw / av; sy = (fh - sh) / 2; } }
      if (zona) { sx += zona.x * sw; sy += zona.y * sh; sw *= zona.ancho; sh *= zona.alto; }
      if (fuente === cuadro && !zona && sx === 0 && sy === 0) return cuadro;
      const salida = lienzo(Math.round(sw), Math.round(sh));
      const ctx = salida.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(fuente, sx, sy, sw, sh, 0, 0, salida.width, salida.height);
      if (fuente !== cuadro) (fuente as ImageBitmap).close();
      return salida;
    },
  };
}

/** Miniatura del video en este instante: se muestra en la pila al disparar, sin esperar a que la foto se procese. */
export function miniatura(v: HTMLVideoElement, lado = 160) {
  const e = lado / Math.max(v.videoWidth, v.videoHeight), c = lienzo(Math.max(1, Math.round(v.videoWidth * e)), Math.max(1, Math.round(v.videoHeight * e)));
  c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

/** Texto para revisar en el celular qué entrega realmente su cámara (se ve al abrir la página con ?camara=diagnostico). */
export function textoDiagnostico(pista: MediaStreamTrack | undefined, c: Capacidades | null, v: HTMLVideoElement | null, ultima: string, lentes: string[] = []) {
  const s = pista?.getSettings();
  return [
    `Lente: ${pista?.label ?? "?"}`,
    `Video: ${v?.videoWidth}×${v?.videoHeight} a ${s?.frameRate ?? "?"} fps · zoom ${(s as { zoom?: number } | undefined)?.zoom ?? "-"} · enfoque ${(s as { focusMode?: string } | undefined)?.focusMode ?? "-"}`,
    `ImageCapture: ${window.ImageCapture ? "sí" : "no"} · linterna: ${c?.linterna ? "sí" : "no"} · flash: ${c?.flash ? "sí" : "no"} · foto: ${c?.foto ? `${c.foto.ancho}×${c.foto.alto}` : "-"}`,
    `Última foto: ${ultima || "-"}`,
    ...(lentes.length ? [`Otros lentes: ${lentes.join(" · ")}`] : []),
  ].join("\n");
}
