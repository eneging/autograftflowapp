/*
 * Piezas sin dependencias de «Organizar PDF» (las herramientas trabajan en el navegador): leer grupos de páginas para
 * «Dividir» y armar un .zip cuando el resultado son varios PDF.
 */

/**
 * «1-3, 4-8, 10» → [[1,2,3],[4..8],[10]]: cada parte separada por coma es un PDF. A diferencia de «Quitar páginas»,
 * un grupo puede tener todas las páginas.
 */
export function leerGrupos(texto: string, total: number): { grupos: number[][] } | { error: string } {
  const partes = texto.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (!partes.length) return { error: "Escribe los rangos. Ej.: 1-3, 4-8" };
  const grupos: number[][] = [];
  for (const parte of partes) {
    const m = /^(\d+)\s*(?:[-–—]\s*(\d+))?$/.exec(parte);
    if (!m) return { error: `No se entiende «${parte}». Usa guiones para rangos y comas para separar cada PDF. Ej.: 1-3, 4-8` };
    let [desde, hasta] = [Number(m[1]), Number(m[2] ?? m[1])];
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    if (desde < 1 || hasta > total) return { error: `El PDF tiene ${total} página${total === 1 ? "" : "s"}: «${parte}» no existe.` };
    grupos.push(Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i));
  }
  return { grupos };
}

/** Grupos de n páginas seguidas: 10 páginas cada 4 → [1-4], [5-8], [9-10]. */
export const gruposCada = (n: number, total: number): number[][] =>
  Array.from({ length: Math.ceil(total / n) }, (_, g) => Array.from({ length: Math.min(n, total - g * n) }, (_, i) => g * n + i + 1));

/** «Contrato final.pdf» + «unido» → «Contrato final-unido.pdf». */
export const nombreSalida = (original: string, sufijo: string, extension = "pdf") =>
  `${original.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "documento"}-${sufijo}.${extension}`;

// ---------------------------------------------------------------- ZIP (sin compresión: los PDF ya van comprimidos)

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Un .zip con los archivos tal cual (método «store»), nombres en UTF-8. */
export function crearZip(archivos: { nombre: string; datos: Uint8Array }[]): Blob {
  const utf8 = new TextEncoder();
  const partes: BlobPart[] = [], central: BlobPart[] = [];
  let desplazamiento = 0, tamCentral = 0;
  for (const a of archivos) {
    const nombre = utf8.encode(a.nombre), crc = crc32(a.datos), n = a.datos.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // UTF-8
    local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true); // store, 01/01/1980
    local.setUint32(14, crc, true); local.setUint32(18, n, true); local.setUint32(22, n, true);
    local.setUint16(26, nombre.length, true); local.setUint16(28, 0, true);
    partes.push(local.buffer, nombre as BlobPart, a.datos as BlobPart);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, n, true); c.setUint32(24, n, true); c.setUint16(28, nombre.length, true);
    c.setUint32(42, desplazamiento, true);
    central.push(c.buffer, nombre as BlobPart);
    desplazamiento += 30 + nombre.length + n;
    tamCentral += 46 + nombre.length;
  }
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, desplazamiento, true);
  return new Blob([...partes, ...central, fin.buffer], { type: "application/zip" });
}
