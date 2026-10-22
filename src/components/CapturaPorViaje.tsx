"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarEtapaCargolink } from "@/app/(app)/operaciones-maritima/actions";
import { AbrirOperacionBoton } from "@/components/OperacionDetalleModal";
import { fechaCorta } from "@/lib/track";

export type BookingViaje = {
  id_booking: number;
  no_booking: string;
  cliente: string | null;
  ejecutivo: string | null;
  atd: string | null;
  eta: string | null;
  ata: string | null;
  mov_atd: string | null;
  mov_eta: string | null;
  mov_ata: string | null;
};
export type Viaje = { buque: string; viaje: string; n: number; distintas: boolean; faltan: number; eta: string | null; bookings: BookingViaje[] };

// Datos que se capturan por viaje: etapa de Cargolink y su campo de fecha.
const CAMPOS = [
  { key: "atd", label: "ATD", etapa: "atd", campo: "fecha_atd", mov: "mov_atd" },
  { key: "eta", label: "ETA", etapa: "eta", campo: "buque_eta", mov: "mov_eta" },
  { key: "ata", label: "ATA", etapa: "ata", campo: "fecha_ata", mov: "mov_ata" },
] as const;
type CampoKey = (typeof CAMPOS)[number]["key"];

// Propuesta: la fecha más capturada en el viaje; empate, la más reciente.
function propuesta(bookings: BookingViaje[], k: CampoKey): string {
  const cuenta = new Map<string, number>();
  for (const b of bookings) if (b[k]) cuenta.set(b[k] as string, (cuenta.get(b[k] as string) ?? 0) + 1);
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? "";
}

type Celda = { estado: "igual" | "agregar" | "distinta" | "bloqueada" | "vacia"; marcable: boolean };
function celda(b: BookingViaje, k: CampoKey, valor: string): Celda {
  const actual = b[k];
  const mov = b[`mov_${k}` as const];
  if (!valor) return { estado: "vacia", marcable: false };
  if (actual === valor) return { estado: "igual", marcable: mov !== "FINALIZADO" && mov !== "NO_APLICA" };
  if (mov === "FINALIZADO" || mov === "NO_APLICA") return { estado: "bloqueada", marcable: false };
  return { estado: actual ? "distinta" : "agregar", marcable: true };
}

