import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TrackEjecutivoFilter } from "@/components/TrackEjecutivoFilter";
import { EstatusBookingFilter } from "@/components/EstatusBookingFilter";
import {
  DIAS_REZAGO,
  EJECUTIVO_TODOS,
  ESTADOS,
  ESTATUS_DEFAULT,
  ETIQUETA_TARJETA,
  TONO_TARJETA,
  VALOR_TARJETA,
  claseFilaEstatus,
  claseTarjeta,
  ejecutivosTrack,
  estatusBooking,
  fechaCorta,
  type EstadoHito,
} from "@/lib/track";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

// "pendientes" = lo que requiere acción hoy (sin el rezago de más de
// DIAS_REZAGO días, que va en su propia tarjeta).
const NIVELES = [
  { key: "pendientes", label: "Pendientes", ayuda: "Requieren acción", tono: TONO_TARJETA.neutro },
  { key: "atrasado", label: "Atrasados", ayuda: `Hasta ${DIAS_REZAGO} días`, tono: TONO_TARJETA.rojo },
  { key: "hoy", label: "Vencen hoy", ayuda: "Compromiso de hoy", tono: TONO_TARJETA.ambar },
  { key: "pronto", label: "Próximos 3 días", ayuda: "Para adelantar", tono: TONO_TARJETA.azul },
  { key: "falta_dato", label: "Falta dato", ayuda: "Sin ETA o días libres", tono: TONO_TARJETA.violeta },
  { key: "rezago", label: "Rezago", ayuda: `Atraso de más de ${DIAS_REZAGO} días`, tono: TONO_TARJETA.gris },
] as const;
type Nivel = (typeof NIVELES)[number]["key"];
const NIVEL_KEYS = new Set<string>(NIVELES.map((n) => n.key));

type Hito = {
  id_booking: number;
  no_booking: string;
  cliente: string | null;
  ejecutivo: string | null;
  eta: string | null;
  orden: number;
  hito: string;
  regla: string;
  fecha_plan: string | null;
  estado: EstadoHito;
  dias_atraso: number | null;
  status_booking: string | null;
};

