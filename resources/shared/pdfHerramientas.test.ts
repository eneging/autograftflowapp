import { describe, expect, it } from "vitest";
import { crc32, crearZip, gruposCada, leerGrupos, nombreSalida } from "./pdfHerramientas";

describe("leerGrupos", () => {
  it("cada parte es un PDF", () => expect(leerGrupos("1-3, 4-5, 7", 8)).toEqual({ grupos: [[1, 2, 3], [4, 5], [7]] }));
  it("un grupo puede tener todas las páginas", () => expect(leerGrupos("3-1", 3)).toEqual({ grupos: [[1, 2, 3]] }));
  it("rechaza lo que no existe o no se entiende", () => {
    expect(leerGrupos("1-9", 8)).toHaveProperty("error");
    expect(leerGrupos("uno", 8)).toHaveProperty("error");
    expect(leerGrupos("", 8)).toHaveProperty("error");
  });
});

it("gruposCada", () => expect(gruposCada(4, 10)).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10]]));
it("nombreSalida", () => expect(nombreSalida("Contrato: final.PDF", "unido")).toBe("Contrato final-unido.pdf"));

describe("zip", () => {
  it("crc32 conocido", () => expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686));
  it("estructura: cabecera local, directorio central y fin", async () => {
    const datos = new TextEncoder().encode("hola");
    const zip = new Uint8Array(await crearZip([{ nombre: "a.txt", datos }, { nombre: "ñ.txt", datos }]).arrayBuffer());
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const fin = zip.length - 22;
    expect(v.getUint32(fin, true)).toBe(0x06054b50);
    expect(v.getUint16(fin + 10, true)).toBe(2);
    const inicioCentral = v.getUint32(fin + 16, true);
    expect(v.getUint32(inicioCentral, true)).toBe(0x02014b50);
    expect(inicioCentral + v.getUint32(fin + 12, true)).toBe(fin);
  });
});
