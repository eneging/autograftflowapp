import { describe, expect, it } from "vitest";
import { calcular, formatoMonto, formatoFecha, formatoMes } from "./calculos";
import { aNumero, esquemaSolicitud, type EntradaSolicitud } from "./esquema";

const base = (): EntradaSolicitud => ({
  contacto: { nombre: "Juan Pérez", estaca: "Lima Norte", barrio: "Los Olivos", telefono: "+51 999 888 777", fechaFactura: "2026-10-06", tasa: 0.3 },
  reiterativo: { distancia: 10, peajes: 2, meses: [{ mes: "2026-10", dias: [1, 2] }, { mes: "2026-11", dias: [5] }] },
  viajes: [{ fecha: "2026-10-03", distancia: 50, peajes: 5 }],
  gastos: [{ vendedor: "Librería", monto: 100 }],
});

describe("calcular", () => {
  // Mismo caso que se comprobó con el motor de scripts del PDF original (pdf.js): total 135.00.
  it("coincide con los scripts del PDF original", () => {
    const t = calcular(esquemaSolicitud.parse(base()));
    expect(t.dias).toBe(3);
    expect(t.reiterativoDistancia).toBe(30);
    expect(formatoMonto(t.reiterativoPeajes)).toBe("6.00");
    expect(formatoMonto(t.reiterativoReembolso)).toBe("15.00");
    expect(formatoMonto(t.viajes[0])).toBe("20.00");
    expect(formatoMonto(t.totalOtros)).toBe("100.00");
    expect(formatoMonto(t.total)).toBe("135.00");
  });

  it("no arrastra errores de coma flotante", () => {
    const d = base();
    d.reiterativo.meses = [];
    d.viajes = [];
    d.gastos = [{ vendedor: "A", monto: 0.1 }, { vendedor: "B", monto: 0.2 }];
    expect(formatoMonto(calcular(esquemaSolicitud.parse(d)).total)).toBe("0.30");
  });

  it("no cuenta dos veces el mismo día", () => {
    const d = base();
    d.reiterativo.meses = [{ mes: "2026-10", dias: [4, 4] }];
    expect(calcular(esquemaSolicitud.parse(d)).dias).toBe(1);
  });
});

describe("validación", () => {
  it("exige la tarifa si hay viajes", () => {
    const d = base();
    d.contacto.tasa = 0;
    expect(esquemaSolicitud.safeParse(d).success).toBe(false);
  });

  it("rechaza días que no existen en el mes", () => {
    const d = base();
    d.reiterativo.meses = [{ mes: "2026-02", dias: [30] }];
    const r = esquemaSolicitud.safeParse(d);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("no tiene día 30");
  });

  it("rechaza una solicitud vacía", () => {
    const d = base();
    d.reiterativo.meses = [];
    d.viajes = [];
    d.gastos = [];
    expect(esquemaSolicitud.safeParse(d).success).toBe(false);
  });
});

describe("formatos", () => {
  it("formatea montos, fechas y meses", () => {
    expect(formatoMonto(123456789)).toBe("1,234,567.89");
    expect(formatoMonto(5)).toBe("0.05");
    expect(formatoFecha("2026-10-06")).toBe("06/10/2026");
    expect(formatoMes("2026-02")).toBe("Febrero 2026");
  });

  it("entiende números escritos a la manera local", () => {
    expect(aNumero("0,30")).toBe(0.3);
    expect(aNumero("1.234,50")).toBe(1234.5);
    expect(aNumero("1,234.50")).toBe(1234.5);
    expect(aNumero("$ 12")).toBe(12);
    expect(aNumero("")).toBe(0);
    expect(aNumero("abc")).toBe(0);
  });
});
