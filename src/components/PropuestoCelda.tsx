import type { Propuesto } from "@/lib/propuestoHito";

const FUENTE: Record<Propuesto["fuente"], string> = {
  Correo: "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900",
  Naviera: "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900",
};

// Valor propuesto por correo o naviera; en ámbar si no coincide con lo que ya está en Cargolink.
export function PropuestoCelda({ items, real }: { items?: Propuesto[]; real?: string | null }) {
  if (!items?.length) return <span className="text-slate-400">—</span>;
  return (
    <span className="flex flex-col gap-1">
      {items.map((p) => {
        const distinto = Boolean(real) && (p.fecha ? p.fecha !== real?.slice(0, 10) : p.valor.toUpperCase() !== real?.toUpperCase());
        return (
          <span key={p.fuente + p.valor} className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              className={`tabular-nums ${distinto ? "font-semibold text-amber-700 dark:text-amber-400" : "text-slate-900 dark:text-slate-100"}`}
              title={distinto ? "No coincide con Cargolink" : undefined}
            >
              {p.valor}
            </span>
            <span className={`rounded px-1.5 py-px text-[10px] font-semibold ring-1 ${FUENTE[p.fuente]}`}>
              {p.fuente}
              {p.nota ? ` · ${p.nota}` : ""}
            </span>
          </span>
        );
      })}
    </span>
  );
}
