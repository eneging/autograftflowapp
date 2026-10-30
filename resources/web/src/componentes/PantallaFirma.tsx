import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import type { Dedo, Mano } from "../../../shared/plataforma";
import { girarRecorte, type Recorte } from "../../../shared/firmaImagen";
import { ConsejosHuella, EncajarHuella, girar } from "./Huella";
import { textoDedoEn, usarIdioma, usarT } from "./idioma";
import { cargarFoto, pngSinRetoques, recortar, RecortarFirma } from "./RecortarFirma";

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

interface FotoRecortable { lienzo: HTMLCanvasElement; recorte: Recorte | null }

/** Pantalla completa de firma: dibujar, subir una imagen o fotografiar la firma en papel. */
export function PantallaFirma({ titulo, tipo = "firma", inicial, alTerminar, alCerrar, bloquearDibujo = false, bloquearSello = false, dedo = null }: Props) {
  const t = usarT(), idioma = usarIdioma();
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
  // Foto original de la imagen actual (para volver a ajustar el recorte) y foto abierta en el recorte.
  const [foto, setFoto] = useState<FotoRecortable | null>(null);
  const [recortando, setRecortando] = useState<FotoRecortable | null>(null);
  const [hayTrazo, setHayTrazo] = useState(false);
  const [aviso, setAviso] = useState(
    sinDibujo ? t("Este documento requiere tu firma real: fírmala en papel y tómale una foto, o sube una imagen de tu firma.")
      : tipo === "sello" && bloquearSello ? t("Este documento requiere tu sello real: fotografíalo o sube una imagen.")
      : tipo === "huella" && dedo ? t("{dedo}: sube o fotografía la foto de tu dedo.", { dedo: textoDedoEn(idioma, dedo) }) : t(txt.aviso));
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
    setFoto(null);
  };

  function ponerImagen(png: string, deFoto: FotoRecortable | null) {
    setImagen(png);
    setFoto(deFoto);
    pad.current?.clear();
    setHayTrazo(false);
    setConfeccionando(false);
  }

  /** Gira la imagen y, si viene de una foto, también la foto y su recorte: al volver a ajustarla sigue igual. */
  async function girarTodo() {
    setImagen(await girarImagen(imagen!));
    if (foto) setFoto({ lienzo: girar(foto.lienzo), recorte: foto.recorte && girarRecorte(foto.recorte) });
  }

  async function alElegirArchivo(archivo?: File) {
    if (!archivo) return;
    if (!/^image\//.test(archivo.type)) return setAviso(t("El archivo debe ser una imagen (PNG o JPG)."));
    if (tipo === "huella") { setFotoHuella(archivo); return; }
    setAviso(t("Procesando la imagen…"));
    try {
      // Un PNG ya viene preparado: se usa tal cual. Una foto pasa por el recorte y la limpieza.
      if (archivo.type === "image/png") {
        ponerImagen(await pngSinRetoques(archivo), null);
        setAviso(t("Imagen PNG lista: se usa tal cual, sin retoques."));
      } else {
        setRecortando({ lienzo: await cargarFoto(archivo), recorte: null });
        setAviso(t(txt.aviso));
      }
    } catch {
      setAviso(t("No se pudo leer la imagen. Prueba con otra."));
    }
  }

  const continuar = () => {
    if (imagen) return alTerminar(imagen);
    if (pad.current && !pad.current.isEmpty()) return alTerminar(recortar(lienzo.current!));
    setAviso(t(tipo === "firma" ? "Primero dibuja, sube o fotografía tu firma." : tipo === "sello" ? "Primero confecciona, sube o fotografía tu sello." : "Primero sube o fotografía tu huella."));
  };

  const vista = imagen ?? inicial;

  return (
    <div id="screen" role="dialog" aria-label={titulo}>
      <div className="top">
        <strong>{titulo}</strong>
        <div className="topRight">
          {vista && !hayTrazo && <div className="spreview"><img src={vista} alt={t("Vista previa de firma")} /></div>}
          <button type="button" onClick={alCerrar}>{t("Cerrar")}</button>
        </div>
      </div>
      <div className="area">
        <div className="water">{t(sinDibujo ? "FOTOGRAFÍA O SUBE TU FIRMA" : txt.marca)}</div>
        <canvas ref={lienzo} id="ink" aria-label={t("Recuadro para firmar")} />
        {imagen && <img className="areaImg" src={imagen} alt={t("Imagen subida")} />}
        {conConfeccion && confeccionando && (
          <div className="stampMaker">
            <label className="smLabel" htmlFor="textoSello">{t("Escribe el contenido de tu sello (cada renglón en una línea)")}</label>
            <textarea id="textoSello" rows={3} maxLength={200} value={textoSello} onChange={(e) => setTextoSello(e.target.value)}
              placeholder={t("Ej.\nJUAN PÉREZ LÓPEZ\nGerente General\nDNI 12345678")} />
            <div className="smLabel">{t("Vista previa")}</div>
            <div className="smPreviewWrap">{textoSello.trim() ? <img src={dibujarSello(textoSello)} alt={t("Vista previa del sello")} /> : <span className="afExtraHint">{t("Escribe para ver tu sello")}</span>}</div>
            <div className="row smActions">
              <button type="button" className="success" disabled={!textoSello.trim()} onClick={() => { ponerImagen(dibujarSello(textoSello), null); setAviso(t("Sello listo.")); }}>{t("✓ Usar este sello")}</button>
            </div>
          </div>
        )}
      </div>
      <div className="methods">
        {tipo === "firma" && !sinDibujo && <button type="button" className={!imagen ? "primary" : ""} onClick={() => { setImagen(null); setFoto(null); }}>{t("✍️ Dibujar")}</button>}
        {conConfeccion && <button type="button" className={confeccionando ? "primary" : ""} onClick={() => setConfeccionando(true)}>{t("✍️ Confeccionar sello")}</button>}
        <button type="button" onClick={() => subir.current?.click()}>{t(`🖼️ Subir ${tipo === "firma" ? "firma PNG" : txt.nombre}`)}</button>
        <button type="button" onClick={() => camara.current?.click()}>{t(`📷 Fotografiar ${txt.nombre}`)}</button>
        {imagen && foto && <button type="button" onClick={() => setRecortando(foto)}>{t("✂️ Ajustar recorte")}</button>}
        {imagen && tipo !== "huella" && <button type="button" title={t("Si la foto salió de lado o de cabeza")} onClick={girarTodo}>{t("↻ Girar 90°")}</button>}
        <input ref={subir} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { alElegirArchivo(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { alElegirArchivo(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <div className="hintBar">{aviso}</div>
      <div className="bottom">
        <button type="button" onClick={borrar} disabled={!hayTrazo && !imagen}>{t(`Borrar ${txt.nombre}`)}</button>
        <button type="button" className="primary" onClick={continuar}>{t("✓ Continuar")}</button>
      </div>
      {recortando && tipo !== "huella" && (
        <RecortarFirma foto={recortando.lienzo} recorte={recortando.recorte} tipo={tipo} alCancelar={() => setRecortando(null)}
          alUsar={(png, lienzo, recorte) => {
            ponerImagen(png, { lienzo, recorte });
            setRecortando(null);
            setAviso(t(tipo === "firma" ? "Listo: se recortó la imagen y se quitó el fondo. Si no se ve bien, ajusta el recorte, prueba con otra foto o dibújala." : "Listo: se recortó la imagen y se quitó el fondo. Si no se ve bien, ajusta el recorte o prueba con otra foto."));
          }} />
      )}
      {consejos && <ConsejosHuella dedo={dedo} alEmpezar={() => setConsejos(false)} />}
      {fotoHuella && (
        <EncajarHuella archivo={fotoHuella} alCancelar={() => setFotoHuella(null)}
          alUsar={(png) => { setImagen(png); setFotoHuella(null); setAviso(t("Huella lista. Si no se ve bien, prueba con otra foto.")); }} />
      )}
    </div>
  );
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
