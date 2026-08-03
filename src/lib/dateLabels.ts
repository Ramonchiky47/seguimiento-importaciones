const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}
