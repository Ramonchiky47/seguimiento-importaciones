// Bookings donde el total de contenedores no coincide con la cantidad de
// tipos listados por Cargolink (ver parseContenedoresTipo) — el desglose
// real se verificó a mano en Cargolink (pantalla "Detalles de Carga FCL",
// columna Tipo de Contenedor por cada número de contenedor) porque esa
// info no viene en el campo de texto que sí tenemos. Ir agregando aquí
// conforme se vayan verificando más bookings ambiguos.
export const DESGLOSE_MANUAL_CONTENEDORES: Record<string, { type: string; count: number }[]> = {
  "2604-1827-FCLI": [
    { type: "40 HC", count: 10 },
    { type: "20", count: 1 },
  ],
  "2601-0133-FCLI": [
    { type: "40 HC", count: 8 },
    { type: "40 OT", count: 2 },
  ],
  "2601-0289-FCLI": [
    { type: "20", count: 1 },
    { type: "40 HC", count: 4 },
  ],
  "2601-0303-FCLI": [
    { type: "40", count: 3 },
    { type: "40 OT", count: 1 },
  ],
  "2601-0345-FCLI": [
    { type: "40 HC", count: 7 },
    { type: "40 FR", count: 5 },
  ],
  "2601-0542-FCLI": [
    { type: "20", count: 1 },
    { type: "40 HC", count: 2 },
  ],
  "2601-0545-FCLI": [
    { type: "20", count: 1 },
    { type: "40 HC", count: 7 },
  ],
  "2601-0549-FCLI": [
    { type: "20", count: 1 },
    { type: "40 HC", count: 7 },
  ],
  "2602-0818-FCLI": [
    { type: "20", count: 1 },
    { type: "40 HC", count: 2 },
  ],
  "2602-0859-FCLI": [
    { type: "20", count: 2 },
    { type: "40 HC", count: 8 },
  ],
  "2602-0993-FCLI": [
    { type: "20", count: 1 },
    { type: "40 HC", count: 4 },
  ],
  "2602-1017-FCLI": [
    { type: "20", count: 1 },
    { type: "40 HC", count: 4 },
  ],
  "2603-1509-FCLI": [
    { type: "40 HC", count: 5 },
    { type: "40 OT", count: 1 },
  ],
  "2603-1577-FCLI": [
    { type: "20", count: 1 },
    { type: "40 HC", count: 2 },
  ],
  "2604-1708-FCLI": [
    { type: "20", count: 1 },
    { type: "40 HC", count: 2 },
  ],
  "2604-1825-FCLI": [
    { type: "20", count: 1 },
    { type: "40 HC", count: 11 },
  ],
  "2604-2135-FCLI": [
    { type: "40 HC", count: 3 },
    { type: "20 FR", count: 1 },
  ],
  "2606-2983-FCLI": [
    { type: "40 HC", count: 4 },
    { type: "20 OT", count: 1 },
  ],
  "2606-2990-FCLI": [
    { type: "40 HC", count: 6 },
    { type: "40 FR", count: 3 },
  ],
  "2606-3137-FCLI": [
    { type: "40 HC", count: 3 },
    { type: "40 FR", count: 3 },
  ],
  "2607-3515-FCLI": [
    { type: "40 HC", count: 4 },
    { type: "40 OT", count: 2 },
  ],
  "2608-3813-FCLI": [
    { type: "40 FR", count: 3 },
    { type: "40 HC", count: 3 },
  ],
};

// Parses strings like "6 contenedores (Tipo 40 HC,40 OT)" produced by
// buildCantidadContenedoresTipo() in lib/cargolink.ts. Cargolink's "Tipo"
// list is the set of distinct types present, not one entry per contenedor —
// so when el total coincide exactamente con la cantidad de tipos listados,
// la única distribución posible es uno de cada tipo (ej. "2 contenedores
// (Tipo 20,40 HC)" = 1 de tipo 20 + 1 de tipo 40 HC), y así se reparte. Si
// el total es mayor a los tipos listados (ej. "6 contenedores (Tipo 40
// HC,40 OT)"), no hay forma de saber cuántos son de cada uno a menos que
// esté en DESGLOSE_MANUAL_CONTENEDORES — si no, se deja como una
// combinación aparte en vez de inventar un reparto.
export function parseContenedoresTipo(
  booking: string | null,
  text: string | null,
): { type: string; count: number }[] {
  if (booking && DESGLOSE_MANUAL_CONTENEDORES[booking]) {
    return DESGLOSE_MANUAL_CONTENEDORES[booking];
  }
  if (!text) return [];
  const match = text.match(/^(\d+)\s+contenedor(?:es)?\s*\(Tipo\s+(.+)\)\s*$/i);
  if (!match) return [];
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return [];
  const tipos = match[2]
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tipos.length === 0) return [];
  if (count === tipos.length) {
    return tipos.map((type) => ({ type, count: 1 }));
  }
  return [{ type: tipos.join(", "), count }];
}
