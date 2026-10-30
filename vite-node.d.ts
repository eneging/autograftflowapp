/** Lo único de Node que usan vite.config.ts y las pruebas (el proyecto no instala @types/node). */
declare module "node:fs" {
  export function copyFileSync(origen: string, destino: string): void;
  export function mkdirSync(ruta: string, opciones?: { recursive?: boolean }): string | undefined;
  export function readFileSync(ruta: string): Uint8Array;
}
declare module "node:zlib" {
  export function deflateSync(datos: Uint8Array): Uint8Array;
}
