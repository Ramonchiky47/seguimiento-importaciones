const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

// "Hoy" en hora de México, para que no cambie de día antes de tiempo por UTC
// (mismo criterio que syncFechaHasta() en importaciones/actions.ts).
export function fechaHoyMexico(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

// Días de demoras = fecha actual - último día libre de demoras. No se puede
// calcular como columna generada en Postgres porque depende de "hoy", que
// cambia todos los días sin que nadie edite la fila — por eso se calcula
// aquí, al vuelo, cada vez que se muestra.
export function calcularDiasDemoras(ultimoDiaLibreDemoras: string | null): number | null {
  if (!ultimoDiaLibreDemoras) return null;
  const hoy = new Date(`${fechaHoyMexico()}T00:00:00Z`);
  const ultimo = new Date(`${ultimoDiaLibreDemoras}T00:00:00Z`);
  const diffMs = hoy.getTime() - ultimo.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
