import { describe, expect, it } from "vitest";
import { corregirConfusiones, esComprobante, esNumerica, leerComprobante, limpiarLineas, lineasDeTexto, ordenarLineas, quitarIconos, type LineaOcr, type PalabraOcr } from "./exTrae";

/** Líneas como las da el OCR: [texto, confianza, alto]; y crece de 20 en 20. */
const ocr = (filas: [string, number, number][]): LineaOcr[] => filas.map(([texto, confianza, alto], i) => ({ texto, confianza, alto, x: 10, y: i * 30, }));

const BOLETA = [
  "BODEGA EJEMPLO DEL SUR S.A.C.", "RUC: 20123456789", "Av. Ejemplo 123, Ica, Perú", "BOLETA DE VENTA ELECTRÓNICA", "B001-00001842",
  "Fecha de emisión: 22/10/2026", "Cliente DNI: 12345678", "OP. GRAVADA S/ 8.47", "IGV (18%) S/ 1.53", "IMPORTE TOTAL S/ 10.00",
].join("\n");

/** Palabras en fila con las medidas reales del OCR: [texto, ancho, alto, color, solidez]; separadas por «espacio» px. */
const fila = (ps: [string, number, number, number?, number?][], espacio = 34): PalabraOcr[] => {
  let x = 100;
  return ps.map(([texto, ancho, alto, color = 0, solidez = 0.35]) => {
    const p = { texto, confianza: 90, x0: x, x1: x + ancho, y0: 0, y1: alto, color, solidez };
    x += ancho + espacio;
    return p;
  });
};

// Las medidas vienen de pasar imágenes con emojis e iconos por el OCR real, que los lee como letras.
describe("quitarIconos", () => {
  it("un emoji en medio de la línea, leído como cifra o letra: fuera por su color", () => {
    expect(quitarIconos(fila([["Ya", 90, 70], ["llegó", 180, 70], ["el", 60, 70], ["pedido", 260, 90], ["6", 70, 80, 0.7, 0.8], ["42", 90, 80, 0.5, 0.7]]))).toBe("Ya llegó el pedido");
    expect(quitarIconos(fila([["Reunión", 300, 70], ["a", 40, 48], ["las", 90, 70], ["10", 80, 66], ["O", 66, 70, 0.3, 0.5], ["en", 90, 48], ["la", 57, 70], ["oficina", 240, 70]]))).toBe("Reunión a las 10 en la oficina");
  });
  it("un icono de color al comienzo", () => {
    expect(quitarIconos(fila([["O", 68, 84, 0.63, 0.64], ["Av.", 116, 66], ["Grau", 183, 66], ["450,", 163, 78], ["Ica", 100, 66]]))).toBe("Av. Grau 450, Ica");
    expect(quitarIconos(fila([["V", 100, 86, 0.23, 0.24], ["Pedido", 269, 70], ["entregado", 412, 92]], 50))).toBe("Pedido entregado");
  });
  it("una forma maciza aunque se lea como palabra de verdad", () => {
    expect(quitarIconos(fila([["El", 65, 64, 0, 0.93], ["Segundo", 354, 92, 0, 0.27], ["punto", 232, 84, 0, 0.28]]))).toBe("Segundo punto");
    expect(quitarIconos(fila([["e", 40, 40, 0, 0.84], ["Primer", 257, 70], ["punto", 232, 84]]))).toBe("Primer punto");
    expect(quitarIconos(fila([["um", 90, 90, 0, 0.91], ["Ver", 131, 66], ["todas", 220, 70]]))).toBe("Ver todas");
  });
  it("un icono de líneas al comienzo: separado y sin ser palabra", () => {
    expect(quitarIconos(fila([["Xx", 65, 61, 0, 0.43], ["Lo", 85, 66], ["mejor", 228, 92], ["del", 114, 70], ["mes", 156, 48], ["*", 66, 62, 0, 0.42]], 40))).toBe("Lo mejor del mes");
    expect(quitarIconos(fila([[">", 76, 51, 0, 0.42], ["Sigue", 217, 92], ["leyendo", 312, 92]]))).toBe("Sigue leyendo");
  });
  it("los caracteres emoji que llegaran en el texto se quitan", () => {
    expect(quitarIconos(fila([["Hola", 150, 70], ["😀", 60, 60], ["amigo👍", 260, 70]]))).toBe("Hola amigo");
  });

  describe("no toca el texto de verdad", () => {
    const igual = (t: string, ps: Parameters<typeof fila>[0], espacio?: number) => expect(quitarIconos(fila(ps, espacio))).toBe(t);
    it("«a» y otras letras sueltas, aunque se midan macizas", () => {
      igual("Juan y María van a la tienda", [["Juan", 178, 66], ["y", 43, 70, 0, 0.36], ["María", 218, 68], ["van", 137, 48, 0, 0.46], ["a", 38, 48, 0, 0.62], ["la", 56, 70, 0, 0.45], ["tienda", 248, 70]]);
      igual("a la casa", [["a", 38, 48, 0, 0.72], ["la", 56, 70, 0, 0.45], ["casa", 170, 48]]);
    });
    it("palabras cortas al comienzo, aunque el espacio sea grande", () => {
      igual("El perro corre", [["El", 90, 70, 0, 0.4], ["perro", 200, 70], ["corre", 200, 70]], 60);
      igual("Yo también", [["Yo", 90, 70], ["también", 300, 70]], 60);
      igual("OK gracias", [["OK", 90, 70, 0, 0.5], ["gracias", 300, 70]], 60);
    });
    it("«DE» y un «8» borroso, aunque se midan macizos (se perdían)", () => {
      igual("FECHA DE EMISIÓN", [["FECHA", 240, 66], ["DE", 110, 66, 0, 0.55], ["EMISIÓN", 300, 80]]);
      igual("Mesa 8 Ticket", [["Mesa", 200, 66], ["8", 42, 66, 0, 0.85], ["Ticket", 240, 66]]);
    });
    it("numeraciones, importes y símbolos con sentido", () => {
      igual("1. Primero", [["1.", 55, 66, 0, 0.24], ["Primero", 308, 70]], 40);
      igual("a) Opción uno", [["a)", 65, 80, 0, 0.36], ["Opción", 284, 92], ["uno", 149, 48]], 40);
      igual("5 cajas", [["5", 40, 66, 0, 0.46], ["cajas", 200, 70]], 60);
      igual("Precio: $ 20.00 + 5 = $ 25.00", [["Precio:", 258, 70], ["$", 38, 84, 0, 0.45], ["20.00", 211, 66], ["+", 43, 42], ["5", 37, 66, 0, 0.46], ["=", 44, 26, 0, 0.83], ["$", 37, 84, 0, 0.48], ["25.00", 211, 66]]);
      igual("Pedido 451 - Lima, Perú", [["Pedido", 269, 70], ["451", 150, 66], ["-", 26, 6, 0, 0.48], ["Lima,", 198, 82], ["Perú", 166, 68]]);
      igual("S/ 125.50", [["S/", 80, 76, 0, 0.31], ["125.50", 255, 66]], 40);
      igual("Total 18%", [["Total", 200, 70], ["18%", 150, 70]]);
    });
    it("una línea entera de color (un enlace) se queda", () => {
      igual("Ver más en la web", [["Ver", 131, 66, 0.3], ["más", 150, 48, 0.3], ["en", 90, 48, 0.3], ["la", 57, 70, 0.3], ["web", 150, 66, 0.3]]);
    });
    it("una palabra corta con su color normal en una línea de texto gris", () => {
      igual("Ver todo", [["Ver", 131, 66, 0.02], ["todo", 170, 70, 0.02]]);
    });
  });
});

