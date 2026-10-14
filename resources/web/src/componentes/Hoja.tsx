import { useEffect, useRef, type ReactNode } from "react";
import { CAMPOS, PASOS, type Paso } from "../documento";
import { escribir, leer, type Formulario } from "../formulario";

interface Props {
  paso: Paso;
  f: Formulario;
  errores: Record<string, string>;
  /** Recibe una función que actualiza el formulario más reciente (así no se pierden toques rápidos). */
  alCambiar: (cambio: (f: Formulario) => Formulario) => void;
  alMover: (paso: Paso) => void;
  alCerrar: () => void;
}

const diasDelMes = (mes: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  return m ? new Date(Number(m[1]), Number(m[2]), 0).getDate() : 31;
};
const igual = (a: Paso, b: Paso) => a.tipo === b.tipo && (a.tipo === "campo" ? a.ruta === (b as typeof a).ruta : a.indice === (b as typeof a).indice);

/** Panel inferior para llenar un campo del documento (o los días de un mes), con navegación al anterior y al siguiente. */
export function Hoja({ paso, f, errores, alCambiar, alMover, alCerrar }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const i = PASOS.findIndex((p) => igual(p, paso));
  const anterior = PASOS[i - 1], siguiente = PASOS[i + 1];

  useEffect(() => {
    entrada.current?.focus({ preventScroll: true });
  }, [paso]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [alCerrar]);

  let titulo: string, cuerpo: ReactNode, error: string | undefined, borrar: () => void;
  if (paso.tipo === "campo") {
    const campo = CAMPOS.find((c) => c.ruta === paso.ruta)!;
    const valor = leer(f, paso.ruta);
    titulo = campo.etiqueta;
    error = errores[paso.ruta];
    borrar = () => alCambiar((p) => escribir(p, paso.ruta, ""));
    const props =
      campo.tipo === "fecha" ? { type: "date" }
      : campo.tipo === "numero" || campo.tipo === "monto" ? { inputMode: "decimal" as const, placeholder: campo.tipo === "monto" ? "0.00" : "0" }
      : campo.tipo === "email" ? { type: "email", inputMode: "email" as const, autoComplete: "email" }
      : campo.tipo === "tel" ? { type: "tel", autoComplete: "tel", placeholder: "+51 999 888 777" }
      : {};
    cuerpo = (
      <>
        <input
          ref={entrada} className={error ? "invalido" : ""} value={valor} aria-label={campo.etiqueta} {...props}
          onChange={(e) => { const v = e.target.value; alCambiar((p) => escribir(p, paso.ruta, v)); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); siguiente ? alMover(siguiente) : alCerrar(); } }}
        />
        {campo.ayuda && <small className="afSheetHint">{campo.ayuda}</small>}
      </>
    );
  } else {
    const m = f.reiterativo.meses[paso.indice];
    const ultimo = diasDelMes(m.mes);
    const k = paso.indice;
    const cambiarMes = (cambio: (m: { mes: string; dias: number[] }) => { mes: string; dias: number[] }) =>
      alCambiar((p) => {
        const meses = p.reiterativo.meses.map((x, j) => {
          if (j !== k) return x;
          const n = cambio(x);
          return { mes: n.mes, dias: n.dias.filter((d) => d <= diasDelMes(n.mes)) };
        });
        return { ...p, reiterativo: { ...p.reiterativo, meses } };
      });
    titulo = `Fechas de viajes reiterativos — mes ${paso.indice + 1}`;
    error = errores[`reiterativo.meses.${paso.indice}.mes`] || errores[`reiterativo.meses.${paso.indice}.dias`];
    borrar = () => cambiarMes(() => ({ mes: "", dias: [] }));
    cuerpo = (
      <>
        <input ref={entrada} type="month" value={m.mes} aria-label="Mes" className={error ? "invalido" : ""} onChange={(e) => { const mes = e.target.value; cambiarMes((x) => ({ ...x, mes })); }} />
        <div className="afDayGrid">
          {Array.from({ length: 31 }, (_, k) => k + 1).map((d) => (
            <button
              type="button" key={d} className={`afDayBtn ${m.dias.includes(d) ? "on" : ""}`} aria-pressed={m.dias.includes(d)}
              disabled={!m.mes || d > ultimo}
              onClick={() => cambiarMes((x) => ({ ...x, dias: x.dias.includes(d) ? x.dias.filter((y) => y !== d) : [...x.dias, d] }))}
            >
              {d}
            </button>
          ))}
        </div>
        <small className="afSheetHint">{m.mes ? `${m.dias.length} día${m.dias.length === 1 ? "" : "s"} marcado${m.dias.length === 1 ? "" : "s"}` : "Primero elige el mes."}</small>
      </>
    );
  }

  return (
    <div className="afSheet" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="afSheetCard" role="dialog" aria-label={titulo}>
        <div className="afSheetHead">
          <div className="afSheetTitles">
            <strong>{titulo}</strong>
            <small>Toca «Siguiente» para pasar al próximo campo</small>
          </div>
          <div className="afSheetNav">
            <button type="button" disabled={!anterior} onClick={() => anterior && alMover(anterior)} aria-label="Anterior">‹</button>
            <span>{i + 1} / {PASOS.length}</span>
            <button type="button" disabled={!siguiente} onClick={() => siguiente && alMover(siguiente)} aria-label="Siguiente">›</button>
          </div>
        </div>
        {cuerpo}
        {error && <small className="afSheetError">{error}</small>}
        <div className="afSheetActions">
          <button type="button" className="danger" onClick={borrar}>Borrar</button>
          {siguiente ? (
            <button type="button" className="primary" onClick={() => alMover(siguiente)}>Siguiente</button>
          ) : null}
          <button type="button" className="success" onClick={alCerrar}>✓ Listo</button>
        </div>
      </div>
    </div>
  );
}
