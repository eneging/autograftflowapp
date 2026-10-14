import { useRef, useState } from "react";
import { ETIQUETA_ESTADO } from "../../../shared/plataforma";
import { ErrorApi, plataforma, type Verificacion } from "./api";
import { fechaHora } from "./Panel";

/** Huella SHA-256 calculada en el navegador: el PDF no se sube a ningún lado. */
async function huella(archivo: File) {
  const bytes = await crypto.subtle.digest("SHA-256", await archivo.arrayBuffer());
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Página pública para comprobar si un PDF fue firmado con AutograFlow y no se alteró. */
export function Verificar() {
  const [r, setR] = useState<(Verificacion & { sha: string; archivo: string }) | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [arrastrando, setArrastrando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  async function revisar(archivo?: File) {
    if (!archivo) return;
    setCargando(true);
    setError("");
    setR(null);
    try {
      const sha = await huella(archivo);
      setR({ ...(await plataforma.verificar(sha)), sha, archivo: archivo.name });
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo revisar el archivo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="card">
      <h1>Verificar un documento</h1>
      <p>Comprueba si un PDF fue firmado con AutograFlow y que no se modificó después. El archivo <strong>no se sube</strong>: tu navegador calcula su huella digital y solo se consulta esa huella.</p>
      <div
        className={`subidaPdf ${arrastrando ? "arrastrando" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); revisar(e.dataTransfer.files[0]); }}
      >
        <div className="subidaIcono">🔍</div>
        <strong>{cargando ? "Revisando…" : "Arrastra aquí el PDF firmado"}</strong>
        <button type="button" className="primary" disabled={cargando} onClick={() => entrada.current?.click()}>Elegir PDF</button>
        <input ref={entrada} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { revisar(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {error && <div className="afAlerta">{error}</div>}
      {r && (r.encontrado && r.tipo === "firmado" ? (
        <div className="okNotice verificacion">
          <h2>✓ Documento auténtico</h2>
          <p><strong>{r.documento.nombre}</strong> fue firmado con AutograFlow por {r.documento.empresa} y <strong>no fue modificado</strong> desde que se completó.</p>
          <p>Completado: {fechaHora(r.documento.completadoEn)}</p>
          <ul>{r.firmantes.map((f, i) => <li key={i}>{f.nombre} — firmó {fechaHora(f.firmadoEn)}</li>)}</ul>
        </div>
      ) : r.encontrado ? (
        <div className="notice verificacion">
          <h2>Es el documento original, sin las firmas</h2>
          <p>«{r.documento.nombre}» se envió a firmar con AutograFlow ({ETIQUETA_ESTADO[r.documento.estado].toLowerCase()}), pero este archivo es la versión anterior a las firmas. Pide el PDF firmado para comprobarlo.</p>
        </div>
      ) : (
        <div className="afAlerta verificacion">
          <h2>✗ No se encontró este documento</h2>
          <p>Este PDF no coincide con ningún documento firmado en AutograFlow. Si debería estarlo, puede haber sido <strong>modificado</strong> después de firmarse, o no se firmó aquí.</p>
        </div>
      ))}
      {r && <p className="afExtraHint huella">Huella SHA-256 de «{r.archivo}»: <code>{r.sha}</code></p>}
    </div>
  );
}
