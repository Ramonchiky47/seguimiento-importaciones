import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { TrackEjecutivoFilter } from "@/components/TrackEjecutivoFilter";
import { BuscadorTrack } from "@/components/BuscadorTrack";
import {
  EJECUTIVO_TODOS,
  ESTATUS_OPCIONES,
  ESTATUS_TRACK,
  PERIODO_ATD_OPCIONES,
  SIN_EJECUTIVO,
  cambiosComerciales,
  ejecutivosTrack,
  estatusBooking,
  periodoAtd,
} from "@/lib/track";
import {
  ESTILO_TAREA,
  FASES,
  calcularTareas,
  estadoFase,
  faseActual,
  siguientePaso,
  type HitoTrack,
} from "@/lib/trackNew";

export const dynamic = "force-dynamic";

const MAX_BOOKINGS = 400;
const VISTAS = [
  { key: "falta", label: "Con algo que falta" },
  { key: "alerta", label: "Por revisar" },
  { key: "aldia", label: "Al día" },
  { key: "todos", label: "Todos" },
] as const;

type Embarque = { id_booking: number; no_booking: string; cliente: string | null; ejecutivo: string | null; etapa: string; max_dias_atraso: number | null };

export default async function TrackNewBandeja({
  searchParams,
}: {
  searchParams: Promise<{ ejecutivo?: string | string[]; estatus?: string | string[]; atd?: string | string[]; q?: string; vista?: string }>;
}) {
  const { ejecutivo, estatus, atd, q, vista } = await searchParams;
  const vistaActiva = VISTAS.some((v) => v.key === vista) ? (vista as (typeof VISTAS)[number]["key"]) : "falta";
  const { filtro: ejecutivoRaw, enUrl: ejecutivoEnUrl } = ejecutivosTrack(ejecutivo);
  const estatusSel = estatusBooking(estatus, ESTATUS_TRACK);
  const atdSel = periodoAtd(atd);
  const busqueda = (q ?? "").replace(/[,()%]/g, " ").trim();
  const supabase = await createClient();

  let query = supabase
    .from("track_embarques")
    .select("id_booking, no_booking, cliente, ejecutivo, etapa, max_dias_atraso")
    .order("max_dias_atraso", { ascending: false, nullsFirst: false })
    .limit(MAX_BOOKINGS);
  if (ejecutivoRaw.length > 0) {
    const nombres = ejecutivoRaw.filter((e) => e !== SIN_EJECUTIVO);
    query = query.or(
      [
        ...(nombres.length > 0 ? [`ejecutivo.in.(${nombres.map((e) => `"${e.replace(/"/g, "")}"`).join(",")})`] : []),
        ...(ejecutivoRaw.includes(SIN_EJECUTIVO) ? ["ejecutivo.is.null"] : []),
      ].join(","),
    );
  }
  if (estatusSel.codigos) query = query.in("status_booking", estatusSel.codigos);
  if (atdSel.codigos) query = query.in("periodo_atd", atdSel.codigos);
  if (busqueda) query = query.or(`no_booking.ilike.%${busqueda}%,cliente.ilike.%${busqueda}%,ejecutivo.ilike.%${busqueda}%`);

  const [{ data, error }, { data: ejecutivosData }] = await Promise.all([
    query,
    supabase.rpc("operaciones_maritima_ejecutivos", { p_anio: null, p_types: null, p_q: null, p_tarjeta: null, p_hoy: null }),
  ]);
  const embarques = (data ?? []) as Embarque[];
  const ids = embarques.map((e) => e.id_booking);

  // Hitos y datos de Cargolink de esos bookings, en bloques.
  const bloques: number[][] = [];
  for (let i = 0; i < ids.length; i += 100) bloques.push(ids.slice(i, i + 100));
  const [hitosRes, opsRes, cambios] = await Promise.all([
    Promise.all(
      bloques.map((b) =>
        supabase
          .from("track_hitos")
          .select("id_booking, orden, hito, regla, fecha_plan, fecha_hecho, hecho, estado, dias_atraso, valor_real")
          .in("id_booking", b),
      ),
    ),
    Promise.all(
      bloques.map((b) =>
        supabase
          .from("operaciones_maritima_vista")
          .select("id_booking, datos, dias_libres_demora, ata, etd_atd, eta, status_booking")
          .in("id_booking", b),
      ),
    ),
    cambiosComerciales(supabase, ids),
  ]);
  const hitosPor = new Map<number, HitoTrack[]>();
  for (const r of hitosRes) {
    for (const h of (r.data ?? []) as (HitoTrack & { id_booking: number })[]) {
      hitosPor.set(h.id_booking, [...(hitosPor.get(h.id_booking) ?? []), h]);
    }
  }
  const opPor = new Map<number, Record<string, unknown>>();
  for (const r of opsRes) for (const o of (r.data ?? []) as Record<string, unknown>[]) opPor.set(o.id_booking as number, o);

  const filas = embarques.map((e) => {
    const tareas = calcularTareas(opPor.get(e.id_booking) ?? {}, hitosPor.get(e.id_booking) ?? []);
    const fases = FASES.map((f) => ({ ...f, estado: estadoFase(tareas.filter((t) => t.fase === f.clave)) }));
    const faltan = tareas.filter((t) => t.estado === "falta").length;
    const revisar = tareas.filter((t) => t.estado === "alerta").length;
    const actual = FASES.find((f) => f.clave === faseActual(tareas))!;
    return { ...e, tareas, fases, faltan, revisar, siguiente: siguientePaso(tareas), actual, cambio: cambios.get(e.id_booking) };
  });
  const cuenta = {
    falta: filas.filter((f) => f.faltan > 0).length,
    alerta: filas.filter((f) => f.faltan === 0 && (f.revisar > 0 || f.cambio)).length,
    aldia: filas.filter((f) => f.faltan === 0 && f.revisar === 0 && !f.cambio).length,
    todos: filas.length,
  };
  const visibles = filas
    .filter((f) =>
      vistaActiva === "falta" ? f.faltan > 0
      : vistaActiva === "alerta" ? f.faltan === 0 && (f.revisar > 0 || Boolean(f.cambio))
      : vistaActiva === "aldia" ? f.faltan === 0 && f.revisar === 0 && !f.cambio
      : true,
    )
    .sort((a, b) => b.faltan - a.faltan || (b.max_dias_atraso ?? 0) - (a.max_dias_atraso ?? 0));

  const availableEjecutivos = Array.from(
    new Set([SIN_EJECUTIVO, ...((ejecutivosData ?? []) as { ejecutivo: string }[]).map((x) => x.ejecutivo), ...ejecutivoRaw]),
  ).sort((a, b) => (a === SIN_EJECUTIVO ? -1 : b === SIN_EJECUTIVO ? 1 : a.localeCompare(b, "es")));
  const params = (cambios2: { vista?: string }) => {
    const p = new URLSearchParams();
    for (const v of ejecutivoEnUrl) p.append("ejecutivo", v);
    for (const v of estatusSel.enUrl) p.append("estatus", v);
    for (const v of atdSel.enUrl) p.append("atd", v);
    if (busqueda) p.set("q", busqueda);
    const vv = cambios2.vista ?? vistaActiva;
    if (vv !== "falta") p.set("vista", vv);
    const s = p.toString();
    return s ? `?${s}` : "?";
  };
  const hrefTodos = `?${new URLSearchParams([
    ...estatusSel.enUrl.map((v) => ["estatus", v]),
    ...atdSel.enUrl.map((v) => ["atd", v]),
    ...(busqueda ? [["q", busqueda]] : []),
    ["ejecutivo", EJECUTIVO_TODOS],
  ]).toString()}`;
  const tonoVista: Record<string, string> = {
    falta: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    alerta: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
    aldia: "border-green-300 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
    todos: "border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  };

  return (
    <main className="mx-auto flex max-w-[1360px] flex-col gap-4 px-4 py-5 text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelectFilter paramName="atd" label="ATD real" options={PERIODO_ATD_OPCIONES} current={atdSel.seleccion} />
        <MultiSelectFilter paramName="estatus" label="Estatus" options={ESTATUS_OPCIONES} current={estatusSel.seleccion} />
        <TrackEjecutivoFilter options={availableEjecutivos} filtro={ejecutivoRaw} hrefTodos={hrefTodos} />
        <BuscadorTrack />
      </div>

      {/* Bandejas por lo que falta */}
      <div role="group" aria-label="Qué mostrar" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {VISTAS.map((v) => (
          <Link
            key={v.key}
            href={params({ vista: v.key })}
            aria-current={v.key === vistaActiva ? "true" : undefined}
            className={`flex min-h-11 flex-col rounded-xl border-2 px-4 py-3 ${tonoVista[v.key]} ${v.key === vistaActiva ? "ring-2 ring-[#16232f] ring-offset-2 dark:ring-slate-100 dark:ring-offset-slate-950" : ""}`}
          >
            <span className="text-xs font-extrabold uppercase tracking-wide">{v.label}</span>
            <span className="text-2xl font-extrabold tabular-nums">{cuenta[v.key]}</span>
          </Link>
        ))}
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">Error al cargar: {error.message}</p>}

      <ul className="flex flex-col gap-2">
        {visibles.map((f) => {
          const sig = f.siguiente;
          return (
            <li key={f.id_booking} data-buscar={`${f.no_booking} ${f.cliente ?? ""} ${f.ejecutivo ?? "Sin ejecutivo"}`}>
              <Link
                href={`/track-new/${f.id_booking}`}
                className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-[#16232f] hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-400"
              >
                <span className="flex min-w-0 flex-[1_1_240px] flex-col">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[15px] font-bold text-blue-700 dark:text-blue-400">{f.no_booking}</span>
                    {f.cambio && (
                      <span title={f.cambio} className="rounded-full bg-amber-100 px-2 text-[11px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        Cambio comercial
                      </span>
                    )}
                  </span>
                  <span className="truncate text-sm text-slate-600 dark:text-slate-400">{f.cliente ?? "—"}</span>
                  <span className={`text-xs ${f.ejecutivo ? "text-slate-500 dark:text-slate-400" : "font-bold text-red-700 dark:text-red-400"}`}>
                    {f.ejecutivo ?? "Sin ejecutivo"}
                  </span>
                </span>

                {/* Recorrido: un punto por fase */}
                <span className="flex flex-[1_1_260px] flex-col gap-1">
                  <span className="flex items-center gap-1" aria-label={`Va en fase ${f.actual.n}: ${f.actual.nombre}`}>
                    {f.fases.map((fa) => (
                      <span
                        key={fa.clave}
                        title={`Fase ${fa.n} · ${fa.nombre}: ${ESTILO_TAREA[fa.estado].label}`}
                        className={`h-2.5 flex-1 rounded-full ${ESTILO_TAREA[fa.estado].punto} ${fa.clave === f.actual.clave ? "ring-2 ring-[#16232f] ring-offset-1 dark:ring-slate-200 dark:ring-offset-slate-900" : ""}`}
                      />
                    ))}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Fase {f.actual.n} · {f.actual.nombre} · {f.etapa}
                  </span>
                </span>

                <span className="flex min-w-0 flex-[2_1_300px] items-center gap-2">
                  {sig ? (
                    <>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${ESTILO_TAREA[sig.estado].pill}`}>SIGUIENTE</span>
                      <span className="min-w-0 truncate text-sm">
                        <strong>{sig.label}</strong> · <span className={ESTILO_TAREA[sig.estado].texto}>{sig.valor}</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-semibold text-green-800 dark:text-green-300">Al día</span>
                  )}
                </span>

                <span className="flex items-center gap-2">
                  {f.faltan > 0 && (
                    <span className="rounded-full bg-red-700 px-2.5 py-0.5 text-xs font-extrabold text-white">{f.faltan} faltan</span>
                  )}
                  {f.revisar > 0 && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      {f.revisar} revisar
                    </span>
                  )}
                  <span aria-hidden="true" className="text-lg text-slate-400">›</span>
                </span>
              </Link>
            </li>
          );
        })}
        {visibles.length === 0 && !error && (
          <li className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            No hay bookings en esta bandeja.
          </li>
        )}
      </ul>
      {embarques.length >= MAX_BOOKINGS && (
        <p className="text-center text-xs text-slate-500">Se muestran los primeros {MAX_BOOKINGS}; usa los filtros o la búsqueda para acotar.</p>
      )}
    </main>
  );
}
