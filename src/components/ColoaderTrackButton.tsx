"use client";

import { useState, useTransition } from "react";
import { consultarTrackingColoader } from "@/app/(app)/importaciones/actions";

export function ColoaderTrackButton({
  importacionId,
  coloader,
  referencia,
}: {
  importacionId: number;
  coloader: string | null;
  referencia: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  if (!coloader) return null;

  const handleTrack = () => {
    setMensaje(null);
    startTransition(async () => {
      try {
        const res = await consultarTrackingColoader(importacionId);
        setMensaje(`Tracking actualizado: ${res?.estatusTexto || "Datos extraídos exitosamente."}`);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al consultar tracking del coloader.");
      }
    });
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleTrack}
        title={`Consultar tracking en el portal de ${coloader}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 shadow-sm transition-colors hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="m16 12-4-4-4 4" />
          <path d="M12 16V8" />
        </svg>
        {pending ? "Consultando portal..." : `Rastrear en ${coloader.split(" ")[0]}`}
      </button>
      {mensaje && (
        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          {mensaje}
        </span>
      )}
    </div>
  );
}
