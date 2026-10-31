// Días de crédito del cliente: verde si tiene, rojo si no.
export function CreditoBadge({ si, className = "" }: { si: boolean | undefined; className?: string }) {
  if (si === undefined) return null;
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${
        si ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
      } ${className}`}
    >
      Días de crédito: {si ? "Sí" : "No"}
    </span>
  );
}
