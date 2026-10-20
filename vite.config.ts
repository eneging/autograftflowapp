import { copyFileSync, mkdirSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import laravel from "laravel-vite-plugin";
import react from "@vitejs/plugin-react";

/**
 * El entorno aislado de pdf.js (cálculos de los formularios PDF) carga quickjs-eval.js y quickjs-eval.wasm desde una
 * misma carpeta: se copian a public/pdfjs, que Laravel sirve tal cual (en desarrollo, al compilar y en el hosting).
 */
const quickjsPdf = (): Plugin => ({
  name: "autograflow-quickjs-pdf",
  buildStart() {
    mkdirSync("public/pdfjs", { recursive: true });
    for (const archivo of ["quickjs-eval.js", "quickjs-eval.wasm"]) copyFileSync(`node_modules/pdfjs-dist/wasm/${archivo}`, `public/pdfjs/${archivo}`);
  },
});

export default defineConfig({
  plugins: [
    // La app React se compila a public/build y Laravel la sirve: en el hosting no hace falta Node.
    laravel({ input: ["resources/web/src/main.tsx"], refresh: true }),
    react(),
    quickjsPdf(),
  ],
  test: { include: ["resources/shared/**/*.test.ts"] },
});
