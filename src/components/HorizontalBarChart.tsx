export function HorizontalBarChart({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number }[];
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
        <div className="space-y-2">
          {data.map((d) => (
            <div
              key={d.label}
              className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <span
                className="w-32 shrink-0 truncate text-xs text-slate-600 dark:text-slate-300"
                title={d.label}
              >
                {d.label}
              </span>
              <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-4 rounded bg-[#2a78d6] dark:bg-[#3987e5]"
                  style={{ width: `${Math.max(4, (d.value / max) * 100)}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-slate-700 dark:text-slate-200">
                {d.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
