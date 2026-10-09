import Link from "next/link";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { createClient } from "@/lib/supabase/server";
import { TrackEjecutivoFilter } from "@/components/TrackEjecutivoFilter";
import {
  DIAS_REZAGO,
  EJECUTIVO_TODOS,
  ESTATUS_OPCIONES,
  ETIQUETA_TARJETA,
  TONO_TARJETA,
  VALOR_TARJETA,
  claseTarjeta,
  ejecutivosTrack,
  estatusBooking,
} from "@/lib/track";

export const dynamic = "force-dynamic";

const PERIODOS = [
  { key: "7", label: "Semana" },
  { key: "30", label: "Mes" },
  { key: "365", label: "Año" },
];

const ETAPAS = [
  { key: "En origen", color: "bg-slate-400" },
  { key: "En tránsito", color: "bg-blue-700" },
  { key: "En puerto", color: "bg-cyan-700" },
  { key: "En demora", color: "bg-red-700" },
];

const META_A_TIEMPO = 90;

type Resumen = {
  activos: number;
  en_demora: number;
  dias_demora: number;
  falta_dato: number;
  atrasados: number;
  rezago: number;
  etapas: Record<string, number>;
  cumplimiento: { hito: string; total: number; a_tiempo: number }[];
  por_ejecutivo: {
    ejecutivo: string;
    activos: number;
    con_atraso: number;
    dias_demora: number;
    falta_dato: number;
    pct_a_tiempo: number | null;
  }[];
};

