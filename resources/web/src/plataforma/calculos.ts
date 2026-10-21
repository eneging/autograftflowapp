import type { FormularioPdf } from "../../../shared/plataforma";

/*
 * Cálculos de los formularios PDF (como el prototipo v43): se ejecutan los scripts del propio PDF, igual que en Acrobat
 * (p. ej. «distancia × días marcados», totales), dentro del entorno aislado de pdf.js: QuickJS en WebAssembly, sin
 * acceso a la página, a la red ni a los archivos. Sus archivos (quickjs-eval.js y .wasm) los copia Vite a /pdfjs/.
 */

/** Valor de cada campo del PDF por su nombre: texto, fecha «AAAA-MM-DD» o casilla marcada. */
export type ValoresPdf = Record<string, string | boolean | null | undefined>;

const fechaPdf = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m ? `${m[3]}/${m[2]}/${m[1]}` : v; };

// Los resultados llegan como eventos globales de la ventana: se ejecuta un cálculo a la vez.
let cola: Promise<unknown> = Promise.resolve();

/** Devuelve el texto de cada campo calculado (por su nombre en el PDF), con el formato del propio PDF. */
export function calcularPdf(formulario: FormularioPdf, valores: ValoresPdf, calculados: string[]): Promise<Record<string, string>> {
  const tarea = cola.then(() => ejecutar(formulario, valores, calculados));
  cola = tarea.catch(() => undefined);
  return tarea;
}

async function ejecutar(formulario: FormularioPdf, valores: ValoresPdf, calculados: string[]) {
  const objects = structuredClone(formulario.objects), idNombre: Record<string, string> = {}, calc = new Set(calculados);
  for (const [nombre, lista] of Object.entries(objects))
    for (const o of lista) {
      idNombre[o.id] = nombre;
      if (calc.has(nombre)) { o.value = ""; continue; }
      if (!(nombre in valores)) continue;
      const v = valores[nombre];
      if (o.type === "checkbox") {
        const exportar = Array.isArray(o.exportValues) ? o.exportValues[0] : o.exportValues;
        o.value = v === true ? exportar || "Yes" : "Off";
      } else if (o.type === "text") o.value = typeof v === "string" ? fechaPdf(v) : "";
    }

  const { QuickJSSandbox } = await import("pdfjs-dist/legacy/build/pdf.sandbox.mjs");
  const cambios: Record<string, { value?: unknown; formattedValue?: unknown }> = {};
  const alCambiar = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.id && idNombre[d.id]) cambios[idNombre[d.id]] = d; };
  window.addEventListener("updatefromsandbox", alCambiar);
  const sandbox = await QuickJSSandbox(`${location.origin}/pdfjs/`);
  try {
    sandbox.create({
      objects, calculationOrder: formulario.calculationOrder, appInfo: { platform: navigator.platform || "", language: navigator.language || "es" },
      docInfo: { actions: formulario.actions ?? {}, numPages: formulario.numPages || 1, title: "", filesize: 0, filename: "", metadata: "", authors: [], URL: "", baseURL: "" },
    });
    sandbox.dispatchEvent({ id: "doc", name: "Open" });
    // Confirmar un campo de texto sin cambiarlo dispara el recálculo completo, en el orden de cálculo del PDF.
    const todos = Object.values(objects).flat(), disparador = todos.find((o) => o.type === "text" && !calc.has(idNombre[o.id]));
    if (disparador) sandbox.dispatchEvent({ id: disparador.id, name: "Keystroke", value: String(disparador.value ?? ""), willCommit: true, commitKey: 1, selStart: 0, selEnd: 0 });
    await new Promise((r) => setTimeout(r, 120));
  } finally {
    window.removeEventListener("updatefromsandbox", alCambiar);
    try { sandbox.nukeSandbox(); } catch { /* ya cerrado */ }
  }

  const salida: Record<string, string> = {};
  for (const nombre of calculados) {
    const c = cambios[nombre];
    if (!c) continue;
    const texto = c.formattedValue != null && c.formattedValue !== "" ? String(c.formattedValue) : c.value == null ? "" : String(c.value);
    // Muchos formularios dejan en blanco los ceros (script «Validate»: if (event.value == 0) event.value = "").
    const validar = (objects[nombre]?.[0]?.actions?.Validate ?? []).join("\n");
    salida[nombre] = Number(c.value) === 0 && /event\.value\s*==\s*0/.test(validar) ? "" : texto;
  }
  return salida;
}