describe("corregirConfusiones", () => {
  const c = corregirConfusiones;
  it("una D leída como O, si lleva a una palabra conocida", () => {
    expect(c("OOCUMENTO OE IOENTIOAO")).toBe("DOCUMENTO DE IDENTIDAD");
    expect(c("FECHA OE EMISIÓN")).toBe("FECHA DE EMISIÓN");
    expect(c("PEOIOO OEL OIA")).toBe("PEDIDO DEL DIA");
    expect(c("OOS MIL")).toBe("DOS MIL");
    expect(c("OIRECCION: Av. Grau")).toBe("DIRECCION: Av. Grau");
    expect(c("TOOO EL MUNOO")).toBe("TODO EL MUNDO");
  });
  it("no cambia palabras válidas con O ni nombres desconocidos", () => {
    for (const l of ["OTRO OSO OLA ODIO ONDA ORO", "OLGA OCHO OFICINA", "NO LO SE", "OSCAR ROJAS", "PEDRO LOPEZ", "Documento de identidad", "COLOR DOLOR", "OK", "O sea", "BOGOTA"]) expect(c(l)).toBe(l);
  });
  it("una letra O en minúscula no se toca", () => expect(c("oe la tienda")).toBe("oe la tienda"));
  it("un cero metido en una palabra", () => expect(c("0SO")).toBe("OSO"));
  it("letras parecidas a cifras dentro de un número", () => {
    expect(c("BOO1-0008963")).toBe("B001-0008963");
    expect(c("BO01-123")).toBe("B001-123");
    expect(c("TOTAL 1,O35.80")).toBe("TOTAL 1,035.80");
    expect(c("RUC 2O6O1938457")).toBe("RUC 20601938457");
    expect(c("Tel 98706321S")).toBe("Tel 987063215");
    expect(c("10:O5")).toBe("10:05");
  });
  it("no toca números limpios, palabras ni códigos con letras de verdad", () => {
    for (const l of ["20601938457", "08/06/2026", "S/ 1,035.80", "B001-0008963", "COVID-19", "A4", "B2B", "SOL", "IGV 18%", "Av. Grau 450, Ica", "3D", "MP3", "ABC123"]) expect(c(l)).toBe(l);
  });
  it("el símbolo de soles mal leído, solo delante de un importe", () => {
    expect(c("TOTAL S$/ 25.50")).toBe("TOTAL S/ 25.50");
    expect(c("TOTAL $S/ 25.50")).toBe("TOTAL S/ 25.50");
    expect(c("TOTAL $/ 25.50")).toBe("TOTAL S/ 25.50");
    expect(c("Precio $ 20.00")).toBe("Precio $ 20.00");
  });
  it("conserva espacios y puntuación", () => expect(c("Total   OE: (1O5)")).toBe("Total   DE: (105)"));
});

