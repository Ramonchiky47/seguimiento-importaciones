import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { deleteImportacion, actualizarImportacion } from "./actions";
import { RowActions } from "@/components/RowActions";
import { UpdateCell } from "@/components/UpdateCell";
import { ClickableRow } from "@/components/ClickableRow";
import { EstatusDropdown } from "@/components/EstatusDropdown";
import { getMyPermissions } from "@/lib/permissions";
import type { Importacion } from "@/types/importacion";
import { FIELD_LABELS, LIST_COLUMNS } from "@/types/importacion";

export const dynamic = "force-dynamic";

const SORTABLE_FIELDS = new Set<string>(LIST_COLUMNS);
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
    page?: string;
  }>;
}) {
  const { q, sort, dir, estatus, page } = await searchParams;
  const myPermissions = await getMyPermissions();
  const supabase = await createClient();

  const sortField = sort && SORTABLE_FIELDS.has(sort) ? sort : "fecha";
  const sortAscending = dir === "asc";

  const estatusRaw = estatus ? (Array.isArray(estatus) ? estatus : [estatus]) : ["Vigente"];
  const isTodosEstatus = estatusRaw.includes("Todos");

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

  if (!isTodosEstatus) {
    query = query.in("estatus", estatusRaw);
  }

  const { data, error, count } = await query;
  const rows = (data ?? []) as Importacion[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const sortHref = (field: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("sort", field);
    params.set("dir", sort === field && sortAscending ? "desc" : "asc");
    for (const s of estatusRaw) params.append("estatus", s);
    return `?${params.toString()}`;
  };

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    if (dir) params.set("dir", dir);
    for (const s of estatusRaw) params.append("estatus", s);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  const exportParams = new URLSearchParams();
  if (q) exportParams.set("q", q);
  if (sort) exportParams.set("sort", sort);
  if (dir) exportParams.set("dir", dir);
  for (const s of estatusRaw) exportParams.append("estatus", s);
  const exportHref = `/importaciones/export${
    exportParams.toString() ? `?${exportParams.toString()}` : ""
  }`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Seguimiento de Importaciones
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Dashboard
            </Link>
            {(myPermissions.es_admin || myPermissions.puede_operativos) && (
              <Link
                href="/catalogos"
                className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              >
                Catálogos
              </Link>
            )}
            <form action={logout}>
              <button
                type="submit"
                className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
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
          </div>

          <div className="flex items-center gap-2">
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
                const rowBg = ESTATUS_ROW_CLASS[row.estatus] || "bg-white dark:bg-slate-900";
                return (
                  <ClickableRow
                    key={row.id}
                    href={`/importaciones/${row.id}`}
                    className={ESTATUS_ROW_CLASS[row.estatus] ?? ""}
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
