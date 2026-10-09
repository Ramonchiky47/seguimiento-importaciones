// Track: seguimiento por hitos sobre operaciones_maritima (vistas
// track_hitos / track_embarques y función track_resumen en Supabase).

export type EstadoHito =
  | "atrasado"
  | "hoy"
  | "pronto"
  | "falta_dato"
  | "en_tiempo"
  | "hecho"
  | "no_aplica"
  | "sin_fecha";

export const ESTADOS: Record<EstadoHito, { label: string; pill: string; barra: string }> = {
  atrasado: { label: "Atrasado", pill: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", barra: "bg-red-700" },
  hoy: { label: "Vence hoy", pill: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300", barra: "bg-amber-600" },
  pronto: { label: "Próximos 3 días", pill: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300", barra: "bg-blue-700" },
  falta_dato: { label: "Falta dato", pill: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-300", barra: "bg-violet-700" },
  en_tiempo: { label: "En tiempo", pill: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", barra: "bg-slate-400" },
  hecho: { label: "Hecho", pill: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", barra: "bg-green-700" },
  no_aplica: { label: "No aplica", pill: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", barra: "bg-slate-300" },
  sin_fecha: { label: "Sin fecha", pill: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", barra: "bg-slate-300" },
};

// Atrasos de más de estos días son "rezago": casi siempre una etapa que no
// se marcó en Cargolink, no un pendiente real del día.
export const DIAS_REZAGO = 30;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d} ${MESES[Number(m) - 1]}`;
}

export function hoyMexico(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

// Estilo de tarjeta-filtro (igual que Operaciones Marítima / Pricing).
export const TONO_TARJETA = {
  neutro: "bg-white border-slate-200",
  rojo: "bg-linear-to-b from-[#fee2e2] to-white to-70% border-[#fca5a5]",
  ambar: "bg-linear-to-b from-[#fef3de] to-white to-70% border-[#f5c58a]",
  azul: "bg-linear-to-b from-[#dbeafe] to-white to-70% border-[#93c5fd]",
  violeta: "bg-linear-to-b from-[#ede9fe] to-white to-70% border-[#c4b5fd]",
  gris: "bg-linear-to-b from-[#f1f5f9] to-white to-70% border-[#cbd5e1]",
};

export function claseTarjeta(activa: boolean, tono: string = TONO_TARJETA.neutro): string {
  return `flex min-w-0 flex-col justify-between gap-1 rounded-[10px] border px-3 py-2.5 transition-shadow hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-none dark:bg-slate-900 ${tono} ${
    activa ? "border-blue-700! ring-2 ring-blue-700/20" : ""
  }`;
}

export const ETIQUETA_TARJETA =
  "text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400";
export const VALOR_TARJETA = "text-[22px] font-extrabold tabular-nums text-slate-900 dark:text-slate-50";
