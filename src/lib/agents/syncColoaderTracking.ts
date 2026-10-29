import { getBackgroundSupabaseClient } from "@/lib/sync";
import { coloaderRegistry } from "./coloaderRegistry";
import type { ColoaderTrackingResult } from "./coloaderTypes";

export type TrackingSyncStats = {
  totalLcl: number;
  consultados: number;
  actualizados: number;
  omitidos: number;
  errores: Array<{ booking: string; error: string }>;
};

export async function sincronizarTrackingBooking(
  importacionId: number,
  bookingNo: string,
  coloaderName: string,
  referencia: string,
): Promise<{ ok: boolean; result?: ColoaderTrackingResult; error?: string }> {
  const supabase = await getBackgroundSupabaseClient();
  const trackRes = await coloaderRegistry.rastrear(coloaderName, referencia);

  if (!trackRes.exito) {
    return { ok: false, error: trackRes.error, result: trackRes };
  }

  // Mapear campos actualizables hacia seguimiento_importaciones
  const updatePayload: Record<string, unknown> = {};

  if (trackRes.ata) {
    updatePayload.eta_ata = trackRes.ata;
  } else if (trackRes.eta) {
    updatePayload.eta_ata = trackRes.eta;
  }

  if (trackRes.fechaDesconsolidacion) {
    updatePayload.revalidacion_48_horas_antes_eta = trackRes.fechaDesconsolidacion;
  }

  if (trackRes.fechaRevalidacion) {
    updatePayload.validacion_48_horas_antes_eta = trackRes.fechaRevalidacion;
  }

  if (trackRes.terminalPortuaria) {
    updatePayload.terminal_portuaria = trackRes.terminalPortuaria;
  }

  if (trackRes.contenedor) {
    updatePayload.contenedor = trackRes.contenedor;
  }

  if (trackRes.mbl) {
    updatePayload.mbl = trackRes.mbl;
  }

  if (trackRes.hbl) {
    updatePayload.hbl = trackRes.hbl;
  }

  // 1. Actualizar campos en seguimiento_importaciones
  if (Object.keys(updatePayload).length > 0) {
    const { error: updErr } = await supabase
      .from("seguimiento_importaciones")
      .update(updatePayload)
      .eq("id", importacionId);

    if (updErr) {
      return { ok: false, error: `Error al actualizar importación: ${updErr.message}`, result: trackRes };
    }
  }

  // 2. Registrar en la bitácora de incidencias
  const fechaHoy = new Date().toISOString().slice(0, 10);
  const bitacoraText =
    `[Agente Coloader - ${trackRes.coloader}] Consulta Ref: ${trackRes.referenciaConsultada}. ` +
    `Buque: ${trackRes.buque ?? "N/A"} | ETA/ATA: ${trackRes.ata ?? trackRes.eta ?? "N/A"} | ` +
    `Terminal: ${trackRes.terminalPortuaria ?? "N/A"} | Almacén: ${trackRes.almacen ?? "N/A"} | ` +
    `Desconsolidación: ${trackRes.fechaDesconsolidacion ?? "Pendiente"}` +
    (trackRes.fechaRevalidacion ? ` | Revalidado: ${trackRes.fechaRevalidacion}` : "");

  await supabase.from("incidencias_importacion").insert({
    importacion_id: importacionId,
    fecha: fechaHoy,
    texto: bitacoraText,
  });

  return { ok: true, result: trackRes };
}

export async function sincronizarTodosLosLcl(): Promise<TrackingSyncStats> {
  const supabase = await getBackgroundSupabaseClient();
  const stats: TrackingSyncStats = {
    totalLcl: 0,
    consultados: 0,
    actualizados: 0,
    omitidos: 0,
    errores: [],
  };

  // Buscar todos los registros LCL vigentes
  const { data: rows, error } = await supabase
    .from("seguimiento_importaciones")
    .select("id, booking, type, agente, naviera, hbl, mbl, contenedor")
    .eq("estatus", "Vigente")
    .or("type.ilike.%LCL%,booking.ilike.%LCLI%");

  if (error || !rows) {
    throw new Error(`Error al leer importaciones LCL: ${error?.message}`);
  }

  stats.totalLcl = rows.length;

  for (const row of rows) {
    const coloader = (row.agente || row.naviera || "").trim();
    const ref = (row.hbl || row.mbl || row.contenedor || "").trim();

    if (!coloader || !ref) {
      stats.omitidos++;
      continue;
    }

    const agente = coloaderRegistry.obtenerAgente(coloader);
    if (!agente) {
      stats.omitidos++;
      continue;
    }

    stats.consultados++;
    const res = await sincronizarTrackingBooking(row.id, row.booking, coloader, ref);
    if (res.ok) {
      stats.actualizados++;
    } else {
      stats.errores.push({
        booking: row.booking,
        error: res.error ?? "Fallo desconocido en sincronización",
      });
    }
  }

  return stats;
}
