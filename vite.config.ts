import { defineConfig } from "vite";
import laravel from "laravel-vite-plugin";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    // La app React se compila a public/build y Laravel la sirve: en el hosting no hace falta Node.
    laravel({ input: ["resources/web/src/main.tsx"], refresh: true }),
    react(),
  ],
  test: { include: ["resources/shared/**/*.test.ts"] },
});
