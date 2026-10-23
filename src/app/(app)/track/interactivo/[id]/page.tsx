import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookingGuiado } from "./BookingGuiado";
import type { HitoTrack } from "@/lib/trackNew";
import { explicarPropuestaDias } from "@/lib/track";

export const dynamic = "force-dynamic";

export default async function TrackInteractivoBooking({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idBooking = Number(id);
  if (!Number.isInteger(idBooking) || idBooking <= 0) notFound();
  const supabase = await createClient();

  const [{ data: op }, { data: hitos }, { data: puedeEditar }, { data: naviera }] = await Promise.all([
    supabase.from("operaciones_maritima_vista").select("*").eq("id_booking", idBooking).maybeSingle(),
    supabase
      .from("track_hitos")
      .select("orden, hito, regla, fecha_plan, fecha_hecho, hecho, estado, dias_atraso, valor_real")
      .eq("id_booking", idBooking)
      .order("posicion"),
    supabase.rpc("puedo_editar_cargolink"),
    // El PDF de estatus para el cliente solo se ofrece si ya hay información de la naviera.
    supabase.from("tracking_naviera").select("ok").eq("id_booking", idBooking).eq("ok", true).maybeSingle(),
  ]);
  if (!op) notFound();

  // Otros bookings vigentes del mismo buque Y mismo viaje: el nombre del buque solo se repite en viajes
  // de otros meses.
  const { buque, no_viaje: viaje } = (op.datos ?? {}) as Record<string, string>;
  const { data: mismoBuque } = buque && viaje
    ? await supabase
        .from("operaciones_maritima_vista")
        .select("id_booking, no_booking, cliente, ejecutivo")
        .eq("datos->>buque", buque)
        .eq("datos->>no_viaje", viaje)
        .eq("status_booking", "1")
        .neq("id_booking", idBooking)
        .order("no_booking")
        .limit(20)
    : { data: [] };
  // Los que también salen en Por viaje (Track: ATD
  // desde el corte); el resto se muestra aparte con el motivo.
  const idsViaje = ((mismoBuque ?? []) as { id_booking: number }[]).map((b) => b.id_booking);
  const { data: enTrack } = idsViaje.length
    ? await supabase.from("track_embarques").select("id_booking, periodo_atd").in("id_booking", idsViaje)
    : { data: [] };
  const periodo = new Map(((enTrack ?? []) as { id_booking: number; periodo_atd: string }[]).map((x) => [x.id_booking, x.periodo_atd]));
  const viaje_ = ((mismoBuque ?? []) as { id_booking: number; no_booking: string; cliente: string | null; ejecutivo: string | null }[]).map((b) => ({
    ...b,
    motivo: !periodo.has(b.id_booking)
      ? "No está en Track"
      : periodo.get(b.id_booking) !== "desde"
        ? "ATD antes del corte del 15 sep"
        : null,
  }));

  // Días libres propuestos por historial si no están capturados.
  const { data: propDias } =
    Number(op.dias_libres_demora) > 0 ? { data: null } : await supabase.rpc("propuesta_dias_libres", { p_ids: [idBooking] });
  const pd = (propDias as Record<string, { dias: number; nivel: number; coinciden: number; muestra: number; ultimo: string | null }> | null)?.[
    String(idBooking)
  ];

  // Regreso de vacío estimado (solo aviso) y riesgo por historial del cliente.
  const { data: vaciosData } = op.ata && !op.regreso_vacio ? await supabase.rpc("track_vacios", {}) : { data: [] };
  const vacio = ((vaciosData ?? []) as { id_booking: number; estimado: string; base: string; riesgo: string; tardes: number; n: number }[]).find(
    (v) => v.id_booking === idBooking,
  );

  return (
    <BookingGuiado
      vacio={vacio ? { estimado: vacio.estimado, base: vacio.base, riesgo: vacio.riesgo, tardes: vacio.tardes, n: vacio.n } : null}
      propuestaDias={pd ? { dias: pd.dias, explicacion: explicarPropuestaDias(pd) } : null}
      key={idBooking}
      idBooking={idBooking}
      op={op as Record<string, unknown>}
      hitos={(hitos ?? []) as HitoTrack[]}
      puedeEditar={puedeEditar === true}
      mismoBuque={viaje_}
      conNaviera={Boolean(naviera)}
    />
  );
}
