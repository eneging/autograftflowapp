/*
 * EX-Trae (Flow Tools): lo que se hace con el resultado del OCR (Tesseract) de una foto.
 *  1. limpiarLineas: quita lo que no es texto legible (sobre todo logos: letras dibujadas o enormes que el OCR lee mal).
 *  2. ordenar en líneas: de arriba abajo y, en la misma altura, de izquierda a derecha.
 *  3. esComprobante: si parece boleta o factura se llenan sus datos; si no, solo se muestra el texto.
 *  4. leerComprobante: RUC, fecha, serie, número, total, IGV, cliente y razón social.
 */

/** Una línea del OCR, con su confianza (0 a 100) y su caja en píxeles. */
export interface LineaOcr { texto: string; confianza: number; x: number; y: number; alto: number }

export interface DatosComprobante {
  tipo: string; razonSocial: string; ruc: string; fecha: string; serie: string; numero: string;
  total: string; igv: string; documento: string; moneda: "PEN" | "USD";
}

const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b), m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
/** Proporción de letras y números (lo demás suelen ser trazos de un logo leídos como símbolos). */
const legible = (s: string) => { const t = s.replace(/\s/g, ""); return t ? (t.match(/[\p{L}\p{N}]/gu)?.length ?? 0) / t.length : 0; };

/**
 * Con poca confianza, ¿igual parece texto de verdad? Casi todo letras o números y al menos dos palabras de 3+ letras.
 * Con letra chica (foto de lejos o de webcam), muchas líneas bien leídas salen con 30-50 % de confianza.
 */
const pareceTexto = (s: string) => legible(s) >= 0.85 && s.split(" ").filter((p) => /[\p{L}\p{N}]{3,}/u.test(p)).length >= 2;

/**
 * Quita las líneas que el OCR leyó mal: poca confianza (salvo que parezcan texto), casi sin letras ni números, o letras
 * mucho más grandes que el resto que no se leyeron con claridad (logos y dibujos). Un título grande y nítido se conserva.
 */
export function limpiarLineas(lineas: LineaOcr[]): LineaOcr[] {
  const base = mediana(lineas.filter((l) => l.confianza >= 60).map((l) => l.alto)) || mediana(lineas.map((l) => l.alto));
  return lineas
    .map((l) => ({ ...l, texto: l.texto.replace(/\s+/g, " ").trim() }))
    .filter((l) => l.texto.length >= 2 && legible(l.texto) >= 0.6 && (l.confianza >= 50 || (l.confianza >= 25 && pareceTexto(l.texto))))
    .filter((l) => !(base && l.alto > base * 2.2 && l.confianza < 85));
}

/** De arriba abajo; las que están a la misma altura (columnas, «Total ..... 10.00») se unen de izquierda a derecha. */
export function ordenarLineas(lineas: LineaOcr[]): string[] {
  const o = [...lineas].sort((a, b) => a.y - b.y || a.x - b.x);
  const filas: LineaOcr[][] = [];
  for (const l of o) {
    const f = filas[filas.length - 1];
    const ref = f?.[0];
    if (ref && Math.abs(l.y - ref.y) < Math.min(l.alto, ref.alto) * 0.5) f.push(l);
    else filas.push([l]);
  }
  return filas.map((f) => f.sort((a, b) => a.x - b.x).map((l) => l.texto).join("   "));
}

/** Parece boleta, factura o ticket: varias señales a la vez (un texto con un número de 11 cifras no basta). */
export function esComprobante(texto: string): boolean {
  const u = texto.toUpperCase();
  let puntos = 0;
  if (/\b(BOLETA|FACTURA|NOTA\s+DE\s+(CR[EÉ]DITO|D[EÉ]BITO)|TICKET|COMPROBANTE)\b/.test(u)) puntos += 2;
  if (/\bR\s*\.?\s*U\s*\.?\s*C\b/.test(u) || /\b(10|15|17|20)\d{9}\b/.test(u)) puntos += 2;
  if (/\bTOTAL\b/.test(u)) puntos += 1;
  if (/\b(I\s*\.?\s*G\s*\.?\s*V|OP\.?\s*GRAVADA)\b/.test(u)) puntos += 1;
  if (/\b[BF][A-Z0-9]{3}\s*[-–—]\s*\d{1,8}\b/.test(u)) puntos += 1;
  return puntos >= 4;
}

// ---------------------------------------------------------------- datos del comprobante

const formatoImporte = (bruto: string) => {
  let s = bruto.replace(/[^\d.,]/g, "");
  if (!s) return "";
  const sep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (sep >= 0 && s.length - sep - 1 === 2) return `${parseInt(s.slice(0, sep).replace(/\D/g, "") || "0", 10)}.${s.slice(sep + 1)}`;
  s = s.replace(/\D/g, "");
  return s ? `${parseInt(s, 10)}.00` : "";
};
const importeEn = (s: string) => {
  const m = [...s.matchAll(/((?:\d{1,3}(?:[,.]\d{3})+|\d+)[.,]\d{2})\b/g)].at(-1);
  return m ? formatoImporte(m[1]) : "";
};
const valorDe = (lineas: string[], etiqueta: RegExp) => {
  for (let i = 0; i < lineas.length; i++) {
    if (!etiqueta.test(lineas[i])) continue;
    const v = importeEn(lineas[i].replace(etiqueta, "")) || (i + 1 < lineas.length ? importeEn(lineas[i + 1]) : "");
    if (v) return v;
  }
  return "";
};

