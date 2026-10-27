import { describe, expect, it } from "vitest";
import { leerRangoPaginas, textoRango } from "./rangoPaginas";

describe("leerRangoPaginas", () => {
  it("rango con guion: de la 2 a la 5", () => expect(leerRangoPaginas("2-5", 200)).toEqual({ paginas: [2, 3, 4, 5] }));
  it("lista con comas: solo la 2 y la 5", () => expect(leerRangoPaginas("2,5", 200)).toEqual({ paginas: [2, 5] }));
  it("combinado, con espacios, repetidas y al revés", () =>
    expect(leerRangoPaginas(" 10-8 ; 1 , 3 – 4, 3 ", 20)).toEqual({ paginas: [1, 3, 4, 8, 9, 10] }));
  it("rechaza texto que no es un rango", () => expect(leerRangoPaginas("2 a 5", 10)).toHaveProperty("error"));
  it("rechaza páginas que no existen", () => {
    expect(leerRangoPaginas("0", 10)).toHaveProperty("error");
    expect(leerRangoPaginas("8-11", 10)).toHaveProperty("error");
  });
  it("no deja quitar todas las páginas", () => expect(leerRangoPaginas("1-3", 3)).toHaveProperty("error"));
  it("vacío pide escribir algo", () => expect(leerRangoPaginas(" , ", 3)).toHaveProperty("error"));
});

describe("textoRango", () => {
  it("agrupa las seguidas", () => expect(textoRango([2, 3, 4, 5, 9, 11, 12])).toBe("2-5, 9, 11-12"));
});
