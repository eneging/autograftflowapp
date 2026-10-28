import { describe, expect, it } from "vitest";
import { esComprobante, leerComprobante, limpiarLineas, lineasDeTexto, ordenarLineas, type LineaOcr } from "./exTrae";

/** Líneas como las da el OCR: [texto, confianza, alto]; y crece de 20 en 20. */
const ocr = (filas: [string, number, number][]): LineaOcr[] => filas.map(([texto, confianza, alto], i) => ({ texto, confianza, alto, x: 10, y: i * 30, }));

const BOLETA = [
  "BODEGA EJEMPLO DEL SUR S.A.C.", "RUC: 20123456789", "Av. Ejemplo 123, Ica, Perú", "BOLETA DE VENTA ELECTRÓNICA", "B001-00001842",
  "Fecha de emisión: 22/10/2026", "Cliente DNI: 12345678", "OP. GRAVADA S/ 8.47", "IGV (18%) S/ 1.53", "IMPORTE TOTAL S/ 10.00",
].join("\n");

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
