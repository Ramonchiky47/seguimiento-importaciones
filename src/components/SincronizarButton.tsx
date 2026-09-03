"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  FilaSincronizacion,
  PrevisualizacionSincronizacion,
  ResultadoSincronizacion,
} from "@/app/(app)/importaciones/actions";

export function SincronizarButton({
  onPrevisualizar,
  onConfirmar,
  basePath = "/importaciones",
  rangoLabel = "ene 2026 a la fecha",
  tipoLabel = "FCLI/LCLI",
}: {
  onPrevisualizar: () => Promise<PrevisualizacionSincronizacion>;
  onConfirmar: (filas: FilaSincronizacion[], totalRevisados: number) => Promise<ResultadoSincronizacion>;
  basePath?: string;
  rangoLabel?: string;
  tipoLabel?: string;
}) {
  const [buscando, startBuscando] = useTransition();
  const [confirmando, startConfirmando] = useTransition();
  const [preview, setPreview] = useState<PrevisualizacionSincronizacion | null>(null);
  const router = useRouter();

  const handleBuscar = () => {
    startBuscando(async () => {
      try {
        const r = await onPrevisualizar();
        setPreview(r);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al consultar Cargolink.");
      }
    });
  };

  const handleConfirmar = () => {
    if (!preview) return;
    startConfirmando(async () => {
      try {
        const r = await onConfirmar(preview.filas, preview.totalRevisados);
        setPreview(null);

        const partes = [
          `Revisados en Cargolink (${rangoLabel}): ${r.totalRevisados}`,
          `Agregadas: ${r.insertados}`,
          `Completadas con todos sus datos: ${r.enriquecidos}`,
        ];
        if (r.errores.length > 0) {
          partes.push(`\nCon error (${r.errores.length}):\n${r.errores.join("\n")}`);
        }
        alert(partes.join("\n"));

        // Lleva a la primera página ordenada por lo recién insertado, así
        // los registros nuevos quedan arriba y se ven sin tener que buscar.
        if (r.insertados > 0) {
          router.push(`${basePath}?sort=created_at&dir=desc&page=1`);
        } else {
          router.refresh();
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al agregar las referencias.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={buscando}
        onClick={handleBuscar}
        title={`Busca en Cargolink las referencias ${tipoLabel} de ${rangoLabel} que falten por cargar`}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {buscando ? "Buscando…" : "Actualizar referencias"}
      </button>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !confirmando && setPreview(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                Referencias nuevas encontradas en Cargolink
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Revisadas {preview.totalRevisados} ({rangoLabel}) · {preview.filas.length} no
                están cargadas todavía
              </p>
            </div>

            <div className="flex-1 overflow-auto px-5 py-3">
              {preview.filas.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No hay referencias nuevas — ya está todo cargado.
                </p>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800">
                  <thead>
                    <tr className="text-left text-slate-500 dark:text-slate-400">
                      <th className="py-1.5 pr-3 font-medium">Booking</th>
                      <th className="py-1.5 pr-3 font-medium">Fecha</th>
                      <th className="py-1.5 pr-3 font-medium">Type</th>
                      <th className="py-1.5 pr-3 font-medium">Vendedor</th>
                      <th className="py-1.5 pr-3 font-medium">Oficina</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {preview.filas.map((f) => (
                      <tr key={f.booking} className="text-slate-700 dark:text-slate-300">
                        <td className="whitespace-nowrap py-1 pr-3 font-medium">{f.booking}</td>
                        <td className="whitespace-nowrap py-1 pr-3">{f.fecha ?? "—"}</td>
                        <td className="whitespace-nowrap py-1 pr-3">{f.type ?? "—"}</td>
                        <td className="whitespace-nowrap py-1 pr-3">{f.vendedor ?? "—"}</td>
                        <td className="whitespace-nowrap py-1 pr-3">{f.oficina ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
              <button
                type="button"
                disabled={confirmando}
                onClick={() => setPreview(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              {preview.filas.length > 0 && (
                <button
                  type="button"
                  disabled={confirmando}
                  onClick={handleConfirmar}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                >
                  {confirmando
                    ? "Agregando y completando datos…"
                    : `Confirmar y agregar ${preview.filas.length}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
