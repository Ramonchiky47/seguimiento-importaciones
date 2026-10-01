import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";

export const dynamic = "force-dynamic";

// Espejo de Cargolink: Operaciones Importacion > Servicios maritimos. Solo
// lectura — la tabla operaciones_maritima se llena con una carga desde
// Cargolink, no se captura desde aquí.
const COLUMNS = [
  { field: "fecha", label: "Fecha" },
  { field: "no_booking", label: "Booking" },
  { field: "type", label: "Type" },
  { field: "mbl", label: "MBL" },
  { field: "cliente", label: "Cliente" },
  { field: "ejecutivo", label: "Ejecutivo" },
  { field: "servicio", label: "Servicio" },
  { field: "modo_transportacion", label: "Modo de transportación" },
  { field: "pod", label: "POD" },
  { field: "origen", label: "Origen" },
  { field: "destino", label: "Destino" },
  { field: "agente_extranjero", label: "Agente extranjero" },
  { field: "incoterm", label: "Incoterm" },
  { field: "etd_atd", label: "ETD/ATD" },
  { field: "eta", label: "ETA" },
  { field: "ata", label: "ATA" },
  { field: "revalidacion", label: "Revalidación" },
  { field: "telex_house_bl", label: "Telex HBL" },
  { field: "telex_master_bl", label: "Telex MBL" },
  { field: "regreso_vacio", label: "Regreso de vacío" },
  { field: "dias_demora", label: "Días demora" },
] as const;

const SORTABLE_FIELDS = new Set<string>(COLUMNS.map((c) => c.field));
const TYPE_OPTIONS = ["FCLI", "LCLI", "FCL", "LCL"];
const PAGE_SIZE = 100;

export default async function OperacionesMaritimaPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    dir?: string;
    type?: string | string[];
    page?: string;
  }>;
}) {
  const { q, sort, dir, type, page } = await searchParams;
  const supabase = await createClient();

  const sortField = sort && SORTABLE_FIELDS.has(sort) ? sort : "fecha";
  const sortAscending = dir === "asc";
  const typeRaw = type ? (Array.isArray(type) ? type : [type]) : [];

  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("operaciones_maritima")
    .select(
      `id_booking, sincronizado_at, ${COLUMNS.map((c) => c.field).join(", ")}`,
      { count: "exact" },
    )
    .order(sortField, { ascending: sortAscending, nullsFirst: false })
    .order("id_booking", { ascending: false })
    .range(from, to);

  if (q) {
    const term = q.replace(/[,()]/g, " ").trim();
    query = query.or(
      `no_booking.ilike.%${term}%,cliente.ilike.%${term}%,mbl.ilike.%${term}%,ejecutivo.ilike.%${term}%,contenedores.ilike.%${term}%,agente_extranjero.ilike.%${term}%`,
    );
  }

  if (typeRaw.length > 0) {
    query = query.in("type", typeRaw);
  }

  const { data, error, count } = await query;
  const rows = (data ?? []) as unknown as Record<string, string | number | null>[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const { data: ultima } = await supabase
    .from("operaciones_maritima")
    .select("sincronizado_at")
    .order("sincronizado_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ultimaCarga = ultima?.sincronizado_at
    ? new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Mexico_City",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(ultima.sincronizado_at))
    : null;

  const baseParams = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    for (const v of typeRaw) params.append("type", v);
    return params;
  };

  const sortHref = (field: string) => {
    const params = baseParams();
    params.set("sort", field);
    params.set("dir", sortField === field && !sortAscending ? "asc" : "desc");
    return `?${params.toString()}`;
  };

  const pageHref = (p: number) => {
    const params = baseParams();
    if (sort) params.set("sort", sort);
    if (dir) params.set("dir", dir);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  const pagerClass = (disabled: boolean) =>
    `rounded-md border border-slate-300 px-2 py-1 dark:border-slate-700 ${
      disabled ? "pointer-events-none opacity-40" : "hover:bg-slate-50 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Operaciones Marítima
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cargolink · Operaciones Importación › Servicios marítimos
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <form className="flex gap-2">
            {typeRaw.map((v) => (
              <input key={v} type="hidden" name="type" value={v} />
            ))}
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar por booking, cliente, MBL, ejecutivo, contenedor, agente..."
              className="w-80 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Buscar
            </button>
          </form>
          <MultiSelectFilter paramName="type" label="Type" options={TYPE_OPTIONS} current={typeRaw} />
        </div>

        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            Error al cargar los datos: {error.message}
          </p>
        )}

        <p className="mb-2 text-[10px] text-slate-500 dark:text-slate-400">
          Última carga desde Cargolink:{" "}
          {ultimaCarga ? (
            <span className="font-medium text-slate-700 dark:text-slate-300">{ultimaCarga}</span>
          ) : (
            "sin datos"
          )}
        </p>

        <div className="max-h-[75vh] overflow-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-[10px] dark:divide-slate-800">
            <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800">
              <tr>
                {COLUMNS.map(({ field, label }) => {
                  const isActive = sortField === field;
                  return (
                    <th
                      key={field}
                      className={`whitespace-nowrap px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 ${
                        field === "no_booking" ? "sticky left-0 z-30 bg-slate-50 dark:bg-slate-800" : ""
                      }`}
                    >
                      <Link
                        href={sortHref(field)}
                        className={`flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-100 ${
                          isActive ? "text-slate-800 dark:text-slate-100" : ""
                        }`}
                      >
                        {label}
                        <span className="text-[10px] leading-none">
                          {isActive ? (sortAscending ? "▲" : "▼") : "⇅"}
                        </span>
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row) => (
                <tr key={row.id_booking} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  {COLUMNS.map(({ field }) => (
                    <td
                      key={field}
                      className={`whitespace-nowrap px-3 py-1.5 text-slate-700 dark:text-slate-300 ${
                        field === "no_booking"
                          ? "sticky left-0 z-10 bg-white font-medium dark:bg-slate-900"
                          : ""
                      }`}
                    >
                      {row[field] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}

              {rows.length === 0 && !error && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-slate-400 dark:text-slate-500">
                    No hay operaciones con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
            <p>
              Mostrando {from + 1}–{Math.min(to + 1, totalCount)} de {totalCount} operaciones
            </p>
            <div className="flex items-center gap-1">
              <Link href={pageHref(1)} aria-disabled={currentPage === 1} className={pagerClass(currentPage === 1)}>
                « Primera
              </Link>
              <Link
                href={pageHref(currentPage - 1)}
                aria-disabled={currentPage === 1}
                className={pagerClass(currentPage === 1)}
              >
                ‹ Anterior
              </Link>
              <span className="px-2">
                Página {currentPage} de {totalPages}
              </span>
              <Link
                href={pageHref(currentPage + 1)}
                aria-disabled={currentPage >= totalPages}
                className={pagerClass(currentPage >= totalPages)}
              >
                Siguiente ›
              </Link>
              <Link
                href={pageHref(totalPages)}
                aria-disabled={currentPage >= totalPages}
                className={pagerClass(currentPage >= totalPages)}
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
