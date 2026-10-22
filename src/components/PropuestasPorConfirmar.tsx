"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarEtapaCargolink, guardarTransbordosCargolink } from "@/app/(app)/operaciones-maritima/actions";
import { AbrirOperacionBoton } from "@/components/OperacionDetalleModal";
import { fechaCorta } from "@/lib/track";

export type Propuesta = {
  id_booking: number;
  no_booking: string;
  cliente: string | null;
  ejecutivo: string | null;
  tipo: "transbordo" | "eta" | "eta_finalizar" | "dias";
  valor: string;
  explicacion: string;
  confianza: "alta" | "media" | "baja";
};

const TIPOS: { tipo: Propuesta["tipo"]; titulo: string; accion: string; ayuda: string }[] = [
  { tipo: "transbordo", titulo: "Transbordo → No aplica", accion: "Marcar No aplica", ayuda: "La naviera casi nunca transborda en esa ruta." },
  { tipo: "eta_finalizar", titulo: "Finalizar ETA", accion: "Finalizar con la ETA capturada", ayuda: "La ETA ya está capturada; falta finalizar la etapa en Cargolink." },
  { tipo: "eta", titulo: "ETA propuesta", accion: "Guardar ETA (queda en edición)", ayuda: "Zarpó sin ETA: ATD + tránsito típico de la naviera." },
  { tipo: "dias", titulo: "Días libres de demora", accion: "Guardar días libres", ayuda: "Ya arribó y no tiene días libres: según el historial." },
];

