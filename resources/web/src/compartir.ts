import { enlaceWhatsApp, urlPdf } from "./api";

/** Descarga el PDF de la solicitud. */
export function descargarPdf(token: string) {
  const a = document.createElement("a");
  a.href = urlPdf(token, true);
  a.click();
}

/**
 * Comparte el PDF como archivo (en el celular abre el menú para elegir WhatsApp);
 * si el navegador no puede compartir archivos, lo descarga y abre WhatsApp con el enlace.
 */
export async function compartirPdf(token: string, nombre: string, texto: string, telefono?: string) {
  try {
    const r = await fetch(urlPdf(token));
    if (!r.ok) throw new Error();
    const archivo = new File([await r.blob()], `${nombre}.pdf`, { type: "application/pdf" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [archivo] }))) {
      await navigator.share({ title: nombre, text: texto, files: [archivo] });
      return;
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return; // la persona cerró el menú de compartir
  }
  descargarPdf(token);
  window.open(enlaceWhatsApp(`${texto} ${location.origin}${urlPdf(token)}`, telefono), "_blank", "noopener,noreferrer");
}

export async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    prompt("Copia el enlace:", texto);
    return false;
  }
}
