import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { FilaOperacion, OperacionDetalleModal } from "@/components/OperacionDetalleModal";
import { YearFilter } from "@/components/YearFilter";
import { EstatusBookingFilter } from "@/components/EstatusBookingFilter";
import { ESTATUS_DEFAULT, claseFilaEstatus, estatusBooking } from "@/lib/track";
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
  { field: "no_booking", label: "Booking" },
  { field: "fecha", label: "Fecha" },
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
// PILOTO de edición en Cargolink: solo administradores (ver
// guardarEtapaCargolink en actions.ts, que lo valida en el servidor).
const EDICION_SOLO_ADMIN = true;

// Tarjetas de la parte superior: cada una (salvo "Total") es un filtro que
// se activa al presionarla y se quita al presionarla de nuevo.
// Colores igual que las tarjetas de las bandejas de Pricing
// (webapp/templates/_tablero_pricing.html).
const TONO = {
  faltante: "bg-linear-to-b from-[#ede9fe] to-white to-70% border-[#c4b5fd]",
  vigente: "bg-linear-to-b from-[#e3f2fd] to-white to-70% border-[#90caf9]",
  curso: "bg-linear-to-b from-[#dbeafe] to-white to-70% border-[#93c5fd]",
  pendiente: "bg-linear-to-b from-[#fef3de] to-white to-70% border-[#f5c58a]",
  perdida: "bg-linear-to-b from-[#fee2e2] to-white to-70% border-[#fca5a5]",
  neutro: "bg-linear-to-b from-[#f1f5f9] to-white to-70% border-[#cbd5e1]",
};

const TARJETAS = [
  { key: "sin_eta", label: "Sin ETA capturada", tono: TONO.faltante },
  { key: "sin_ejecutivo", label: "Sin ejecutivo asignado", tono: TONO.vigente },
  { key: "sin_dias_libres", label: "Sin días libres de demora", tono: TONO.neutro },
  { key: "aviso_arribo", label: "Aviso de arribo (≤ 7 días)", tono: TONO.curso },
  { key: "por_vencer", label: "Por vencer demoras (1–4 días)", tono: TONO.pendiente },
  { key: "demora", label: "Con días de demora", tono: TONO.perdida },
] as const;
type TarjetaKey = (typeof TARJETAS)[number]["key"];
const TARJETA_KEYS = new Set<string>(TARJETAS.map((t) => t.key));

const ETIQUETA_TARJETA =
  "text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400";
const VALOR_TARJETA = "text-[22px] font-extrabold tabular-nums text-slate-900 dark:text-slate-50";

// Línea a la derecha de la columna fija (Booking); con border-collapse un
// border normal no se queda pegado a la celda sticky, una sombra sí.
const COLUMNA_FIJA_BORDE = "shadow-[inset_-1px_0_0_rgb(203_213_225)] dark:shadow-[inset_-1px_0_0_rgb(51_65_85)]";

