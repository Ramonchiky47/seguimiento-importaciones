import Link from "next/link";

// Enlace de regreso cuando se llegó desde el Tablero; "volver" trae los
// filtros que tenía el Tablero ("1" = sin filtros).
export function RegresarTablero({ volver }: { volver: string | undefined }) {
  if (!volver) return null;
  const query = volver === "1" ? "" : volver.replace(/^\?/, "");
  return (
    <Link
      href={query ? `/track/tablero?${query}` : "/track/tablero"}
      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      ← Regresar al Tablero
    </Link>
  );
}
