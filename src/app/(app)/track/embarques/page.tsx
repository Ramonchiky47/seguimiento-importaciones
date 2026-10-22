import Link from "next/link";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { createClient } from "@/lib/supabase/server";
import { TrackEjecutivoFilter } from "@/components/TrackEjecutivoFilter";
import { FilaOperacion } from "@/components/OperacionDetalleModal";
import { AsignarEjecutivoBoton } from "@/components/AsignarEjecutivoBoton";
import { RegresarTablero } from "@/components/RegresarTablero";
import {
  EJECUTIVO_TODOS,
  SIN_EJECUTIVO,
  ESTADOS,
  ESTATUS_OPCIONES,
  ESTATUS_TRACK,
  cambiosComerciales,
  explicarPropuestaDias,
  claseFilaEstatus,
  hoyMexico,
  VER_EMBARQUES,
  ejecutivosTrack,
  estatusBooking,
  periodoAtd,
  PERIODO_ATD_OPCIONES,
  fechaCorta,
  type EstadoHito,
} from "@/lib/track";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
// Etapa por fechas reales (vista track_embarques). "Dato por corregir" no es
// etapa: filtra los bookings con alerta_dato (captura inconsistente).
const DATO_POR_CORREGIR = "Dato por corregir";
const ETAPAS = ["Por zarpar", "En tránsito", "En puerto", "En demora", DATO_POR_CORREGIR];

type Embarque = {
  id_booking: number;
  no_booking: string;
  type: string | null;
  cliente: string | null;
  ejecutivo: string | null;
  eta: string | null;
  ata: string | null;
  dias_demora: number | null;
  etapa: string;
  alerta_dato: string | null;
  pendientes: number;
  semaforo: EstadoHito;
  max_dias_atraso: number | null;
  siguiente_hito: string | null;
  siguiente_fecha: string | null;
  status_booking: string | null;
};

