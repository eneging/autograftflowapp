/** Lo único de Node que usa vite.config.ts (el proyecto no instala @types/node). */
declare module "node:fs" {
  export function copyFileSync(origen: string, destino: string): void;
  export function mkdirSync(ruta: string, opciones?: { recursive?: boolean }): string | undefined;
}
