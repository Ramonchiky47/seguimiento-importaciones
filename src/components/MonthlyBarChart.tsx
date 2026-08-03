const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year.slice(2)}`;
}

export function MonthlyBarChart({
  title,
  data,
}: {
  title: string;
  data: { month: string; value: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      {data.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">Sin datos.</p>
      ) : (
        <div className="flex h-40 items-end gap-2">
          {data.map((d) => (
            <div key={d.month} className="group flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-slate-600 dark:text-slate-300">
                {d.value}
              </span>
              <div className="flex h-28 w-full items-end">
                <div
                  className="w-full rounded-t bg-[#2a78d6] transition-opacity group-hover:opacity-80 dark:bg-[#3987e5]"
                  style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                {formatMonth(d.month)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
