import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import type { Dedo, Mano } from "../../../shared/plataforma";
import { ConsejosHuella, EncajarHuella, textoDedo } from "./Huella";

export type TipoImagen = "firma" | "sello" | "huella";
const TEXTOS: Record<TipoImagen, { nombre: string; marca: string; aviso: string }> = {
  firma: { nombre: "firma", marca: "FIRME AQUÍ", aviso: "Puedes dibujar, subir una imagen o fotografiar tu firma." },
  sello: { nombre: "sello", marca: "SELLO", aviso: "Confecciona tu sello escribiendo su texto, o sube o fotografía uno." },
  huella: { nombre: "huella", marca: "HUELLA", aviso: "Sube o fotografía tu huella digital (con tinta, sobre papel blanco)." },
};

interface Props {
  titulo: string;
  /** Firma (se puede dibujar), sello (se puede confeccionar) o huella (solo imagen). */
  tipo?: TipoImagen;
  /** Firma ya hecha, para mostrarla en la vista previa al volver a abrir. */
  inicial?: string | null;
  alTerminar: (png: string | null) => void;
  alCerrar: () => void;
  /** El documento pide la firma real en papel: no se puede dibujar en la pantalla. */
  bloquearDibujo?: boolean;
  /** El documento pide el sello real: no se puede confeccionar con texto. */
  bloquearSello?: boolean;
  /** Dedo pedido para la huella. */
  dedo?: { mano: Mano; dedo: Dedo } | null;
}

