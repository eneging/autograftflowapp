/*
 * EX-Trae (Flow Tools): lo que se hace con el resultado del OCR (Tesseract) de una foto.
 *  0. quitarIconos: los emojis e iconos, que el OCR lee como si fueran letras.
 *  1. limpiarLineas: quita lo que no es texto legible (sobre todo logos: letras dibujadas o enormes que el OCR lee mal).
 *  2. ordenar en líneas: de arriba abajo y, en la misma altura, de izquierda a derecha.
 *  3. esComprobante: si parece boleta o factura se llenan sus datos; si no, solo se muestra el texto.
 *  4. leerComprobante: RUC, fecha, serie, número, total, IGV, cliente y razón social.
 */

/** Una línea del OCR, con su confianza (0 a 100) y su caja en píxeles. dudas: números que el OCR no leyó con seguridad. */
export interface LineaOcr { texto: string; confianza: number; x: number; y: number; alto: number; dudas?: string[] }

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

/** Una palabra del OCR, con su caja y lo que se midió en la imagen dentro de ella. */
export interface PalabraOcr {
  texto: string; confianza: number; x0: number; x1: number; y0: number; y1: number;
  /** Fracción de la caja con color vivo (0 a 1). El texto común casi no tiene; un emoji, mucho. */
  color: number;
  /** Fracción de la caja cubierta de tinta (0 a 1). Una letra deja mucho hueco; un cuadrado o un punto gordo, poco. */
  solidez: number;
}

const alfanumericos = (s: string) => s.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
/** Palabras cortas de verdad, que no se pueden confundir con un icono al comienzo de una línea. */
const CORTAS = new Set(`a e i o u y al de del el en es ha he la le lo me mi ni no se si sí su te tu tú un va ve ya yo da di dr sr jr av ok id pm am rd nº n° ca pe si
  an as at be by do go he hi if in is it me my of on or so to up us we`.split(/\s+/));
const ENUMERACION = /^(\d{1,3}[.)°º:]?|[\p{L}][.)])$/u;
/** Símbolos que sí son parte del texto; sueltos en medio de una línea (S/ 20 + 5 = $ 25) tienen sentido. */
const SIMBOLO_EN_MEDIO = /^[-–—+=:/&%$#€£.,;()]+$/;
const SIMBOLO_EN_BORDE = /^[$#(]+$|^S\/$/;

/**
 * El texto de una línea sin sus emojis e iconos. El OCR no los deja como símbolos: los lee como letras o cifras comunes
 * y con mucha confianza (un teléfono → «Ka», una cara → «S», un cuadrado → «El»), así que no basta con mirar el texto:
 * se mide en la imagen qué hay dentro de cada palabra.
 */
export function quitarIconos(palabras: PalabraOcr[]): string {
  const normales = palabras.filter((p) => alfanumericos(p.texto) >= 3);
  const alto = mediana((normales.length ? normales : palabras).map((p) => p.y1 - p.y0));
  // Una línea entera de color (un enlace, un título) no es un icono: se compara con el color de sus palabras.
  const colorBase = mediana(normales.map((p) => p.color));
  const queda: string[] = [];
  palabras.forEach((p, i) => {
    const texto = p.texto.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu, "").trim();
    const n = alfanumericos(texto), ancho = p.x1 - p.x0, altura = p.y1 - p.y0;
    const borde = i === 0 || i === palabras.length - 1;
    if (!texto) return;
    if (n === 0 && !(borde ? SIMBOLO_EN_BORDE : SIMBOLO_EN_MEDIO).test(texto)) return;
    if (n === 0) { queda.push(texto); return; }
    const corta = n <= 3 && !/^\d{1,3}[.,]\d/.test(texto);
    // Con color vivo que el resto de la línea no tiene.
    if (corta && p.color >= 0.12 && p.color >= colorBase + 0.1) return;
    // Una mancha maciza con forma de cuadro o de punto: ninguna letra cubre tanto. Medido: «a» 0.62, «●» 0.84, «■» 0.93.
    // Una palabra de verdad («a», «y», «El») pide más seguridad: se ve más maciza si la foto está algo borrosa.
    const palabraReal = CORTAS.has(texto.toLowerCase().replace(/[.,:;]+$/, ""));
    // Una cifra borrosa también se ve maciza (un «8»), y perder un número es peor: solo si es casi un cuadrado lleno.
    if (n <= 2 && p.solidez >= (/^\d+$/.test(texto) ? 0.9 : palabraReal ? 0.8 : 0.7) && ancho >= altura * 0.6) return;
    // Al comienzo de la línea, separada del resto y sin ser una palabra ni una numeración.
    const siguiente = palabras[i + 1];
    if (i === 0 && siguiente && n <= 2 && siguiente.x0 - p.x1 >= alto * 0.28 && !CORTAS.has(texto.toLowerCase().replace(/[.,:;]+$/, "")) && !ENUMERACION.test(texto) && !/^\p{Lu}\.$/u.test(texto) && !/^\d+$/.test(texto) && !SIMBOLO_EN_BORDE.test(texto)) return;
    queda.push(texto);
  });
  // Lo que quedó al final sin ser texto: un símbolo que era el último tras quitar un icono.
  while (queda.length && !alfanumericos(queda[queda.length - 1]) && !SIMBOLO_EN_BORDE.test(queda[queda.length - 1]) && !/^[%)]+$/.test(queda[queda.length - 1])) queda.pop();
  while (queda.length && !alfanumericos(queda[0]) && !SIMBOLO_EN_BORDE.test(queda[0])) queda.shift();
  return queda.join(" ");
}