/** Sociedad peruana al final o en medio del nombre: S.A.C., S.A., E.I.R.L., S.R.L., S.A.A. */
const SOCIEDAD = /\b(S\.?\s?A\.?\s?C|S\.?\s?A\.?\s?A|E\.?\s?I\.?\s?R\.?\s?L|S\.?\s?R\.?\s?L|S\.?\s?A)\b\.?/i;
const NO_ES_NOMBRE = /^(BOLETA|FACTURA|NOTA|TICKET|RUC|R\.U\.C|TEL|TEL[EÉ]FONO|CEL|CELULAR|DIRECCI[OÓ]N|DIR\.|FECHA|HORA|WWW|HTTP|JR\.?|AV\.?|AVENIDA|CALLE|CAL\.|MZ|LOTE|URB|LIMA\b|PER[UÚ]\b|SERIE|IMPORTE|TOTAL|SUBTOTAL|IGV|CLIENTE|SE[NÑ]OR|EMAIL|CORREO|SUCURSAL|PUNTO DE VENTA)/i;

/** Un nombre de negocio o de persona: palabras con letras, sin ser una dirección, un dato ni un encabezado. */
function pareceNombre(s: string) {
  const u = s.toUpperCase().trim();
  if (u.length < 4 || NO_ES_NOMBRE.test(u) || /\b(BOLETA\s+DE\s+VENTA|ELECTR[OÓ]NICA)\b/.test(u)) return false;
  if (/^\d[\d\s.,/:-]*$/.test(u) || /@|\d{6,}/.test(u)) return false;
  const palabras = u.split(/\s+/).filter((p) => /\p{L}{2,}/u.test(p));
  return palabras.length >= 1 && legible(u) >= 0.75;
}

/**
 * Razón social, en este orden: 1) con su etiqueta («Razón social:», «Emisor:»); 2) una línea con forma de sociedad
 * (S.A.C., E.I.R.L.…); 3) la línea con nombre más cercana encima del RUC, de tamaño normal (no un logo);
 * 4) la primera línea con nombre del encabezado.
 */
function razonSocial(lineas: LineaOcr[], indiceRuc: number, base: number): string {
  for (const l of lineas.slice(0, 16)) {
    const m = l.texto.match(/(?:RAZ[OÓ]N\s+SOCIAL|NOMBRE\s+O\s+RAZ[OÓ]N\s+SOCIAL|EMISOR)\s*[:\-]\s*(.{3,})/i);
    if (m && !/\bRUC\b/i.test(m[1])) return m[1].trim();
  }
  const normal = (l: LineaOcr) => !base || l.alto <= base * 1.8;
  const conSociedad = lineas.slice(0, 14).find((l) => SOCIEDAD.test(l.texto) && pareceNombre(l.texto) && l.confianza >= 60);
  if (conSociedad) return conSociedad.texto.replace(/^(NOMBRE\s+COMERCIAL)\s*[:\-]\s*/i, "").trim();
  if (indiceRuc > 0) {
    for (let i = indiceRuc - 1; i >= Math.max(0, indiceRuc - 4); i--) {
      const l = lineas[i];
      if (normal(l) && l.confianza >= 65 && pareceNombre(l.texto)) return l.texto.trim();
    }
  }
  const primera = lineas.slice(0, 6).find((l) => normal(l) && l.confianza >= 65 && pareceNombre(l.texto));
  return primera?.texto.trim() ?? "";
}

