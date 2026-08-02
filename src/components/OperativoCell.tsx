"use client";

import { useState, useTransition } from "react";

function parseValue(value: string | null): string[] {
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

export function OperativoCell({
  id,
  initialValue,
  options,
  onSave,
}: {
  id: number;
  initialValue: string | null;
  options: string[];
  onSave: (id: number, operativos: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(parseValue(initialValue));
  const [pending, startTransition] = useTransition();

  const mergedOptions = Array.from(new Set([...options, ...parseValue(initialValue)]));

  function toggle(option: string) {
    const prev = selected;
    const next = selected.includes(option)
      ? selected.filter((o) => o !== option)
      : [...selected, option];
    setSelected(next);
    startTransition(async () => {
      try {
        await onSave(id, next);
      } catch (err) {
        setSelected(prev);
        alert(err instanceof Error ? err.message : "Error al guardar el operativo.");
      }
    });
  }

  return (
    <td
      className="whitespace-nowrap px-3 py-1.5 text-slate-700 dark:text-slate-300"
      onClick={(e) => e.stopPropagation()}
    >
      <details className="relative">
        <summary className="max-w-[160px] cursor-pointer list-none truncate hover:underline">
          {pending ? "Guardando..." : selected.length > 0 ? selected.join(", ") : "—"}
        </summary>
        <div className="absolute left-0 z-20 mt-1 max-h-48 w-56 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {mergedOptions.length === 0 && (
            <p className="px-2 py-1 text-[10px] text-slate-400 dark:text-slate-500">
              Sin operativos activos.
            </p>
          )}
          {mergedOptions.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 rounded px-2 py-1 text-[10px] hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <input
                type="checkbox"
                value={option}
                checked={selected.includes(option)}
                disabled={pending}
                onChange={() => toggle(option)}
                className="h-3 w-3 rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-slate-700 dark:text-slate-300">{option}</span>
            </label>
          ))}
        </div>
      </details>
    </td>
  );
}