// Rojo = en demora, ámbar = vence en 0 a 4 días, verde = el vacío regresó
// a tiempo (la vista deja la demora en 0 y ya no la calcula).
function DiasDemora({ valor, regresado }: { valor: number | null; regresado: boolean }) {
  if (valor === null || valor === undefined) return <>—</>;
  if (regresado && valor === 0) {
    return (
      <span className="inline-block rounded bg-green-100 px-1.5 py-0.5 font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">
        Sin demora
      </span>
    );
  }
  const clase =
    valor > 0
      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
      : valor >= -4
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "text-slate-600 dark:text-slate-400";
  return <span className={`inline-block min-w-8 rounded px-1.5 py-0.5 font-semibold ${clase}`}>{valor}</span>;
}

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
    estatus?: string;
    tarjeta?: string;
    page?: string;
  }>;
}) {
  const { q, sort, dir, type, ejecutivo, anio, estatus, tarjeta, page } = await searchParams;
  const estatusSel = estatusBooking(estatus);
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

  // "Con días de demora" y "Por vencer demoras" se ordenan por días de demora
  // de mayor a menor (la más vencida / la más próxima a vencer primero),
  // salvo que el usuario elija otra columna.
  const sortField =
    sort && SORTABLE_FIELDS.has(sort)
      ? sort
      : tarjetaActiva === "demora" || tarjetaActiva === "por_vencer"
        ? "dias_demora"
        : "fecha";
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
    if (estatusSel.codigos) qb = qb.in("status_booking", estatusSel.codigos);
    if (anioFiltro) {
      qb = qb.gte("fecha", `${anioSeleccionado}-01-01`).lte("fecha", `${anioSeleccionado}-12-31`);
    }
    if (filtroTarjeta === "sin_eta") qb = qb.is("eta", null);
    if (filtroTarjeta === "sin_ejecutivo") qb = qb.is("ejecutivo", null);
    // FCL sin días libres capturados (la vista excluye LCL y "No aplica").
    if (filtroTarjeta === "sin_dias_libres") qb = qb.eq("sin_dias_libres", true);
    // Hoy cae entre 7 días antes de la ETA y la ETA misma.
    if (filtroTarjeta === "aviso_arribo") qb = qb.gte("eta", hoy).lte("eta", sumarDias(hoy, 7));
    // Les quedan de 1 a 4 días libres y el vacío no ha regresado.
    if (filtroTarjeta === "por_vencer") {
      qb = qb.gte("dias_demora", -4).lte("dias_demora", -1).is("regreso_vacio", null);
    }
    if (filtroTarjeta === "demora") qb = qb.gt("dias_demora", 0);
    return qb;
  };

  const [{ data, error, count }, ...conteos] = await Promise.all([
    consulta(`id_booking, sincronizado_at, status_booking, ${COLUMNS.map((c) => c.field).join(", ")}`, { count: "exact" }, tarjetaActiva)
      .order(sortField, { ascending: sortAscending, nullsFirst: false })
      .order("id_booking", { ascending: false })
      .range(from, to),
    consulta("id_booking", { count: "exact", head: true }, null),
    ...TARJETAS.map((t) => consulta("id_booking", { count: "exact", head: true }, t.key)),
  ]);
  const [conteoTotal, ...conteoTarjetas] = conteos.map((c) => c.count ?? 0);

  // Solo ejecutivos con bookings bajo los demás filtros activos; los ya
  // seleccionados se conservan para poder quitarlos.
  const { data: ejecutivosData } = await supabase.rpc("operaciones_maritima_ejecutivos_estatus", {
    p_anio: anioFiltro,
    p_types: typeRaw.length > 0 ? typeRaw : null,
    p_q: term || null,
    p_tarjeta: tarjetaActiva,
    p_hoy: hoy,
    p_estatus: estatusSel.codigos,
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
    if (estatusSel.key !== ESTATUS_DEFAULT) params.set("estatus", estatusSel.key);
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

  const tarjetaClass = (activa: boolean, tono = "bg-white border-slate-200") =>
    `flex min-w-0 flex-col justify-between gap-1 rounded-[10px] border px-3 py-2.5 transition-shadow hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-none dark:bg-slate-900 ${tono} ${
      activa ? "border-blue-700! ring-2 ring-blue-700/20" : ""
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
      <OperacionDetalleModal puedeEditar={EDICION_SOLO_ADMIN ? myPermissions.es_admin : true} />
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
        <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Link href={tarjetaHref(null)} className={tarjetaClass(tarjetaActiva === null)}>
            <span className={ETIQUETA_TARJETA}>Bookings totales</span>
            <span className={VALOR_TARJETA}>{conteoTotal}</span>
          </Link>
          {TARJETAS.map((t, i) => (
            <Link key={t.key} href={tarjetaHref(t.key)} className={tarjetaClass(tarjetaActiva === t.key, t.tono)}>
              <span className={ETIQUETA_TARJETA}>{t.label}</span>
              <span className={VALOR_TARJETA}>{conteoTarjetas[i]}</span>
            </Link>
          ))}
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
            {estatusSel.key !== ESTATUS_DEFAULT && <input type="hidden" name="estatus" value={estatusSel.key} />}
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
          <EstatusBookingFilter current={estatusSel.key} />
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

        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Última carga desde Cargolink:{" "}
          {ultimaCarga ? (
            <span className="font-medium text-slate-700 dark:text-slate-300">{ultimaCarga}</span>
          ) : (
            "sin datos"
          )}
        </p>

        <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800">
            {/* sticky va en cada <th> y no en <thead>: Safari dibuja copias
                desfasadas de los títulos con un <thead> sticky al desplazar. */}
            <thead>
              <tr>
                {COLUMNS.map(({ field, label }) => {
                  const isActive = sortField === field;
                  return (
                    <th
                      key={field}
                      className={`sticky top-0 whitespace-nowrap bg-slate-100 px-3 py-2.5 text-left font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300 ${
                        field === "no_booking"
                          ? "left-0 z-30 shadow-[inset_-1px_-1px_0_rgb(203_213_225)] dark:shadow-[inset_-1px_-1px_0_rgb(51_65_85)]"
                          : "z-20 shadow-[inset_0_-1px_0_rgb(203_213_225)] dark:shadow-[inset_0_-1px_0_rgb(51_65_85)]"
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
                <FilaOperacion
                  key={row.id_booking}
                  idBooking={row.id_booking as number}
                  className={`group hover:bg-blue-50 dark:hover:bg-slate-800 ${
                    claseFilaEstatus(row.status_booking) ||
                    "odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-900/60"
                  }`}
                >
                  {COLUMNS.map(({ field }) => (
                    <td
                      key={field}
                      className={`whitespace-nowrap px-3 py-2 text-slate-700 dark:text-slate-300 ${
                        field === "no_booking"
                          ? `sticky left-0 z-10 bg-inherit font-semibold text-slate-900 dark:text-slate-100 ${COLUMNA_FIJA_BORDE}`
                          : ""
                      } ${field === "dias_libres_demora" || field === "dias_demora" ? "text-center" : ""}`}
                    >
                      {field === "dias_demora" ? (
                        <DiasDemora valor={row[field] as number | null} regresado={row.regreso_vacio !== null} />
                      ) : (
                        (row[field] ?? "—")
                      )}
                    </td>
                  ))}
                </FilaOperacion>
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
          {/* Espacio para que la barra de desplazamiento horizontal no tape la última fila. */}
          <div className="h-3" aria-hidden="true" />
        </div>

        {totalCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
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