const CONFIANZA: Record<Propuesta["confianza"], { label: string; clase: string }> = {
  alta: { label: "Confianza alta", clase: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  media: { label: "Revisar", clase: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  baja: { label: "Poca historia", clase: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
};

const clave = (p: Propuesta) => `${p.tipo}:${p.id_booking}`;

export function PropuestasPorConfirmar({ propuestas, puedeEditar }: { propuestas: Propuesta[]; puedeEditar: boolean }) {
  const router = useRouter();
  // Por default solo las de confianza alta quedan marcadas.
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(propuestas.map((p) => [clave(p), p.confianza === "alta"])),
  );
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(propuestas.map((p) => [clave(p), p.valor])));
  const [resultado, setResultado] = useState<Record<string, { ok: boolean; mensaje: string }>>({});
  const [revisando, setRevisando] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);

  const pendientes = propuestas.filter((p) => !resultado[clave(p)]?.ok);
  const seleccion = useMemo(() => pendientes.filter((p) => marcadas[clave(p)] && valores[clave(p)]), [pendientes, marcadas, valores]);

  const confirmar = async () => {
    setRevisando(false);
    setProgreso({ hechos: 0, total: seleccion.length });
    const res: Record<string, { ok: boolean; mensaje: string }> = { ...resultado };
    for (const [i, p] of seleccion.entries()) {
      const v = valores[clave(p)];
      const r =
        p.tipo === "transbordo"
          ? await guardarTransbordosCargolink(p.id_booking, "NO_APLICA", [])
          : p.tipo === "eta"
            ? await guardarEtapaCargolink(p.id_booking, "eta", "EDICION", { buque_eta: v })
            : p.tipo === "eta_finalizar"
              ? await guardarEtapaCargolink(p.id_booking, "eta", "FINALIZADO", { buque_eta: v })
              : await guardarEtapaCargolink(p.id_booking, "ata", "EDICION", { dias_demora: v });
      res[clave(p)] = r;
      setResultado({ ...res });
      setProgreso({ hechos: i + 1, total: seleccion.length });
    }
    setProgreso(null);
    router.refresh();
  };

  if (propuestas.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        No hay propuestas por confirmar con estos filtros.
      </p>
    );
  }

  const valorTexto = (p: Propuesta, v: string) =>
    p.tipo === "transbordo" ? "No aplica" : p.tipo === "dias" ? `${v} días` : fechaCorta(v);

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <strong>{pendientes.length}</strong> propuestas · <strong>{seleccion.length}</strong> seleccionadas · nada se guarda hasta confirmar
        </p>
        {puedeEditar ? (
          <button
            type="button"
            disabled={seleccion.length === 0 || Boolean(progreso)}
            onClick={() => setRevisando(true)}
            className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {progreso ? `Guardando ${progreso.hechos} de ${progreso.total}…` : `Revisar y confirmar (${seleccion.length})`}
          </button>
        ) : (
          <span className="text-xs text-slate-500">Solo los editores de la prueba confirman propuestas.</span>
        )}
      </div>

      {revisando && (
        <div role="alertdialog" aria-labelledby="rev-propuestas" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <p id="rev-propuestas" className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            Se escribirán en Cargolink {seleccion.length} propuestas en {new Set(seleccion.map((p) => p.id_booking)).size} bookings. No se notificará al
            cliente; queda en la Bitácora con tu nombre.
          </p>
          <ul className="max-h-60 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-amber-950 dark:text-amber-100">
            {seleccion.map((p) => (
              <li key={clave(p)}>
                {p.no_booking} · {TIPOS.find((t) => t.tipo === p.tipo)?.accion}: <strong>{valorTexto(p, valores[clave(p)])}</strong>
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

      {TIPOS.map((t) => {
        const lista = propuestas.filter((p) => p.tipo === t.tipo);
        if (lista.length === 0) return null;
        const abiertas = lista.filter((p) => !resultado[clave(p)]?.ok);
        const todas = abiertas.length > 0 && abiertas.every((p) => marcadas[clave(p)]);
        return (
          <section key={t.tipo} aria-labelledby={`tipo-${t.tipo}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <h2 id={`tipo-${t.tipo}`} className="text-base font-bold text-slate-900 dark:text-slate-50">
                  {t.titulo} <span className="text-sm font-semibold text-slate-500">· {lista.length}</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.ayuda}</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={todas}
                  disabled={!puedeEditar || Boolean(progreso)}
                  onChange={(e) => setMarcadas((m) => ({ ...m, ...Object.fromEntries(abiertas.map((p) => [clave(p), e.target.checked])) }))}
                />
                Seleccionar todas
              </label>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {lista.map((p) => {
                const k = clave(p);
                const r = resultado[k];
                const hecho = r?.ok === true;
                return (
                  <li key={k} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm ${hecho ? "bg-green-50 dark:bg-green-950/40" : ""}`}>
                    <input
                      type="checkbox"
                      aria-label={`Confirmar ${p.no_booking}`}
                      disabled={!puedeEditar || hecho || Boolean(progreso)}
                      checked={Boolean(marcadas[k]) && !hecho}
                      onChange={(e) => setMarcadas((m) => ({ ...m, [k]: e.target.checked }))}
                    />
                    <span className="flex w-56 min-w-0 flex-col">
                      <AbrirOperacionBoton idBooking={p.id_booking} className="text-left font-mono text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400">
                        {p.no_booking}
                      </AbrirOperacionBoton>
                      <span className="truncate text-xs text-slate-500">
                        {p.cliente ?? "—"} · {p.ejecutivo ?? "Sin ejecutivo"}
                      </span>
                    </span>
                    <span className="w-44">
                      {p.tipo === "transbordo" ? (
                        <span className="font-semibold">No aplica</span>
                      ) : (
                        <input
                          type={p.tipo === "dias" ? "number" : "date"}
                          min={p.tipo === "dias" ? 0 : undefined}
                          max={p.tipo === "dias" ? 365 : undefined}
                          value={valores[k] ?? ""}
                          disabled={!puedeEditar || hecho || Boolean(progreso)}
                          aria-label={`Valor propuesto para ${p.no_booking}`}
                          onChange={(e) => setValores((x) => ({ ...x, [k]: e.target.value }))}
                          className={`min-h-9 rounded-md border px-2 text-sm dark:bg-slate-900 ${
                            valores[k] === p.valor ? "border-2 border-dashed border-blue-500 bg-blue-50 font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200" : "border-slate-300 dark:border-slate-600"
                          } ${p.tipo === "dias" ? "w-24" : ""}`}
                        />
                      )}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CONFIANZA[p.confianza].clase}`}>{CONFIANZA[p.confianza].label}</span>
                    <span className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-400">{p.explicacion}</span>
                    {r && <span className={`basis-full pl-8 text-xs ${r.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{r.ok ? "✓ Guardado en Cargolink" : r.mensaje}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
