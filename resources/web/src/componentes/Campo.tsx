import { useId, type InputHTMLAttributes, type ReactNode } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  etiqueta: ReactNode;
  valor: string;
  alCambiar: (v: string) => void;
  error?: string;
  ayuda?: string;
  ancho?: "completo" | "medio" | "tercio" | "cuarto";
};

/** Campo de texto con etiqueta, ayuda y mensaje de error. Los números se escriben como texto y se convierten al enviar. */
export function Campo({ etiqueta, valor, alCambiar, error, ayuda, ancho = "medio", id, ...resto }: Props) {
  const auto = useId();
  const ident = id ?? auto;
  return (
    <label className={`campo ancho-${ancho} ${error ? "con-error" : ""}`} htmlFor={ident}>
      <span className="campo-etiqueta">
        {etiqueta}
        {resto.required && <span className="obligatorio" aria-hidden> *</span>}
      </span>
      <input
        id={ident}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        aria-invalid={!!error}
        data-error={error ? "si" : undefined}
        {...resto}
      />
      {error ? <span className="error">{error}</span> : ayuda ? <span className="ayuda">{ayuda}</span> : null}
    </label>
  );
}

export const propsNumero = { inputMode: "decimal" as const, autoComplete: "off", placeholder: "0.00" };
