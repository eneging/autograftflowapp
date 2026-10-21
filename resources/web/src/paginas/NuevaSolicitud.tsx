import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { calcular, formatoFecha, formatoMonto } from "../../../shared/calculos";
import { esquemaSolicitud, LIMITES } from "../../../shared/esquema";
import { api, ErrorApi } from "../api";
import { Campo, propsNumero } from "../componentes/Campo";
import { Documento } from "../componentes/Documento";
import { Hoja } from "../componentes/Hoja";
import { AvisoPrivacidad, AdministrarPlantillaIncluida } from "../componentes/Marco";
import { PantallaFirma } from "../componentes/PantallaFirma";
import { CAMPOS, PASOS, type Paso } from "../documento";
import {
  aDatos, formularioVacio, gastoVacio, guardarBorrador, hoy, leerBorrador, paraTotales, reembolsoPorFila, rutaEnFormulario, viajeVacio,
  type FilaGasto, type FilaViaje, type Formulario,
} from "../formulario";

export const NOMBRE_DOCUMENTO = "Solicitud de Reembolso Para Maestros y Supervisores";
type Errores = Record<string, string>;

function validar(f: Formulario, firma: string | null): Errores {
  const errores: Errores = {};
  const r = esquemaSolicitud.safeParse(aDatos(f));
  if (!r.success)
    for (const i of r.error.issues) errores[rutaEnFormulario(f, i.path.join(".")) || "_"] ??= i.message;
  if (!firma) errores.firma = "Falta tu firma";
  return errores;
}

/** Paso del documento al que pertenece un error, para abrirlo directamente. */
function pasoDeError(ruta: string): Paso | null {
  const mes = /^reiterativo\.meses\.(\d+)/.exec(ruta);
  if (mes) return { tipo: "mes", indice: Number(mes[1]) };
  return CAMPOS.some((c) => c.ruta === ruta) ? { tipo: "campo", ruta } : null;
}

