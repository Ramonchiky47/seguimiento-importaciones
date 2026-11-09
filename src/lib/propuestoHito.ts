import { fechaCorta } from "@/lib/track";

// "Propuesto" de cada hito: lo que dice el último correo del booking (Info correos)
// o la naviera (rastreo), junto al Compromiso (regla) y al Real (Cargolink).
export type Propuesto = { valor: string; fuente: "Correo" | "Naviera"; nota?: string; fecha?: string };

export type CorreoPropuesto = { atd_iso?: string | null; eta_iso?: string | null; mbl?: string | null; hbl?: string | null } | null;
export type NavieraPropuesto = { ok?: boolean | null; eta_naviera?: string | null; ata_naviera?: string | null } | null;

// Hitos: 1 ATD, 2 ETA, 4 HBL, 5 MBL, 7 ATA.
export function propuestosPorHito(correo: CorreoPropuesto, naviera: NavieraPropuesto, hoy: string): Record<number, Propuesto[]> {
  const r: Record<number, Propuesto[]> = {};
  const poner = (orden: number, p: Propuesto) => (r[orden] ??= []).push(p);
  const fecha = (iso: string, fuente: Propuesto["fuente"], nota?: string): Propuesto => ({
    valor: fechaCorta(iso),
    fecha: iso.slice(0, 10),
    fuente,
    nota,
  });
  const nav = naviera?.ok === false ? null : naviera;

  if (correo?.atd_iso) poner(1, fecha(correo.atd_iso, "Correo"));
  if (nav?.eta_naviera) poner(2, fecha(nav.eta_naviera, "Naviera"));
  if (correo?.eta_iso && correo.eta_iso.slice(0, 10) !== nav?.eta_naviera?.slice(0, 10)) poner(2, fecha(correo.eta_iso, "Correo"));
  // Telex: el número de BL del correo no es la fecha del telex (Ramón, 9 nov); no se propone ahí.
  // ATA a futuro: el buque aún no llega, es una ETA estimada.
  if (nav?.ata_naviera) poner(7, fecha(nav.ata_naviera, "Naviera", nav.ata_naviera.slice(0, 10) > hoy ? "estimada" : undefined));
  return r;
}

// Lo que ya está en Cargolink para comparar con lo propuesto.
export function cargolinkDeHito(orden: number, op: Record<string, unknown> | null): string | null {
  const v = op?.[{ 1: "etd_atd", 2: "eta", 5: "mbl", 7: "ata" }[orden] ?? ""];
  return typeof v === "string" && v ? v : null;
}
