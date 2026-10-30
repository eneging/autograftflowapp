import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFString, StandardFonts, type PDFImage } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { armarOptimizado, esArchivoIntacto, type Pieza } from "./pdfOptimizar";

/** PNG liso con ruido (no se comprime casi): pesa de verdad, como una foto o un logo grande. */
function pngRuido(semilla: number, lado = 400): Uint8Array {
  const filas = new Uint8Array((lado * 3 + 1) * lado);
  let x = semilla;
  for (let i = 0; i < filas.length; i++) { x = (x * 1664525 + 1013904223) >>> 0; filas[i] = i % (lado * 3 + 1) === 0 ? 0 : x >>> 24; }
  const crc = (b: Uint8Array) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
  const trozo = (t: string, d: Uint8Array) => {
    const o = new Uint8Array(12 + d.length), v = new DataView(o.buffer);
    v.setUint32(0, d.length); for (let i = 0; i < 4; i++) o[4 + i] = t.charCodeAt(i);
    o.set(d, 8); v.setUint32(8 + d.length, crc(o.subarray(4, 8 + d.length)));
    return o;
  };
  const ih = new Uint8Array(13), v = new DataView(ih.buffer);
  v.setUint32(0, lado); v.setUint32(4, lado); ih[8] = 8; ih[9] = 2;
  const partes = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), trozo("IHDR", ih), trozo("IDAT", deflateSync(filas)), trozo("IEND", new Uint8Array())];
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let n = 0; for (const p of partes) { out.set(p, n); n += p.length; }
  return out;
}

/** N páginas que comparten una imagen y una fuente, cada una con su texto. */
async function pdfCompartido(paginas: number, semilla = 7): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(pngRuido(semilla)), letra = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < paginas; i++) {
    const p = pdf.addPage([400, 500]);
    p.drawImage(img, { x: 20, y: 200, width: 200, height: 200 });
    p.drawText(`Pagina ${i + 1}`, { x: 20, y: 100, size: 18, font: letra });
  }
  return pdf.save();
}

const armar = async (piezas: Pieza[], fuentes: Record<string, Uint8Array>) => {
  const docs = new Map<string, PDFDocument>();
  for (const id of new Set(piezas.map((p) => p.fuente))) docs.set(id, await PDFDocument.load(fuentes[id], { updateMetadata: false }));
  return armarOptimizado(piezas, docs);
};
const paginasDe = (fuente: string, indices: number[]): Pieza[] => indices.map((pagina) => ({ fuente, pagina, giro: 0 }));

/** Lo que dibuja cada página según pdf.js: su texto y la lista de operaciones. */
async function dibujo(bytes: Uint8Array) {
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const paginas: { texto: string; ops: number[]; giro: number }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const texto = (await p.getTextContent()).items.map((t) => ("str" in t ? t.str : "")).join("");
    paginas.push({ texto, ops: [...(await p.getOperatorList()).fnArray], giro: p.rotate });
  }
  await doc.destroy();
  return paginas;
}

