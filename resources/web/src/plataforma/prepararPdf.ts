import { PDFCheckBox, PDFDocument, PDFSignature, PDFTextField, degrees } from "pdf-lib";
import { LIMITES_PLATAFORMA, type TipoCampo } from "../../../shared/plataforma";

export interface CampoDetectado { tipo: TipoCampo; pagina: number; x: number; y: number; w: number; h: number; etiqueta: string }

/**
 * Prepara en el navegador un PDF antes de subirlo (en hosting compartido no hay Node en el servidor):
 *  - endereza las páginas giradas o recortadas, para que lo que se ve coincida con las coordenadas de los campos;
 *  - detecta sus campos rellenables (texto, casillas, firmas) para sugerirlos en el editor;
 *  - lo guarda sin «object streams»: así lo puede leer FPDI, la librería PHP que genera el PDF final.
 */
export async function prepararPdf(archivo: File) {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(String((e as Error)?.message))) throw new Error("El PDF está protegido con contraseña. Quita la protección y vuelve a subirlo.");
    throw new Error("El archivo no es un PDF válido.");
  }
  const paginas = doc.getPages();
  if (!paginas.length) throw new Error("El PDF no tiene páginas.");
  if (paginas.length > LIMITES_PLATAFORMA.paginas) throw new Error(`El PDF tiene más de ${LIMITES_PLATAFORMA.paginas} páginas.`);

  const geometria = paginas.map((p) => {
    const giro = ((p.getRotation().angle % 360) + 360) % 360;
    const recorte = p.getCropBox();
    return { giro, recorte, recta: giro === 0 && recorte.x === 0 && recorte.y === 0 };
  });
  const todasRectas = geometria.every((g) => g.recta);
  const campos = todasRectas ? detectarCampos(doc) : [];

  let salida = doc;
  if (!todasRectas) {
    // Páginas giradas o con recorte: se redibujan sobre páginas nuevas ya derechas.
    salida = await PDFDocument.create();
    for (let i = 0; i < paginas.length; i++) {
      const { giro, recorte: c } = geometria[i];
      const [w, h] = [c.width, c.height];
      const [ancho, alto] = giro === 90 || giro === 270 ? [h, w] : [w, h];
      const pagina = salida.addPage([ancho, alto]);
      if (!paginas[i].node.Contents()) continue; // página en blanco
      const incrustada = await salida.embedPage(paginas[i], { left: c.x, bottom: c.y, right: c.x + c.width, top: c.y + c.height });
      const pos = giro === 90 ? { x: 0, y: w, rotate: degrees(-90) }
        : giro === 180 ? { x: w, y: h, rotate: degrees(180) }
        : giro === 270 ? { x: h, y: 0, rotate: degrees(90) }
        : { x: 0, y: 0, rotate: degrees(0) };
      pagina.drawPage(incrustada, { ...pos, width: w, height: h });
    }
  }
  const preparado = await salida.save({ useObjectStreams: false });
  return { preparado: new Blob([preparado as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), campos };
}

/** Campos rellenables del PDF → campos de AutograFlow (en coordenadas desde arriba a la izquierda). */
function detectarCampos(doc: PDFDocument): CampoDetectado[] {
  let campos;
  try {
    campos = doc.getForm().getFields();
  } catch {
    return [];
  }
  const paginas = doc.getPages();
  const indice = new Map(paginas.map((p, i) => [p.ref.toString(), i]));
  const salida: CampoDetectado[] = [];
  for (const campo of campos) {
    const nombre = campo.getName();
    let tipo: TipoCampo | null =
      campo instanceof PDFSignature ? "firma" : campo instanceof PDFCheckBox ? "casilla" : campo instanceof PDFTextField ? "texto" : null;
    if (!tipo) continue;
    if (tipo === "texto" && /firma|signature|sign\b/i.test(nombre)) tipo = "firma";
    else if (tipo === "texto" && /fecha|date/i.test(nombre)) tipo = "fecha";
    for (const widget of campo.acroField.getWidgets()) {
      const ref = widget.P();
      let i = ref ? indice.get(ref.toString()) : undefined;
      if (i === undefined) i = paginas.findIndex((p) => p.node.Annots()?.asArray().some((a) => doc.context.lookup(a) === widget.dict));
      if (i === undefined || i < 0) continue;
      const r = widget.getRectangle(), alto = paginas[i].getHeight();
      if (r.width < 4 || r.height < 4) continue;
      // Las firmas en una línea delgada se agrandan hacia arriba para que quepa el trazo.
      const h = tipo === "firma" ? Math.max(r.height, 36) : r.height;
      salida.push({ tipo, pagina: i + 1, x: r.x, y: alto - r.y - h, w: r.width, h, etiqueta: nombre.replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) });
    }
  }
  return salida.slice(0, LIMITES_PLATAFORMA.campos);
}
