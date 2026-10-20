/** Entorno aislado de pdf.js (QuickJS en WebAssembly) que ejecuta los scripts de los formularios PDF. */
declare module "pdfjs-dist/build/pdf.sandbox.mjs" {
  export interface SandboxPdf {
    create(datos: unknown): void;
    dispatchEvent(evento: unknown): void;
    nukeSandbox(): void;
  }
  /** carpetaWasm: URL de la carpeta con quickjs-eval.js y quickjs-eval.wasm (terminada en «/»). */
  export function QuickJSSandbox(carpetaWasm?: string): Promise<SandboxPdf>;
}