function ViajeTarjeta({ v, puedeEditar }: { v: Viaje; puedeEditar: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(v.distintas || v.faltan > 0);
  const [valores, setValores] = useState<Record<CampoKey, string>>(() => ({
    atd: propuesta(v.bookings, "atd"),
    eta: propuesta(v.bookings, "eta"),
    ata: propuesta(v.bookings, "ata"),
  }));
  const [finalizar, setFinalizar] = useState(false);
  // Selección por celda: por default solo las que se agregan (vacías).
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const b of v.bookings) for (const c of CAMPOS) m[`${b.id_booking}:${c.key}`] = celda(b, c.key, propuesta(v.bookings, c.key)).estado === "agregar";
    return m;
  });
  const [revisando, setRevisando] = useState(false);
  const [progreso, setProgreso] = useState<{ total: number; hechos: number } | null>(null);
  const [resultado, setResultado] = useState<Record<string, { ok: boolean; mensaje: string }>>({});

  const cambios = useMemo(
    () =>
      v.bookings.flatMap((b) =>
        CAMPOS.filter((c) => {
          const ce = celda(b, c.key, valores[c.key]);
          return marcadas[`${b.id_booking}:${c.key}`] && ce.marcable && (ce.estado !== "igual" || finalizar);
        }).map((c) => ({ b, c, antes: b[c.key], despues: valores[c.key] })),
      ),
    [v.bookings, valores, marcadas, finalizar],
  );

  const confirmar = async () => {
    setRevisando(false);
    setProgreso({ total: cambios.length, hechos: 0 });
    const res: Record<string, { ok: boolean; mensaje: string }> = {};
    // Uno por uno, con el mismo guardado de cada etapa (verificación y bitácora).
    for (const [i, x] of cambios.entries()) {
      const r = await guardarEtapaCargolink(x.b.id_booking, x.c.etapa, finalizar ? "FINALIZADO" : "EDICION", { [x.c.campo]: x.despues });
      res[`${x.b.id_booking}:${x.c.key}`] = r;
      setResultado({ ...res });
      setProgreso({ total: cambios.length, hechos: i + 1 });
    }
    setProgreso(null);
    router.refresh();
  };

  const estiloCelda: Record<Celda["estado"], string> = {
    igual: "text-green-800 dark:text-green-300",
    agregar: "text-blue-800 dark:text-blue-300",
    distinta: "text-amber-900 dark:text-amber-200",
    bloqueada: "text-slate-500",
    vacia: "text-slate-400",
  };
  const textoCelda = (ce: Celda, actual: string | null) =>
    ce.estado === "igual" ? `${fechaCorta(actual)} ✓`
    : ce.estado === "agregar" ? "— · se agrega"
    : ce.estado === "distinta" ? `${fechaCorta(actual)} · distinta`
    : ce.estado === "bloqueada" ? `${fechaCorta(actual)} · finalizada`
    : fechaCorta(actual);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#c65a1f]">
          <path d="M3 17h18l-3 4H6zM12 3v10M8 9h8" />
        </svg>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-bold text-slate-900 dark:text-slate-50">
            {v.buque} · Viaje {v.viaje}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {v.n} bookings · ETA {fechaCorta(v.eta)}
          </span>
        </span>
        {v.distintas && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">Fechas distintas</span>
        )}
        {v.faltan > 0 && (
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-900 dark:bg-blue-950 dark:text-blue-200">
            {v.faltan} por capturar
          </span>
        )}
        {!v.distintas && v.faltan === 0 && (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800 dark:bg-green-950 dark:text-green-300">Cuadra</span>
        )}
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-2 py-2 font-semibold">Booking</th>
                  {CAMPOS.map((c) => (
                    <th key={c.key} scope="col" className="px-2 py-2 font-semibold">
                      {c.label}
                    </th>
                  ))}
                </tr>
                <tr className="bg-slate-50 normal-case dark:bg-slate-800">
                  <th scope="row" className="px-2 py-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                    Valor para el viaje
                    <span className="block font-normal text-slate-500">propuesta: la más capturada</span>
                  </th>
                  {CAMPOS.map((c) => (
                    <td key={c.key} className="px-2 py-2">
                      <label className="sr-only" htmlFor={`v-${v.buque}-${v.viaje}-${c.key}`}>
                        {c.label} para el viaje
                      </label>
                      <input
                        id={`v-${v.buque}-${v.viaje}-${c.key}`}
                        type="date"
                        value={valores[c.key]}
                        disabled={!puedeEditar}
                        onChange={(e) => setValores((x) => ({ ...x, [c.key]: e.target.value }))}
                        className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                      />
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {v.bookings.map((b) => (
                  <tr key={b.id_booking}>
                    <td className="px-2 py-2">
                      <AbrirOperacionBoton idBooking={b.id_booking} className="font-mono text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400">
                        {b.no_booking}
                      </AbrirOperacionBoton>
                      <span className="block max-w-56 truncate text-xs text-slate-500">
                        {b.cliente ?? "—"} · {b.ejecutivo ?? "Sin ejecutivo"}
                      </span>
                    </td>
                    {CAMPOS.map((c) => {
                      const id = `${b.id_booking}:${c.key}`;
                      const ce = celda(b, c.key, valores[c.key]);
                      const r = resultado[id];
                      return (
                        <td key={c.key} className="px-2 py-2">
                          <label className={`flex items-center gap-2 ${estiloCelda[ce.estado]}`}>
                            <input
                              type="checkbox"
                              disabled={!puedeEditar || !ce.marcable || Boolean(progreso)}
                              checked={Boolean(marcadas[id]) && ce.marcable}
                              onChange={(e) => setMarcadas((m) => ({ ...m, [id]: e.target.checked }))}
                              aria-label={`Cambiar ${c.label} de ${b.no_booking}`}
                            />
                            <span className="text-sm">{textoCelda(ce, b[c.key])}</span>
                          </label>
                          {r && <span className={`block text-xs ${r.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{r.ok ? "✓ Guardado" : r.mensaje}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {puedeEditar ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={finalizar} onChange={(e) => setFinalizar(e.target.checked)} />
                Guardar y finalizar la etapa (si no, queda en edición)
              </label>
              <button
                type="button"
                disabled={cambios.length === 0 || Boolean(progreso)}
                onClick={() => setRevisando(true)}
                className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                {progreso ? `Guardando ${progreso.hechos} de ${progreso.total}…` : `Revisar cambios (${cambios.length})`}
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Solo los editores de la prueba capturan desde la app.</p>
          )}

          {revisando && (
            <div role="alertdialog" aria-labelledby={`rev-${v.buque}-${v.viaje}`} className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
              <p id={`rev-${v.buque}-${v.viaje}`} className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Se escribirán en Cargolink {cambios.length} {cambios.length === 1 ? "fecha" : "fechas"} en{" "}
                {new Set(cambios.map((x) => x.b.id_booking)).size} bookings{finalizar ? " y se finalizarán esas etapas" : ""}:
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-950 dark:text-amber-100">
                {cambios.map((x) => (
                  <li key={`${x.b.id_booking}:${x.c.key}`}>
                    {x.b.no_booking} · {x.c.label}: {x.antes ? fechaCorta(x.antes) : "—"} → <strong>{fechaCorta(x.despues)}</strong>
                    {x.antes && x.antes !== x.despues ? " (se reemplaza)" : ""}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-900 dark:text-amber-200">No se notificará al cliente. Queda en la Bitácora con tu nombre.</p>
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
        </div>
      )}
    </section>
  );
}

export function CapturaPorViaje({ viajes, puedeEditar }: { viajes: Viaje[]; puedeEditar: boolean }) {
  if (viajes.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        No hay bookings que compartan buque y viaje con estos filtros.
      </p>
    );
  }
  const pendientes = viajes.filter((v) => v.distintas || v.faltan > 0).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        <strong>{viajes.length}</strong> viajes compartidos · <strong>{pendientes}</strong> con fechas por capturar o distintas
      </p>
      {viajes.map((v) => (
        <ViajeTarjeta key={`${v.buque}|${v.viaje}`} v={v} puedeEditar={puedeEditar} />
      ))}
    </div>
  );
}
