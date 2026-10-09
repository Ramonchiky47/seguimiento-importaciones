import { Fragment } from "react";
import Link from "next/link";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { createClient } from "@/lib/supabase/server";
import { TrackEjecutivoFilter } from "@/components/TrackEjecutivoFilter";
import { AbrirOperacionBoton } from "@/components/OperacionDetalleModal";
import {
  DIAS_REZAGO,
  EJECUTIVO_TODOS,
  ESTADOS,
  ESTATUS_OPCIONES,
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

const PAGE_SIZE = 50;

// "pendientes" = lo que requiere acción hoy (sin el rezago de más de
// DIAS_REZAGO días, que va en su propia tarjeta).
const NIVELES = [
  { key: "pendientes", label: "Pendientes", ayuda: "Referencias que requieren acción", tono: TONO_TARJETA.neutro },
  { key: "atrasado", label: "Atrasados", ayuda: `Hasta ${DIAS_REZAGO} días`, tono: TONO_TARJETA.rojo },
  { key: "hoy", label: "Vencen hoy", ayuda: "Compromiso de hoy", tono: TONO_TARJETA.ambar },
  { key: "pronto", label: "Próximos 3 días", ayuda: "Para adelantar", tono: TONO_TARJETA.azul },
  { key: "falta_dato", label: "Falta dato", ayuda: "Sin ETA o días libres", tono: TONO_TARJETA.violeta },
  { key: "rezago", label: "Rezago", ayuda: `Atraso de más de ${DIAS_REZAGO} días`, tono: TONO_TARJETA.gris },
] as const;
type Nivel = (typeof NIVELES)[number]["key"];
const NIVEL_KEYS = new Set<string>(NIVELES.map((n) => n.key));

// Un renglón por booking con sus hitos pendientes del nivel elegido
// (función track_mi_dia; los conteos son referencias distintas).
type HitoPendiente = {
  orden: number;
  hito: string;
  regla: string;
  fecha_plan: string | null;
  estado: EstadoHito;
  dias_atraso: number | null;
};
type Grupo = {
  // atrasado | hoy | pronto | falta_dato | rezago
  seccion: string;
  id_booking: number;
  no_booking: string;
  cliente: string | null;
  ejecutivo: string | null;
  eta: string | null;
  status_booking: string | null;
  max_dias_atraso: number | null;
  hitos: HitoPendiente[];
};
type MiDia = { conteos: Record<string, number>; total: number; filas: Grupo[] };

// Encabezado de cada sección de la lista, en orden de urgencia.
const SECCIONES: Record<string, string> = {
  atrasado: "Atrasados",
  hoy: "Vencen hoy",
  pronto: "Próximos 3 días",
  falta_dato: "Falta dato",
  rezago: `Rezago (más de ${DIAS_REZAGO} días)`,
};

export default async function MiDiaPage({
  searchParams,
}: {
  searchParams: Promise<{ nivel?: string; ejecutivo?: string | string[]; estatus?: string | string[]; page?: string }>;
}) {
  const { nivel, ejecutivo, estatus, page } = await searchParams;
  const nivelActivo: Nivel = nivel && NIVEL_KEYS.has(nivel) ? (nivel as Nivel) : "pendientes";
  const supabase = await createClient();
  // Operativo con clientes asignados: Track ya viene acotado a sus clientes.
  const { data: restringido } = await supabase.rpc("track_usuario_restringido");
  const { filtro: ejecutivoRaw, enUrl: ejecutivoEnUrl } = ejecutivosTrack(ejecutivo, restringido === true);
  const estatusSel = estatusBooking(estatus);
  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;


  const { data, error } = await supabase.rpc("track_mi_dia", {
    p_ejecutivos: ejecutivoRaw.length > 0 ? ejecutivoRaw : null,
    p_estatus: estatusSel.codigos,
    p_nivel: nivelActivo,
    p_limit: PAGE_SIZE,
    p_offset: from,
  });
  const resultado = (data ?? { conteos: {}, total: 0, filas: [] }) as MiDia;
  const filas = resultado.filas;
  const totales = NIVELES.map((n) => resultado.conteos[n.key] ?? 0);
  const totalCount = resultado.total;
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
    for (const v of estatusSel.enUrl) params.append("estatus", v);
    if (cambios.page && cambios.page > 1) params.set("page", String(cambios.page));
    const q = params.toString();
    return q ? `?${q}` : "?";
  };

  const hrefTodos = `?${new URLSearchParams([
    ...(nivelActivo !== "pendientes" ? [["nivel", nivelActivo]] : []),
    ...estatusSel.enUrl.map((v) => ["estatus", v]),
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
          <MultiSelectFilter paramName="estatus" label="Estatus" options={ESTATUS_OPCIONES} current={estatusSel.seleccion} />
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
            {resultado.conteos[nivelActivo] ?? 0} {(resultado.conteos[nivelActivo] ?? 0) === 1 ? "referencia" : "referencias"}
          </span>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {filas.map((f, i) => {
            const peor = ESTADOS[(f.seccion === "rezago" ? "atrasado" : f.seccion) as EstadoHito] ?? ESTADOS.en_tiempo;
            const nuevaSeccion = i === 0 || filas[i - 1].seccion !== f.seccion;
            return (
              <Fragment key={`${f.seccion}-${f.id_booking}`}>
              {nuevaSeccion && (
                <li className="flex items-center justify-between gap-2 bg-slate-50 px-4 py-2 dark:bg-slate-800/60">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    {SECCIONES[f.seccion] ?? f.seccion}
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {resultado.conteos[f.seccion] ?? 0} {(resultado.conteos[f.seccion] ?? 0) === 1 ? "referencia" : "referencias"}
                  </span>
                </li>
              )}
              <li
                className={`${claseFilaEstatus(f.status_booking)} grid grid-cols-[6px_minmax(0,1fr)_minmax(0,2.2fr)] gap-4 py-3 pr-4 text-sm sm:grid-cols-[6px_minmax(0,1fr)_minmax(0,2.2fr)_minmax(0,0.6fr)]`}
              >
                <span className={`self-stretch ${peor.barra}`} aria-hidden="true" />
                <div className="min-w-0">
                  <AbrirOperacionBoton
                    idBooking={f.id_booking}
                    className="text-left font-mono text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {f.no_booking}
                  </AbrirOperacionBoton>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{f.cliente ?? "—"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ETA {fechaCorta(f.eta)} · {f.hitos.length} {f.hitos.length === 1 ? "pendiente" : "pendientes"}
                  </p>
                </div>
                <ul className="min-w-0 space-y-1.5">
                  {f.hitos.map((h) => {
                    const e = ESTADOS[h.estado] ?? ESTADOS.en_tiempo;
                    return (
                      <li
                        key={h.orden}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-white/70 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900/60"
                      >
                        <span className="min-w-36 font-semibold text-slate-900 dark:text-slate-100">{h.hito}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.pill}`}>
                          {e.label}
                          {h.dias_atraso ? ` · ${h.dias_atraso} d` : ""}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {h.fecha_plan ? `Compromiso ${fechaCorta(h.fecha_plan)}` : "Sin fecha compromiso"} · {h.regla}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">{f.ejecutivo ?? "Sin ejecutivo"}</p>
              </li>
              </Fragment>
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
