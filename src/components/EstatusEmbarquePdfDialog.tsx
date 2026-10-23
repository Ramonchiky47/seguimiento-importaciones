"use client";

import { useEffect, useRef } from "react";

// Visor del PDF "Estatus de embarque" (AV2 Logistics → cliente), con descarga.
// La app no lo envía: el ejecutivo lo descarga y lo comparte con su cliente.
// También muestra el "Pulso de la operación" (api, titulo y nota).
export function EstatusEmbarquePdfDialog({
  idBooking,
  noBooking,
  onCerrar,
  api = "/api/track/estatus-embarque",
  titulo = "Estatus de embarque",
  nota = "para compartir con el cliente",
}: {
  idBooking: number;
  noBooking: string;
  onCerrar: () => void;
  api?: string;
  titulo?: string;
  nota?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const url = (descargar = false) => `${api}?id=${idBooking}${descargar ? "&descargar=1" : ""}`;

  return (
    <dialog
      ref={ref}
      onClose={(e) => {
        if (e.target === ref.current) onCerrar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="estatus-pdf-titulo"
      className="m-auto flex h-[90vh] w-[min(1000px,calc(100vw-32px))] flex-col rounded-xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">{noBooking} · {nota}</p>
          <h3 id="estatus-pdf-titulo" className="text-base font-semibold text-slate-900 dark:text-slate-50">
            {titulo} (PDF)
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={url(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
            </svg>
            Descargar
          </a>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Cerrar"
            className="flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
      <iframe src={url()} title={`${titulo} ${noBooking}`} className="min-h-0 w-full flex-1 bg-slate-100 dark:bg-slate-950" />
    </dialog>
  );
}
