import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usarT } from "./idioma";
import "./camara-en-vivo.css";

/*
 * Cámara en vivo para evidencias que deben tomarse en el momento (DNI, firma en papel con DNI, foto de rostro):
 * no ofrece galería ni subir archivos. Usa getUserMedia; si el navegador no lo permite, en el celular se puede usar
 * la cámara del sistema (input con «capture», que abre la cámara directamente). En una computadora sin cámara
 * no hay alternativa: se explica que hace falta una.
 */
export function CamaraEnVivo({ titulo, pista, frontal = false, alCapturar, alCerrar }: {
  titulo: string;
  /** Indicación sobre el visor (qué encuadrar). */
  pista: string;
  /** Cámara frontal (foto de rostro); si no, la trasera. */
  frontal?: boolean;
  alCapturar: (foto: File) => void;
  alCerrar: () => void;
}) {
  const t = usarT();
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const sistema = useRef<HTMLInputElement>(null);
  const [lista, setLista] = useState(false);
  const [error, setError] = useState("");
  const [ocupada, setOcupada] = useState(false);
  const tactil = matchMedia("(pointer: coarse)").matches;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(window.isSecureContext ? "Este navegador no permite usar la cámara desde la página." : "La cámara solo se puede usar en una conexión segura (https).");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
          facingMode: { ideal: frontal ? "user" : "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 },
        } });
        if (cancelado) { s.getTracks().forEach((p) => p.stop()); return; }
        flujo.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => undefined);
        setLista(true);
      } catch (e) {
        const n = (e as DOMException)?.name;
        setError(n === "NotAllowedError" ? "No hay permiso para usar la cámara. Actívalo en los permisos del sitio (el candado junto a la dirección) y vuelve a intentarlo."
          : n === "NotFoundError" || n === "OverconstrainedError" ? "No encontramos una cámara en este dispositivo. Abre el enlace en tu celular para tomar la foto."
          : n === "NotReadableError" ? "Otra aplicación está usando la cámara. Ciérrala e inténtalo de nuevo."
          : "No se pudo abrir la cámara.");
      }
    })();
    return () => { cancelado = true; flujo.current?.getTracks().forEach((p) => p.stop()); flujo.current = null; };
  }, [frontal]);

  async function disparar() {
    const v = video.current;
    if (!v?.videoWidth || ocupada) return;
    setOcupada(true);
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const g = c.getContext("2d")!;
    // La vista frontal se muestra como espejo; la foto se guarda sin espejo (como la ven los demás).
    g.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.92));
    setOcupada(false);
    if (blob) alCapturar(new File([blob], frontal ? "rostro.jpg" : "foto.jpg", { type: "image/jpeg" }));
  }

  return createPortal(
    <div className="cevPantalla" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="cevArriba">
        <button type="button" className="cevIcono" onClick={alCerrar} aria-label={t("Cerrar la cámara")}>✕</button>
        <strong>{titulo}</strong>
        <span className="cevIcono" aria-hidden />
      </div>
      <div className="cevEscena">
        <video ref={video} className={frontal ? "espejo" : ""} playsInline muted autoPlay />
        {lista && <div className={`cevGuia ${frontal ? "rostro" : "tarjeta"}`} aria-hidden />}
        {!error && <div className="cevPista" role="status">{lista ? t(pista) : t("Abriendo la cámara…")}</div>}
        {error && <div className="cevError" role="alert">
          <span aria-hidden>📷</span>
          <p>{t(error)}</p>
          {tactil && <button type="button" className="primary" onClick={() => sistema.current?.click()}>{t("Usar la cámara del sistema")}</button>}
          <p className="small">{t("Por seguridad, esta foto solo se puede tomar con la cámara: no se pueden subir imágenes guardadas.")}</p>
        </div>}
      </div>
      <div className="cevControles">
        <button type="button" className={`cevDisparador ${ocupada ? "ocupado" : ""}`} disabled={!lista || ocupada} onClick={disparar} aria-label={t("Tomar foto")} />
      </div>
      <input ref={sistema} type="file" accept="image/*" capture={frontal ? "user" : "environment"} hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) alCapturar(f); }} />
    </div>,
    document.body,
  );
}