export default async function MiDiaPage({
  searchParams,
}: {
  searchParams: Promise<{ nivel?: string; ejecutivo?: string | string[]; estatus?: string; page?: string }>;
}) {
  const { nivel, ejecutivo, estatus, page } = await searchParams;
  const nivelActivo: Nivel = nivel && NIVEL_KEYS.has(nivel) ? (nivel as Nivel) : "pendientes";
  const { filtro: ejecutivoRaw, enUrl: ejecutivoEnUrl } = ejecutivosTrack(ejecutivo);
  const estatusSel = estatusBooking(estatus);
  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;

  const supabase = await createClient();

  const consulta = (columnas: string, opciones: { count: "exact"; head?: boolean }, n: Nivel) => {
    let qb = supabase.from("track_hitos").select(columnas, opciones);
    if (ejecutivoRaw.length > 0) qb = qb.in("ejecutivo", ejecutivoRaw);
    if (estatusSel.codigos) qb = qb.in("status_booking", estatusSel.codigos);
    if (n === "pendientes") {
      qb = qb.or(`estado.in.(hoy,pronto,falta_dato),and(estado.eq.atrasado,dias_atraso.lte.${DIAS_REZAGO})`);
    } else if (n === "atrasado") {
      qb = qb.eq("estado", "atrasado").lte("dias_atraso", DIAS_REZAGO);
    } else if (n === "rezago") {
      qb = qb.eq("estado", "atrasado").gt("dias_atraso", DIAS_REZAGO);
    } else {
      qb = qb.eq("estado", n);
    }
    return qb;
  };

  let lista = consulta(
    "id_booking, no_booking, cliente, ejecutivo, eta, orden, hito, regla, fecha_plan, estado, dias_atraso, status_booking",
    { count: "exact" },
    nivelActivo,
  );
  // Lo más urgente primero: atrasos más viejos (o el rezago más largo), luego
  // hoy, próximos y al final lo que no tiene fecha (falta dato).
  lista =
    nivelActivo === "rezago"
      ? lista.order("dias_atraso", { ascending: false })
      : lista.order("fecha_plan", { ascending: true, nullsFirst: false });
  lista = lista.order("no_booking").order("orden").range(from, from + PAGE_SIZE - 1);

  const [{ data, error, count }, ...conteos] = await Promise.all([
    lista,
    ...NIVELES.map((n) => consulta("id_booking", { count: "exact", head: true }, n.key)),
  ]);
  const filas = (data ?? []) as unknown as Hito[];
  const totales = conteos.map((c) => c.count ?? 0);
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const { data: ejecutivosData } = await supabase.rpc("operaciones_maritima_ejecutivos", {
    p_anio: null,
    p_types: null,
    p_q: null,
    p_tarjeta: null,
    p_hoy: null,
  });
  const availableEjecutivos = Array.from(
    new Set([...((ejecutivosData ?? []) as { ejecutivo: string }[]).map((r) => r.ejecutivo), ...ejecutivoRaw]),
  ).sort((a, b) => a.localeCompare(b, "es"));

  const href = (cambios: { nivel?: Nivel; page?: number }) => {
    const params = new URLSearchParams();
    const n = cambios.nivel ?? nivelActivo;
    if (n !== "pendientes") params.set("nivel", n);
    for (const v of ejecutivoEnUrl) params.append("ejecutivo", v);
    if (estatusSel.key !== ESTATUS_DEFAULT) params.set("estatus", estatusSel.key);
    if (cambios.page && cambios.page > 1) params.set("page", String(cambios.page));
    const q = params.toString();
    return q ? `?${q}` : "?";
  };

  const hrefTodos = `?${new URLSearchParams([
    ...(nivelActivo !== "pendientes" ? [["nivel", nivelActivo]] : []),
    ...(estatusSel.key !== ESTATUS_DEFAULT ? [["estatus", estatusSel.key]] : []),
            ["ejecutivo", EJECUTIVO_TODOS],
  ]).toString()}`;

  const tituloLista = NIVELES.find((n) => n.key === nivelActivo)?.label ?? "Pendientes";
  const pagerClass = (disabled: boolean) =>
    `rounded-md border border-slate-300 px-2 py-1 dark:border-slate-700 ${
      disabled ? "pointer-events-none opacity-40" : "hover:bg-slate-50 dark:hover:bg-slate-800"
    }`;

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Solo lo que requiere acción. Un hito sale de la lista cuando se marca en Cargolink.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <EstatusBookingFilter current={estatusSel.key} />
          <TrackEjecutivoFilter options={availableEjecutivos} filtro={ejecutivoRaw} hrefTodos={hrefTodos} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {NIVELES.map((n, i) => (
          <Link key={n.key} href={href({ nivel: n.key })} className={claseTarjeta(nivelActivo === n.key, n.tono)}>
            <span className={ETIQUETA_TARJETA}>{n.label}</span>
            <span className={VALOR_TARJETA}>{totales[i]}</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">{n.ayuda}</span>
          </Link>
        ))}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Error al cargar los datos: {error.message}
        </p>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{tituloLista}</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {totalCount} {totalCount === 1 ? "hito" : "hitos"}
          </span>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {filas.map((f) => {
            const e = ESTADOS[f.estado] ?? ESTADOS.en_tiempo;
            return (
              <li
                key={`${f.id_booking}-${f.orden}`}
                className={`${claseFilaEstatus(f.status_booking)} grid grid-cols-[6px_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-4 py-3 pr-4 text-sm sm:grid-cols-[6px_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)]`}
              >
                <span className={`self-stretch ${e.barra}`} aria-hidden="true" />
                <div className="min-w-0">
                  <Link
                    href={`/track/embarques/${f.id_booking}`}
                    className="font-mono text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {f.no_booking}
                  </Link>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{f.cliente ?? "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{f.hito}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {f.regla} · ETA {fechaCorta(f.eta)}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.pill}`}>{e.label}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {f.fecha_plan ? `Compromiso ${fechaCorta(f.fecha_plan)}` : "Sin fecha compromiso"}
                    {f.dias_atraso ? ` · ${f.dias_atraso} d de atraso` : ""}
                  </span>
                </div>
                <p className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">{f.ejecutivo ?? "Sin ejecutivo"}</p>
              </li>
            );
          })}
          {filas.length === 0 && !error && (
            <li className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Nada pendiente en esta categoría.</li>
          )}
        </ul>
      </section>

      {totalCount > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <p>
            Mostrando {from + 1}–{Math.min(from + PAGE_SIZE, totalCount)} de {totalCount}
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
