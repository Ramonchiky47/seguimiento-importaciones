"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarEtapaCargolink } from "@/app/(app)/operaciones-maritima/actions";
import { VerCorreo, type Evidencia } from "@/components/VerCorreo";
import { fechaCorta } from "@/lib/track";

export type DatosDelCorreo = { fecha_correo: string; atd: string | null; etd?: string | null; eta: string | null; mbl: string | null; evidencia: Evidencia | null };

type Campo = { id: string; label: string; etapa: string; campo: string; tipo: "date" | "text"; inicial: string; finalizar: boolean };

// Vínculo con lo que trajo el correo (zarpe, ETA, BL). Al darle clic abre los campos ya
// llenos para capturarlos en Cargolink: mismo guardado que el Interactivo (Bitácora, sin
// notificar). El BL va en Origen (número de control) y solo se guarda, sin finalizar.
export function CapturaDelCorreo({ idBooking, noBooking, correo: original, puedeEditar }: { idBooking: number; noBooking: string; correo: DatosDelCorreo; puedeEditar: boolean }) {
  const router = useRouter();
  // Fechas que el agente leyó mal (p. ej. "2026-28-10") no se muestran ni se proponen.
  const valida = (f: string | null) => (f && !Number.isNaN(Date.parse(`${f.slice(0, 10)}T12:00:00Z`)) && /^\d{4}-(0[1-9]|1[0-2])-\d{2}/.test(f) ? f : null);
  const correo = { ...original, atd: valida(original.atd), etd: valida(original.etd ?? null), eta: valida(original.eta) };
  const campos: Campo[] = [
    // Ramón (9 nov): ETD = salida ESTIMADA (va a Origen, solo se guarda); ATD = zarpe real, solo si el correo dice ATD.
    ...(correo.atd ? [{ id: "atd", label: "Zarpe real (ATD)", etapa: "atd", campo: "fecha_atd", tipo: "date" as const, inicial: correo.atd, finalizar: true }] : []),
    ...(correo.etd && !correo.atd
      ? [{ id: "etd", label: "ETD - POL (salida estimada · se guarda en Origen)", etapa: "origen", campo: "fecha_estimada", tipo: "date" as const, inicial: correo.etd, finalizar: false }]
      : []),
    ...(correo.eta ? [{ id: "eta", label: "ETA", etapa: "eta", campo: "buque_eta", tipo: "date" as const, inicial: correo.eta, finalizar: true }] : []),
    ...(correo.mbl ? [{ id: "bl", label: "BL (MBL)", etapa: "origen", campo: "no_control", tipo: "text" as const, inicial: correo.mbl, finalizar: false }] : []),
  ];
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(campos.map((c) => [c.id, c.inicial])));
  const [resultado, setResultado] = useState<Record<string, { ok: boolean; mensaje: string } | "guardando">>({});
  if (campos.length === 0) return null;

  const guardar = async (c: Campo, status: string) => {
    setResultado((r) => ({ ...r, [c.id]: "guardando" }));
    const r = await guardarEtapaCargolink(idBooking, c.etapa, status, { [c.campo]: valores[c.id] });
    setResultado((x) => ({ ...x, [c.id]: { ok: r.ok, mensaje: r.ok ? "Guardado en Cargolink" : r.mensaje } }));
    if (r.ok) router.refresh();
  };

  const resumen = campos.map((c) => `${c.id === "atd" ? "Zarpe (ATD)" : c.id === "etd" ? "ETD" : c.id === "eta" ? "ETA" : "BL"} ${c.tipo === "date" ? fechaCorta(c.inicial) : c.inicial}`).join(" · ");

  return (
    <div className="col-span-full">
      <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setAbierto((x) => !x)}
        aria-expanded={abierto}
        className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1 text-left text-xs font-semibold ${
          abierto
            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
            : "border-blue-300 bg-blue-50 text-blue-800 hover:border-blue-600 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
        }`}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
        <span className="truncate">Correo del {fechaCorta(correo.fecha_correo.slice(0, 10))}: {resumen}</span>
        <span aria-hidden="true">{abierto ? "▴" : "▾"}</span>
      </button>
      {correo.evidencia && (
        <VerCorreo
          evidencia={correo.evidencia}
          booking={noBooking}
          boton="Ver correo"
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        />
      )}
      </div>
      {abierto && (
        <div className="mt-2 space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          {campos.map((c) => {
            const r = resultado[c.id];
            return (
              <div key={c.id} className="flex flex-wrap items-end gap-2">
                <label className="flex w-60 flex-col text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {c.label}
                  <input
                    type={c.tipo}
                    value={valores[c.id] ?? ""}
                    disabled={!puedeEditar}
                    onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))}
                    className="mt-0.5 rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-sm font-normal text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                {puedeEditar && (
                  <>
                    <button
                      type="button"
                      disabled={r === "guardando" || !valores[c.id]}
                      onClick={() => guardar(c, "EDICION")}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    >
                      Guardar
                    </button>
                    {c.finalizar && (
                      <button
                        type="button"
                        disabled={r === "guardando" || !valores[c.id]}
                        onClick={() => guardar(c, "FINALIZADO")}
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                      >
                        Guardar y finalizar
                      </button>
                    )}
                  </>
                )}
                {r && r !== "guardando" && (
                  <span className={`pb-1.5 text-xs font-semibold ${r.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                    {r.ok ? "✓ " : ""}
                    {r.mensaje}
                  </span>
                )}
                {r === "guardando" && <span className="pb-1.5 text-xs text-slate-500">Guardando…</span>}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {!puedeEditar && <span className="text-slate-500">Solo los editores de Cargolink pueden guardar.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
