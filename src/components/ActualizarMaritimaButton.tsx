"use client";

import { useTransition } from "react";
import type { ResultadoActualizacion } from "@/app/(app)/operaciones-maritima/actions";

export function ActualizarMaritimaButton({
  onActualizar,
}: {
  onActualizar: () => Promise<ResultadoActualizacion>;
}) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      try {
        const r = await onActualizar();
        alert(
          r.completo
            ? `Listo: se actualizaron las ${r.actualizadas} operaciones de 2026 en adelante.`
            : `Listo: se actualizaron ${r.actualizadas} operaciones; no alcanzó el tiempo para todo 2026. ` +
                "El resto se actualiza en la carga programada (2:00 PM y 7:00 PM).",
        );
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
      title="Descarga de Cargolink todas las operaciones de 2026 en adelante (tarda unos 2 minutos)"
      className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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
      {pending ? "Actualizando… (hasta 4 min)" : "Actualizar"}
    </button>
  );
}
