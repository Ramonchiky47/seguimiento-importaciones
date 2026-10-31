import { Fragment } from "react";
import Link from "next/link";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { createClient } from "@/lib/supabase/server";
import { TrackEjecutivoFilter } from "@/components/TrackEjecutivoFilter";
import { CreditoBadge } from "@/components/CreditoBadge";
import { creditoPorBooking } from "@/lib/credito";
import { AbrirOperacionBoton } from "@/components/OperacionDetalleModal";
import { RegresarTablero } from "@/components/RegresarTablero";
import { BuscadorTrack } from "@/components/BuscadorTrack";
import { FilasTarjetas, type FilaTarjetas } from "@/components/FilasTarjetas";
import {
  DIAS_REZAGO,
  EJECUTIVO_TODOS,
  SIN_EJECUTIVO,
  ESTADOS,
  ESTATUS_OPCIONES,
  ESTATUS_TRACK,
  TONO_TARJETA,
  type ConteosTrack,
  cambiosComerciales,
  claseFilaEstatus,
  ejecutivosTrack,
  estatusBooking,
  periodoAtd,
  PERIODO_ATD_OPCIONES,
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
  searchParams: Promise<{ nivel?: string; ejecutivo?: string | string[]; estatus?: string | string[]; atd?: string | string[]; page?: string; volver?: string; q?: string }>;
}) {
  const { nivel, ejecutivo, estatus, atd, page, volver, q } = await searchParams;
  // Búsqueda parcial por booking, cliente o ejecutivo.
  const busqueda = (q ?? "").replace(/[,()%]/g, " ").trim();
  const nivelActivo: Nivel = nivel && NIVEL_KEYS.has(nivel) ? (nivel as Nivel) : "pendientes";
  const supabase = await createClient();
  const { filtro: ejecutivoRaw, enUrl: ejecutivoEnUrl } = ejecutivosTrack(ejecutivo);
  const estatusSel = estatusBooking(estatus, ESTATUS_TRACK);
  const atdSel = periodoAtd(atd);
  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;


  const filtrosTrack = {
    p_ejecutivos: ejecutivoRaw.length > 0 ? ejecutivoRaw : null,
    p_estatus: estatusSel.codigos,
    p_atd: atdSel.codigos,
  };

  // Por zarpar sin nada vencido: sin ATD ni ETA todavía no generan
  // compromisos, así que no salen arriba; se listan al final.
  let porZarparQuery = supabase
    .from("track_embarques")
    .select("id_booking, no_booking, cliente, ejecutivo, fecha, status_booking", { count: "exact" })
    .eq("etapa", "Por zarpar")
    .eq("semaforo", "en_tiempo");
  if (ejecutivoRaw.length > 0) {
    const nombres = ejecutivoRaw.filter((e) => e !== SIN_EJECUTIVO);
    const condiciones = [
      ...(nombres.length > 0 ? [`ejecutivo.in.(${nombres.map((e) => `"${e.replace(/"/g, "")}"`).join(",")})`] : []),
      ...(ejecutivoRaw.includes(SIN_EJECUTIVO) ? ["ejecutivo.is.null"] : []),
    ];
    porZarparQuery = porZarparQuery.or(condiciones.join(","));
  }
  if (estatusSel.codigos) porZarparQuery = porZarparQuery.in("status_booking", estatusSel.codigos);
  if (atdSel.codigos) porZarparQuery = porZarparQuery.in("periodo_atd", atdSel.codigos);
  if (busqueda) {
    porZarparQuery = porZarparQuery.or(
      `no_booking.ilike.%${busqueda}%,cliente.ilike.%${busqueda}%,ejecutivo.ilike.%${busqueda}%`,
    );
  }

  // Todas las consultas a la vez: la página tarda lo que la más lenta, no la suma.
  const [
    { data, error },
    { data: conteosData },
    { data: viajesData },
    { data: propuestasData },
    { data: vaciosData },
    { data: porZarparData, count: porZarparCount },
    { data: ejecutivosData },
  ] = await Promise.all([
    supabase.rpc("track_mi_dia_q", { ...filtrosTrack, p_q: busqueda || null, p_nivel: nivelActivo, p_limit: PAGE_SIZE, p_offset: from }),
    supabase.rpc("track_conteos_q", { ...filtrosTrack, p_q: busqueda || null }),
    supabase.rpc("track_viajes", filtrosTrack),
    supabase.rpc("track_propuestas_v2", filtrosTrack),
    supabase.rpc("track_vacios", filtrosTrack),
    porZarparQuery.order("fecha", { ascending: true, nullsFirst: false }).limit(200),
    supabase.rpc("operaciones_maritima_ejecutivos", { p_anio: null, p_types: null, p_q: null, p_tarjeta: null, p_hoy: null }),
  ]);
  const resultado = (data ?? { conteos: {}, total: 0, filas: [] }) as MiDia;
  const c = (conteosData ?? null) as ConteosTrack | null;
  const totalPropuestas = ((propuestasData ?? []) as unknown[]).length;
  const vaciosAtencion = ((vaciosData ?? []) as { estado: string }[]).filter((v) => v.estado !== "en_tiempo").length;
  const viajesPendientes = ((viajesData ?? []) as { distintas: boolean; faltan: number }[]).filter((v) => v.distintas || v.faltan > 0).length;
  const porZarpar = (porZarparData ?? []) as {
    id_booking: number;
    no_booking: string;
    cliente: string | null;
    ejecutivo: string | null;
    fecha: string | null;
    status_booking: string | null;
  }[];
  const filas = resultado.filas;
  const [cambios, credito] = await Promise.all([
    cambiosComerciales(supabase, filas.map((f) => f.id_booking)),
    creditoPorBooking(supabase, filas.map((f) => f.id_booking)),
  ]);
  const totales = NIVELES.map((n) => resultado.conteos[n.key] ?? 0);
  const totalCount = resultado.total;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const availableEjecutivos = Array.from(
    new Set([SIN_EJECUTIVO, ...((ejecutivosData ?? []) as { ejecutivo: string }[]).map((r) => r.ejecutivo), ...ejecutivoRaw]),
  ).sort((a, b) => (a === SIN_EJECUTIVO ? -1 : b === SIN_EJECUTIVO ? 1 : a.localeCompare(b, "es")));

  const href = (cambios: { nivel?: Nivel; page?: number }) => {
    const params = new URLSearchParams();
    const n = cambios.nivel ?? nivelActivo;
    if (n !== "pendientes") params.set("nivel", n);
    for (const v of ejecutivoEnUrl) params.append("ejecutivo", v);
    for (const v of estatusSel.enUrl) params.append("estatus", v);
    for (const v of atdSel.enUrl) params.append("atd", v);
    if (volver) params.set("volver", volver);
    if (busqueda) params.set("q", busqueda);
    if (cambios.page && cambios.page > 1) params.set("page", String(cambios.page));
    const q = params.toString();
    return q ? `?${q}` : "?";
  };

  const hrefTodos = `?${new URLSearchParams([
    ...(nivelActivo !== "pendientes" ? [["nivel", nivelActivo]] : []),
    ...estatusSel.enUrl.map((v) => ["estatus", v]),
    ...atdSel.enUrl.map((v) => ["atd", v]),
    ...(volver ? [["volver", volver]] : []),
    ...(busqueda ? [["q", busqueda]] : []),
            ["ejecutivo", EJECUTIVO_TODOS],
  ]).toString()}`;

  // Tarjetas por embarque: abren Embarques con los mismos filtros.
  const embarquesHref = (ruta: string, ejecutivos: string[] = ejecutivoEnUrl) => {
    const [path, query] = ruta.split("?");
    const params = new URLSearchParams(query ?? "");
    for (const v of ejecutivos) params.append("ejecutivo", v);
    for (const v of estatusSel.enUrl) params.append("estatus", v);
    for (const v of atdSel.enUrl) params.append("atd", v);
    if (busqueda) params.set("q", busqueda);
    return `${path}?${params.toString()}`;
  };
  const totalNivel = (key: Nivel) => totales[NIVELES.findIndex((n) => n.key === key)] ?? 0;
  // Cuatro filas en el orden en que se revisa la operación: dinero en riesgo,
  // compromisos, flujo del embarque y calidad de captura.
  const nivelCard = (k: Nivel, label: string, nota: string, tono: string) => ({
    key: k,
    label,
    valor: totalNivel(k),
    nota,
    tono,
    href: href({ nivel: k }),
    activa: nivelActivo === k,
  });
  const filasTarjetas: FilaTarjetas[] = [
    {
      titulo: "¿Perdemos dinero?",
      tarjetas: [
        { key: "en_demora", label: "En demora", valor: c?.en_demora ?? 0, nota: "Días libres agotados", tono: TONO_TARJETA.rojo, href: embarquesHref("/track/embarques?etapa=En%20demora") },
        { key: "por_vencer", label: "Por vencer demoras", valor: c?.por_vencer ?? 0, nota: "Le quedan 1 a 4 días libres", tono: TONO_TARJETA.ambar, href: embarquesHref("/track/embarques?ver=por_vencer") },
        { key: "sin_dias", label: "Sin días libres (ya arribó)", valor: c?.sin_dias_arribo ?? 0, nota: "Arribó y no se capturaron", tono: TONO_TARJETA.rojo, href: embarquesHref("/track/embarques?ver=sin_dias_arribo") },
        { key: "vacios", label: "Vacíos por regresar", valor: vaciosAtencion, nota: "En demora, por vencer o ya deberían haber regresado", tono: TONO_TARJETA.rojo, href: embarquesHref("/track/propuestas#vacios") },
      ],
    },
    {
      titulo: "¿Cumplimos hoy?",
      tarjetas: [
        nivelCard("atrasado", "Atrasados", `Hasta ${DIAS_REZAGO} días`, TONO_TARJETA.rojo),
        nivelCard("hoy", "Vencen hoy", "Compromiso de hoy", TONO_TARJETA.ambar),
        nivelCard("pronto", "Próximos 3 días", "Para adelantar", TONO_TARJETA.azul),
        nivelCard("rezago", "Rezago", `Más de ${DIAS_REZAGO} días sin marcar`, TONO_TARJETA.gris),
      ],
    },
    {
      titulo: "¿Dónde van los embarques?",
      tarjetas: [
        { key: "por_zarpar", label: "Por zarpar", valor: c?.por_zarpar ?? 0, nota: "Sin ATD real · al final", tono: TONO_TARJETA.gris, href: "#por-zarpar" },
        { key: "en_transito", label: "En tránsito", valor: c?.en_transito ?? 0, nota: "Zarpó y no ha arribado", tono: TONO_TARJETA.azul, href: embarquesHref(`/track/embarques?etapa=${encodeURIComponent("En tránsito")}`) },
        { key: "llegan", label: "Llegan en 7 días", valor: c?.aviso_arribo ?? 0, nota: "ETA en los próximos 7 días", tono: TONO_TARJETA.azul, href: embarquesHref("/track/embarques?ver=aviso_arribo") },
        { key: "en_puerto", label: "En puerto", valor: c?.en_puerto ?? 0, nota: "Arribó, con días libres", tono: TONO_TARJETA.gris, href: embarquesHref("/track/embarques?etapa=En%20puerto") },
      ],
    },
    {
      titulo: "¿La captura está bien?",
      tarjetas: [
        { key: "por_corregir", label: "Datos por corregir", valor: c?.por_corregir ?? 0, nota: "Captura pendiente o inconsistente", tono: TONO_TARJETA.violeta, href: embarquesHref(`/track/embarques?etapa=${encodeURIComponent("Dato por corregir")}`) },
        { key: "sin_eta", label: "Zarpó sin ETA", valor: c?.sin_eta_zarpo ?? 0, nota: "Ya zarpó y no tiene ETA", tono: TONO_TARJETA.violeta, href: embarquesHref("/track/embarques?ver=sin_eta_zarpo") },
        { key: "por_asignar", label: "Por asignar", valor: c?.por_asignar ?? 0, nota: "Sin ejecutivo en Cargolink", tono: TONO_TARJETA.azul, href: embarquesHref("/track/embarques", [SIN_EJECUTIVO]) },
        { key: "propuestas", label: "Propuestas por confirmar", valor: totalPropuestas, nota: "Listas por historial", tono: TONO_TARJETA.azul, href: embarquesHref("/track/propuestas") },
      ],
    },
  ];
  const resumenTarjetas = (
    <>
      <strong>{(c?.embarques ?? 0).toLocaleString("es-MX")}</strong> embarques ·{" "}
      <Link href={href({ nivel: "pendientes" })} className="font-semibold text-blue-700 hover:underline dark:text-blue-400">
        {totalNivel("pendientes")} requieren acción
      </Link>{" "}
      · <strong className={(c?.en_demora ?? 0) + (c?.por_vencer ?? 0) > 0 ? "text-red-700 dark:text-red-400" : ""}>
        {(c?.en_demora ?? 0) + (c?.por_vencer ?? 0)} en riesgo de demora
      </strong>
    </>
  );

  const tituloLista = NIVELES.find((n) => n.key === nivelActivo)?.label ?? "Pendientes";
  const pagerClass = (disabled: boolean) =>
    `rounded-md border border-slate-300 px-2 py-1 dark:border-slate-700 ${
      disabled ? "pointer-events-none opacity-40" : "hover:bg-slate-50 dark:hover:bg-slate-800"
    }`;

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-6 py-6">
      <RegresarTablero volver={volver} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Solo lo que requiere acción. Un hito sale de la lista cuando se marca en Cargolink.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <MultiSelectFilter paramName="atd" label="ATD real" options={PERIODO_ATD_OPCIONES} current={atdSel.seleccion} />
          <MultiSelectFilter paramName="estatus" label="Estatus" options={ESTATUS_OPCIONES} current={estatusSel.seleccion} />
          <TrackEjecutivoFilter options={availableEjecutivos} filtro={ejecutivoRaw} hrefTodos={hrefTodos} />
          <BuscadorTrack />
          <Link
            href={embarquesHref("/track/interactivo")}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[#16232f] px-3 text-sm font-semibold text-white hover:bg-[#22364a] dark:bg-slate-100 dark:text-slate-900"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 12h3l2-5 4 10 2-5h5" />
            </svg>
            Vista interactiva
          </Link>
        </div>
      </div>

      <FilasTarjetas resumen={resumenTarjetas} filas={filasTarjetas} />

      {viajesPendientes > 0 && (
        <Link
          href={embarquesHref("/track/viajes")}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
        >
          <span>
            <strong>
              {viajesPendientes} {viajesPendientes === 1 ? "viaje" : "viajes"}
            </strong>{" "}
            con ATD, ETA o ATA por capturar o distintas entre bookings del mismo buque.
          </span>
          <span className="font-semibold">Capturar por viaje →</span>
        </Link>
      )}

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
                <li data-encabezado={f.seccion} className="flex items-center justify-between gap-2 bg-slate-50 px-4 py-2 dark:bg-slate-800/60">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    {SECCIONES[f.seccion] ?? f.seccion}
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {resultado.conteos[f.seccion] ?? 0} {(resultado.conteos[f.seccion] ?? 0) === 1 ? "referencia" : "referencias"}
                  </span>
                </li>
              )}
              <li
                data-buscar={`${f.no_booking} ${f.cliente ?? ""} ${f.ejecutivo ?? "Sin ejecutivo"}`}
                data-seccion={f.seccion}
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
                  {cambios.has(f.id_booking) && (
                    <span title={cambios.get(f.id_booking)} className="ml-1.5 text-sm font-bold text-red-700 dark:text-red-400">
                      ⚠<span className="sr-only"> {cambios.get(f.id_booking)}</span>
                    </span>
                  )}
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{f.cliente ?? "—"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ETA {fechaCorta(f.eta)} · {f.hitos.length} {f.hitos.length === 1 ? "pendiente" : "pendientes"}
                  </p>
                  <Link
                    href={`/track/interactivo/${f.id_booking}`}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                  >
                    Ver interactivo →
                  </Link>
                  <CreditoBadge si={credito.get(f.id_booking)} className="mt-1 block w-fit" />
                </div>
                <ul className="min-w-0 space-y-1.5">
                  {f.hitos.map((h) => {
                    const e = ESTADOS[h.estado] ?? ESTADOS.en_tiempo;
                    return (
                      <li
                        key={h.orden}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-white/70 px-2.5 py-1.5 sm:grid sm:grid-cols-[minmax(0,9.5rem)_9rem_6.5rem_minmax(0,1fr)] dark:border-slate-700 dark:bg-slate-900/60"
                      >
                        {/* Columnas fijas: hito, estado, fecha y regla quedan alineados entre renglones. */}
                        <span className="truncate font-semibold text-slate-900 dark:text-slate-100">{h.hito}</span>
                        <span className={`justify-self-start whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${e.pill}`}>
                          {e.label}
                          {h.dias_atraso ? ` · ${h.dias_atraso} d` : ""}
                        </span>
                        <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                          {h.fecha_plan ? fechaCorta(h.fecha_plan) : "Sin fecha"}
                        </span>
                        <span className="truncate text-xs text-slate-500 dark:text-slate-400" title={h.regla}>
                          {h.regla}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p
                  className={`hidden truncate text-xs sm:block ${f.ejecutivo ? "text-slate-500 dark:text-slate-400" : "font-bold text-red-700 dark:text-red-400"}`}
                >
                  {f.ejecutivo ?? "Sin ejecutivo"}
                </p>
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

      <section
        id="por-zarpar"
        aria-labelledby="por-zarpar-titulo"
        className="scroll-mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 id="por-zarpar-titulo" className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Por zarpar · sin nada vencido aún
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sin ATD ni ETA todavía no tienen fechas compromiso. Captura la ETA al confirmar el buque.
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {porZarparCount ?? 0} {(porZarparCount ?? 0) === 1 ? "referencia" : "referencias"}
          </span>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {porZarpar.map((z) => (
            <li
              key={z.id_booking}
              data-buscar={`${z.no_booking} ${z.cliente ?? ""} ${z.ejecutivo ?? "Sin ejecutivo"}`}
              className={`${claseFilaEstatus(z.status_booking)} grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_auto]`}
            >
              <AbrirOperacionBoton
                idBooking={z.id_booking}
                className="text-left font-mono text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                {z.no_booking}
              </AbrirOperacionBoton>
              <span className="truncate text-slate-600 dark:text-slate-400">{z.cliente ?? "—"}</span>
              {z.ejecutivo ? (
                <span className="truncate text-xs text-slate-500 dark:text-slate-400">{z.ejecutivo}</span>
              ) : (
                <span className="truncate text-xs font-bold text-red-700 dark:text-red-400">Sin ejecutivo</span>
              )}
              <span className="text-xs text-slate-500 dark:text-slate-400">Booking {fechaCorta(z.fecha)}</span>
            </li>
          ))}
          {porZarpar.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">Sin referencias por zarpar.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
