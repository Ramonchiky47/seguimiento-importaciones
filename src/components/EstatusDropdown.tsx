"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const STATUSES = ["Vigente", "Finalizado", "Cancelado"] as const;

export function EstatusDropdown({ current }: { current: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isTodos = current.includes("Todos");
  const active = isTodos ? [...STATUSES] : current;

  function navigate(next: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("estatus");
    if (next.length === 0) {
      params.append("estatus", "Todos");
    } else {
      for (const s of next) params.append("estatus", s);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleTodos() {
    if (isTodos) {
      navigate(["Vigente"]);
    } else {
      navigate([]);
    }
  }

  function toggleStatus(status: string) {
    const base = isTodos ? [] : current;
    const next = base.includes(status) ? base.filter((s) => s !== status) : [...base, status];
    navigate(next);
  }

  const summary = isTodos
    ? "Todos"
    : active.length === 0
      ? "Ninguno"
      : active.length === STATUSES.length
        ? "Todos"
        : active.join(", ");

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
        Estatus: {summary}
        <span className="text-[10px]">▾</span>
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
          <input
            type="checkbox"
            checked={isTodos}
            onChange={toggleTodos}
            className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600"
          />
          <span className="text-slate-700 dark:text-slate-300">Todos</span>
        </label>
        <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
        {STATUSES.map((status) => (
          <label
            key={status}
            className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <input
              type="checkbox"
              checked={active.includes(status)}
              onChange={() => toggleStatus(status)}
              className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600"
            />
            <span className="text-slate-700 dark:text-slate-300">{status}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
