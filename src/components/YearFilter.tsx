"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// "todos" es un valor explícito (no la ausencia del parámetro) para poder
// distinguir "el usuario eligió ver todos los años" de "todavía no ha
// tocado el filtro" — en este segundo caso se preselecciona currentYear,
// pero sin forzarlo en la URL hasta que el usuario realmente elija algo.
export function YearFilter({ years, currentYear }: { years: string[]; currentYear: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("anio") ?? currentYear;

  return (
    <select
      value={current}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("anio", e.target.value);
        const query = params.toString();
        router.push(`${pathname}${query ? `?${query}` : ""}`);
      }}
      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
    >
      <option value="todos">Todos los años</option>
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
