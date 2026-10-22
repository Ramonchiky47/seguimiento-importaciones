import { createClient } from "@/lib/supabase/server";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { TrackEjecutivoFilter } from "@/components/TrackEjecutivoFilter";
import { PropuestasPorConfirmar, type Propuesta } from "@/components/PropuestasPorConfirmar";
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

// Propuestas por confirmar: capturas repetitivas que el historial deja listas
// (transbordo No aplica, ETA, días libres). Se revisan y confirman en lote.
export default async function PropuestasPage({
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
    supabase.rpc("track_propuestas", {
      p_ejecutivos: ejecutivoRaw.length > 0 ? ejecutivoRaw : null,
      p_estatus: estatusSel.codigos,
      p_atd: atdSel.codigos,
    }),
    supabase.rpc("puedo_editar_cargolink"),
    supabase.rpc("operaciones_maritima_ejecutivos", { p_anio: null, p_types: null, p_q: null, p_tarjeta: null, p_hoy: null }),
  ]);
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
        Capturas que el historial ya dejó listas. Las de confianza alta vienen marcadas; revisa, ajusta si hace falta y
        confirma. Nada se escribe en Cargolink antes de confirmar.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelectFilter paramName="atd" label="ATD real" options={PERIODO_ATD_OPCIONES} current={atdSel.seleccion} />
        <MultiSelectFilter paramName="estatus" label="Estatus" options={ESTATUS_OPCIONES} current={estatusSel.seleccion} />
        <TrackEjecutivoFilter options={availableEjecutivos} filtro={ejecutivoRaw} hrefTodos={hrefTodos} />
      </div>
      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">Error al cargar: {error.message}</p>}
      <PropuestasPorConfirmar propuestas={(data ?? []) as Propuesta[]} puedeEditar={puedeEditar === true} />
    </main>
  );
}
