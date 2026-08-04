"use client";

import { useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function MultiSelectFilter({
  paramName,
  label,
  options,
  current,
}: {
  paramName: string;
  label: string;
  options: string[];
  current: string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<string[]>(current);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function toggleDraft(option: string) {
    setDraft((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option],
    );
  }

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(paramName);
    for (const v of draft) params.append(paramName, v);
    const query = params.toString();
    // router.push() unreliably keeps the old query string when the new
    // target has none of this param left (observed repeatedly with Next.js
    // 16's client router here) — a hard navigation always applies correctly.
    window.location.href = query ? `${pathname}?${query}` : pathname;
  }

  function cancel() {
    setDraft(current);
    setSearch("");
    detailsRef.current?.removeAttribute("open");
  }

  const isActive = current.length > 0;
  const summary =
    current.length === 0 ? "Todos" : current.length <= 2 ? current.join(", ") : `${current.length} seleccionados`;
  const visibleOptions = search.trim()
    ? options.filter((o) => o.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  return (
    <details
      ref={detailsRef}
      className="relative"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open) {
          setDraft(current);
          setSearch("");
        }
      }}
    >
      <summary
        className={`flex cursor-pointer list-none items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 ${
          isActive
            ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
            : "border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        }`}
      >
        {label}: {summary}
        <span className="text-[10px]">▾</span>
      </summary>
      <div className="absolute left-0 z-40 mt-1 w-64 rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <label className="flex items-center gap-2 rounded px-2 py-1 text-[10px] hover:bg-slate-50 dark:hover:bg-slate-800">
          <input
            type="checkbox"
            checked={draft.length === 0}
            onChange={() => setDraft([])}
            className="h-3 w-3 shrink-0 rounded border-slate-300 dark:border-slate-600"
          />
          <span className="font-medium text-slate-700 dark:text-slate-300">Todos</span>
        </label>
        <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
        {options.length > 8 && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="mb-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
          />
        )}
        <div className="max-h-48 overflow-y-auto">
          {visibleOptions.length === 0 && (
            <p className="px-2 py-1 text-[10px] text-slate-400 dark:text-slate-500">
              {options.length === 0 ? "Sin opciones." : "Sin resultados."}
            </p>
          )}
          {visibleOptions.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 rounded px-2 py-1 text-[10px] hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <input
                type="checkbox"
                checked={draft.includes(option)}
                onChange={() => toggleDraft(option)}
                className="h-3 w-3 shrink-0 rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-slate-700 dark:text-slate-300">{option}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex justify-end gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
          <button
            type="button"
            onClick={cancel}
            className="rounded-md border border-slate-300 px-3 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded-md bg-slate-900 px-3 py-1 text-[10px] font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            Aceptar
          </button>
        </div>
      </div>
    </details>
  );
}
