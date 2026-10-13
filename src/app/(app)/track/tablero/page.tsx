import Link from "next/link";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { createClient } from "@/lib/supabase/server";
import { TrackEjecutivoFilter } from "@/components/TrackEjecutivoFilter";
import { AbrirOperacionBoton } from "@/components/OperacionDetalleModal";
import {
  EJECUTIVO_TODOS,
  SIN_EJECUTIVO,
  ESTATUS_OPCIONES,
  ETIQUETA_COMPACTA,
  TONO_TARJETA,
  VALOR_COMPACTO,
  claseTarjetaCompacta,
  type ConteosTrack,
  ejecutivosTrack,
  estatusBooking,
  periodoAtd,
  PERIODO_ATD_OPCIONES,
} from "@/lib/track";

export const dynamic = "force-dynamic";

const PERIODOS = [
  { key: "7", label: "Semana" },
  { key: "30", label: "Mes" },
  { key: "365", label: "Año" },
];

const ETAPAS = [
  { key: "Por zarpar", color: "bg-slate-400" },
  { key: "En tránsito", color: "bg-blue-700" },
  { key: "En puerto", color: "bg-cyan-700" },
  { key: "En demora", color: "bg-red-700" },
];

const META_A_TIEMPO = 90;
// Con menos hitos en el periodo el % a tiempo no es representativo.
const MIN_HITOS_PCT = 10;

type Operativo = {
  operativo: string;
  embarques: number;
  por_zarpar: number;
  con_atraso: number;
  vencen: number;
  por_corregir: number;
  en_demora: number;
  hitos_periodo: number;
  a_tiempo: number;
};

type Accion = {
  id_booking: number;
  no_booking: string;
  cliente: string | null;
  operativo: string;
  accion: string;
  detalle: string;
  prioridad: number;
  otras: number;
};

type Tablero = {
  embarques: number;
  atrasados: number;
  vencen: number;
  por_corregir: number;
  en_demora: number;
  etapas: Record<string, number>;
  por_operativo: Operativo[];
  acciones_total: number;
  acciones: Accion[];
};

