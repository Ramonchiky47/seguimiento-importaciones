"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatMonthLabel } from "@/lib/dateLabels";

export function MonthFilter({ months }: { months: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("mes") ?? "";

  return (
    <select
      value={current}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) params.set("mes", e.target.value);
        else params.delete("mes");
        const query = params.toString();
        router.push(`${pathname}${query ? `?${query}` : ""}`);
      }}
      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
    >
      <option value="">Todos los meses</option>
      {months.map((m) => (
        <option key={m} value={m}>
          {formatMonthLabel(m)}
        </option>
      ))}
    </select>
  );
}
