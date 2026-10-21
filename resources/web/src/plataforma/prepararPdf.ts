import { PDFCheckBox, PDFDocument, PDFSignature, PDFTextField, degrees } from "pdf-lib";
import { LIMITES_PLATAFORMA, type FormularioPdf, type TipoCampo } from "../../../shared/plataforma";
import { leerPdf } from "./VisorPdf";

export interface CampoDetectado { tipo: TipoCampo; pagina: number; x: number; y: number; w: number; h: number; etiqueta: string; nombrePdf: string }

/**
 * Prepara en el navegador un PDF antes de subirlo (en hosting compartido no hay Node en el servidor):
 *  - endereza las páginas giradas o recortadas, para que lo que se ve coincida con las coordenadas de los campos;
 *  - detecta sus campos rellenables (texto, fechas y casillas) para sugerirlos en el editor. Las firmas no se sugieren:
 *    quien prepara el documento decide dónde firma cada persona;
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
  const formulario = todasRectas ? await leerFormulario(bytes) : null;
  const calculados = new Set(formulario ? Object.entries(formulario.objects).filter(([, l]) => l.some((o) => o.actions?.Calculate?.length)).map(([n]) => n) : []);
  const campos = todasRectas ? detectarCampos(doc, calculados) : [];

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
  // El formulario (con sus scripts) solo se guarda si el PDF tiene campos calculados.
  return { preparado: new Blob([preparado as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), campos, formulario: calculados.size ? formulario : null };
}

/** Campos y scripts del formulario con pdf.js (lo que necesita su entorno aislado para ejecutar los cálculos). */
async function leerFormulario(bytes: Uint8Array): Promise<FormularioPdf | null> {
  try {
    const pdf = await leerPdf(bytes.slice());
    try {
      const [objects, orden, actions] = await Promise.all([pdf.getFieldObjects(), pdf.getCalculationOrderIds(), pdf.getJSActions()]);
      if (!objects) return null;
      return { objects: objects as unknown as FormularioPdf["objects"], calculationOrder: orden ?? [], actions: (actions as FormularioPdf["actions"]) ?? null, numPages: pdf.numPages };
    } finally {
      pdf.destroy();
    }
  } catch {
    return null; // sin formulario legible: el PDF se sube igual, solo que sin cálculos
  }
}

/** Campos rellenables del PDF → campos de AutograFlow (en coordenadas desde arriba a la izquierda). */
function detectarCampos(doc: PDFDocument, calculados: Set<string>): CampoDetectado[] {
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
    // Los campos de firma del PDF (y los de texto pensados para firmar) se omiten: no se crean recuadros de firma automáticos.
    if (campo instanceof PDFSignature) continue;
    let tipo: TipoCampo | null = campo instanceof PDFCheckBox ? "casilla" : campo instanceof PDFTextField ? "texto" : null;
    if (!tipo) continue;
    if (tipo === "texto" && calculados.has(nombre)) tipo = "calculo";
    else if (tipo === "texto" && /firma|signature|sign\b/i.test(nombre)) continue;
    else if (tipo === "texto" && /fecha|date/i.test(nombre)) tipo = "fecha";
    for (const widget of campo.acroField.getWidgets()) {
      const ref = widget.P();
      let i = ref ? indice.get(ref.toString()) : undefined;
      if (i === undefined) i = paginas.findIndex((p) => p.node.Annots()?.asArray().some((a) => doc.context.lookup(a) === widget.dict));
      if (i === undefined || i < 0) continue;
      const r = widget.getRectangle(), alto = paginas[i].getHeight();
      if (r.width < 4 || r.height < 4) continue;
      const h = r.height;
      salida.push({ tipo, pagina: i + 1, x: r.x, y: alto - r.y - h, w: r.width, h, etiqueta: nombre.replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120), nombrePdf: nombre.slice(0, 200) });
    }
  }
  return salida.slice(0, LIMITES_PLATAFORMA.campos);
}