/** Pantalla completa de firma: dibujar, subir una imagen o fotografiar la firma en papel. */
export function PantallaFirma({ titulo, tipo = "firma", inicial, alTerminar, alCerrar, bloquearDibujo = false, bloquearSello = false, dedo = null }: Props) {
  const txt = TEXTOS[tipo];
  const sinDibujo = tipo === "firma" && bloquearDibujo;
  const conConfeccion = tipo === "sello" && !bloquearSello;
  const [confeccionando, setConfeccionando] = useState(conConfeccion);
  const [consejos, setConsejos] = useState(tipo === "huella" && !inicial);
  const [fotoHuella, setFotoHuella] = useState<File | null>(null);
  const [textoSello, setTextoSello] = useState("");
  const lienzo = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePad | null>(null);
  const [imagen, setImagen] = useState<string | null>(null); // firma subida o fotografiada
  const [hayTrazo, setHayTrazo] = useState(false);
  const [aviso, setAviso] = useState(
    sinDibujo ? "Este documento requiere tu firma real: fírmala en papel y tómale una foto, o sube una imagen de tu firma."
      : tipo === "sello" && bloquearSello ? "Este documento requiere tu sello real: fotografíalo o sube una imagen."
      : tipo === "huella" && dedo ? `${textoDedo(dedo)}: sube o fotografía la foto de tu dedo.` : txt.aviso);
  const subir = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const c = lienzo.current!;
    const p = new SignaturePad(c, { penColor: "#0b1f44", minWidth: 1, maxWidth: 3.2, backgroundColor: "rgba(0,0,0,0)" });
    pad.current = p;
    const ajustar = () => {
      const datos = p.toData();
      const r = Math.max(window.devicePixelRatio || 1, 1);
      c.width = c.offsetWidth * r;
      c.height = c.offsetHeight * r;
      c.getContext("2d")!.scale(r, r);
      p.clear();
      p.fromData(datos);
    };
    ajustar();
    const alTrazar = () => setHayTrazo(!p.isEmpty());
    p.addEventListener("endStroke", alTrazar);
    const obs = new ResizeObserver(ajustar);
    obs.observe(c);
    document.body.style.overflow = "hidden";
    return () => {
      obs.disconnect();
      p.removeEventListener("endStroke", alTrazar);
      p.off();
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (imagen || tipo !== "firma" || sinDibujo) pad.current?.off();
    else pad.current?.on();
  }, [imagen, tipo, sinDibujo]);

  const borrar = () => {
    pad.current?.clear();
    setHayTrazo(false);
    setImagen(null);
  };

  async function alElegirArchivo(archivo?: File) {
    if (!archivo) return;
    if (!/^image\//.test(archivo.type)) return setAviso("El archivo debe ser una imagen (PNG o JPG).");
    if (tipo === "huella") { setFotoHuella(archivo); return; }
    setAviso("Procesando la imagen…");
    try {
      setImagen(await limpiarImagenFirma(archivo));
      pad.current?.clear();
      setHayTrazo(false);
      setConfeccionando(false);
      setAviso(`Listo: se recortó la imagen y se quitó el fondo. Si no se ve bien, prueba con otra foto${tipo === "firma" ? " o dibújala" : ""}.`);
    } catch {
      setAviso("No se pudo leer la imagen. Prueba con otra.");
    }
  }

  const continuar = () => {
    if (imagen) return alTerminar(imagen);
    if (pad.current && !pad.current.isEmpty()) return alTerminar(recortar(lienzo.current!));
    setAviso(tipo === "firma" ? "Primero dibuja, sube o fotografía tu firma." : `Primero ${tipo === "sello" ? "confecciona, " : ""}sube o fotografía tu ${txt.nombre}.`);
  };

  const vista = imagen ?? inicial;

  return (
    <div id="screen" role="dialog" aria-label={titulo}>
      <div className="top">
        <strong>{titulo}</strong>
        <div className="topRight">
          {vista && !hayTrazo && <div className="spreview"><img src={vista} alt="Vista previa de firma" /></div>}
          <button type="button" onClick={alCerrar}>Cerrar</button>
        </div>
      </div>
      <div className="area">
        <div className="water">{sinDibujo ? "FOTOGRAFÍA O SUBE TU FIRMA" : txt.marca}</div>
        <canvas ref={lienzo} id="ink" aria-label="Recuadro para firmar" />
        {imagen && <img className="areaImg" src={imagen} alt="Imagen subida" />}
        {conConfeccion && confeccionando && (
          <div className="stampMaker">
            <label className="smLabel" htmlFor="textoSello">Escribe el contenido de tu sello (cada renglón en una línea)</label>
            <textarea id="textoSello" rows={3} maxLength={200} value={textoSello} onChange={(e) => setTextoSello(e.target.value)}
              placeholder={"Ej.\nJUAN PÉREZ LÓPEZ\nGerente General\nDNI 12345678"} />
            <div className="smLabel">Vista previa</div>
            <div className="smPreviewWrap">{textoSello.trim() ? <img src={dibujarSello(textoSello)} alt="Vista previa del sello" /> : <span className="afExtraHint">Escribe para ver tu sello</span>}</div>
            <div className="row smActions">
              <button type="button" className="success" disabled={!textoSello.trim()} onClick={() => { setImagen(dibujarSello(textoSello)); setConfeccionando(false); setAviso("Sello listo."); }}>✓ Usar este sello</button>
            </div>
          </div>
        )}
      </div>
      <div className="methods">
        {tipo === "firma" && !sinDibujo && <button type="button" className={!imagen ? "primary" : ""} onClick={() => setImagen(null)}>✍️ Dibujar</button>}
        {conConfeccion && <button type="button" className={confeccionando ? "primary" : ""} onClick={() => setConfeccionando(true)}>✍️ Confeccionar sello</button>}
        <button type="button" onClick={() => subir.current?.click()}>🖼️ Subir {tipo === "firma" ? "firma PNG" : txt.nombre}</button>
        <button type="button" onClick={() => camara.current?.click()}>📷 Fotografiar {txt.nombre}</button>
        {imagen && tipo !== "huella" && <button type="button" title="Si la foto salió de lado o de cabeza" onClick={async () => setImagen(await girarImagen(imagen))}>↻ Girar 90°</button>}
        <input ref={subir} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { alElegirArchivo(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { alElegirArchivo(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <div className="hintBar">{aviso}</div>
      <div className="bottom">
        <button type="button" onClick={borrar} disabled={!hayTrazo && !imagen}>Borrar {txt.nombre}</button>
        <button type="button" className="primary" onClick={continuar}>✓ Continuar</button>
      </div>
      {consejos && <ConsejosHuella dedo={dedo} alEmpezar={() => setConsejos(false)} />}
      {fotoHuella && (
        <EncajarHuella archivo={fotoHuella} alCancelar={() => setFotoHuella(null)}
          alUsar={(png) => { setImagen(png); setFotoHuella(null); setAviso("Huella lista. Si no se ve bien, prueba con otra foto."); }} />
      )}
    </div>
  );
}

/** Recorta el espacio vacío alrededor de lo dibujado y limita el tamaño del PNG. */
function recortar(origen: HTMLCanvasElement, margen = 6): string {
  const ctx = origen.getContext("2d")!;
  const { width: w, height: h } = origen;
  const px = ctx.getImageData(0, 0, w, h).data;
  let x1 = w, y1 = h, x2 = -1, y2 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 10) {
        if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      }
  if (x2 < 0) return origen.toDataURL("image/png");
  x1 = Math.max(0, x1 - margen); y1 = Math.max(0, y1 - margen); x2 = Math.min(w - 1, x2 + margen); y2 = Math.min(h - 1, y2 + margen);
  const k = Math.min(1, 900 / (x2 - x1 + 1));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round((x2 - x1 + 1) * k));
  out.height = Math.max(1, Math.round((y2 - y1 + 1) * k));
  out.getContext("2d")!.drawImage(origen, x1, y1, x2 - x1 + 1, y2 - y1 + 1, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

/**
 * Convierte la foto de una firma en papel en tinta sobre fondo transparente:
 * separa tinta y papel con el umbral de Otsu, quita el fondo y recorta.
 */
async function limpiarImagenFirma(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = mal;
      i.src = url;
    });
    const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const datos = ctx.getImageData(0, 0, c.width, c.height);
    const px = datos.data, n = c.width * c.height;
    const gris = new Uint8Array(n), hist = new Array(256).fill(0);
    for (let i = 0; i < n; i++) {
      const a = px[i * 4 + 3] / 255;
      // Lo transparente cuenta como papel blanco.
      const g = Math.round((0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) * a + 255 * (1 - a));
      gris[i] = g;
      hist[g]++;
    }
    let suma = 0, sumaB = 0, pesoB = 0, mejor = 0, umbral = 160;
    for (let t = 0; t < 256; t++) suma += t * hist[t];
    for (let t = 0; t < 256; t++) {
      pesoB += hist[t];
      if (!pesoB) continue;
      const pesoF = n - pesoB;
      if (!pesoF) break;
      sumaB += t * hist[t];
      const mB = sumaB / pesoB, mF = (suma - sumaB) / pesoF, v = pesoB * pesoF * (mB - mF) ** 2;
      if (v > mejor) { mejor = v; umbral = t; }
    }
    for (let i = 0; i < n; i++) {
      const g = gris[i];
      // Suaviza el borde: cuanto más oscuro respecto al umbral, más opaca la tinta.
      const alfa = g >= umbral ? 0 : Math.min(255, Math.round(((umbral - g) / Math.max(umbral, 1)) * 255 * 2.2));
      // Se conserva el color de la tinta (azul, rojo, morado…), algo más intenso.
      px[i * 4] = Math.round(px[i * 4] * 0.8); px[i * 4 + 1] = Math.round(px[i * 4 + 1] * 0.8); px[i * 4 + 2] = Math.round(px[i * 4 + 2] * 0.8);
      px[i * 4 + 3] = alfa;
    }
    ctx.putImageData(datos, 0, 0);
    return recortar(c, 8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Gira una imagen 90° en el sentido del reloj (firma o sello fotografiados de lado). */
async function girarImagen(src: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = src; });
  const c = document.createElement("canvas");
  c.width = img.naturalHeight;
  c.height = img.naturalWidth;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL("image/png");
}

/** Sello rectangular de doble borde con el texto centrado (el primer renglón en negrita). */
export function dibujarSello(texto: string): string {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 6);
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const fuente = (i: number) => `${i === 0 ? "800" : "600"} ${i === 0 ? 34 : 26}px Arial, sans-serif`;
  let ancho = 0;
  lineas.forEach((l, i) => { ctx.font = fuente(i); ancho = Math.max(ancho, ctx.measureText(l).width); });
  const alto = lineas.reduce((a, _, i) => a + (i === 0 ? 42 : 34), 0);
  c.width = Math.ceil(ancho + 80);
  c.height = Math.ceil(alto + 60);
  const tinta = "#1d3fae";
  ctx.strokeStyle = tinta; ctx.fillStyle = tinta;
  ctx.lineWidth = 6; ctx.strokeRect(8, 8, c.width - 16, c.height - 16);
  ctx.lineWidth = 2; ctx.strokeRect(18, 18, c.width - 36, c.height - 36);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  let y = 30;
  lineas.forEach((l, i) => { const h = i === 0 ? 42 : 34; ctx.font = fuente(i); ctx.fillText(l, c.width / 2, y + h / 2); y += h; });
  return c.toDataURL("image/png");
}
