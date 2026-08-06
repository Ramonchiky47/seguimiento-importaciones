"use client";

import { useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const STATUSES = ["Vigente", "Finalizado", "Cancelado"] as const;

export function EstatusDropdown({ current }: { current: string[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const isTodos = current.includes("Todos");
  const committedStatuses = isTodos ? [] : current.filter((s) => s !== "Ninguno");

  const [draftTodos, setDraftTodos] = useState(isTodos);
  const [draft, setDraft] = useState<string[]>(committedStatuses);

  function toggleDraftTodos() {
    setDraftTodos((prev) => !prev);
    setDraft([]);
  }

  function toggleDraftStatus(status: string) {
    setDraftTodos(false);
    setDraft((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  }

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("estatus");
    if (draftTodos) {
      params.append("estatus", "Todos");
    } else if (draft.length === 0) {
      // Selección explícita de "ninguno" — distinto de no traer el parámetro
      // en absoluto (que por default cae en "Vigente").
      params.append("estatus", "Ninguno");
    } else {
      for (const s of draft) params.append("estatus", s);
    }
    // Navegación dura por la misma razón que en MultiSelectFilter: router.push()
    // no siempre aplica de forma confiable cuando el query resultante cambia
    // de forma no trivial.
    window.location.href = `${pathname}?${params.toString()}`;
  }

  function cancel() {
    setDraftTodos(isTodos);
    setDraft(committedStatuses);
    detailsRef.current?.removeAttribute("open");
  }

  const summary = isTodos
    ? "Todos"
    : committedStatuses.length === 0
      ? "Ninguno"
      : committedStatuses.join(", ");

  return (
    <details
      ref={detailsRef}
      className="relative"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open) {
          setDraftTodos(isTodos);
          setDraft(committedStatuses);
        }
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
        Estatus: {summary}
        <span className="text-[10px]">▾</span>
      </summary>
      <div className="absolute left-0 z-40 mt-1 w-44 rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
          <input
            type="checkbox"
            checked={draftTodos}
            onChange={toggleDraftTodos}
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
              checked={!draftTodos && draft.includes(status)}
              onChange={() => toggleDraftStatus(status)}
              className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600"
            />
            <span className="text-slate-700 dark:text-slate-300">{status}</span>
          </label>
        ))}
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