/** Firmante 1: llena el documento, firma, revisa y envía. */
export function NuevaSolicitud() {
  const navegar = useNavigate();
  const [f, setF] = useState<Formulario>(() => leerBorrador() ?? formularioVacio());
  const [firma, setFirma] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso | null>(null);
  const [firmando, setFirmando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [anexo, setAnexo] = useState(() => f.viajes.length > LIMITES.viajesEnFormulario || f.gastos.length > LIMITES.gastosEnFormulario);
  const [errores, setErrores] = useState<Errores>({});
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    const t = setTimeout(() => guardarBorrador(f), 400);
    return () => clearTimeout(t);
  }, [f]);
  useEffect(() => {
    if (!intentado) return;
    const errs = validar(f, firma);
    setErrores(errs);
    if (!Object.keys(errs).length) setAviso("");
  }, [f, firma, intentado]);

  const t = useMemo(() => calcular(paraTotales(f)), [f]);
  const porFila = useMemo(() => reembolsoPorFila(f, t.viajes), [f, t]);
  const cerrarHoja = useCallback(() => setPaso(null), []);

  function revisar() {
    setIntentado(true);
    const errs = validar(f, firma);
    setErrores(errs);
    const lista = Object.entries(errs);
    if (lista.length) {
      const nombres = lista.slice(0, 4).map(([ruta, msj]) => {
        const c = CAMPOS.find((x) => x.ruta === ruta);
        return c ? `${c.etiqueta} (${msj.toLowerCase()})` : msj;
      });
      setAviso(`Completa o corrige: ${nombres.join("; ")}${lista.length > 4 ? ` y ${lista.length - 4} más` : ""}.`);
      const primero = lista.map(([r]) => pasoDeError(r)).find(Boolean);
      if (primero) setPaso(primero);
      else if (errs.firma) setFirmando(true);
      return;
    }
    setAviso("");
    setRevisando(true);
    window.scrollTo({ top: 0 });
  }

  async function enviar() {
    setEnviando(true);
    try {
      const r = await api.crear(aDatos(f), firma!);
      guardarBorrador(null);
      navegar(`/s/${r.tokenSolicitante}`, { state: { nueva: true } });
    } catch (e) {
      if (e instanceof ErrorApi && Object.keys(e.campos).length) {
        setErrores(Object.fromEntries(Object.entries(e.campos).map(([k, v]) => [rutaEnFormulario(f, k.replace(/^datos\./, "")) || "_", v])));
        setRevisando(false);
      }
      alert("No se pudo enviar la solicitud: " + (e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const empezarDeNuevo = () => {
    if (!confirm("¿Borrar todo lo escrito y empezar de nuevo?")) return;
    setF(formularioVacio());
    setFirma(null);
    setErrores({});
    setIntentado(false);
    setAviso("");
  };

  const firmaDoc = { imagen: firma, fecha: firma ? formatoFecha(hoy()) : undefined };

  if (revisando)
    return (
      <div className="card">
        <h2 id="finishTitle">Previsualización del documento firmado</h2>
        <p>Revisa que todo esté correcto. Al enviar, la solicitud se guarda y recibirás el PDF y el enlace para el Firmante 2.</p>
        <div className="signed">
          <Documento f={f} totales={t} reembolsosFila={porFila} solicitante={firmaDoc} />
        </div>
        {(f.viajes.length > LIMITES.viajesEnFormulario || f.gastos.length > LIMITES.gastosEnFormulario) && (
          <p className="notice">Los viajes y gastos adicionales irán en una hoja anexa del PDF.</p>
        )}
        <p className="totalLinea">Total de gastos de viaje: <strong>{formatoMonto(t.total)}</strong></p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button type="button" onClick={() => setRevisando(false)} disabled={enviando}>Volver a firmar</button>
          <button type="button" className="success" onClick={enviar} disabled={enviando}>
            {enviando ? "Enviando…" : "✓ Enviar solicitud firmada"}
          </button>
        </div>
      </div>
    );

  return (
    <>
      <AdministrarPlantillaIncluida />
      <div className="card">
        <h1>Documento listo para firmar — Firmante 1</h1>
        <div className="notice">
          <strong>Firmante 1 · Solicitante</strong>
          <br />Llena tus datos tocando cada campo del documento y firma en el campo configurado.
        </div>
        <h3>{NOMBRE_DOCUMENTO}</h3>
        <AvisoPrivacidad />

        <div className="readyBar">
          <button type="button" className="primary" onClick={() => setPaso(PASOS[0])}>✍️ Empezar a llenar mis datos</button>
          <button type="button" className="primary" onClick={() => setFirmando(true)}>{firma ? "✍️ Cambiar mi firma" : "✍️ Listo para firmar"}</button>
        </div>
        {aviso && <div className="afAlerta" role="alert">{aviso}</div>}
        <div className="readyBar">
          <button type="button" className="success" disabled={!firma} onClick={revisar}>✓ Revisar y continuar</button>
        </div>

        <div className="signerPageNav"><span>Página <b>1</b> de <b>1</b></span></div>
        <div className="preview">
          <Documento
            f={f} totales={t} reembolsosFila={porFila} errores={errores}
            alTocarCampo={(ruta) => setPaso({ tipo: "campo", ruta })}
            alTocarMes={(indice) => setPaso({ tipo: "mes", indice })}
            solicitante={{ ...firmaDoc, alTocar: () => setFirmando(true), error: Boolean(errores.firma) }}
          />
        </div>

        <div className="afExtraTextRow">
          <button type="button" onClick={() => setAnexo((a) => !a)}>{anexo ? "Ocultar hoja anexa" : "➕ Agregar más viajes o gastos (hoja anexa)"}</button>
          <p className="afExtraHint">Úsalo solo si no te alcanzan las filas del documento.</p>
        </div>
        {anexo && <Anexo f={f} setF={setF} errores={errores} reembolsos={porFila} />}

        <div className="row pie">
          <button type="button" className="enlace" onClick={empezarDeNuevo}>Borrar todo y empezar de nuevo</button>
        </div>
      </div>

      {paso && <Hoja paso={paso} f={f} errores={errores} alCambiar={setF} alMover={setPaso} alCerrar={cerrarHoja} />}
      {firmando && (
        <PantallaFirma
          titulo="Firma manuscrita — Firmante 1" inicial={firma}
          alTerminar={(png) => { setFirma(png); setFirmando(false); }}
          alCerrar={() => setFirmando(false)}
        />
      )}
    </>
  );
}

/** Filas extra de viajes y gastos (después de las del documento), que el PDF pone en una hoja anexa. */
function Anexo({ f, setF, errores, reembolsos }: { f: Formulario; setF: (fn: (p: Formulario) => Formulario) => void; errores: Errores; reembolsos: number[] }) {
  const V = LIMITES.viajesEnFormulario, G = LIMITES.gastosEnFormulario;
  const viaje = (i: number, k: keyof FilaViaje) => (v: string) => setF((p) => ({ ...p, viajes: p.viajes.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const gasto = (i: number, k: keyof FilaGasto) => (v: string) => setF((p) => ({ ...p, gastos: p.gastos.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const e = (r: string) => errores[r];
  return (
    <div className="anexo">
      <h3>Hoja anexa: viajes con diversas paradas</h3>
      {f.viajes.slice(V).map((v, k) => {
        const i = k + V;
        return (
          <div className="anexoFila" key={i}>
            <div className="anexoCab">
              <strong>Viaje {i + 1}</strong><span>{formatoMonto(reembolsos[i] ?? 0)}</span>
              <button type="button" className="enlace peligro" onClick={() => setF((p) => ({ ...p, viajes: p.viajes.filter((_, j) => j !== i) }))}>Quitar</button>
            </div>
            <div className="rejilla">
              <Campo etiqueta="Punto de partida" valor={v.origen} alCambiar={viaje(i, "origen")} error={e(`viajes.${i}.origen`)} />
              <Campo etiqueta="Destino" valor={v.destino} alCambiar={viaje(i, "destino")} error={e(`viajes.${i}.destino`)} />
              <Campo etiqueta="Propósito" valor={v.proposito} alCambiar={viaje(i, "proposito")} error={e(`viajes.${i}.proposito`)} ancho="completo" />
              <Campo etiqueta="Fecha" valor={v.fecha} alCambiar={viaje(i, "fecha")} error={e(`viajes.${i}.fecha`)} type="date" ancho="tercio" />
              <Campo etiqueta="mi o km" valor={v.distancia} alCambiar={viaje(i, "distancia")} error={e(`viajes.${i}.distancia`)} ancho="tercio" {...propsNumero} placeholder="0" />
              <Campo etiqueta="Peajes" valor={v.peajes} alCambiar={viaje(i, "peajes")} error={e(`viajes.${i}.peajes`)} ancho="tercio" {...propsNumero} />
            </div>
          </div>
        );
      })}
      <button type="button" disabled={f.viajes.length >= LIMITES.viajes} onClick={() => setF((p) => ({ ...p, viajes: [...p.viajes, viajeVacio()] }))}>+ Agregar viaje</button>

      <h3>Hoja anexa: otros gastos</h3>
      {f.gastos.slice(G).map((g, k) => {
        const i = k + G;
        return (
          <div className="anexoFila" key={i}>
            <div className="anexoCab">
              <strong>Gasto {i + 1}</strong>
              <button type="button" className="enlace peligro" onClick={() => setF((p) => ({ ...p, gastos: p.gastos.filter((_, j) => j !== i) }))}>Quitar</button>
            </div>
            <div className="rejilla">
              <Campo etiqueta="Nombre del vendedor" valor={g.vendedor} alCambiar={gasto(i, "vendedor")} error={e(`gastos.${i}.vendedor`)} />
              <Campo etiqueta="Cantidad" valor={g.monto} alCambiar={gasto(i, "monto")} error={e(`gastos.${i}.monto`)} {...propsNumero} />
              <Campo etiqueta="Finalidad y descripción de la compra" valor={g.descripcion} alCambiar={gasto(i, "descripcion")} error={e(`gastos.${i}.descripcion`)} />
              <Campo etiqueta="Código de cuenta" valor={g.cuenta} alCambiar={gasto(i, "cuenta")} error={e(`gastos.${i}.cuenta`)} />
            </div>
          </div>
        );
      })}
      <button type="button" disabled={f.gastos.length >= LIMITES.gastos} onClick={() => setF((p) => ({ ...p, gastos: [...p.gastos, gastoVacio()] }))}>+ Agregar gasto</button>
      <p className="afExtraHint">Estos importes se suman automáticamente a los totales del documento.</p>
    </div>
  );
}
