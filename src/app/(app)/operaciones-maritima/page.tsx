import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { ClickableRow } from "@/components/ClickableRow";
import { YearFilter } from "@/components/YearFilter";
import { ActualizarMaritimaButton } from "@/components/ActualizarMaritimaButton";
import { getMyPermissions } from "@/lib/permissions";
import { actualizarOperacionesMaritima } from "./actions";

export const dynamic = "force-dynamic";
// "Actualizar" descarga de Cargolink durante ~3-4 min (ver actions.ts).
export const maxDuration = 300;

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
  { field: "dias_libres_demora", label: "Días libres de demoras" },
  { field: "dias_demora", label: "Días demora" },
] as const;

const SORTABLE_FIELDS = new Set<string>(COLUMNS.map((c) => c.field));
const TYPE_OPTIONS = ["FCLI", "LCLI", "FCL", "LCL"];
const PAGE_SIZE = 100;

// Tarjetas de la parte superior: cada una (salvo "Total") es un filtro que
// se activa al presionarla y se quita al presionarla de nuevo.
const TARJETAS = [
  { key: "sin_eta", label: "Sin ETA capturada" },
  { key: "sin_ejecutivo", label: "Sin ejecutivo asignado" },
  { key: "aviso_arribo", label: "Aviso de arribo (ETA en ≤ 7 días)" },
  { key: "demora", label: "Con días de demora" },
] as const;
type TarjetaKey = (typeof TARJETAS)[number]["key"];
const TARJETA_KEYS = new Set<string>(TARJETAS.map((t) => t.key));

