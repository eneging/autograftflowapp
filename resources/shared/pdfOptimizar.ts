import {
  decodePDFRawStream, degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, type PDFObject, type PDFPage,
} from "pdf-lib";
import { crc32 } from "./pdfHerramientas";

/*
 * Armar un PDF con páginas de otros sin que pese de más y sin perder calidad (nada se vuelve a comprimir con pérdida):
 *  - Lo compartido (fuentes, imágenes, perfiles de color) se copia una sola vez: pdf-lib solo lo reconoce dentro de una
 *    misma llamada a copyPages. Copiando página por página, cada una se lleva su propia copia de todo.
 *  - Lo que solo sirve para llegar a otras páginas no se copia: si no, una página extraída arrastra las demás.
 *  - Los recursos que la página declara pero no usa, tampoco (hay PDF con una lista común para todas las páginas).
 *  - Al final se unen los datos repetidos y se comprime lo que venía sin comprimir.
 */

/** Una página del resultado: de qué fuente, cuál (desde 0) y cuánto girarla (además de su giro original). */
export interface Pieza { fuente: string; pagina: number; giro: number }

const nombre = (n: string) => PDFName.of(n);
/** El nombre sin «/» y con los #xx resueltos, para comparar el de la lista de recursos con el del contenido. */
const textoNombre = (s: string) => s.replace(/^\//, "").replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

/** Todos los nombres («/Im0») que aparecen en el contenido de la página; null si no se puede leer. */
function nombresDelContenido(p: PDFPage): Set<string> | null {
  const ctx = p.doc.context, contenido = p.node.Contents();
  if (!contenido) return new Set();
  const flujos: PDFObject[] = contenido instanceof PDFArray ? contenido.asArray().map((o) => ctx.lookup(o) as PDFObject) : [contenido];
  const vistos = new Set<string>();
  try {
    for (const f of flujos) {
      if (!(f instanceof PDFRawStream)) return null;
      const texto = new TextDecoder("latin1").decode(decodePDFRawStream(f).decode());
      for (const m of texto.matchAll(/\/([^\s/<>[\]()%{}]+)/g)) vistos.add(textoNombre(m[1]));
    }
  } catch { return null; }
  return vistos;
}

/**
 * Deja en los recursos de la página solo las imágenes y fuentes que su contenido nombra. Es prudente: un diseño
 * (Form XObject) sin recursos propios usa los de la página, y entonces no se puede saber qué necesita y no se toca nada.
 */
function quitarRecursosSinUso(p: PDFPage) {
  const ctx = p.doc.context, recursos = p.node.Resources();
  if (!recursos) return;
  const usados = nombresDelContenido(p);
  if (!usados) return;
  const xobjects = recursos.lookupMaybe(nombre("XObject"), PDFDict);
  for (const [, valor] of xobjects?.entries() ?? []) {
    const x = ctx.lookup(valor);
    if (x instanceof PDFStream && x.dict.lookup(nombre("Subtype")) === nombre("Form") && !x.dict.has(nombre("Resources"))) return;
  }
  const nuevos = recursos.clone(ctx);
  for (const tipo of ["XObject", "Font"]) {
    const lista = recursos.lookupMaybe(nombre(tipo), PDFDict);
    if (!lista) continue;
    const copia = lista.clone(ctx);
    for (const clave of lista.keys()) if (!usados.has(textoNombre(clave.asString()))) copia.delete(clave);
    nuevos.set(nombre(tipo), copia);
  }
  p.node.set(nombre("Resources"), nuevos);
}

/**
 * Corta los caminos de una página hacia las demás, que harían copiar sus contenidos: la miniatura, los datos privados
 * del programa que hizo el PDF, los hilos de artículos, la referencia de cada anotación a su página y los enlaces
 * internos (al copiar, un enlace a otra página deja de funcionar: no se pierde nada y evita arrastrar esa página).
 */
function aislarPaginas(todas: PDFPage[]) {
  for (const p of todas) {
    const ctx = p.doc.context;
    for (const clave of ["Thumb", "PieceInfo", "B"]) p.node.delete(nombre(clave));
    const anotaciones = p.node.Annots();
    if (!anotaciones) continue;
    const quedan: PDFObject[] = [];
    for (const o of anotaciones.asArray()) {
      const a = ctx.lookup(o);
      if (a instanceof PDFDict) {
        a.delete(nombre("P"));
        const accion = a.lookupMaybe(nombre("A"), PDFDict);
        const destino = a.lookup(nombre("Dest")) ?? accion?.lookup(nombre("D"));
        if (a.lookup(nombre("Subtype")) === nombre("Link") && destino instanceof PDFArray) continue;
      }
      quedan.push(o);
    }
    p.node.set(nombre("Annots"), ctx.obj(quedan));
  }
}

/** Cambia las referencias a un objeto repetido por la del que se conserva, en todo lo que cuelga de este objeto. */
function cambiarReferencias(o: PDFObject | undefined, cambios: Map<string, PDFRef>) {
  const dict = o instanceof PDFStream ? o.dict : o;
  if (dict instanceof PDFDict) {
    for (const [k, v] of dict.entries()) {
      const nuevo = v instanceof PDFRef ? cambios.get(v.toString()) : undefined;
      if (nuevo) dict.set(k, nuevo); else cambiarReferencias(v, cambios);
    }
  } else if (dict instanceof PDFArray) {
    for (let i = 0; i < dict.size(); i++) {
      const v = dict.get(i), nuevo = v instanceof PDFRef ? cambios.get(v.toString()) : undefined;
      if (nuevo) dict.set(i, nuevo); else cambiarReferencias(v, cambios);
    }
  }
}

const iguales = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/** Une los flujos idénticos (el mismo logo en varios archivos, o un PDF que ya venía con todo repetido). */
function unirRepetidos(pdf: PDFDocument) {
  const ctx = pdf.context;
  // Unir una imagen puede dejar iguales a las que apuntaban a ella (p. ej., por su máscara): por eso más de una vuelta.
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const vistos = new Map<string, { ref: PDFRef; datos: Uint8Array }[]>(), cambios = new Map<string, PDFRef>();
    for (const [ref, o] of ctx.enumerateIndirectObjects()) {
      if (!(o instanceof PDFRawStream)) continue;
      const clave = `${o.contents.length}:${crc32(o.contents)}:${o.dict.toString()}`;
      const grupo = vistos.get(clave) ?? [];
      const igual = grupo.find((g) => iguales(g.datos, o.contents));
      if (igual) cambios.set(ref.toString(), igual.ref);
      else { grupo.push({ ref, datos: o.contents }); vistos.set(clave, grupo); }
    }
    if (!cambios.size) return;
    for (const [, o] of ctx.enumerateIndirectObjects()) cambiarReferencias(o, cambios);
    for (const [ref] of ctx.enumerateIndirectObjects()) if (cambios.has(ref.toString())) ctx.delete(ref);
  }
}