// ---------------------------------------------------------------- confusiones de letras y cifras

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
/**
 * Palabras comunes con D. Solo se corrige hacia una de estas, y solo si lo leído no es ya una palabra conocida: así un
 * nombre o una palabra rara nunca se cambian. Las que empiezan con O van en CON_O para no volverlas D («OIGA» no es «DIGA»).
 */
const CON_D = new Set(`DE DEL DA DAN DAR DAS DE DI DIA DIAS DIGA DIGO DIJO DIME DIOS DOS DOCE DONDE DOMINGO DOMICILIO DOCUMENTO DOCUMENTOS DOLAR DOLARES DATO DATOS
  DADO DADOS DADA DEBE DEBER DEBO DECIR DEJA DEJAR DEMAS DENTRO DEPARTAMENTO DEPOSITO DERECHO DERECHOS DESCUENTO DESDE DESPUES DETALLE DETALLES DEUDA DEVOLUCION
  DIEZ DIECISEIS DIECISIETE DIECIOCHO DIECINUEVE DICIEMBRE DIFERENTE DIRECCION DIRECTOR DIRECTA DIRECTO DISTRITO DIVISION DNI DUENO DURANTE ADEMAS ADELANTO
  ADMINISTRACION ADQUIRIENTE ADUANA AGENCIA ACTIVIDAD ALREDEDOR ANDA ANTIGUEDAD APELLIDO APELLIDOS AUTORIDAD AYUDA BANDA BODEGA CADA CALIDAD CANTIDAD CAPACIDAD
  CARIDAD CIUDAD CODIGO CODIGOS COMIDA COMUNIDAD CONDICION CONDICIONES CONTENIDO CREDITO CREDITOS CUENTA CUIDADO DEPENDE DONACION EDAD EDIFICIO EDUCACION EMPRESA
  ENTIDAD ESTADO ESTADOS ESTUDIO EXPEDIENTE FECHA FEDERAL FONDO FONDOS GRADO GRANDE IDENTIDAD IDIOMA IMPORTADO INDICE INDIVIDUAL INGRESADO LADO LADOS LUNES MANDO MEDIO
  MEDIOS MEDIDA MERCADO MIERCOLES MINUTO MODELO MODO MONEDA MUNDO NACIDO NADA NADIE NIVEL NOMBRE NUMERO ORDEN ORDENES PADRE PAGADO PAGANDO PARTIDA PEDIDO PEDIDOS
  PERIODO PODER PRECIO PRODUCTO PRODUCTOS PROCEDENCIA PUEDE PUEDEN PUNTO QUEDA RECIBIDO REDONDEO RESIDENCIA SABADO SALDO SEDE SEGUNDO SEGUNDOS SEGURIDAD SENOR SERVICIO
  SOCIEDAD SOLICITUD SUELDO TARDE TIENDA TODA TODAS TODO TODOS TRADUCCION UNIDAD UNIDADES UNIDO USADO USTED VALIDO VENDEDOR VENDIDO VERDAD VIDA VIUDO VOLUMEN`.split(/\s+/));
