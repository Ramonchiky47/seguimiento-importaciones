import type { SupabaseClient } from "@supabase/supabase-js";

// Días de crédito del cliente: Cargolink manda "credito": "SI" en el booking; vacío = sin crédito.
export const tieneCredito = (valor: unknown) => String(valor ?? "").trim().toUpperCase() === "SI";

export async function creditoPorBooking(supabase: SupabaseClient, ids: number[]): Promise<Map<number, boolean>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("operaciones_maritima").select("id_booking, credito:datos->>credito").in("id_booking", ids);
  return new Map(((data ?? []) as { id_booking: number; credito: string | null }[]).map((x) => [x.id_booking, tieneCredito(x.credito)]));
}