async function desinflar(datos: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([datos as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

/** Comprime lo que venía sin comprimir. Los metadatos XML quedan legibles, como pide el formato. */
async function comprimirSueltos(pdf: PDFDocument) {
  if (typeof CompressionStream === "undefined") return; // navegador antiguo: solo se ahorra menos
  for (const [ref, o] of pdf.context.enumerateIndirectObjects()) {
    if (!(o instanceof PDFRawStream) || o.dict.has(nombre("Filter")) || o.contents.length < 256) continue;
    if (o.dict.lookup(nombre("Type")) === nombre("Metadata")) continue;
    const comprimido = await desinflar(o.contents);
    if (comprimido.length >= o.contents.length) continue;
    const dict = o.dict.clone(pdf.context);
    dict.set(nombre("Filter"), nombre("FlateDecode"));
    pdf.context.assign(ref, PDFRawStream.of(dict, comprimido));
  }
}

/** ¿El resultado sería exactamente este archivo? Todas sus páginas, en orden y sin girar. */
export const esArchivoIntacto = (piezas: Pieza[], paginas: number) =>
  piezas.length === paginas && piezas.every((p, i) => p.pagina === i && !p.giro);

/**
 * El PDF con estas páginas, en este orden. `fuentes` da el documento ya leído de cada fuente; se modifica (se le cortan
 * los caminos entre páginas), así que no se debe reutilizar. alAvance: de 0 a 1.
 */
export async function armarOptimizado(piezas: Pieza[], fuentes: Map<string, PDFDocument>, alAvance: (f: number) => void = () => {}): Promise<Uint8Array> {
  const salida = await PDFDocument.create();
  const copias = new Map<string, PDFPage[]>();
  let hechas = 0;
  for (const [id, src] of fuentes) {
    const indices = piezas.filter((p) => p.fuente === id).map((p) => p.pagina);
    const paginas = src.getPages();
    aislarPaginas(paginas);
    for (const i of new Set(indices)) quitarRecursosSinUso(paginas[i]);
    // Una sola llamada por archivo: es lo que hace que lo compartido se copie una vez.
    copias.set(id, await salida.copyPages(src, indices));
    hechas += indices.length;
    alAvance((hechas / piezas.length) * 0.8);
  }
  for (const p of piezas) {
    const pagina = copias.get(p.fuente)!.shift()!;
    if (p.giro) pagina.setRotation(degrees((((pagina.getRotation().angle + p.giro) % 360) + 360) % 360));
    salida.addPage(pagina);
  }
  unirRepetidos(salida);
  await comprimirSueltos(salida);
  alAvance(0.95);
  const bytes = await salida.save();
  alAvance(1);
  return bytes;
}
