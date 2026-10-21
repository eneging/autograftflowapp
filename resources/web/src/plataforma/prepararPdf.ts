import { PDFCheckBox, PDFDocument, PDFHexString, PDFName, PDFSignature, PDFString, PDFTextField, degrees } from "pdf-lib";
import { LIMITES_PLATAFORMA, type FormularioPdf, type Idioma, type TipoCampo } from "../../../shared/plataforma";
import { leerPdf } from "./VisorPdf";

export interface CampoDetectado { tipo: TipoCampo; pagina: number; x: number; y: number; w: number; h: number; etiqueta: string; nombrePdf: string }

/**
 * Prepara en el navegador un PDF antes de subirlo (en hosting compartido no hay Node en el servidor):
 *  - endereza las páginas giradas o recortadas, para que lo que se ve coincida con las coordenadas de los campos;
 *  - detecta sus campos rellenables (texto, fechas y casillas) para sugerirlos en el editor. Las firmas no se sugieren:
 *    quien prepara el documento decide dónde firma cada persona;
 *  - nombra cada campo con el texto que se ve junto a él en el documento (en su idioma), no con el nombre interno del
 *    formulario, que suele estar en inglés o abreviado;
 *  - detecta el idioma del documento (español o inglés), con el que se abrirá la página del firmante;
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
  const { formulario, textos, idioma } = await leerConPdfJs(bytes, todasRectas);
  const calculados = new Set(formulario ? Object.entries(formulario.objects).filter(([, l]) => l.some((o) => o.actions?.Calculate?.length)).map(([n]) => n) : []);
  const campos = todasRectas ? detectarCampos(doc, calculados, textos) : [];

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
  return { preparado: new Blob([preparado as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), campos, formulario: calculados.size ? formulario : null, idioma };
}

/** Un trozo de texto visible de una página, en puntos PDF desde arriba a la izquierda. */
interface Trozo { x0: number; x1: number; arriba: number; abajo: number; texto: string }

/**
 * Con pdf.js: los campos y scripts del formulario (lo que necesita su entorno aislado para ejecutar los cálculos), los
 * textos visibles de cada página (para nombrar los campos) y el idioma del documento.
 */
async function leerConPdfJs(bytes: Uint8Array, conCampos: boolean): Promise<{ formulario: FormularioPdf | null; textos: Trozo[][]; idioma: Idioma }> {
  let formulario: FormularioPdf | null = null;
  const textos: Trozo[][] = [];
  try {
    const pdf = await leerPdf(bytes.slice());
    try {
      if (conCampos) {
        try {
          const [objects, orden, actions] = await Promise.all([pdf.getFieldObjects(), pdf.getCalculationOrderIds(), pdf.getJSActions()]);
          if (objects) formulario = { objects: objects as unknown as FormularioPdf["objects"], calculationOrder: orden ?? [], actions: (actions as FormularioPdf["actions"]) ?? null, numPages: pdf.numPages };
        } catch { /* sin formulario legible: el PDF se sube igual, solo que sin cálculos */ }
      }
      for (let i = 1; i <= Math.min(pdf.numPages, LIMITES_PLATAFORMA.paginas); i++) {
        const pagina = await pdf.getPage(i);
        const alto = pagina.view[3] - pagina.view[1];
        const contenido = await pagina.getTextContent();
        textos.push(agruparTrozos(contenido.items.flatMap((it) => {
          if (!("str" in it) || !it.str.trim()) return [];
          const [, , c, d, e, f] = it.transform as number[];
          const tam = it.height || Math.hypot(c, d) || 8;
          return [{ x0: e, x1: e + it.width, arriba: alto - f - tam, abajo: alto - f + tam * 0.2, texto: it.str }];
        })));
        pagina.cleanup();
      }
    } finally {
      pdf.destroy();
    }
  } catch { /* sin textos: los campos se nombran con su nombre interno */ }
  return { formulario, textos, idioma: detectarIdioma(textos.flat().map((t) => t.texto).join(" ")) };
}

/** Une los pedazos de una misma línea que están pegados (pdf.js suele partir las frases); los separados por un hueco grande quedan aparte. */
function agruparTrozos(items: Trozo[]): Trozo[] {
  const orden = [...items].sort((a, b) => a.abajo - b.abajo || a.x0 - b.x0);
  const salida: Trozo[] = [];
  for (const t of orden) {
    const alto = t.abajo - t.arriba;
    const previo = salida.find((s) => Math.abs(s.abajo - t.abajo) < alto * 0.4 && t.x0 >= s.x0 && t.x0 - s.x1 < alto * 1.2);
    if (previo) {
      previo.texto += (t.x0 - previo.x1 > alto * 0.15 && !previo.texto.endsWith(" ") ? " " : "") + t.texto;
      previo.x1 = Math.max(previo.x1, t.x1);
      previo.arriba = Math.min(previo.arriba, t.arriba);
    } else salida.push({ ...t });
  }
  return salida;
}

