"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function YearFilter({ years }: { years: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("anio") ?? "";

  return (
    <select
      value={current}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) params.set("anio", e.target.value);
        else params.delete("anio");
        const query = params.toString();
        router.push(`${pathname}${query ? `?${query}` : ""}`);
      }}
      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
    >
      <option value="">Todos los años</option>
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
