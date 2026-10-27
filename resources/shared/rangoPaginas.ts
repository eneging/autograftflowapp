/**
 * Lee las páginas que se quieren quitar, como se escriben al imprimir: «2-5» (de la 2 a la 5), «2,5» (la 2 y la 5) o
 * combinadas, «1-3, 7, 10-12». Acepta espacios, «;» y el guion largo; un rango al revés («5-2») vale igual.
 * Devuelve las páginas ordenadas y sin repetir, o un mensaje para la persona si algo no se entiende o no existe.
 */
export function leerRangoPaginas(texto: string, total: number): { paginas: number[] } | { error: string } {
  const partes = texto.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (!partes.length) return { error: "Escribe las páginas que quieres quitar. Ej.: 2-5 o 2,5" };
  const paginas = new Set<number>();
  for (const parte of partes) {
    const m = /^(\d+)\s*(?:[-–—]\s*(\d+))?$/.exec(parte);
    if (!m) return { error: `No se entiende «${parte}». Usa números, guiones para rangos y comas para separar. Ej.: 2-5, 8` };
    let [desde, hasta] = [Number(m[1]), Number(m[2] ?? m[1])];
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    if (desde < 1 || hasta > total) return { error: `El documento tiene ${total} página${total === 1 ? "" : "s"}: «${parte}» no existe.` };
    for (let p = desde; p <= hasta; p++) paginas.add(p);
  }
  if (paginas.size >= total) return { error: "No puedes quitar todas las páginas: el documento debe tener al menos una." };
  return { paginas: [...paginas].sort((a, b) => a - b) };
}

/** [2,3,4,5,9] → «2-5, 9». */
export function textoRango(paginas: number[]): string {
  const partes: [number, number][] = [];
  for (const p of paginas) {
    const u = partes[partes.length - 1];
    if (u && u[1] === p - 1) u[1] = p;
    else partes.push([p, p]);
  }
  return partes.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(", ");
}