const PALABRAS: Record<Idioma, Set<string>> = {
  es: new Set("de la el los las del y que en por con para una un su se al es nombre fecha firma dirección direccion número numero teléfono telefono correo apellidos documento".split(" ")),
  en: new Set("the of and to in for with your you is this that name date signature address number phone email please by on are be from".split(" ")),
};
/** Español o inglés según las palabras más comunes del texto del documento (si no se sabe, español). */
export function detectarIdioma(texto: string): Idioma {
  const cuenta = { es: 0, en: 0 };
  for (const p of texto.toLowerCase().split(/[^a-záéíóúüñ]+/).slice(0, 20000)) {
    if (PALABRAS.es.has(p)) cuenta.es++;
    if (PALABRAS.en.has(p)) cuenta.en++;
  }
  return cuenta.en > cuenta.es * 1.3 && cuenta.en >= 5 ? "en" : "es";
}

/** Limpia un texto para usarlo como nombre de campo; vacío si no sirve (sin letras, muy largo…). */
function limpiarRotulo(t: string) {
  const s = t.replace(/\s+/g, " ").replace(/[\s:*_.…]+$/u, "").replace(/^[\s*•·-]+/u, "").trim();
  const letras = s.match(/\p{L}/gu)?.length ?? 0, cifras = s.match(/\d/g)?.length ?? 0;
  // Sin letras suficientes o casi todo números (p. ej. la fila «1 2 3 … 16» encima de unas casillas): no sirve como nombre.
  return letras >= 2 && cifras <= letras && s.length <= 90 ? s : "";
}

/**
 * El texto que se ve junto al campo: para una casilla, a su derecha (o a su izquierda); para un texto, a su izquierda en
 * la misma línea (p. ej. «Nombre: ____») o justo encima (o dentro de la celda, arriba), como en los formularios en tabla.
 */
function rotuloVisible(trozos: Trozo[], r: { x: number; y: number; w: number; h: number }, casilla: boolean): string {
  const medio = r.y + r.h / 2;
  const enLinea = (t: Trozo) => t.arriba - 3 <= medio && t.abajo + 3 >= medio;
  const elegir = (lista: Trozo[], dist: (t: Trozo) => number) => {
    let mejor = "", d = Infinity;
    for (const t of lista) { const x = dist(t), l = limpiarRotulo(t.texto); if (l && x < d) { d = x; mejor = l; } }
    return mejor;
  };
  const derecha = elegir(trozos.filter((t) => enLinea(t) && t.x0 >= r.x + r.w - 3 && t.x0 - (r.x + r.w) < 60), (t) => t.x0 - (r.x + r.w));
  const izquierda = elegir(trozos.filter((t) => enLinea(t) && t.x1 <= r.x + 6 && r.x - t.x1 < (casilla ? 60 : 45)), (t) => r.x - t.x1);
  if (casilla) return derecha || izquierda;
  const encima = elegir(trozos.filter((t) => t.x0 >= r.x - 8 && t.x0 < r.x + r.w - 6 && t.abajo <= r.y + Math.max(r.h * 0.6, 4) && t.abajo >= r.y - 26),
    (t) => Math.abs(r.y - t.abajo) + (t.x0 - r.x) * 0.05);
  return izquierda || encima;
}

/** La descripción (TU) del campo en el formulario, si la tiene. */
function descripcion(campo: { acroField: { dict: { lookup: (n: PDFName) => unknown } } }) {
  const tu = campo.acroField.dict.lookup(PDFName.of("TU"));
  return tu instanceof PDFString || tu instanceof PDFHexString ? limpiarRotulo(tu.decodeText()) : "";
}

/** Campos rellenables del PDF → campos de AutograFlow (en coordenadas desde arriba a la izquierda). */
function detectarCampos(doc: PDFDocument, calculados: Set<string>, textos: Trozo[][]): CampoDetectado[] {
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
      const h = r.height, y = alto - r.y - h;
      // Nombre del campo: el texto visible junto a él (en el idioma del documento), su descripción o, al final, su nombre interno.
      const etiqueta = rotuloVisible(textos[i] ?? [], { x: r.x, y, w: r.width, h }, tipo === "casilla") || descripcion(campo)
        || nombre.replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim();
      salida.push({ tipo, pagina: i + 1, x: r.x, y, w: r.width, h, etiqueta: etiqueta.slice(0, 120), nombrePdf: nombre.slice(0, 200) });
    }
  }
  return salida.slice(0, LIMITES_PLATAFORMA.campos);
}
