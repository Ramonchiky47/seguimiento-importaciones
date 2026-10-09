import Link from "next/link";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { EJECUTIVO_TODOS } from "@/lib/track";

// Filtro de ejecutivo de Track + atajo para ver a todo el equipo (sin él,
// desmarcar todo regresaría al ejecutivo por default).
export function TrackEjecutivoFilter({
  options,
  filtro,
  hrefTodos,
}: {
  options: string[];
  filtro: string[];
  hrefTodos: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectFilter paramName="ejecutivo" label="Ejecutivo" options={options} current={filtro} />
      {filtro.length > 0 ? (
        <Link href={hrefTodos} className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400">
          Ver todos los ejecutivos
        </Link>
      ) : (
        <span className="text-xs text-slate-500 dark:text-slate-400">Mostrando: {EJECUTIVO_TODOS.toLowerCase()} los ejecutivos</span>
      )}
    </div>
  );
}
