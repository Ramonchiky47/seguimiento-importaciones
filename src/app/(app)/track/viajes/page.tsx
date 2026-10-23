import { createClient } from "@/lib/supabase/server";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { TrackEjecutivoFilter } from "@/components/TrackEjecutivoFilter";
import { CapturaPorViaje, type Viaje } from "@/components/CapturaPorViaje";
import {
  EJECUTIVO_TODOS,
  ESTATUS_OPCIONES,
  ESTATUS_TRACK,
  PERIODO_ATD_OPCIONES,
  SIN_EJECUTIVO,
  ejecutivosTrack,
  estatusBooking,
  periodoAtd,
} from "@/lib/track";

export const dynamic = "force-dynamic";

// Captura por viaje: bookings del mismo buque y viaje comparten ATD, ETA y
// ATA. Se propone el valor del viaje y nada se escribe en Cargolink hasta
// confirmar.
export default async function ViajesPage({
  searchParams,
}: {
  searchParams: Promise<{ ejecutivo?: string | string[]; estatus?: string | string[]; atd?: string | string[] }>;
}) {
  const { ejecutivo, estatus, atd } = await searchParams;
  const { filtro: ejecutivoRaw } = ejecutivosTrack(ejecutivo);
  const estatusSel = estatusBooking(estatus, ESTATUS_TRACK);
  const atdSel = periodoAtd(atd);
  const supabase = await createClient();
  const [{ data, error }, { data: puedeEditar }, { data: ejecutivosData }] = await Promise.all([
    supabase.rpc("track_viajes", {
      p_ejecutivos: ejecutivoRaw.length > 0 ? ejecutivoRaw : null,
      p_estatus: estatusSel.codigos,
      p_atd: atdSel.codigos,
    }),
    supabase.rpc("puedo_editar_cargolink"),
    supabase.rpc("operaciones_maritima_ejecutivos", { p_anio: null, p_types: null, p_q: null, p_tarjeta: null, p_hoy: null }),
  ]);
  // Directo o con transbordo por booking: primero lo que dice la naviera; si no
  // hay, la etapa Transbordo de Cargolink (No aplica = directo).
  const viajesBase = (data ?? []) as Viaje[];
  const ids = viajesBase.flatMap((v) => v.bookings.map((b) => b.id_booking));
  const [{ data: navData }, { data: opsData }] = ids.length
    ? await Promise.all([
        supabase.from("tracking_naviera").select("id_booking, transbordos").eq("ok", true).in("id_booking", ids),
        supabase.from("operaciones_maritima").select("id_booking, mov_tb:datos->>his_mov_transbordo").in("id_booking", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const nav = new Map(((navData ?? []) as { id_booking: number; transbordos: { lugar: string }[] | null }[]).map((x) => [x.id_booking, x.transbordos ?? []]));
  const mov = new Map(((opsData ?? []) as { id_booking: number; mov_tb: string | null }[]).map((x) => [x.id_booking, x.mov_tb ?? ""]));
  const viajes: Viaje[] = viajesBase.map((v) => ({
    ...v,
    bookings: v.bookings.map((b) => {
      const t = nav.get(b.id_booking);
      if (t) {
        const lugares = t.map((x) => x.lugar).filter(Boolean);
        return { ...b, ruta: { tipo: lugares.length ? "transbordo" : "directo", lugares, fuente: "naviera" as const } };
      }
      const m = mov.get(b.id_booking) ?? "";
      const tipo = m === "NO_APLICA" ? "directo" : m === "FINALIZADO" || m === "EDICION" ? "transbordo" : "sin_dato";
      return { ...b, ruta: { tipo, lugares: [], fuente: tipo === "sin_dato" ? null : ("cargolink" as const) } };
    }),
  }));
  const availableEjecutivos = Array.from(
    new Set([SIN_EJECUTIVO, ...((ejecutivosData ?? []) as { ejecutivo: string }[]).map((x) => x.ejecutivo), ...ejecutivoRaw]),
  ).sort((a, b) => (a === SIN_EJECUTIVO ? -1 : b === SIN_EJECUTIVO ? 1 : a.localeCompare(b, "es")));
  const hrefTodos = `?${new URLSearchParams([
    ...estatusSel.enUrl.map((v) => ["estatus", v]),
    ...atdSel.enUrl.map((v) => ["atd", v]),
    ["ejecutivo", EJECUTIVO_TODOS],
  ]).toString()}`;

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Bookings que vienen en el mismo buque y viaje comparten ATD, ETA y ATA. Revisa la propuesta, marca qué cambiar y
        confirma: nada se escribe en Cargolink antes de confirmar.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelectFilter paramName="atd" label="ATD real" options={PERIODO_ATD_OPCIONES} current={atdSel.seleccion} />
        <MultiSelectFilter paramName="estatus" label="Estatus" options={ESTATUS_OPCIONES} current={estatusSel.seleccion} />
        <TrackEjecutivoFilter options={availableEjecutivos} filtro={ejecutivoRaw} hrefTodos={hrefTodos} />
      </div>
      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">Error al cargar: {error.message}</p>}
      <CapturaPorViaje viajes={viajes} puedeEditar={puedeEditar === true} />
    </main>
  );
}
