"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sincronizarColoadersMasivoAction } from "@/app/(app)/importaciones/actions";

export function RastrearColoadersButton() {
  const [pending, startTransition] = useTransition();
  const [modalData, setModalData] = useState<{
    totalLcl: number;
    consultados: number;
    actualizados: number;
    omitidos: number;
    errores: Array<{ booking: string; error: string }>;
  } | null>(null);
  const router = useRouter();

  const handleRastrear = () => {
    startTransition(async () => {
      try {
        const stats = await sincronizarColoadersMasivoAction();
        setModalData(stats);
        router.refresh();
      } catch (err) {
        alert(
          err instanceof Error
            ? err.message
            : "Error al sincronizar con los portales de los coloaders.",
        );
      }
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={handleRastrear}
        title="Consultar en tiempo real los portales de los consolidadores (LCL)"
        className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/80 bg-cyan-50 px-3.5 py-2 text-sm font-medium text-cyan-900 shadow-sm transition hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200 dark:hover:bg-cyan-900/60"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 text-cyan-600 dark:text-cyan-400 ${
            pending ? "animate-spin" : ""
          }`}
        >
          <path d="M12 2v4" />
          <path d="m16.2 7.8 2.9-2.9" />
          <path d="M18 12h4" />
          <path d="m16.2 16.2 2.9 2.9" />
          <path d="M12 18v4" />
          <path d="m4.9 19.1 2.9-2.9" />
          <path d="M2 12h4" />
          <path d="m4.9 4.9 2.9 2.9" />
        </svg>
        {pending ? "Rastreando en portales..." : "Rastrear Coloaders"}
      </button>

      {modalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              Rastreo de Coloaders Completado
            </h3>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Se consultaron los portales de los consolidadores y se actualizaron los hitos
              en Track.
            </p>

            <div className="mb-4 space-y-1.5 rounded-md bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <div className="flex justify-between">
                <span>Bookings LCL en seguimiento:</span>
                <span className="font-semibold">{modalData.totalLcl}</span>
              </div>
              <div className="flex justify-between">
                <span>Consultados en portales:</span>
                <span className="font-semibold">{modalData.consultados}</span>
              </div>
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Actualizados con éxito en Track:</span>
                <span className="font-semibold">{modalData.actualizados}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Omitidos (sin HBL o portal no integrado):</span>
                <span>{modalData.omitidos}</span>
              </div>
            </div>

            {modalData.errores.length > 0 && (
              <div className="mb-4 max-h-32 overflow-y-auto rounded border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                <p className="font-semibold">Incidencias ({modalData.errores.length}):</p>
                {modalData.errores.map((e, idx) => (
                  <p key={idx}>
                    • {e.booking}: {e.error}
                  </p>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setModalData(null)}
                className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
