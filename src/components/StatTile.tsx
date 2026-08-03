export function StatTile({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: number | string;
  accent?: "green" | "red" | "neutral";
}) {
  const accentClass =
    accent === "green"
      ? "text-green-700 dark:text-green-400"
      : accent === "red"
        ? "text-red-700 dark:text-red-400"
        : "text-slate-900 dark:text-slate-50";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}
