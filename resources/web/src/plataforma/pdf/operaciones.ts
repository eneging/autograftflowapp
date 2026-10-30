import { PDFDocument } from "pdf-lib";
import { armarOptimizado, esArchivoIntacto } from "../../../../shared/pdfOptimizar";
import { leerPdf } from "../VisorPdf";
import { vistaPrevia, type Esquinas, type Filtro } from "./escaner";

/*
 * «Organizar PDF» trabaja en el navegador: los archivos no se suben al servidor. pdf.js dibuja las miniaturas y
 * pdf-lib arma los PDF de salida copiando las páginas tal cual (sin volver a imprimirlas: no pierden calidad y, con
 * armarOptimizado, tampoco pesan de más).
 */
export type VistaPdf = Awaited<ReturnType<typeof leerPdf>>;
export interface ArchivoPdf { id: string; nombre: string; bytes: Uint8Array; paginas: number; vista: VistaPdf }
/** Una página en el resultado: de qué archivo, cuál (desde 0) y cuánto girarla (además de su giro original). */
export interface Hoja { id: string; archivo: string; pagina: number; giro: number }

let contador = 0;
export const nuevoId = (p: string) => `${p}${Date.now().toString(36)}${contador++}`;

/** Límite por archivo: todo se procesa en la memoria del dispositivo. */
export const MAX_BYTES = 150 * 1024 * 1024;

export async function abrirPdf(f: File): Promise<ArchivoPdf> {
  if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) throw new Error(`«${f.name}» no es un PDF.`);
  if (f.size > MAX_BYTES) throw new Error(`«${f.name}» pesa más de ${MAX_BYTES / 1024 / 1024} MB.`);
  const bytes = new Uint8Array(await f.arrayBuffer());
  try {
    const vista = await leerPdf(bytes.slice());
    return { id: nuevoId("a"), nombre: f.name, bytes, paginas: vista.numPages, vista };
  } catch (e) {
    if ((e as Error)?.name === "PasswordException") throw new Error(`«${f.name}» está protegido con contraseña. Quita la protección y vuelve a intentarlo.`);
    throw new Error(`«${f.name}» no es un PDF válido o está dañado.`);
  }
}

export const hojasDe = (a: ArchivoPdf): Hoja[] => Array.from({ length: a.paginas }, (_, i) => ({ id: nuevoId("h"), archivo: a.id, pagina: i, giro: 0 }));

/** Un PDF nuevo con estas hojas, en este orden y con su giro. alAvance: de 0 a 1. */
export async function armarPdf(hojas: Hoja[], archivos: ArchivoPdf[], alAvance: (f: number) => void = () => {}): Promise<Uint8Array> {
  const piezas = hojas.map((h) => ({ fuente: h.archivo, pagina: h.pagina, giro: h.giro }));
  const fuentes = new Map<string, PDFDocument>();
  let intacto: ArchivoPdf | null = null;
  for (const id of new Set(hojas.map((h) => h.archivo))) {
    const a = archivos.find((x) => x.id === id);
    if (!a) throw new Error("Falta uno de los archivos.");
    if (hojas.every((h) => h.archivo === id) && esArchivoIntacto(piezas, a.paginas)) intacto = a;
    try { fuentes.set(id, await PDFDocument.load(a.bytes, { updateMetadata: false })); }
    catch {
      if (intacto) { alAvance(1); return intacto.bytes.slice(); }
      throw new Error(`No se pudo leer «${a.nombre}» para armar el resultado (¿está protegido?).`);
    }
  }
  const bytes = await armarOptimizado(piezas, fuentes, alAvance);
  // Sin cambios, se conserva el archivo tal cual (con sus marcadores y formularios), salvo que venga muy inflado.
  return intacto && bytes.length > intacto.bytes.length * 0.9 ? intacto.bytes.slice() : bytes;
}

// ---------------------------------------------------------------- escanear

/**
 * Una página escaneada: «original» es la foto tal cual y «url» la hoja ya enderezada según sus «esquinas» (son la misma
 * si no se recortó). El filtro y el giro se aplican al armar el PDF.
 */
export interface Foto { id: string; nombre: string; original: string; url: string; esquinas: Esquinas; filtro: Filtro; giro: number; carnet?: boolean }
export type TamanoHoja = "a4" | "carta" | "imagen";
const TAMANOS: Record<Exclude<TamanoHoja, "imagen">, [number, number]> = { a4: [595.28, 841.89], carta: [612, 792] };

/** La hoja girada, con su filtro y nitidez (lado mayor hasta 2480 px: A4 a unos 210 ppp), como JPEG. */
async function prepararFoto(f: Foto): Promise<{ jpg: Uint8Array; ancho: number; alto: number }> {
  const c = await vistaPrevia(f.url, f.filtro, 2480, f.giro);
  const blob = await new Promise<Blob>((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo convertir la imagen."))), "image/jpeg", 0.88));
  return { jpg: new Uint8Array(await blob.arrayBuffer()), ancho: c.width, alto: c.height };
}

/** Un PDF con una foto por página. En A4 o Carta la foto se centra con margen; «imagen» usa su propio tamaño. */
export async function fotosAPdf(fotos: Foto[], opciones: { tamano: TamanoHoja; margen: boolean }, alAvance: (f: number) => void = () => {}) {
  const pdf = await PDFDocument.create();
  for (const [i, f] of fotos.entries()) {
    const { jpg, ancho, alto } = await prepararFoto(f);
    const imagen = await pdf.embedJpg(jpg);
    if (opciones.tamano === "imagen") {
      // 150 ppp: la página mide lo que mediría la foto impresa.
      const [pw, ph] = [(ancho * 72) / 150, (alto * 72) / 150];
      pdf.addPage([pw, ph]).drawImage(imagen, { x: 0, y: 0, width: pw, height: ph });
    } else {
      let [pw, ph] = TAMANOS[opciones.tamano];
      if (ancho > alto) [pw, ph] = [ph, pw]; // foto apaisada: hoja apaisada
      const m = opciones.margen ? 24 : 0, e = Math.min((pw - 2 * m) / ancho, (ph - 2 * m) / alto);
      const [w, h] = [ancho * e, alto * e];
      pdf.addPage([pw, ph]).drawImage(imagen, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    alAvance((i + 1) / fotos.length);
  }
  return pdf.save();
}

// ---------------------------------------------------------------- descargar

export function descargar(datos: Blob | Uint8Array, nombre: string) {
  const blob = datos instanceof Blob ? datos : new Blob([datos as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
