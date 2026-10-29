import { lienzo } from "./escaner";

/*
 * La cámara del escáner y de EX-Trae, lo más parecida posible a la del sistema: el lente trasero principal (no el gran
 * angular), enfoque continuo y tocar para enfocar, zoom si el equipo lo tiene y, al disparar, una foto de verdad
 * (ImageCapture.takePhoto: el sensor completo, con el procesado de foto) en lugar de un cuadro del video.
 */

interface ImageCaptureT { takePhoto: () => Promise<Blob> }
declare global { interface Window { ImageCapture?: new (pista: MediaStreamTrack) => ImageCaptureT } }

/** Lo que el equipo permite ajustar (lo que no está, no se muestra). */
export interface Capacidades { linterna: boolean; zoom: { min: number; max: number } | null; enfoqueTactil: boolean }
interface CapacidadesT { torch?: boolean; zoom?: { min: number; max: number }; focusMode?: string[] }

const RESOLUCION = { width: { ideal: 3840 }, height: { ideal: 2160 } };

/**
 * Abre la cámara trasera. En celulares con varias, «environment» a veces da el gran angular (menos nítido): con los
 * nombres que ya se pueden leer tras el permiso, se cambia a la principal («camera2 0» en Android).
 */
export async function abrirCamara(): Promise<MediaStream> {
  let s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, ...RESOLUCION } });
  try {
    const actual = s.getVideoTracks()[0]?.getSettings().deviceId;
    const traseras = (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === "videoinput" && /back|rear|trasera|posterior|environment/i.test(d.label));
    const principal = traseras.find((d) => /camera2 0\b/.test(d.label))
      ?? traseras.find((d) => !/wide|ultra|tele|macro|depth|0[.,]5/i.test(d.label));
    if (traseras.length > 1 && principal && principal.deviceId !== actual) {
      s.getTracks().forEach((t) => t.stop());
      s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: principal.deviceId }, ...RESOLUCION } });
    }
  } catch { /* si algo falla, se queda con la que abrió */ }
  return s;
}

/** Enfoque continuo (si se puede) y lo que el equipo permite ajustar. */
export async function prepararPista(pista: MediaStreamTrack): Promise<Capacidades> {
  const c = (pista.getCapabilities?.() ?? {}) as CapacidadesT;
  if (c.focusMode?.includes("continuous")) {
    await pista.applyConstraints({ advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet] }).catch(() => {});
  }
  return {
    linterna: !!c.torch,
    zoom: c.zoom && c.zoom.max >= 1.5 ? { min: c.zoom.min, max: c.zoom.max } : null,
    enfoqueTactil: !!c.focusMode?.some((m) => m === "single-shot" || m === "continuous"),
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
 * La foto: con ImageCapture, la del sensor completo; si no se puede (Safari, Firefox, algunas webcams) o sale con otra
 * orientación que el video, un cuadro del video. «soloVisible»: recortada a lo que se veía en pantalla (EX-Trae).
 */
export async function tomarFoto(pista: MediaStreamTrack | undefined, v: HTMLVideoElement, soloVisible: boolean): Promise<HTMLCanvasElement> {
  let fuente: CanvasImageSource = v, fw = v.videoWidth, fh = v.videoHeight;
  if (pista && window.ImageCapture) {
    try {
      const blob = await Promise.race([
        new window.ImageCapture(pista).takePhoto(),
        new Promise<never>((_, mal) => setTimeout(() => mal(new Error("tiempo")), 4000)),
      ]);
      const img = await createImageBitmap(blob, { imageOrientation: "from-image" });
      // Misma orientación que el video (vertical/horizontal) y más resolución: si no, mejor el cuadro del video.
      if ((img.width > img.height) === (fw > fh) && img.width * img.height > fw * fh) { fuente = img; fw = img.width; fh = img.height; }
    } catch { /* se usa el cuadro del video */ }
  }
  // La foto puede ser 4:3 aunque el video sea 16:9 (el video es un recorte del sensor): se recorta al encuadre del video.
  const av = v.videoWidth / v.videoHeight;
  let sx = 0, sy = 0, sw = fw, sh = fh;
  if (Math.abs(fw / fh - av) > 0.01) { if (fw / fh > av) { sw = fh * av; sx = (fw - sw) / 2; } else { sh = fw / av; sy = (fh - sh) / 2; } }
  if (soloVisible) {
    const z = zonaVisible(v);
    sx += z.x * sw; sy += z.y * sh; sw *= z.ancho; sh *= z.alto;
  }
  const c = lienzo(Math.round(sw), Math.round(sh));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fuente, sx, sy, sw, sh, 0, 0, c.width, c.height);
  if (fuente !== v) (fuente as ImageBitmap).close();
  return c;
}