it("esNumerica", () => {
  for (const t of ["987063215", "1,035.80", "08/06/2026", "B001-0008963", "4O5"]) expect(esNumerica(t)).toBe(true);
  for (const t of ["Total", "S/", "a", "8", "B2B", "Av."]) expect(esNumerica(t)).toBe(false);
});

describe("limpiarLineas: logos fuera", () => {
  it("quita lo que se leyó con poca confianza o casi sin letras", () => {
    const l = limpiarLineas(ocr([["~%&@ ;;", 80, 14], ["xQz", 30, 14], ["Texto normal", 92, 14]]));
    expect(l.map((x) => x.texto)).toEqual(["Texto normal"]);
  });
  it("con letra chica conserva lo que parece texto aunque tenga poca confianza; los símbolos sueltos no", () => {
    const l = limpiarLineas(ocr([["situación pero almenos sabremos", 38, 14], ["€ | Mi O", 38, 14], ["ruido", 12, 14]]));
    expect(l.map((x) => x.texto)).toEqual(["situación pero almenos sabremos"]);
  });
  it("quita letras enormes mal leídas (logo) y conserva un título grande y nítido", () => {
    const l = limpiarLineas(ocr([["MARKETO", 70, 60], ["GRAN TÍTULO", 95, 60], ["línea uno", 90, 14], ["línea dos", 90, 15], ["línea tres", 90, 14]]));
    expect(l.map((x) => x.texto)).toEqual(["GRAN TÍTULO", "línea uno", "línea dos", "línea tres"]);
  });
});

it("ordenarLineas: de arriba abajo y une las de la misma altura", () => {
  const lineas: LineaOcr[] = [
    { texto: "10.00", confianza: 90, x: 300, y: 100, alto: 14 }, { texto: "Total", confianza: 90, x: 10, y: 102, alto: 14 },
    { texto: "Primera", confianza: 90, x: 10, y: 20, alto: 14 },
  ];
  expect(ordenarLineas(lineas)).toEqual(["Primera", "Total   10.00"]);
});

describe("esComprobante", () => {
  it("una boleta sí", () => expect(esComprobante(BOLETA)).toBe(true));
  it("un texto cualquiera no, aunque tenga la palabra total o un número", () => {
    expect(esComprobante("Lista de compras\nTotal de invitados: 20\nLlamar al 987654321")).toBe(false);
  });
});

describe("leerComprobante", () => {
  it("datos de una boleta", () => {
    expect(leerComprobante(lineasDeTexto(BOLETA))).toEqual({
      tipo: "Boleta", razonSocial: "BODEGA EJEMPLO DEL SUR S.A.C.", ruc: "20123456789", fecha: "22/10/2026", serie: "B001", numero: "00001842",
      total: "10.00", igv: "1.53", documento: "12345678", moneda: "PEN",
    });
  });
  it("la razón social no es el texto del logo: se usa la línea normal encima del RUC", () => {
    const d = leerComprobante(ocr([["SUPER", 82, 48], ["Juan Pérez Quispe", 90, 14], ["RUC 10456789012", 92, 14], ["BOLETA DE VENTA ELECTRÓNICA", 90, 14], ["B002-77", 90, 14], ["TOTAL 25.50", 90, 14]]));
    expect(d.razonSocial).toBe("Juan Pérez Quispe");
    expect(d.ruc).toBe("10456789012");
  });
  it("prefiere la etiqueta «Razón social» y una factura con F", () => {
    const d = leerComprobante(lineasDeTexto("LOGO GRANDE\nRazón social: Servicios Andinos E.I.R.L.\nRUC: 20555555555\nFACTURA ELECTRÓNICA\nF001-12\nTOTAL A PAGAR US$ 1,250.00"));
    expect(d).toMatchObject({ tipo: "Factura", razonSocial: "Servicios Andinos E.I.R.L.", serie: "F001", numero: "12", total: "1250.00", moneda: "USD" });
  });
  it("no toma una dirección o un teléfono como razón social", () => {
    const d = leerComprobante(lineasDeTexto("Av. Grau 450 Ica\nTel. 056-123456\nRUC 20111111111\nBOLETA\nB001-1\nTOTAL 5.00"));
    expect(d.razonSocial).toBe("");
  });
});