function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export default async function OperacionesMaritimaPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    dir?: string;
    type?: string | string[];
    ejecutivo?: string | string[];
    anio?: string;
    tarjeta?: string;
    page?: string;
  }>;
}) {
  const { q, sort, dir, type, ejecutivo, anio, tarjeta, page } = await searchParams;
  const supabase = await createClient();
  const myPermissions = await getMyPermissions();

  // Igual que el dashboard: sin parámetro se muestra el año en curso;
  // "todos" es una elección explícita.
  const anioActual = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
  }).format(new Date());
  const anioSeleccionado = anio ?? anioActual;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  const tarjetaActiva: TarjetaKey | null =
    tarjeta && TARJETA_KEYS.has(tarjeta) ? (tarjeta as TarjetaKey) : null;

  // "Con días de demora" se ordena de mayor a menor demora, salvo que el
  // usuario elija otra columna.
  const sortField =
    sort && SORTABLE_FIELDS.has(sort) ? sort : tarjetaActiva === "demora" ? "dias_demora" : "fecha";
  const sortAscending = sort ? dir === "asc" : false;
  const typeRaw = type ? (Array.isArray(type) ? type : [type]) : [];
  const ejecutivoRaw = ejecutivo ? (Array.isArray(ejecutivo) ? ejecutivo : [ejecutivo]) : [];

  const term = (q ?? "").replace(/[,()]/g, " ").trim();
  const anioFiltro = /^\d{4}$/.test(anioSeleccionado) ? Number(anioSeleccionado) : null;

  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Búsqueda, type y año aplican a la tabla y a los conteos de las tarjetas;
  // la tarjeta activa solo se suma encima.
  const consulta = (
    columnas: string,
    opciones: { count: "exact"; head?: boolean },
    filtroTarjeta: TarjetaKey | null,
  ) => {
    // La vista agrega dias_demora calculado al día de hoy (ver migración
    // operaciones_maritima_dias_demora).
    let qb = supabase.from("operaciones_maritima_vista").select(columnas, opciones);
    if (q) {
      qb = qb.or(
        `no_booking.ilike.%${term}%,cliente.ilike.%${term}%,mbl.ilike.%${term}%,ejecutivo.ilike.%${term}%,contenedores.ilike.%${term}%,agente_extranjero.ilike.%${term}%`,
      );
    }
    if (typeRaw.length > 0) qb = qb.in("type", typeRaw);
    if (ejecutivoRaw.length > 0) qb = qb.in("ejecutivo", ejecutivoRaw);
    if (anioFiltro) {
      qb = qb.gte("fecha", `${anioSeleccionado}-01-01`).lte("fecha", `${anioSeleccionado}-12-31`);
    }
    if (filtroTarjeta === "sin_eta") qb = qb.is("eta", null);
    if (filtroTarjeta === "sin_ejecutivo") qb = qb.is("ejecutivo", null);
    // Hoy cae entre 7 días antes de la ETA y la ETA misma.
    if (filtroTarjeta === "aviso_arribo") qb = qb.gte("eta", hoy).lte("eta", sumarDias(hoy, 7));
    if (filtroTarjeta === "demora") qb = qb.gt("dias_demora", 0);
    return qb;
  };

  const [{ data, error, count }, ...conteos] = await Promise.all([
    consulta(`id_booking, sincronizado_at, ${COLUMNS.map((c) => c.field).join(", ")}`, { count: "exact" }, tarjetaActiva)
      .order(sortField, { ascending: sortAscending, nullsFirst: false })
      .order("id_booking", { ascending: false })
      .range(from, to),
    consulta("id_booking", { count: "exact", head: true }, null),
    ...TARJETAS.map((t) => consulta("id_booking", { count: "exact", head: true }, t.key)),
  ]);
  const [conteoTotal, ...conteoTarjetas] = conteos.map((c) => c.count ?? 0);

  // Solo ejecutivos con bookings bajo los demás filtros activos; los ya
  // seleccionados se conservan para poder quitarlos.
  const { data: ejecutivosData } = await supabase.rpc("operaciones_maritima_ejecutivos", {
    p_anio: anioFiltro,
    p_types: typeRaw.length > 0 ? typeRaw : null,
    p_q: term || null,
    p_tarjeta: tarjetaActiva,
    p_hoy: hoy,
  });
  const availableEjecutivos = Array.from(
    new Set([
      ...((ejecutivosData ?? []) as { ejecutivo: string }[]).map((r) => r.ejecutivo),
      ...ejecutivoRaw,
    ]),
  ).sort((a, b) => a.localeCompare(b, "es"));
  const rows = (data ?? []) as unknown as Record<string, string | number | null>[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const { data: ultima } = await supabase
    .from("operaciones_maritima")
    .select("sincronizado_at")
    .order("sincronizado_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: primera } = await supabase
    .from("operaciones_maritima")
    .select("fecha")
    .not("fecha", "is", null)
    .order("fecha", { ascending: true })
    .limit(1)
    .maybeSingle();
  const primerAnio = Number(primera?.fecha?.slice(0, 4)) || Number(anioActual);
  const availableYears: string[] = [];
  for (let y = Number(anioActual); y >= primerAnio; y--) availableYears.push(String(y));

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
    for (const v of ejecutivoRaw) params.append("ejecutivo", v);
    if (anio) params.set("anio", anio);
    if (tarjetaActiva) params.set("tarjeta", tarjetaActiva);
    return params;
  };

  // Presionar la tarjeta activa la quita; "Total" siempre quita el filtro.
  const tarjetaHref = (key: TarjetaKey | null) => {
    const params = baseParams();
    params.delete("tarjeta");
    if (key && key !== tarjetaActiva) params.set("tarjeta", key);
    const query = params.toString();
    return query ? `?${query}` : "?";
  };

  const tarjetaClass = (activa: boolean) =>
    `block rounded-lg border p-4 transition-colors ${
      activa
        ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
        : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
    }`;

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
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Link href={tarjetaHref(null)} className={tarjetaClass(tarjetaActiva === null)}>
            <p className={`text-xs ${tarjetaActiva === null ? "opacity-80" : "text-slate-500 dark:text-slate-400"}`}>
              Bookings totales
            </p>
            <p className="mt-1 text-3xl font-semibold">{conteoTotal}</p>
          </Link>
          {TARJETAS.map((t, i) => {
            const activa = tarjetaActiva === t.key;
            return (
              <Link key={t.key} href={tarjetaHref(t.key)} className={tarjetaClass(activa)}>
                <p className={`text-xs ${activa ? "opacity-80" : "text-slate-500 dark:text-slate-400"}`}>
                  {t.label}
                </p>
                <p className="mt-1 text-3xl font-semibold">{conteoTarjetas[i]}</p>
              </Link>
            );
          })}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <form className="flex gap-2">
            {typeRaw.map((v) => (
              <input key={v} type="hidden" name="type" value={v} />
            ))}
            {ejecutivoRaw.map((v) => (
              <input key={v} type="hidden" name="ejecutivo" value={v} />
            ))}
            {anio && <input type="hidden" name="anio" value={anio} />}
            {tarjetaActiva && <input type="hidden" name="tarjeta" value={tarjetaActiva} />}
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
          <MultiSelectFilter
            paramName="ejecutivo"
            label="Ejecutivo"
            options={availableEjecutivos}
            current={ejecutivoRaw}
          />
          <YearFilter years={availableYears} currentYear={anioActual} />
          {myPermissions.es_admin && (
            <div className="ml-auto">
              <ActualizarMaritimaButton onActualizar={actualizarOperacionesMaritima} />
            </div>
          )}
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
                <ClickableRow
                  key={row.id_booking}
                  href={`/operaciones-maritima/${row.id_booking}`}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
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
                </ClickableRow>
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
