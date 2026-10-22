import { Fragment } from "react";
import Link from "next/link";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { createClient } from "@/lib/supabase/server";
import { TrackEjecutivoFilter } from "@/components/TrackEjecutivoFilter";
import { AbrirOperacionBoton } from "@/components/OperacionDetalleModal";
import { RegresarTablero } from "@/components/RegresarTablero";
import { BuscadorTrack } from "@/components/BuscadorTrack";
import {
  DIAS_REZAGO,
  EJECUTIVO_TODOS,
  SIN_EJECUTIVO,
  ESTADOS,
  ESTATUS_OPCIONES,
  ESTATUS_TRACK,
  ETIQUETA_COMPACTA,
  TONO_TARJETA,
  VALOR_COMPACTO,
  claseTarjetaCompacta,
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


  const { data, error } = await supabase.rpc("track_mi_dia_q", {
    p_ejecutivos: ejecutivoRaw.length > 0 ? ejecutivoRaw : null,
    p_estatus: estatusSel.codigos,
    p_atd: atdSel.codigos,
    p_q: busqueda || null,
    p_nivel: nivelActivo,
    p_limit: PAGE_SIZE,
    p_offset: from,
  });
  const resultado = (data ?? { conteos: {}, total: 0, filas: [] }) as MiDia;
  const { data: conteosData } = await supabase.rpc("track_conteos_q", {
    p_ejecutivos: ejecutivoRaw.length > 0 ? ejecutivoRaw : null,
    p_estatus: estatusSel.codigos,
    p_atd: atdSel.codigos,
    p_q: busqueda || null,
  });
  const c = (conteosData ?? null) as ConteosTrack | null;
  const { data: viajesData } = await supabase.rpc("track_viajes", {
    p_ejecutivos: ejecutivoRaw.length > 0 ? ejecutivoRaw : null,
    p_estatus: estatusSel.codigos,
    p_atd: atdSel.codigos,
  });
  const viajesPendientes = ((viajesData ?? []) as { distintas: boolean; faltan: number }[]).filter((v) => v.distintas || v.faltan > 0).length;

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
  const { data: porZarparData, count: porZarparCount } = await porZarparQuery
    .order("fecha", { ascending: true, nullsFirst: false })
    .limit(200);
  const porZarpar = (porZarparData ?? []) as {
    id_booking: number;
    no_booking: string;
    cliente: string | null;
    ejecutivo: string | null;
    fecha: string | null;
    status_booking: string | null;
  }[];
  const filas = resultado.filas;
  const cambios = await cambiosComerciales(supabase, filas.map((f) => f.id_booking));
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
  const nivelInfo = (key: Nivel) => NIVELES.find((n) => n.key === key)!;
  // Dos filas en orden logístico: el recorrido del embarque y, abajo, los
  // hitos por urgencia.
  const filasTarjetas = [
    {
      titulo: "Flujo del embarque",
      tarjetas: [
        { key: "por_asignar", label: "Por asignar", valor: c?.por_asignar ?? 0, nota: "Sin ejecutivo en Cargolink", tono: TONO_TARJETA.azul, href: embarquesHref("/track/embarques", [SIN_EJECUTIVO]), activa: false },
        { key: "por_zarpar", label: "Por zarpar", valor: porZarparCount ?? 0, nota: "Sin nada vencido aún · al final", tono: TONO_TARJETA.gris, href: "#por-zarpar", activa: false },
        { key: "sin_eta", label: "Sin ETA", valor: c?.sin_eta ?? 0, nota: "ETA sin capturar", tono: TONO_TARJETA.violeta, href: embarquesHref("/track/embarques?ver=sin_eta"), activa: false },
        { key: "aviso_arribo", label: "Aviso de arribo", valor: c?.aviso_arribo ?? 0, nota: "ETA en los próximos 7 días", tono: TONO_TARJETA.azul, href: embarquesHref("/track/embarques?ver=aviso_arribo"), activa: false },
        { key: "sin_dias_libres", label: "Sin días libres", valor: c?.sin_dias_libres ?? 0, nota: "FCL sin días libres de demora", tono: TONO_TARJETA.violeta, href: embarquesHref("/track/embarques?ver=sin_dias_libres"), activa: false },
        { key: "por_vencer", label: "Por vencer demoras", valor: c?.por_vencer ?? 0, nota: "Le quedan 1 a 4 días libres", tono: TONO_TARJETA.ambar, href: embarquesHref("/track/embarques?ver=por_vencer"), activa: false },
        { key: "en_demora", label: "En demora", valor: c?.en_demora ?? 0, nota: "Días libres agotados", tono: TONO_TARJETA.rojo, href: embarquesHref("/track/embarques?etapa=En%20demora"), activa: false },
      ],
    },
    {
      titulo: "Hitos por urgencia",
      tarjetas: [
        ...(["pendientes", "hoy", "pronto", "atrasado", "rezago", "falta_dato"] as Nivel[]).map((k) => ({
          key: k,
          label: nivelInfo(k).label,
          valor: totalNivel(k),
          nota: nivelInfo(k).ayuda,
          tono: nivelInfo(k).tono,
          href: href({ nivel: k }),
          activa: nivelActivo === k,
        })),
        { key: "por_corregir", label: "Datos por corregir", valor: c?.por_corregir ?? 0, nota: "Captura pendiente o inconsistente", tono: TONO_TARJETA.violeta, href: embarquesHref(`/track/embarques?etapa=${encodeURIComponent("Dato por corregir")}`), activa: false },
      ],
    },
  ];

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
        </div>
      </div>

      <div className="space-y-2">
        {filasTarjetas.map((fila) => (
          <div key={fila.titulo} role="group" aria-label={fila.titulo} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {fila.tarjetas.map((t) => (
              <Link key={t.key} href={t.href} title={t.nota} className={claseTarjetaCompacta(t.activa, t.tono)}>
                <span className={ETIQUETA_COMPACTA}>{t.label}</span>
                <span className={VALOR_COMPACTO}>{t.valor}</span>
                <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{t.nota}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>

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
