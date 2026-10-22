"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarEtapaCargolink } from "@/app/(app)/operaciones-maritima/actions";

// Bitácora: vuelve a mandar a Cargolink un cambio que quedó con error, con
// los mismos valores. guardarEtapaCargolink relee, verifica y deja su propio
// registro en la bitácora.
export function ReenviarCambioBoton({
  idBooking,
  etapa,
  accion,
  valores,
  resumen,
}: {
  idBooking: number;
  etapa: string;
  accion: string;
  valores: Record<string, string>;
  resumen: string[];
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (resultado?.ok) return <p className="mt-1 max-w-64 text-xs font-semibold text-green-700 dark:text-green-400">✓ Reenviado: {resultado.mensaje}</p>;

  return (
    <div className="mt-1.5 max-w-64 space-y-1.5">
      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="min-h-9 rounded-md border border-red-300 bg-white px-3 text-xs font-semibold text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950"
        >
          Reenviar a Cargolink
        </button>
      ) : (
        <div role="alertdialog" aria-label="Confirmar reenvío" className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-semibold">Se volverá a mandar a Cargolink:</p>
          <ul className="list-disc pl-4">
            {resumen.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmando(false)}
              className="min-h-9 rounded-md border border-slate-300 bg-white px-2.5 font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await guardarEtapaCargolink(idBooking, etapa, accion, valores);
                  setResultado(r);
                  setConfirmando(false);
                  if (r.ok) router.refresh();
                })
              }
              className="min-h-9 rounded-md bg-amber-700 px-2.5 font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {pending ? "Enviando…" : "Confirmar y reenviar"}
            </button>
          </div>
        </div>
      )}
      {resultado && !resultado.ok && <p className="text-xs text-red-700 dark:text-red-400">Volvió a fallar: {resultado.mensaje}</p>}
    </div>
  );
}
