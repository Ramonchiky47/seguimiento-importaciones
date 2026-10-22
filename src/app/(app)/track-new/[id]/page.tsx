import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookingGuiado } from "./BookingGuiado";
import type { HitoTrack } from "@/lib/trackNew";

export const dynamic = "force-dynamic";

export default async function TrackNewBooking({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idBooking = Number(id);
  if (!Number.isInteger(idBooking) || idBooking <= 0) notFound();
  const supabase = await createClient();

  const [{ data: op }, { data: hitos }, { data: puedeEditar }] = await Promise.all([
    supabase.from("operaciones_maritima_vista").select("*").eq("id_booking", idBooking).maybeSingle(),
    supabase
      .from("track_hitos")
      .select("orden, hito, regla, fecha_plan, fecha_hecho, hecho, estado, dias_atraso, valor_real")
      .eq("id_booking", idBooking)
      .order("posicion"),
    supabase.rpc("puedo_editar_cargolink"),
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
        .limit(12)
    : { data: [] };

  return (
    <BookingGuiado
      key={idBooking}
      idBooking={idBooking}
      op={op as Record<string, unknown>}
      hitos={(hitos ?? []) as HitoTrack[]}
      puedeEditar={puedeEditar === true}
      mismoBuque={(mismoBuque ?? []) as { id_booking: number; no_booking: string; cliente: string | null; ejecutivo: string | null }[]}
    />
  );
}