describe("armarOptimizado", () => {
  it("quitar una página no hace crecer el PDF (página por página sí: es lo que se corrigió)", async () => {
    const original = await pdfCompartido(12);
    const indices = Array.from({ length: 11 }, (_, i) => i);
    const nuevo = await armar(paginasDe("a", indices), { a: original });

    const src = await PDFDocument.load(original), antes = await PDFDocument.create();
    for (const i of indices) { const [p] = await antes.copyPages(src, [i]); antes.addPage(p); }
    const metodoAnterior = (await antes.save()).length;

    expect(metodoAnterior).toBeGreaterThan(original.length * 5); // el problema, reproducido
    expect(nuevo.length).toBeLessThanOrEqual(original.length * 1.02);
  });

  it("dibuja lo mismo que el original, en el orden pedido", async () => {
    const original = await pdfCompartido(5);
    const esperado = await dibujo(original);
    const resultado = await dibujo(await armar(paginasDe("a", [4, 0, 2]), { a: original }));
    expect(resultado.map((p) => p.texto)).toEqual(["Pagina 5", "Pagina 1", "Pagina 3"]);
    expect(resultado.map((p) => p.ops)).toEqual([esperado[4].ops, esperado[0].ops, esperado[2].ops]);
  });

  it("conserva el giro y permite repetir una página", async () => {
    const r = await dibujo(await armar([{ fuente: "a", pagina: 1, giro: 90 }, { fuente: "a", pagina: 1, giro: 0 }], { a: await pdfCompartido(3) }));
    expect(r.map((p) => [p.texto, p.giro])).toEqual([["Pagina 2", 90], ["Pagina 2", 0]]);
  });

  it("unir archivos con la misma imagen la guarda una sola vez", async () => {
    const a = await pdfCompartido(2), b = await pdfCompartido(2);
    const unido = await armar([...paginasDe("a", [0, 1]), ...paginasDe("b", [0, 1])], { a, b });
    expect(unido.length).toBeLessThan(a.length * 1.1);
    expect((await dibujo(unido)).map((p) => p.texto)).toEqual(["Pagina 1", "Pagina 2", "Pagina 1", "Pagina 2"]);
  });

  it("imágenes distintas no se unen", async () => {
    const a = await pdfCompartido(1, 1), b = await pdfCompartido(1, 2);
    expect((await armar([...paginasDe("a", [0]), ...paginasDe("b", [0])], { a, b })).length).toBeGreaterThan(a.length * 1.8);
  });

  it("repara un PDF que ya venía con todo repetido", async () => {
    const src = await PDFDocument.load(await pdfCompartido(6)), hinchado = await PDFDocument.create();
    for (let i = 0; i < 6; i++) { const [p] = await hinchado.copyPages(src, [i]); hinchado.addPage(p); }
    const bytes = await hinchado.save();
    const r = await armar(paginasDe("a", [0, 1, 2, 3, 4, 5]), { a: bytes });
    expect(r.length).toBeLessThan(bytes.length / 4);
    expect((await dibujo(r)).map((p) => p.texto)[5]).toBe("Pagina 6");
  });

  it("una página extraída no arrastra las imágenes de una lista común de recursos", async () => {
    const pdf = await PDFDocument.create(), letra = await pdf.embedFont(StandardFonts.Helvetica);
    const imgs: PDFImage[] = [];
    for (let i = 0; i < 4; i++) imgs.push(await pdf.embedPng(pngRuido(100 + i)));
    const paginas = imgs.map((img, i) => { const p = pdf.addPage([400, 500]); p.drawImage(img, { x: 0, y: 0, width: 100, height: 100 }); p.drawText(`P${i}`, { x: 10, y: 200, font: letra }); return p; });
    // Todas las páginas declaran todas las imágenes, como hacen algunos programas.
    const comun = pdf.context.obj({});
    for (const p of paginas) {
      const x = p.node.normalizedEntries().XObject;
      for (const [k, v] of x.entries()) comun.set(k, v);
    }
    const ref = pdf.context.register(comun);
    for (const p of paginas) p.node.normalizedEntries().Resources.set(PDFName.of("XObject"), ref);
    const bytes = await pdf.save();

    const r = await armar(paginasDe("a", [2]), { a: bytes });
    expect(r.length).toBeLessThan(bytes.length / 2.5);
    const [hoja] = await dibujo(r), [orig] = (await dibujo(bytes)).slice(2);
    expect(hoja.texto).toBe("P2");
    expect(hoja.ops).toEqual(orig.ops);
  });

  it("no toca los recursos si un diseño sin recursos propios podría usarlos", async () => {
    const pdf = await PDFDocument.create(), p = pdf.addPage([200, 200]);
    p.drawImage(await pdf.embedPng(pngRuido(9, 60)), { x: 0, y: 0, width: 50, height: 50 });
    const nombreImg = p.node.normalizedEntries().XObject.keys()[0].asString();
    const forma = pdf.context.register(pdf.context.stream(`q 10 0 0 10 0 0 cm ${nombreImg} Do Q`, { Type: "XObject", Subtype: "Form", BBox: [0, 0, 200, 200] }));
    p.node.normalizedEntries().XObject.set(PDFName.of("Fm1"), forma);
    p.pushOperators(); // contenido de la página sin nombrar la imagen directamente
    const c = pdf.context.register(pdf.context.flateStream("/Fm1 Do"));
    p.node.set(PDFName.of("Contents"), c);
    const bytes = await pdf.save();
    const r = await PDFDocument.load(await armar(paginasDe("a", [0]), { a: bytes }));
    const x = r.getPage(0).node.Resources()!.lookup(PDFName.of("XObject")) as ReturnType<typeof p.node.normalizedEntries>["XObject"];
    expect(x.keys().map((k) => k.asString()).sort()).toEqual([nombreImg, "/Fm1"].sort());
  });

  it("un enlace a una página quitada no la arrastra", async () => {
    const pdf = await PDFDocument.create();
    const [uno, dos] = [pdf.addPage([200, 200]), pdf.addPage([200, 200])];
    dos.drawImage(await pdf.embedPng(pngRuido(33)), { x: 0, y: 0, width: 100, height: 100 });
    const enlace = pdf.context.register(pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 50, 50], Dest: [dos.ref, PDFName.of("Fit")] }));
    const web = pdf.context.register(pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [60, 0, 90, 50], A: { S: "URI", URI: PDFString.of("https://ejemplo.com") } }));
    uno.node.set(PDFName.of("Annots"), pdf.context.obj([enlace, web]));
    const bytes = await pdf.save();
    const r = await armar(paginasDe("a", [0]), { a: bytes });
    expect(r.length).toBeLessThan(bytes.length / 5);
    // El enlace a una web se conserva.
    const annots = (await PDFDocument.load(r)).getPage(0).node.Annots() as PDFArray;
    expect(annots.size()).toBe(1);
  });

  it("comprime lo que venía sin comprimir, sin alterarlo", async () => {
    const pdf = await PDFDocument.create(), p = pdf.addPage([200, 200]);
    const texto = "BT /F1 12 Tf 10 10 Td (Hola) Tj ET\n".repeat(400);
    p.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.stream(texto)));
    const bytes = await pdf.save();
    const r = await armar(paginasDe("a", [0]), { a: bytes });
    expect(r.length).toBeLessThan(bytes.length / 2);
    const contenido = (await PDFDocument.load(r)).getPage(0).node.Contents();
    expect(contenido).toBeInstanceOf(PDFRawStream);
    expect((contenido as PDFRawStream).getContentsString().length).toBeLessThan(texto.length);
  });

  it.each(["tests/fixtures/contrato.pdf", "resources/pdf/plantilla-reembolso.pdf"])("archivo real %s: mismo dibujo y no crece", async (ruta) => {
    const bytes = new Uint8Array(readFileSync(ruta));
    const esperado = await dibujo(bytes);
    const r = await armar(paginasDe("a", esperado.map((_, i) => i).reverse()), { a: bytes });
    const resultado = await dibujo(r);
    expect(resultado.map((p) => p.ops)).toEqual([...esperado].reverse().map((p) => p.ops));
    expect(resultado.map((p) => p.texto)).toEqual([...esperado].reverse().map((p) => p.texto));
    expect(r.length).toBeLessThanOrEqual(bytes.length * 1.05);
  });
});

describe("esArchivoIntacto", () => {
  it("todas, en orden y sin girar", () => expect(esArchivoIntacto(paginasDe("a", [0, 1, 2]), 3)).toBe(true));
  it("faltan páginas, otro orden o giro: no", () => {
    expect(esArchivoIntacto(paginasDe("a", [0, 1]), 3)).toBe(false);
    expect(esArchivoIntacto(paginasDe("a", [1, 0]), 2)).toBe(false);
    expect(esArchivoIntacto([{ fuente: "a", pagina: 0, giro: 90 }], 1)).toBe(false);
  });
});