export function leerComprobante(lineasOcr: LineaOcr[]): DatosComprobante {
  const lineas = lineasOcr.filter((l) => l.texto.trim());
  const textos = lineas.map((l) => l.texto.trim());
  const U = textos.map((t) => t.toUpperCase());
  const todo = U.join("\n");
  const base = mediana(lineas.map((l) => l.alto));
  const d: DatosComprobante = { tipo: "", razonSocial: "", ruc: "", fecha: "", serie: "", numero: "", total: "", igv: "", documento: "", moneda: "PEN" };

  d.tipo = /\bFACTURA\b/.test(todo) ? "Factura" : /\bBOLETA\b/.test(todo) ? "Boleta" : /\bNOTA\s+DE\s+CR[EÉ]DITO\b/.test(todo) ? "Nota de crédito" : /\bTICKET\b/.test(todo) ? "Ticket" : "";

  // RUC del emisor: el primero que lleva la etiqueta RUC; si no, el primer número de 11 cifras que empieza como un RUC.
  let indiceRuc = -1;
  for (let i = 0; i < U.length; i++) {
    if (!/\bR\s*\.?\s*U\s*\.?\s*C\b/.test(U[i])) continue;
    const m = U[i].match(/\b[12]\d[\d\s.-]{8,14}\d\b/);
    const cifras = m?.[0].replace(/\D/g, "");
    if (cifras?.length === 11) { d.ruc = cifras; indiceRuc = i; break; }
  }
  if (!d.ruc) {
    const i = U.findIndex((t) => /\b(10|15|17|20)\d{9}\b/.test(t));
    if (i >= 0) { d.ruc = U[i].match(/\b(10|15|17|20)\d{9}\b/)![0]; indiceRuc = i; }
  }

  // Serie y número (SUNAT: B001-123 para boletas, F001-123 para facturas). O→0 e I/L→1 en el número.
  const sn = todo.match(/\b([BF][A-Z0-9]{3})\s*[-–—]\s*([0-9OIL]{1,8})\b/);
  if (sn) { d.serie = sn[1]; d.numero = sn[2].replace(/O/g, "0").replace(/[IL]/g, "1"); }
  else {
    d.serie = todo.match(/\bSERIE\s*[:#-]?\s*([BF][A-Z0-9]{3})\b/)?.[1] ?? "";
    d.numero = todo.match(/\b(?:CORRELATIVO|N[ÚU]MERO)\s*[:#-]?\s*(\d{1,8})\b/)?.[1] ?? "";
  }

  // Fecha: primero la que está junto a «Fecha (de emisión)».
  const dmy = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/, ymd = /\b(20\d{2})[/.-](\d{1,2})[/.-](\d{1,2})\b/;
  const aFecha = (s: string) => {
    const i = s.match(ymd);
    if (i) return `${i[3].padStart(2, "0")}/${i[2].padStart(2, "0")}/${i[1]}`;
    const m = s.match(dmy);
    return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3].length === 2 ? `20${m[3]}` : m[3]}` : "";
  };
  d.fecha = aFecha(U.find((t) => /FECHA/.test(t) && (dmy.test(t) || ymd.test(t))) ?? todo);

  // Total: sin confundirlo con SUBTOTAL, TOTAL IGV ni el total en letras.
  d.total = valorDe(U, /\b(?:IMPORTE\s+TOTAL|TOTAL\s+A\s+PAGAR|TOTAL\s+VENTA|MONTO\s+TOTAL|TOTAL\s+PAGADO|TOTAL\s+S\s*\/)\b\s*[:=]?/);
  if (!d.total) {
    for (let i = U.length - 1; i >= 0; i--) {
      if (/\b(SUB\s*TOTAL|IGV|DESCUENTO|TOTAL\s+LETRAS|TOTAL\s+ITEMS|TOTAL\s+PRODUCTOS)\b/.test(U[i]) || !/\bTOTAL\b/.test(U[i])) continue;
      d.total = importeEn(U[i]) || (i + 1 < U.length ? importeEn(U[i + 1]) : "");
      if (d.total) break;
    }
  }
  d.igv = valorDe(U, /\b(?:I\s*\.?\s*G\s*\.?\s*V\s*\.?|IMPUESTO\s+GENERAL\s+A\s+LAS\s+VENTAS)\b(?:\s*\(\s*\d+\s*%\s*\))?\s*[:=]?/);
  if (/\b(USD|D[OÓ]LARES|US\$)/.test(todo)) d.moneda = "USD";

  // DNI o RUC del cliente: solo junto a su etiqueta.
  for (let i = 0; i < U.length; i++) {
    if (!/\b(CLIENTE|ADQUIRIENTE|USUARIO|DOCUMENTO|DNI|SE[NÑ]OR(ES)?)\b/.test(U[i])) continue;
    const resto = U[i].replace(/^.*?\b(DNI|DOC(UMENTO)?(\s+DE\s+IDENTIDAD)?|RUC(\s+CLIENTE)?|CLIENTE)\s*[:#-]?/, "");
    const m = resto.match(/\b(\d{8}|\d{11})\b/) ?? (i + 1 < U.length ? U[i + 1].match(/^\s*(\d{8}|\d{11})\b/) : null);
    if (m && m[1] !== d.ruc) { d.documento = m[1]; break; }
  }

  d.razonSocial = razonSocial(lineas, indiceRuc, base);
  return d;
}

/** Faltan datos importantes: para avisar que se revisen. */
export const faltantes = (d: DatosComprobante) =>
  [!d.ruc && "RUC", !d.fecha && "fecha", (!d.serie || !d.numero) && "serie y número", !d.total && "importe total"].filter(Boolean) as string[];

/** Líneas a partir de un texto pegado o editado a mano (sin cajas: todas del mismo tamaño y confianza alta). */
export const lineasDeTexto = (texto: string): LineaOcr[] =>
  texto.split(/\r?\n/).map((t, i) => ({ texto: t, confianza: 95, x: 0, y: i * 20, alto: 14 })).filter((l) => l.texto.trim());
