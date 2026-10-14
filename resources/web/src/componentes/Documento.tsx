import { aCentavos, formatoFecha, formatoMes, formatoMonto, type Totales } from "../../../shared/calculos";
import { aNumero } from "../../../shared/esquema";
import { CALCULADOS, CAMPOS, FIRMAS, MESES, posicion, type DefCampo } from "../documento";
import { leer, type Formulario } from "../formulario";

type Rect = [number, number, number, number];
/** El recuadro de la firma ocupa toda la celda (incluida la etiqueta) para que sea fácil de tocar en el celular. */
const celdaFirma = (r: Rect): Rect => [r[0], r[1], r[2], r[3] + 9];

export interface FirmaDoc {
  imagen?: string | null;
  fecha?: string;
  /** Si se da, el recuadro muestra «FIRMA AQUÍ» y al tocarlo se abre la pantalla de firma. */
  alTocar?: () => void;
  error?: boolean;
}

interface Props {
  f: Formulario;
  totales: Totales;
  reembolsosFila: number[];
  errores?: Record<string, string>;
  /** Si se da, los campos se pueden tocar para llenarlos. */
  alTocarCampo?: (ruta: string) => void;
  alTocarMes?: (indice: number) => void;
  numeroFactura?: string;
  solicitante?: FirmaDoc;
  aprobador?: FirmaDoc;
}

const mostrar = (campo: DefCampo, valor: string) => {
  if (campo.tipo === "fecha") return formatoFecha(valor);
  const n = aNumero(valor);
  return campo.tipo === "monto" && valor.trim() && Number.isFinite(n) ? formatoMonto(aCentavos(n)) : valor;
};

/** Página del formulario con los datos dibujados encima, en la misma posición que tendrán en el PDF. */
export function Documento({ f, totales, reembolsosFila, errores = {}, alTocarCampo, alTocarMes, numeroFactura, solicitante, aprobador }: Props) {
  const editable = Boolean(alTocarCampo);
  return (
    <div className="page">
      <img src="/formulario.jpg" alt="Solicitud de reembolso para no empleados" draggable={false} />

      {CAMPOS.map((campo) => {
        const valor = mostrar(campo, leer(f, campo.ruta));
        const clase = `afTextInput ${editable ? "touch" : "lectura"} ${valor ? "filled" : ""} ${errores[campo.ruta] ? "invalido" : ""}`;
        const contenido = <span className={`afTextShown ${campo.tipo === "monto" || campo.tipo === "numero" ? "der" : ""}`}>{valor}</span>;
        return editable ? (
          <button type="button" key={campo.ruta} className={clase} style={posicion(campo.rect)} title={campo.etiqueta} aria-label={`${campo.etiqueta}${valor ? `: ${valor}` : ""}`} onClick={() => alTocarCampo!(campo.ruta)}>
            {contenido}
          </button>
        ) : (
          <div key={campo.ruta} className={clase} style={posicion(campo.rect)}>{contenido}</div>
        );
      })}

      {MESES.map((m, i) => {
        const fila = f.reiterativo.meses[i];
        const invalido = errores[`reiterativo.meses.${i}.mes`] || errores[`reiterativo.meses.${i}.dias`];
        return (
          <div key={i}>
            <div className="afTextInput lectura filled" style={posicion(m.mes)}>
              <span className="afTextShown">{formatoMes(fila.mes)}</span>
            </div>
            {fila.dias.map((d) => (
              <span key={d} className="afCheckMark" style={posicion(m.dias[d - 1])}>✓</span>
            ))}
            {alTocarMes && (
              <button
                type="button" className={`afMesZona ${fila.mes || fila.dias.length ? "filled" : ""} ${invalido ? "invalido" : ""}`}
                style={posicion(m.zona)} aria-label={`Fechas de viajes reiterativos, mes ${i + 1}`} onClick={() => alTocarMes(i)}
              />
            )}
          </div>
        );
      })}

      {CALCULADOS.map((x, i) => {
        const v = x.valor(totales, reembolsosFila);
        return (
          <div key={i} className={`afCalcOut ${editable ? "" : "lectura"}`} style={posicion(x.rect)} title="Campo calculado automáticamente">
            {v || (editable ? "ƒx" : "")}
          </div>
        );
      })}

      <div className="afTextInput lectura filled" style={posicion(FIRMAS.factura)}>
        <span className={`afTextShown ${numeroFactura ? "" : "auto"}`}>{numeroFactura || (editable ? "Se asigna al enviar" : "")}</span>
      </div>

      {[
        { datos: solicitante, r: FIRMAS.solicitante },
        { datos: aprobador, r: FIRMAS.aprobador },
      ].map(({ datos, r }, i) =>
        datos ? (
          <div key={i}>
            {datos.alTocar ? (
              <button
                type="button" className={`sig ${datos.imagen ? "filled" : ""} ${datos.error ? "invalido" : ""}`}
                style={posicion(celdaFirma(r.firma))} onClick={datos.alTocar} aria-label="Firmar aquí"
              >
                {datos.imagen && <img src={datos.imagen} alt="Firma" />}
              </button>
            ) : (
              datos.imagen && <img className="sigImg" src={datos.imagen} alt="Firma" style={posicion(r.firma)} />
            )}
            {datos.fecha && (
              <div className="afTextInput lectura filled" style={posicion(r.fecha)}>
                <span className="afTextShown">{datos.fecha}</span>
              </div>
            )}
          </div>
        ) : null,
      )}
    </div>
  );
}