const CON_O = new Set(`O OJO OLA OLGA OCA ODA ODIO OIGA OIGO OIDO ONDA ORO OSO OTRO OTRA OTROS OTRAS OR OK ON OF OTOÑO OCHO OBRA OBRAS OFICINA OPCION OPCIONES
  NO LO LOS SO TO DO GO YO MI OLD SOL DOLOR COLOR OTORGADO OLVIDO ODONTOLOGO`.split(/\s+/));

/** Una palabra con «D» leída como «O» (o con un «0» en lugar de la «O»), si la corrección lleva a una palabra conocida. */
function corregirPalabra(p: string): string {
  // Sin el 0, por si un cero se coló en una palabra: «0SO» → «OSO».
  const base = /^[\p{L}0]+$/u.test(p) && /\p{L}/u.test(p) ? p.replace(/0/g, (c, i) => (/\p{Lu}/u.test(p) || i ? "O" : c)) : p;
  if (!/^\p{L}+$/u.test(base) || base.length < 2) return p;
  const n = sinTildes(base);
  if (CON_D.has(n) || CON_O.has(n)) return base;
  const posiciones = [...base].flatMap((c, i) => (c === "O" ? [i] : []));
  if (!posiciones.length || posiciones.length > 4) return base === p ? p : p;
  const letras = [...base], halladas: string[] = [];
  for (let m = 1; m < 1 << posiciones.length; m++) {
    const v = [...letras];
    posiciones.forEach((q, k) => { if (m & (1 << k)) v[q] = "D"; });
    if (CON_D.has(sinTildes(v.join("")))) halladas.push(v.join(""));
  }
  return halladas.length === 1 ? halladas[0] : p;
}

const CIFRA_PARECIDA: Record<string, string> = { O: "0", o: "0", Q: "0", I: "1", l: "1", "|": "1", S: "5", B: "8", Z: "2" };

/** Un número con letras parecidas a cifras (3O5 → 305). Solo si casi todo son cifras: «B2B» o «SOL» no se tocan. */
function corregirNumero(t: string): string {
  // Serie de comprobante, documento o cuenta: una letra y cifras («BOO1-0008963» → «B001-0008963»).
  const serie = t.match(/^([BFE])([0-9OoIl|]{3})(-[0-9OoIl|SB]+)?$/);
  if (serie && /[0-9]/.test(serie[2] + (serie[3] ?? ""))) return serie[1] + (serie[2] + (serie[3] ?? "")).replace(/[OoIl|SB]/g, (c) => CIFRA_PARECIDA[c]);
  const nucleo = t.replace(/[.,:/-]/g, "");
  const cifras = nucleo.match(/\d/g)?.length ?? 0;
  if (cifras < 2 || !/^[\dOoQIl|SBZ.,:/-]+$/.test(t) || cifras / nucleo.length < 0.6) return t;
  return t.replace(/[OoQIl|SBZ]/g, (c) => CIFRA_PARECIDA[c]);
}

/** ¿Parece un número o un código con cifras? */
export const esNumerica = (t: string) => { const n = t.replace(/[^\p{L}\p{N}]/gu, ""); return n.length >= 2 && (n.match(/\d/g)?.length ?? 0) / n.length >= 0.5; };

/** Corrige lo que el OCR confunde, mirando el contexto de cada palabra: nunca cambia una palabra conocida ni un número limpio. */
export function corregirConfusiones(linea: string): string {
  const texto = linea.replace(/(^|\s)(?:S\$S?|\$S?)\/(?=\s*\d)/g, "$1S/");
  return texto.split(/(\s+)/).map((t) => {
    if (!t.trim()) return t;
    const m = t.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}%]*)$/su);
    if (!m || !m[2]) return t;
    const [, a, cuerpo, z] = m;
    return a + (/\d|^[OoIl|]+[.,:/-]/.test(cuerpo) && !/^\p{L}+0\p{L}*$|^0\p{L}+$/u.test(cuerpo) ? corregirNumero(cuerpo) : corregirPalabra(cuerpo)) + z;
  }).join("");
}

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
