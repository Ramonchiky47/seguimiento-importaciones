import Link from "next/link";

export function HorizontalBarChart({
  title,
  data,
  href,
  totalLabel,
}: {
  title: string;
  data: { label: string; value: number }[];
  href?: string;
  totalLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </h3>
        {href ? (
          <Link
            href={href}
            className="text-[10px] font-medium text-slate-500 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
          >
            Ver detalle →
          </Link>
        ) : (
          totalLabel && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">{totalLabel}</span>
          )
        )}
      </div>
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
