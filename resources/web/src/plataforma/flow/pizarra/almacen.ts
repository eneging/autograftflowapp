/*
 * Pizarras guardadas solo en este navegador (IndexedDB), separadas por usuario: no ocupan espacio en el servidor.
 * Las imágenes se guardan aparte como Blob (no como texto base64), para que pesen lo mismo que el archivo original.
 */
import type { Elemento } from "./modelo";

export interface Camara { x: number; y: number; zoom: number }
export interface Pizarra { id: string; usuario: number; nombre: string; elementos: Elemento[]; camara: Camara; creada: number; actualizada: number }
export type ResumenPizarra = Pick<Pizarra, "id" | "nombre" | "actualizada">;

const BASE = "autograflow-pizarras";
const PIZARRAS = "pizarras", IMAGENES = "imagenes";

let abierta: Promise<IDBDatabase> | null = null;
function base(): Promise<IDBDatabase> {
  return (abierta ??= new Promise((ok, mal) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore(PIZARRAS, { keyPath: "id" }).createIndex("usuario", "usuario");
      db.createObjectStore(IMAGENES);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { abierta = null; mal(r.error); };
  }));
}

function pedir<T>(almacen: string, modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return base().then((db) => new Promise<T>((ok, mal) => {
    const r = fn(db.transaction(almacen, modo).objectStore(almacen));
    r.onsuccess = () => ok(r.result as T);
    r.onerror = () => mal(r.error);
  }));
}

export const nuevoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export async function listar(usuario: number): Promise<ResumenPizarra[]> {
  const todas = await pedir<Pizarra[]>(PIZARRAS, "readonly", (s) => s.index("usuario").getAll(usuario));
  return todas.map(({ id, nombre, actualizada }) => ({ id, nombre, actualizada })).sort((a, b) => b.actualizada - a.actualizada);
}

export const leer = (id: string) => pedir<Pizarra | undefined>(PIZARRAS, "readonly", (s) => s.get(id));
export const guardar = (p: Pizarra) => pedir<IDBValidKey>(PIZARRAS, "readwrite", (s) => s.put({ ...p, actualizada: Date.now() }));

export async function crear(usuario: number, nombre: string, elementos: Elemento[] = []): Promise<Pizarra> {
  const p: Pizarra = { id: nuevoId(), usuario, nombre, elementos, camara: { x: 0, y: 0, zoom: 1 }, creada: Date.now(), actualizada: Date.now() };
  await guardar(p);
  return p;
}

/** Borra la pizarra y las imágenes que solo usaba ella. */
export async function borrar(id: string): Promise<void> {
  const p = await leer(id);
  await pedir(PIZARRAS, "readwrite", (s) => s.delete(id));
  if (!p) return;
  const enUso = new Set<string>();
  for (const otra of await pedir<Pizarra[]>(PIZARRAS, "readonly", (s) => s.getAll())) {
    for (const e of otra.elementos) if (e.tipo === "imagen") enUso.add(e.imagen);
  }
  for (const e of p.elementos) if (e.tipo === "imagen" && !enUso.has(e.imagen)) await pedir(IMAGENES, "readwrite", (s) => s.delete(e.imagen));
}

export async function guardarImagen(blob: Blob): Promise<string> {
  const id = nuevoId();
  await pedir(IMAGENES, "readwrite", (s) => s.put(blob, id));
  return id;
}
export const leerImagen = (id: string) => pedir<Blob | undefined>(IMAGENES, "readonly", (s) => s.get(id));

/** Espacio usado y disponible del navegador (aproximado), para avisar antes de llenarlo. */
export async function espacio(): Promise<{ usado: number; total: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e?.usage != null && e.quota ? { usado: e.usage, total: e.quota } : null;
  } catch { return null; }
}
