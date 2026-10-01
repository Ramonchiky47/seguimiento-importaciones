"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { descargarOperacionesRecientes, mapOperacionMaritima } from "@/lib/operacionesMaritima";

// Deja margen dentro del maxDuration (300 s) de la página para el upsert.
const PRESUPUESTO_DESCARGA_MS = 200_000;
const LOTE = 500;

export type ResultadoActualizacion = { actualizadas: number; total: number; completo: boolean };

export async function actualizarOperacionesMaritima(): Promise<ResultadoActualizacion> {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    throw new Error("Solo los administradores pueden actualizar desde Cargolink.");
  }

  const { registros, total, completo } = await descargarOperacionesRecientes(PRESUPUESTO_DESCARGA_MS);

  const sincronizadoAt = new Date().toISOString();
  const filas = new Map<number, Record<string, unknown>>();
  for (const r of registros) {
    const fila = mapOperacionMaritima(r);
    if (Number.isFinite(fila.id_booking)) filas.set(fila.id_booking, { ...fila, sincronizado_at: sincronizadoAt });
  }
  const lista = Array.from(filas.values());

  const supabase = await createClient();
  for (let i = 0; i < lista.length; i += LOTE) {
    const { error } = await supabase
      .from("operaciones_maritima")
      .upsert(lista.slice(i, i + LOTE), { onConflict: "id_booking" });
    if (error) throw new Error(`Error al guardar en la base de datos: ${error.message}`);
  }

  revalidatePath("/operaciones-maritima");
  return { actualizadas: lista.length, total, completo };
}