export default async function TableroPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; ejecutivo?: string | string[]; estatus?: string | string[] }>;
}) {
  const { periodo, ejecutivo, estatus } = await searchParams;
  const periodoActivo = PERIODOS.some((p) => p.key === periodo) ? (periodo as string) : "30";
  const supabase = await createClient();
  // Operativo con clientes asignados: Track ya viene acotado a sus clientes.
  const { data: restringido } = await supabase.rpc("track_usuario_restringido");
  const { filtro: ejecutivoRaw, enUrl: ejecutivoEnUrl } = ejecutivosTrack(ejecutivo, restringido === true);
  const estatusSel = estatusBooking(estatus);

  const [{ data, error }, { data: ejecutivosData }] = await Promise.all([
    supabase.rpc("track_resumen_estatus", {
      p_dias: Number(periodoActivo),
      p_ejecutivos: ejecutivoRaw.length > 0 ? ejecutivoRaw : null,
      p_estatus: estatusSel.codigos,
    }),
    supabase.rpc("operaciones_maritima_ejecutivos", {
      p_anio: null,
      p_types: null,
      p_q: null,
      p_tarjeta: null,
      p_hoy: null,
    }),
  ]);
  const r = (data ?? null) as Resumen | null;
  const availableEjecutivos = Array.from(
    new Set([...((ejecutivosData ?? []) as { ejecutivo: string }[]).map((x) => x.ejecutivo), ...ejecutivoRaw]),
  ).sort((a, b) => a.localeCompare(b, "es"));

  const periodoHref = (key: string) => {
    const params = new URLSearchParams();
    if (key !== "30") params.set("periodo", key);
    for (const v of ejecutivoEnUrl) params.append("ejecutivo", v);
    for (const v of estatusSel.enUrl) params.append("estatus", v);
    const q = params.toString();
    return q ? `?${q}` : "?";
  };

  // Los enlaces a Mi día / Embarques conservan el ejecutivo elegido.
  const conEjecutivo = (ruta: string) => {
    const [path, query] = ruta.split("?");
    const params = new URLSearchParams(query ?? "");
    for (const v of ejecutivoEnUrl) params.append("ejecutivo", v);
    for (const v of estatusSel.enUrl) params.append("estatus", v);
    const s = params.toString();
    return s ? `${path}?${s}` : path;
  };

  const totalHitos = r?.cumplimiento.reduce((s, c) => s + c.total, 0) ?? 0;
  const aTiempoHitos = r?.cumplimiento.reduce((s, c) => s + c.a_tiempo, 0) ?? 0;
  const pctGeneral = totalHitos > 0 ? Math.round((100 * aTiempoHitos) / totalHitos) : null;
  const maxEtapa = Math.max(1, ...ETAPAS.map((e) => r?.etapas[e.key] ?? 0));

  const kpis = r
    ? [
        { label: "Embarques", valor: r.activos, nota: "Últimos 180 días, sin regreso de vacío", tono: TONO_TARJETA.neutro, href: conEjecutivo("/track/embarques") },
        { label: "Hitos a tiempo", valor: pctGeneral === null ? "—" : `${pctGeneral} %`, nota: `Meta ${META_A_TIEMPO} % · compromisos del periodo`, tono: pctGeneral !== null && pctGeneral >= META_A_TIEMPO ? TONO_TARJETA.azul : TONO_TARJETA.ambar, href: null },
        { label: `Atrasados (≤ ${DIAS_REZAGO} d)`, valor: r.atrasados, nota: "Hitos sin marcar", tono: TONO_TARJETA.rojo, href: conEjecutivo("/track/mi-dia?nivel=atrasado") },
        { label: "En demora", valor: r.en_demora, nota: `${r.dias_demora.toLocaleString("es-MX")} días de demora acumulados`, tono: TONO_TARJETA.rojo, href: conEjecutivo("/track/embarques?etapa=En%20demora") },
        { label: "Falta dato", valor: r.falta_dato, nota: "Embarques sin ETA o días libres", tono: TONO_TARJETA.violeta, href: conEjecutivo("/track/mi-dia?nivel=falta_dato") },
        { label: "Rezago", valor: r.rezago, nota: `Hitos con más de ${DIAS_REZAGO} días sin marcar`, tono: TONO_TARJETA.gris, href: conEjecutivo("/track/mi-dia?nivel=rezago") },
      ]
    : [];

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Periodo" className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
          {PERIODOS.map((p) => (
            <Link
              key={p.key}
              href={periodoHref(p.key)}
              aria-current={p.key === periodoActivo ? "true" : undefined}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold ${
                p.key === periodoActivo
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <MultiSelectFilter paramName="estatus" label="Estatus" options={ESTATUS_OPCIONES} current={estatusSel.seleccion} />
        <TrackEjecutivoFilter
          options={availableEjecutivos}
          filtro={ejecutivoRaw}
          hrefTodos={`?${new URLSearchParams([
            ...(periodoActivo !== "30" ? [["periodo", periodoActivo]] : []),
            ...estatusSel.enUrl.map((v) => ["estatus", v]),
            ["ejecutivo", EJECUTIVO_TODOS],
          ]).toString()}`}
        />
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Error al cargar las estadísticas: {error.message}
        </p>
      )}

      {r && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map((k) =>
              k.href ? (
                <Link key={k.label} href={k.href} className={claseTarjeta(false, k.tono)}>
                  <span className={ETIQUETA_TARJETA}>{k.label}</span>
                  <span className={VALOR_TARJETA}>{k.valor}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{k.nota}</span>
                </Link>
              ) : (
                <div key={k.label} className={claseTarjeta(false, k.tono)}>
                  <span className={ETIQUETA_TARJETA}>{k.label}</span>
                  <span className={VALOR_TARJETA}>{k.valor}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{k.nota}</span>
                </div>
              ),
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Embarques activos por etapa</h2>
              <div className="space-y-3">
                {ETAPAS.map((e) => {
                  const n = r.etapas[e.key] ?? 0;
                  return (
                    <Link
                      key={e.key}
                      href={conEjecutivo(`/track/embarques?etapa=${encodeURIComponent(e.key)}`)}
                      className="grid grid-cols-[110px_minmax(0,1fr)_48px] items-center gap-3 rounded text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span className="text-slate-700 dark:text-slate-300">{e.key}</span>
                      <span className="h-3.5 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                        <span className={`block h-full rounded ${e.color}`} style={{ width: `${(100 * n) / maxEtapa}%` }} />
                      </span>
                      <span className="text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">{n}</span>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Hitos marcados a tiempo en Cargolink</h2>
              <div className="space-y-3">
                {r.cumplimiento.map((c) => {
                  const pct = c.total > 0 ? Math.round((100 * c.a_tiempo) / c.total) : 0;
                  return (
                    <div key={c.hito} className="grid grid-cols-[110px_minmax(0,1fr)_88px] items-center gap-3 text-sm">
                      <span className="text-slate-700 dark:text-slate-300">{c.hito}</span>
                      <span className="h-3.5 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                        <span
                          className={`block h-full rounded ${pct >= META_A_TIEMPO ? "bg-blue-700" : "bg-orange-600"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="text-right tabular-nums text-slate-900 dark:text-slate-100">
                        <span className="font-semibold">{pct} %</span>{" "}
                        <span className="text-xs text-slate-500">
                          {c.a_tiempo}/{c.total}
                        </span>
                      </span>
                    </div>
                  );
                })}
                {r.cumplimiento.length === 0 && (
                  <p className="text-sm text-slate-500">Sin compromisos en el periodo.</p>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Meta {META_A_TIEMPO} %. Naranja: debajo de la meta. Un hito que se hizo pero no se marcó en Cargolink cuenta como no hecho.
              </p>
            </section>
          </div>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-50">
              Carga y cumplimiento por ejecutivo
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Ejecutivo</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Activos</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Con atraso</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Hitos a tiempo</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Días de demora</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">Falta dato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {r.por_ejecutivo.map((e) => (
                    <tr key={e.ejecutivo} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-2.5">
                        {e.ejecutivo === "Sin ejecutivo" ? (
                          <span className="text-slate-500">Sin ejecutivo</span>
                        ) : (
                          <Link
                            href={`/track/mi-dia?ejecutivo=${encodeURIComponent(e.ejecutivo)}${estatusSel.enUrl.map((v) => `&estatus=${encodeURIComponent(v)}`).join("")}`}
                            className="font-medium text-blue-700 hover:underline dark:text-blue-400"
                          >
                            {e.ejecutivo}
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{e.activos}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-red-700 dark:text-red-400">{e.con_atraso}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{e.pct_a_tiempo === null ? "—" : `${e.pct_a_tiempo} %`}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{e.dias_demora.toLocaleString("es-MX")}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{e.falta_dato}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
