import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  deleteImportacion,
  actualizarImportacion,
  previsualizarSincronizacion,
  confirmarSincronizacion,
  obtenerUltimaSincronizacion,
} from "./actions";
import { RowActions } from "@/components/RowActions";
import { UpdateCell } from "@/components/UpdateCell";
import { ClickableRow } from "@/components/ClickableRow";
import { EstatusDropdown } from "@/components/EstatusDropdown";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { SincronizarButton } from "@/components/SincronizarButton";
import { RealtimeRefresher } from "@/components/RealtimeRefresher";
import { getMyPermissions } from "@/lib/permissions";
import { calcularDiasDemoras } from "@/lib/dateLabels";
import type { Importacion } from "@/types/importacion";
import { FIELD_LABELS, LIST_COLUMNS } from "@/types/importacion";

export const dynamic = "force-dynamic";
// "Actualizar referencias" ahora enriquece cada registro insertado
// consultando Cargolink uno por uno (ver confirmarSincronizacion), lo que
// puede tardar bastante más que el resto de las acciones de esta página.
export const maxDuration = 300;

// "created_at" no es una columna visible en la tabla, pero se permite como
// orden para poder mostrar primero lo recién agregado por "Actualizar
// referencias" (ver SincronizarButton).
const SORTABLE_FIELDS = new Set<string>([...LIST_COLUMNS, "created_at"]);
const PAGE_SIZE = 100;

const ESTATUS_ROW_CLASS: Record<string, string> = {
  Finalizado: "bg-green-300 dark:bg-green-800",
  Cancelado: "bg-red-300 dark:bg-red-800",
};

