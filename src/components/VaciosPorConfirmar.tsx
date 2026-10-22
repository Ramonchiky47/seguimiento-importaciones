"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarEtapaCargolink } from "@/app/(app)/operaciones-maritima/actions";
import { AbrirOperacionBoton } from "@/components/OperacionDetalleModal";
import { fechaCorta, hoyMexico } from "@/lib/track";

export type VacioPendiente = {
  id_booking: number;
  no_booking: string;
  cliente: string | null;
  ejecutivo: string | null;
  naviera: string | null;
  ata: string;
  dias_libres: number | null;
  ultimo_dia_libre: string | null;
  dias_demora: number | null;
  estimado: string;
  dias_tipicos: number;
  base: string;
  riesgo: "alto" | "medio" | "bajo";
  tardes: number;
  n: number;
  estado: "demora" | "por_vencer" | "estimado_paso" | "en_tiempo";
};

const ESTADO: Record<VacioPendiente["estado"], { label: string; clase: string }> = {
  demora: { label: "En demora", clase: "bg-red-700 text-white" },
  por_vencer: { label: "Por vencer", clase: "bg-amber-500 text-white" },
  estimado_paso: { label: "Ya debería haber regresado", clase: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  en_tiempo: { label: "En tiempo", clase: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};
const RIESGO: Record<VacioPendiente["riesgo"], { label: string; clase: string }> = {
  alto: { label: "Riesgo alto", clase: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  medio: { label: "Riesgo medio", clase: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  bajo: { label: "Riesgo bajo", clase: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
};

// "¿Ya regresó el vacío?": la fecha estimada es solo un aviso. El operativo
// captura la fecha REAL de la papeleta de entrega (campo vacío, nunca
// precargado) y confirma; hasta entonces el booking sigue en seguimiento.
export function VaciosPorConfirmar({ vacios, puedeEditar }: { vacios: VacioPendiente[]; puedeEditar: boolean }) {
  const router = useRouter();
  const hoy = hoyMexico();
  const [fechas, setFechas] = useState<Record<number, string>>({});
  const [resultado, setResultado] = useState<Record<number, { ok: boolean; mensaje: string }>>({});
  const [revisando, setRevisando] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);

  // Fecha real válida: entre el ATA y hoy.
  const valida = (v: VacioPendiente, f: string | undefined) => Boolean(f && f >= v.ata.slice(0, 10) && f <= hoy);
  const listos = vacios.filter((v) => !resultado[v.id_booking]?.ok && valida(v, fechas[v.id_booking]));
  const atencion = vacios.filter((v) => v.estado !== "en_tiempo").length;

  const confirmar = async () => {
    setRevisando(false);
    setProgreso({ hechos: 0, total: listos.length });
    const res = { ...resultado };
    for (const [i, v] of listos.entries()) {
      res[v.id_booking] = await guardarEtapaCargolink(v.id_booking, "vacio", "EDICION", { fecha_maniobra_entrega: fechas[v.id_booking] });
      setResultado({ ...res });
      setProgreso({ hechos: i + 1, total: listos.length });
    }
    setProgreso(null);
    router.refresh();
  };

  return (
    <section id="vacios" aria-labelledby="vacios-titulo" className="scroll-mt-20 overflow-hidden rounded-xl border-2 border-red-200 bg-white shadow-sm dark:border-red-900 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/40">
        <div>
          <h2 id="vacios-titulo" className="text-base font-bold text-red-900 dark:text-red-200">
            ¿Ya regresó el vacío? <span className="text-sm font-semibold">· {vacios.length} por regresar · {atencion} requieren atención</span>
          </h2>
          <p className="text-xs text-red-900/80 dark:text-red-200/80">
            La fecha estimada es solo un aviso y <strong>no se guarda</strong>. Captura la fecha real de la papeleta de entrega; si aún no regresa,
            déjalo vacío y sigue en seguimiento.
          </p>
        </div>
        {puedeEditar && (
          <button
            type="button"
            disabled={listos.length === 0 || Boolean(progreso)}
            onClick={() => setRevisando(true)}
            className="min-h-10 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
          >
            {progreso ? `Guardando ${progreso.hechos} de ${progreso.total}…` : `Revisar y guardar regresos (${listos.length})`}
          </button>
        )}
      </div>

      {revisando && (
        <div role="alertdialog" aria-labelledby="rev-vacios" className="space-y-3 border-b border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <p id="rev-vacios" className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            Se guardará en Cargolink la fecha REAL de regreso de vacío de {listos.length} bookings. Al guardarla, dejan de contar días de demora en
            Track. Confirma que cada fecha es la de la papeleta de entrega:
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-950 dark:text-amber-100">
            {listos.map((v) => (
              <li key={v.id_booking}>
                {v.no_booking} · regresó el <strong>{fechaCorta(fechas[v.id_booking])}</strong>
                {v.ultimo_dia_libre && fechas[v.id_booking] > v.ultimo_dia_libre.slice(0, 10) ? " (después del último día libre: genera demora)" : ""}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => setRevisando(false)} className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
              Cancelar
            </button>
            <button type="button" onClick={confirmar} className="min-h-10 rounded-md bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800">
              Confirmar y guardar en Cargolink
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {vacios.map((v) => {
          const r = resultado[v.id_booking];
          const f = fechas[v.id_booking] ?? "";
          const fueraDeRango = Boolean(f) && !valida(v, f);
          const restantes = v.dias_demora === null ? null : -v.dias_demora;
          return (
            <li key={v.id_booking} className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-sm ${r?.ok ? "bg-green-50 dark:bg-green-950/40" : ""}`}>
              <span className="flex w-56 min-w-0 flex-col">
                <AbrirOperacionBoton idBooking={v.id_booking} className="text-left font-mono text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400">
                  {v.no_booking}
                </AbrirOperacionBoton>
                <span className="truncate text-xs text-slate-500">
                  {v.cliente ?? "—"} · {v.ejecutivo ?? "Sin ejecutivo"}
                </span>
                <span className="truncate text-[11px] text-slate-500">{v.naviera ?? "Naviera sin capturar"}</span>
              </span>
              <span className="flex w-52 flex-col gap-1">
                <span className="flex flex-wrap gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO[v.estado].clase}`}>{ESTADO[v.estado].label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${RIESGO[v.riesgo].clase}`} title={v.n ? `${v.tardes} de ${v.n} regresos de este cliente fueron después de los días libres` : undefined}>
                    {RIESGO[v.riesgo].label}
                  </span>
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  ATA {fechaCorta(v.ata)} · último día libre {v.ultimo_dia_libre ? fechaCorta(v.ultimo_dia_libre) : "sin capturar"}
                  {restantes !== null && (restantes >= 0 ? ` · quedan ${restantes} d` : ` · ${-restantes} d de demora`)}
                </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col text-xs text-slate-600 dark:text-slate-400">
                <span>
                  <strong className="text-slate-800 dark:text-slate-200">Estimado (no se guarda): {fechaCorta(v.estimado)}</strong>
                </span>
                <span>Según {v.base}.</span>
              </span>
              <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Fecha real de regreso
                <input
                  type="date"
                  value={f}
                  min={v.ata.slice(0, 10)}
                  max={hoy}
                  disabled={!puedeEditar || r?.ok || Boolean(progreso)}
                  onChange={(e) => setFechas((x) => ({ ...x, [v.id_booking]: e.target.value }))}
                  className={`min-h-10 rounded-md border px-2 text-sm font-normal dark:bg-slate-900 ${fueraDeRango ? "border-red-500" : "border-slate-300 dark:border-slate-600"}`}
                />
                {fueraDeRango && <span className="font-normal text-red-700">Debe estar entre el ATA y hoy.</span>}
              </label>
              {r && <span className={`basis-full text-xs ${r.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{r.ok ? "✓ Regreso guardado en Cargolink" : r.mensaje}</span>}
            </li>
          );
        })}
        {vacios.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No hay vacíos pendientes de regresar.</li>}
      </ul>
    </section>
  );
}