export default async function EmbarquesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; etapa?: string; ejecutivo?: string | string[]; estatus?: string | string[]; atd?: string | string[]; page?: string; volver?: string; ver?: string }>;
}) {
  const { q, etapa, ejecutivo, estatus, atd, page, volver, ver } = await searchParams;
  const verActivo = ver && VER_EMBARQUES[ver] ? ver : null;
  const etapaActiva = etapa && ETAPAS.includes(etapa) ? etapa : null;
  const supabase = await createClient();
  const { filtro: ejecutivoRaw, enUrl: ejecutivoEnUrl } = ejecutivosTrack(ejecutivo);
  const estatusSel = estatusBooking(estatus, ESTATUS_TRACK);
  const atdSel = periodoAtd(atd);
  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const term = (q ?? "").replace(/[,()]/g, " ").trim();

  let query = supabase
    .from("track_embarques")
    .select(
      "id_booking, no_booking, type, cliente, ejecutivo, eta, ata, dias_demora, etapa, pendientes, semaforo, max_dias_atraso, siguiente_hito, siguiente_fecha, status_booking, alerta_dato",
      { count: "exact" },
    );
  if (term) {
    query = query.or(`no_booking.ilike.%${term}%,cliente.ilike.%${term}%,ejecutivo.ilike.%${term}%`);
  }
  if (etapaActiva === DATO_POR_CORREGIR) query = query.not("alerta_dato", "is", null);
  else if (etapaActiva) query = query.eq("etapa", etapaActiva);
  if (ejecutivoRaw.length > 0) {
    const nombres = ejecutivoRaw.filter((e) => e !== SIN_EJECUTIVO);
    const condiciones = [
      ...(nombres.length > 0 ? [`ejecutivo.in.(${nombres.map((e) => `"${e.replace(/"/g, "")}"`).join(",")})`] : []),
      ...(ejecutivoRaw.includes(SIN_EJECUTIVO) ? ["ejecutivo.is.null"] : []),
    ];
    query = query.or(condiciones.join(","));
  }
  if (estatusSel.codigos) query = query.in("status_booking", estatusSel.codigos);
  if (verActivo === "sin_eta") query = query.is("eta", null);
  if (verActivo === "sin_dias_libres") query = query.eq("sin_dias_libres", true);
  if (verActivo === "por_vencer") query = query.gte("dias_demora", -4).lte("dias_demora", -1);
  if (verActivo === "aviso_arribo") {
    const hoy = hoyMexico();
    const d = new Date(`${hoy}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    query = query.gte("eta", hoy).lte("eta", d.toISOString().slice(0, 10));
  }
  if (atdSel.codigos) query = query.in("periodo_atd", atdSel.codigos);
  // Los que llevan más días de atraso primero; luego por siguiente compromiso.
  query = query
    .order("max_dias_atraso", { ascending: false, nullsFirst: false })
    .order("siguiente_fecha", { ascending: true, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  const [{ data, error, count }, { data: ejecutivosData }, { data: puedeEditar }] = await Promise.all([
    query,
    supabase.rpc("operaciones_maritima_ejecutivos", { p_anio: null, p_types: null, p_q: null, p_tarjeta: null, p_hoy: null }),
    supabase.rpc("puedo_editar_cargolink"),
  ]);
  const filas = (data ?? []) as Embarque[];
  const cambios = await cambiosComerciales(supabase, filas.map((f) => f.id_booking));
  // En "Sin días libres" se muestra la propuesta por historial (no guardada).
  const { data: propDias } =
    verActivo === "sin_dias_libres" && filas.length > 0
      ? await supabase.rpc("propuesta_dias_libres", { p_ids: filas.map((f) => f.id_booking) })
      : { data: null };
  const propuestas = (propDias ?? {}) as Record<string, { dias: number; nivel: number; coinciden: number; muestra: number; ultimo: string | null }>;
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const availableEjecutivos = Array.from(
    new Set([SIN_EJECUTIVO, ...((ejecutivosData ?? []) as { ejecutivo: string }[]).map((x) => x.ejecutivo), ...ejecutivoRaw]),
  ).sort((a, b) => (a === SIN_EJECUTIVO ? -1 : b === SIN_EJECUTIVO ? 1 : a.localeCompare(b, "es")));

  const href = (cambios: { etapa?: string | null; page?: number; ver?: null }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const et = cambios.etapa === undefined ? etapaActiva : cambios.etapa;
    if (et) params.set("etapa", et);
    for (const v of ejecutivoEnUrl) params.append("ejecutivo", v);
    for (const v of estatusSel.enUrl) params.append("estatus", v);
    for (const v of atdSel.enUrl) params.append("atd", v);
    if (volver) params.set("volver", volver);
    if (verActivo && cambios.ver !== null) params.set("ver", verActivo);
    if (cambios.page && cambios.page > 1) params.set("page", String(cambios.page));
    const s = params.toString();
    return s ? `?${s}` : "?";
  };
  const pagerClass = (disabled: boolean) =>
    `rounded-md border border-slate-300 px-2 py-1 dark:border-slate-700 ${
      disabled ? "pointer-events-none opacity-40" : "hover:bg-slate-50 dark:hover:bg-slate-800"
    }`;

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <RegresarTablero volver={volver} />
      {verActivo && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200">
            {VER_EMBARQUES[verActivo]}
          </span>
          <Link href={href({ ver: null, page: 1 })} className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400">
            Quitar filtro
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2">
          {etapaActiva && <input type="hidden" name="etapa" value={etapaActiva} />}
          {estatusSel.enUrl.map((v) => (
              <input key={v} type="hidden" name="estatus" value={v} />
            ))}
          {atdSel.enUrl.map((v) => (
            <input key={v} type="hidden" name="atd" value={v} />
          ))}
          {volver && <input type="hidden" name="volver" value={volver} />}
          {verActivo && <input type="hidden" name="ver" value={verActivo} />}
          {ejecutivoEnUrl.map((v) => (
            <input key={v} type="hidden" name="ejecutivo" value={v} />
          ))}
          <label htmlFor="buscar-embarque" className="sr-only">
            Buscar embarque
          </label>
          <input
            id="buscar-embarque"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por booking, cliente o ejecutivo..."
            className="w-72 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Buscar
          </button>
        </form>
        <MultiSelectFilter paramName="atd" label="ATD real" options={PERIODO_ATD_OPCIONES} current={atdSel.seleccion} />
        <MultiSelectFilter paramName="estatus" label="Estatus" options={ESTATUS_OPCIONES} current={estatusSel.seleccion} />
        <TrackEjecutivoFilter
          options={availableEjecutivos}
          filtro={ejecutivoRaw}
          hrefTodos={`?${new URLSearchParams([
            ...(q ? [["q", q]] : []),
            ...(etapaActiva ? [["etapa", etapaActiva]] : []),
            ...estatusSel.enUrl.map((v) => ["estatus", v]),
            ...atdSel.enUrl.map((v) => ["atd", v]),
            ...(volver ? [["volver", volver]] : []),
            ...(verActivo ? [["ver", verActivo]] : []),
            ["ejecutivo", EJECUTIVO_TODOS],
          ]).toString()}`}
        />
        <div role="group" aria-label="Etapa" className="flex flex-wrap gap-1">
          {[null, ...ETAPAS].map((et) => (
            <Link
              key={et ?? "todas"}
              href={href({ etapa: et, page: 1 })}
              aria-current={et === etapaActiva ? "true" : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                et === etapaActiva
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {et ?? "Todas las etapas"}
            </Link>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Error al cargar los datos: {error.message}
        </p>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {["Booking", "Cliente", "Ejecutivo", "Etapa", "ETA", "ATA", "Siguiente hito", "Pendientes", "Semáforo", "Días demora"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="sticky top-0 z-10 whitespace-nowrap bg-slate-100 px-3 py-2.5 font-semibold shadow-[inset_0_-1px_0_rgb(203_213_225)] dark:bg-slate-800 dark:shadow-[inset_0_-1px_0_rgb(51_65_85)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filas.map((f) => {
              const s = ESTADOS[f.semaforo] ?? ESTADOS.en_tiempo;
              return (
                <FilaOperacion key={f.id_booking} idBooking={f.id_booking} className={`hover:bg-blue-50 dark:hover:bg-slate-800 ${claseFilaEstatus(f.status_booking)}`}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                    {f.no_booking}
                    {cambios.has(f.id_booking) && (
                      <span title={cambios.get(f.id_booking)} className="ml-1.5 font-sans text-sm font-bold text-red-700 dark:text-red-400">
                        ⚠<span className="sr-only"> {cambios.get(f.id_booking)}</span>
                      </span>
                    )}
                  </td>
                  <td className="max-w-56 truncate px-3 py-2">{f.cliente ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {f.ejecutivo ??
                      (puedeEditar === true ? (
                        <AsignarEjecutivoBoton idBooking={f.id_booking} noBooking={f.no_booking} />
                      ) : (
                        <span className="font-bold text-red-700 dark:text-red-400">Sin ejecutivo</span>
                      ))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {f.etapa}
                    {f.alerta_dato && (
                      <span className="mt-0.5 block text-xs font-semibold text-amber-700 dark:text-amber-400">⚠ {f.alerta_dato}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fechaCorta(f.eta)}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fechaCorta(f.ata)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {f.siguiente_hito ? `${f.siguiente_hito} · ${fechaCorta(f.siguiente_fecha)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{f.pendientes}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.pill}`}>
                      {s.label}
                      {f.semaforo === "atrasado" && f.max_dias_atraso ? ` · ${f.max_dias_atraso} d` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {propuestas[String(f.id_booking)] ? (
                      <span
                        title={explicarPropuestaDias(propuestas[String(f.id_booking)])}
                        className="whitespace-nowrap rounded border border-dashed border-blue-500 bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200"
                      >
                        Propuesta {propuestas[String(f.id_booking)].dias} d
                      </span>
                    ) : f.dias_demora !== null && f.dias_demora > 0 ? (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">{f.dias_demora}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </FilaOperacion>
              );
            })}
            {filas.length === 0 && !error && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-slate-500">
                  No hay embarques activos con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="h-3" aria-hidden="true" />
      </div>

      {totalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <p>
            Mostrando {from + 1}–{Math.min(from + PAGE_SIZE, totalCount)} de {totalCount} embarques
          </p>
          <div className="flex items-center gap-1">
            <Link href={href({ page: currentPage - 1 })} aria-disabled={currentPage === 1} className={pagerClass(currentPage === 1)}>
              ‹ Anterior
            </Link>
            <span className="px-2">
              Página {currentPage} de {totalPages}
            </span>
            <Link
              href={href({ page: currentPage + 1 })}
              aria-disabled={currentPage >= totalPages}
              className={pagerClass(currentPage >= totalPages)}
            >
              Siguiente ›
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