export default async function ImportacionesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    dir?: string;
    estatus?: string | string[];
    pol?: string | string[];
    pod?: string | string[];
    page?: string;
  }>;
}) {
  const { q, sort, dir, estatus, pol, pod, page } = await searchParams;
  const myPermissions = await getMyPermissions();
  const supabase = await createClient();

  const sortField = sort && SORTABLE_FIELDS.has(sort) ? sort : "booking";
  const sortAscending = dir === "asc";

  const estatusRaw = estatus ? (Array.isArray(estatus) ? estatus : [estatus]) : ["Vigente"];
  const isTodosEstatus = estatusRaw.includes("Todos");
  const isNingunoEstatus = estatusRaw.includes("Ninguno");
  const polRaw = pol ? (Array.isArray(pol) ? pol : [pol]) : [];
  const podRaw = pod ? (Array.isArray(pod) ? pod : [pod]) : [];

  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("seguimiento_importaciones")
    .select("*", { count: "exact" })
    .order(sortField, { ascending: sortAscending })
    .range(from, to);

  if (q) {
    query = query.or(
      `booking.ilike.%${q}%,client.ilike.%${q}%,contenedor.ilike.%${q}%,mbl.ilike.%${q}%,hbl.ilike.%${q}%,naviera.ilike.%${q}%,operativo.ilike.%${q}%`,
    );
  }

  if (isNingunoEstatus) {
    // Selección explícita de "ningún estatus" — se fuerza una condición
    // imposible en vez de .in("estatus", []) porque un IN vacío no siempre
    // se traduce de forma confiable a "cero filas" en PostgREST.
    query = query.eq("id", -1);
  } else if (!isTodosEstatus) {
    query = query.in("estatus", estatusRaw);
  }

  if (polRaw.length > 0) {
    query = query.in("pol", polRaw);
  }

  if (podRaw.length > 0) {
    query = query.in("pod", podRaw);
  }

  const { data, error, count } = await query;
  const rows = (data ?? []) as Importacion[];
  for (const row of rows) {
    row.dias_demoras = calcularDiasDemoras(row.ultimo_dia_libre_demoras);
  }
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const ultimaSincronizacionRaw = await obtenerUltimaSincronizacion();
  const ultimaSincronizacion = ultimaSincronizacionRaw
    ? new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Mexico_City",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(ultimaSincronizacionRaw))
    : null;

  // Paginado porque la API recorta a 1000 filas por default y la tabla ya
  // pasó de eso — sin esto, POL/POD de filas más allá de la 1000 no
  // aparecían como opción de filtro.
  const polPodData: { pol: string | null; pod: string | null }[] = [];
  for (let desde = 0; ; desde += 500) {
    const { data } = await supabase
      .from("seguimiento_importaciones")
      .select("pol, pod")
      .range(desde, desde + 499);
    const pagina = data ?? [];
    polPodData.push(...pagina);
    if (pagina.length < 500) break;
  }
  const availablePol = Array.from(
    new Set(polPodData.map((r) => r.pol?.trim()).filter((v): v is string => Boolean(v))),
  ).sort();
  const availablePod = Array.from(
    new Set(polPodData.map((r) => r.pod?.trim()).filter((v): v is string => Boolean(v))),
  ).sort();

  const sortHref = (field: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("sort", field);
    params.set("dir", sort === field && sortAscending ? "desc" : "asc");
    for (const s of estatusRaw) params.append("estatus", s);
    for (const v of polRaw) params.append("pol", v);
    for (const v of podRaw) params.append("pod", v);
    return `?${params.toString()}`;
  };

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    if (dir) params.set("dir", dir);
    for (const s of estatusRaw) params.append("estatus", s);
    for (const v of polRaw) params.append("pol", v);
    for (const v of podRaw) params.append("pod", v);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  const exportParams = new URLSearchParams();
  if (q) exportParams.set("q", q);
  if (sort) exportParams.set("sort", sort);
  if (dir) exportParams.set("dir", dir);
  for (const s of estatusRaw) exportParams.append("estatus", s);
  for (const v of polRaw) exportParams.append("pol", v);
  for (const v of podRaw) exportParams.append("pod", v);
  const exportHref = `/importaciones/export${
    exportParams.toString() ? `?${exportParams.toString()}` : ""
  }`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <RealtimeRefresher table="seguimiento_importaciones" />
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Seguimiento de Importaciones
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex gap-2">
              {estatusRaw.map((s) => (
                <input key={s} type="hidden" name="estatus" value={s} />
              ))}
              <input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Buscar por booking, cliente, contenedor, MBL, HBL, naviera, operativo..."
                className="w-80 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="submit"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Buscar
              </button>
            </form>
            <EstatusDropdown current={estatusRaw} />
            <MultiSelectFilter paramName="pol" label="POL" options={availablePol} current={polRaw} />
            <MultiSelectFilter paramName="pod" label="POD" options={availablePod} current={podRaw} />
          </div>

          <div className="flex items-center gap-2">
            <SincronizarButton
              onPrevisualizar={previsualizarSincronizacion}
              onConfirmar={confirmarSincronizacion}
              rangoLabel="ene 2026 a la fecha"
            />
            {myPermissions.puede_exportar && (
              <a
                href={exportHref}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Exportar
              </a>
            )}
            <Link
              href="/importaciones/nueva"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              + Nuevo registro
            </Link>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            Error al cargar los datos: {error.message}
          </p>
        )}

        <p className="mb-1 text-[10px] text-slate-500 dark:text-slate-400">
          Última actualización de referencias:{" "}
          {ultimaSincronizacion ? (
            <span className="font-medium text-slate-700 dark:text-slate-300">{ultimaSincronizacion}</span>
          ) : (
            "nunca se ha corrido"
          )}
        </p>
        <p className="mb-2 text-[10px] text-slate-400 dark:text-slate-500">
          El resto de la información (Vendedor, Incidencias) se ve al abrir el detalle de la fila.
        </p>

        <div className="max-h-[75vh] overflow-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-[10px] dark:divide-slate-800">
            <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="sticky left-0 z-30 w-8 bg-slate-50 px-2 py-2 dark:bg-slate-800" />
                {LIST_COLUMNS.map((field) => {
                  const isActive = sortField === field;
                  const isBooking = field === "booking";
                  return (
                    <th
                      key={field}
                      className={`whitespace-nowrap px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 ${
                        isBooking ? "sticky left-8 z-30 bg-slate-50 dark:bg-slate-800" : ""
                      }`}
                    >
                      <Link
                        href={sortHref(field)}
                        className={`flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-100 ${
                          isActive ? "text-slate-800 dark:text-slate-100" : ""
                        }`}
                      >
                        {FIELD_LABELS[field] ?? field}
                        <span className="text-[10px] leading-none">
                          {isActive ? (sortAscending ? "▲" : "▼") : "⇅"}
                        </span>
                      </Link>
                    </th>
                  );
                })}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row) => {
                const values = row as unknown as Record<string, string | number | null>;
                const sinOperativo = !row.operativo?.trim();
                const enDemoras = row.dias_demoras !== null && row.dias_demoras >= 0;
                const proximoADemoras =
                  row.dias_demoras !== null && row.dias_demoras > -5 && row.dias_demoras < 0;
                const rowClass =
                  ESTATUS_ROW_CLASS[row.estatus] ??
                  (enDemoras
                    ? "bg-red-300 dark:bg-red-800"
                    : proximoADemoras
                      ? "bg-orange-300 dark:bg-orange-800"
                      : sinOperativo
                        ? "bg-yellow-200 dark:bg-yellow-900"
                        : "");
                const rowBg = rowClass || "bg-white dark:bg-slate-900";
                return (
                  <ClickableRow
                    key={row.id}
                    href={`/importaciones/${row.id}`}
                    className={rowClass}
                  >
                    <UpdateCell id={row.id} onUpdate={actualizarImportacion} stickyBg={rowBg} />
                    {LIST_COLUMNS.map((field) => (
                      <td
                        key={field}
                        className={`whitespace-nowrap px-3 py-1.5 text-slate-700 dark:text-slate-300 ${
                          field === "booking" ? `sticky left-8 z-10 ${rowBg}` : ""
                        }`}
                      >
                        {values[field] ?? "—"}
                      </td>
                    ))}
                    <RowActions
                      id={row.id}
                      onDelete={deleteImportacion}
                      canDelete={myPermissions.puede_borrar}
                    />
                  </ClickableRow>
                );
              })}

              {rows.length === 0 && !error && (
                <tr>
                  <td
                    colSpan={LIST_COLUMNS.length + 2}
                    className="px-3 py-8 text-center text-slate-400 dark:text-slate-500"
                  >
                    No hay registros todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
            <p>
              Mostrando {from + 1}–{Math.min(to + 1, totalCount)} de {totalCount} registros
            </p>
            <div className="flex items-center gap-1">
              <Link
                href={pageHref(1)}
                aria-disabled={currentPage === 1}
                className={`rounded-md border border-slate-300 px-2 py-1 dark:border-slate-700 ${
                  currentPage === 1
                    ? "pointer-events-none opacity-40"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                « Primera
              </Link>
              <Link
                href={pageHref(currentPage - 1)}
                aria-disabled={currentPage === 1}
                className={`rounded-md border border-slate-300 px-2 py-1 dark:border-slate-700 ${
                  currentPage === 1
                    ? "pointer-events-none opacity-40"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                ‹ Anterior
              </Link>
              <span className="px-2">
                Página {currentPage} de {totalPages}
              </span>
              <Link
                href={pageHref(currentPage + 1)}
                aria-disabled={currentPage >= totalPages}
                className={`rounded-md border border-slate-300 px-2 py-1 dark:border-slate-700 ${
                  currentPage >= totalPages
                    ? "pointer-events-none opacity-40"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                Siguiente ›
              </Link>
              <Link
                href={pageHref(totalPages)}
                aria-disabled={currentPage >= totalPages}
                className={`rounded-md border border-slate-300 px-2 py-1 dark:border-slate-700 ${
                  currentPage >= totalPages
                    ? "pointer-events-none opacity-40"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                Última »
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
