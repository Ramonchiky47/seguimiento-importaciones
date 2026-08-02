"use client";

import { useTransition } from "react";

export function UpdateButton({
  id,
  onUpdate,
}: {
  id: number;
  onUpdate: (id: number) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      try {
        await onUpdate(id);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al actualizar desde Cargolink.");
      }
    });
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      title="Actualizar desde Cargolink"
      aria-label="Actualizar desde Cargolink"
      className="rounded p-1 text-black hover:bg-slate-100 disabled:opacity-50 dark:text-white dark:hover:bg-slate-800"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
      >
        <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    </button>
  );
}