// Qué atender con cada operativo, en palabras.
function estadoOperativo(o: Operativo): { label: string; clase: string } {
  if (o.operativo === SIN_EJECUTIVO) {
    return { label: "Asignar ejecutivo", clase: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
  }
  if (o.con_atraso >= 3 || o.en_demora > 0) {
    return { label: "Atrasos", clase: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" };
  }
  if (o.por_corregir >= 5 || (o.embarques > 0 && o.por_corregir / o.embarques >= 0.25)) {
    return { label: "Calidad de captura", clase: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" };
  }
  if (o.embarques >= 25) {
    return { label: "Carga alta", clase: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" };
  }
  if (o.con_atraso > 0 || o.por_corregir > 0 || o.vencen > 0) {
    return { label: "Vigilar", clase: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" };
  }
  return { label: "En orden", clase: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" };
}

const CLASE_PRIORIDAD: Record<number, string> = {
  1: "text-amber-800 dark:text-amber-300",
  2: "text-red-700 dark:text-red-400",
  3: "text-orange-700 dark:text-orange-400",
  4: "text-blue-800 dark:text-blue-300",
  5: "text-violet-800 dark:text-violet-300",
  6: "text-slate-500 dark:text-slate-400",
};

export default async function TableroPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; ejecutivo?: string | string[]; estatus?: string | string[]; atd?: string | string[] }>;
}) {
  const { periodo, ejecutivo, estatus, atd } = await searchParams;
  const periodoActivo = PERIODOS.some((p) => p.key === periodo) ? (periodo as string) : "30";
  const supabase = await createClient();
  const { filtro: ejecutivoRaw, enUrl: ejecutivoEnUrl } = ejecutivosTrack(ejecutivo);
  const estatusSel = estatusBooking(estatus);
  const atdSel = periodoAtd(atd);

  const [{ data, error }, { data: ejecutivosData }, { data: conteosData }] = await Promise.all([
    supabase.rpc("track_tablero", {
      p_dias: Number(periodoActivo),
      p_ejecutivos: ejecutivoRaw.length > 0 ? ejecutivoRaw : null,
      p_estatus: estatusSel.codigos,
      p_atd: atdSel.codigos,
    }),
    supabase.rpc("operaciones_maritima_ejecutivos", {
      p_anio: null,
      p_types: null,
      p_q: null,
      p_tarjeta: null,
      p_hoy: null,
    }),
    supabase.rpc("track_conteos", {
      p_ejecutivos: ejecutivoRaw.length > 0 ? ejecutivoRaw : null,
      p_estatus: estatusSel.codigos,
      p_atd: atdSel.codigos,
    }),
  ]);
  const r = (data ?? null) as Tablero | null;
  const c = (conteosData ?? null) as ConteosTrack | null;
  const availableEjecutivos = Array.from(
    new Set([SIN_EJECUTIVO, ...((ejecutivosData ?? []) as { ejecutivo: string }[]).map((x) => x.ejecutivo), ...ejecutivoRaw]),
  ).sort((a, b) => (a === SIN_EJECUTIVO ? -1 : b === SIN_EJECUTIVO ? 1 : a.localeCompare(b, "es")));

  const periodoHref = (key: string) => {
    const params = new URLSearchParams();
    if (key !== "30") params.set("periodo", key);
    for (const v of ejecutivoEnUrl) params.append("ejecutivo", v);
    for (const v of estatusSel.enUrl) params.append("estatus", v);
    for (const v of atdSel.enUrl) params.append("atd", v);
    const q = params.toString();
    return q ? `?${q}` : "?";
  };

  // Filtros actuales del Tablero, para el botón "Regresar al Tablero".
  const volver = periodoHref(periodoActivo).replace(/^\?/, "") || "1";
  // Los enlaces a Mi día / Embarques conservan los filtros elegidos.
  const conFiltros = (ruta: string, ejecutivos: string[] = ejecutivoEnUrl) => {
    const [path, query] = ruta.split("?");
    const params = new URLSearchParams(query ?? "");
    for (const v of ejecutivos) params.append("ejecutivo", v);
    for (const v of estatusSel.enUrl) params.append("estatus", v);
    for (const v of atdSel.enUrl) params.append("atd", v);
    params.set("volver", volver);
    const s = params.toString();
    return s ? `${path}?${s}` : path;
  };
  // Clic en un operativo: el tablero completo se filtra a él.
  const operativoHref = (nombre: string) => {
    const params = new URLSearchParams([["ejecutivo", nombre]]);
    if (periodoActivo !== "30") params.set("periodo", periodoActivo);
    for (const v of estatusSel.enUrl) params.append("estatus", v);
    for (const v of atdSel.enUrl) params.append("atd", v);
    return `?${params.toString()}`;
  };

  // Dos filas en orden logístico: el recorrido del embarque y, abajo, las
  // alertas de puerto y de seguimiento.
  const filasTarjetas =
    r && c
      ? [
          {
            titulo: "Flujo del embarque",
            tarjetas: [
              { label: "Embarques", valor: c.embarques, nota: "Activos con estos filtros", tono: TONO_TARJETA.neutro, href: conFiltros("/track/embarques") },
              { label: "Por asignar", valor: c.por_asignar, nota: "Sin ejecutivo en Cargolink", tono: TONO_TARJETA.azul, href: conFiltros("/track/embarques", [SIN_EJECUTIVO]) },
              { label: "Por zarpar", valor: c.por_zarpar, nota: "Sin ATD real todavía", tono: TONO_TARJETA.gris, href: conFiltros("/track/embarques?etapa=Por%20zarpar") },
              { label: "Sin ETA", valor: c.sin_eta, nota: "ETA sin capturar", tono: TONO_TARJETA.violeta, href: conFiltros("/track/embarques?ver=sin_eta") },
              { label: "En tránsito", valor: c.en_transito, nota: "Zarpó y no ha arribado", tono: TONO_TARJETA.azul, href: conFiltros(`/track/embarques?etapa=${encodeURIComponent("En tránsito")}`) },
              { label: "Aviso de arribo", valor: c.aviso_arribo, nota: "ETA en los próximos 7 días", tono: TONO_TARJETA.azul, href: conFiltros("/track/embarques?ver=aviso_arribo") },
              { label: "En puerto", valor: c.en_puerto, nota: "Arribó, con días libres", tono: TONO_TARJETA.gris, href: conFiltros("/track/embarques?etapa=En%20puerto") },
            ],
          },
          {
            titulo: "Alertas",
            tarjetas: [
              { label: "Sin días libres", valor: c.sin_dias_libres, nota: "FCL sin días libres de demora", tono: TONO_TARJETA.violeta, href: conFiltros("/track/embarques?ver=sin_dias_libres") },
              { label: "Por vencer demoras", valor: c.por_vencer, nota: "Le quedan 1 a 4 días libres", tono: TONO_TARJETA.ambar, href: conFiltros("/track/embarques?ver=por_vencer") },
              { label: "En demora", valor: c.en_demora, nota: "Días libres agotados", tono: TONO_TARJETA.rojo, href: conFiltros("/track/embarques?etapa=En%20demora") },
              { label: "Vencen en 3 días", valor: r.vencen, nota: "Hitos para hoy o los próximos 3 días", tono: TONO_TARJETA.ambar, href: conFiltros("/track/mi-dia") },
              { label: "Atrasados", valor: r.atrasados, nota: "Algún hito vencido sin marcar", tono: TONO_TARJETA.rojo, href: conFiltros("/track/embarques") },
              { label: "Datos por corregir", valor: c.por_corregir, nota: "Captura pendiente o inconsistente", tono: TONO_TARJETA.violeta, href: conFiltros(`/track/embarques?etapa=${encodeURIComponent("Dato por corregir")}`) },
            ],
          },
        ]
      : [];
  const totalEtapas = r ? Math.max(1, ETAPAS.reduce((t, e) => t + (r.etapas[e.key] ?? 0), 0)) : 1;

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
        <MultiSelectFilter paramName="atd" label="ATD real" options={PERIODO_ATD_OPCIONES} current={atdSel.seleccion} />
        <MultiSelectFilter paramName="estatus" label="Estatus" options={ESTATUS_OPCIONES} current={estatusSel.seleccion} />
        <TrackEjecutivoFilter
          options={availableEjecutivos}
          filtro={ejecutivoRaw}
          hrefTodos={`?${new URLSearchParams([
            ...(periodoActivo !== "30" ? [["periodo", periodoActivo]] : []),
            ...estatusSel.enUrl.map((v) => ["estatus", v]),
            ...atdSel.enUrl.map((v) => ["atd", v]),
            ["ejecutivo", EJECUTIVO_TODOS],
          ]).toString()}`}
        />
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Error al cargar el tablero: {error.message}
        </p>
      )}

      {r && (
        <>
          {/* 1. ¿Cómo vamos? */}
          <section aria-labelledby="como-vamos" className="space-y-2">
            <h2 id="como-vamos" className="text-sm font-semibold text-slate-900 dark:text-slate-50">¿Cómo vamos?</h2>
            {filasTarjetas.map((fila) => (
              <div key={fila.titulo} role="group" aria-label={fila.titulo} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {fila.tarjetas.map((k) => (
                  <Link key={k.label} href={k.href} title={k.nota} className={claseTarjetaCompacta(false, k.tono)}>
                    <span className={ETIQUETA_COMPACTA}>{k.label}</span>
                    <span className={VALOR_COMPACTO}>{k.valor}</span>
                    <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{k.nota}</span>
                  </Link>
                ))}
              </div>
            ))}
          </section>

          {/* 2. ¿Quién necesita apoyo? */}
          <section aria-labelledby="por-operativo" className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h2 id="por-operativo" className="text-sm font-semibold text-slate-900 dark:text-slate-50">¿Quién necesita apoyo?</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">Clic en un operativo para ver solo lo suyo</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Operativo</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Embarques</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Por zarpar</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Con atraso</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Datos por corregir</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Vencen ≤ 3 días</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">% a tiempo</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {r.por_operativo.map((o) => {
                    const estado = estadoOperativo(o);
                    const pct =
                      o.hitos_periodo >= MIN_HITOS_PCT ? Math.round((100 * o.a_tiempo) / o.hitos_periodo) : null;
                    return (
                      <tr key={o.operativo} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <td className="px-4 py-2.5">
                          <Link href={operativoHref(o.operativo)} className="font-medium text-blue-700 hover:underline dark:text-blue-400">
                            {o.operativo}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{o.embarques}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          <Link
                            href={conFiltros("/track/embarques?etapa=Por%20zarpar", [o.operativo])}
                            className="hover:underline"
                          >
                            {o.por_zarpar}
                          </Link>
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${o.con_atraso > 0 ? "font-semibold text-red-700 dark:text-red-400" : ""}`}>
                          {o.con_atraso}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${o.por_corregir > 0 ? "font-semibold text-violet-800 dark:text-violet-300" : ""}`}>
                          {o.por_corregir}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{o.vencen}</td>
                        <td
                          className={`px-3 py-2.5 text-right tabular-nums ${pct !== null && pct < META_A_TIEMPO ? "font-semibold text-orange-700 dark:text-orange-400" : ""}`}
                          title={pct === null ? `Menos de ${MIN_HITOS_PCT} hitos en el periodo (${o.hitos_periodo})` : `${o.a_tiempo} de ${o.hitos_periodo} hitos`}
                        >
                          {pct === null ? "—" : `${pct} %`}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.clase}`}>{estado.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {r.por_operativo.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-500">Sin embarques con estos filtros.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              % a tiempo: hitos marcados en Cargolink a más tardar en su fecha compromiso (meta {META_A_TIEMPO} %); se muestra con al menos {MIN_HITOS_PCT} hitos en el periodo.
            </p>
          </section>

          {/* 3. ¿Qué hay que hacer hoy? */}
          <section aria-labelledby="acciones" className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h2 id="acciones" className="text-sm font-semibold text-slate-900 dark:text-slate-50">¿Qué hay que hacer hoy?</h2>
              <Link href={conFiltros("/track/mi-dia")} className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400">
                {r.acciones_total > r.acciones.length ? `Ver los ${r.acciones_total} en Mi día` : "Ir a Mi día"}
              </Link>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {r.acciones.map((a) => (
                <li key={a.id_booking} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <AbrirOperacionBoton
                    idBooking={a.id_booking}
                    className="font-mono text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {a.no_booking}
                  </AbrirOperacionBoton>
                  <span className="min-w-0 max-w-56 truncate text-slate-600 dark:text-slate-400">{a.cliente ?? "—"}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {a.accion === "Corregir dato" || a.accion === "Asignar ejecutivo" ? a.accion : `Marcar ${a.accion}`}
                  </span>
                  <span className={`font-medium ${CLASE_PRIORIDAD[a.prioridad] ?? ""}`}>{a.detalle}</span>
                  {a.otras > 0 && <span className="text-xs text-slate-500">+{a.otras} más</span>}
                  <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{a.operativo}</span>
                </li>
              ))}
              {r.acciones.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Nada pendiente. 🎉</li>}
            </ul>
          </section>

          {/* Flujo de embarques */}
          <section aria-labelledby="flujo" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 id="flujo" className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Flujo de embarques</h2>
            <div className="flex h-3 overflow-hidden rounded bg-slate-100 dark:bg-slate-800" aria-hidden="true">
              {ETAPAS.map((e) => {
                const n = r.etapas[e.key] ?? 0;
                return n > 0 ? <span key={e.key} className={e.color} style={{ width: `${(100 * n) / totalEtapas}%` }} /> : null;
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {ETAPAS.map((e, i) => (
                <Link key={e.key} href={conFiltros(`/track/embarques?etapa=${encodeURIComponent(e.key)}`)} className="flex items-center gap-2 hover:underline">
                  <span className={`inline-block size-2.5 rounded-full ${e.color}`} aria-hidden="true" />
                  <span className="text-slate-700 dark:text-slate-300">{e.key}</span>
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{r.etapas[e.key] ?? 0}</span>
                  {i < ETAPAS.length - 1 && <span className="text-slate-400" aria-hidden="true">→</span>}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
