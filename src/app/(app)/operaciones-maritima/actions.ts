"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import {
  CAMPOS_CORREGIBLES,
  descargarOperacionesRecientes,
  mapOperacionMaritima,
} from "@/lib/operacionesMaritima";

// Deja margen dentro del maxDuration (300 s) de la página para el guardado.
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

  // cargar_operaciones_maritima (security definer, valida admin) solo escribe
  // columnas de Cargolink: las correcciones y datos propios no se tocan.
  const supabase = await createClient();
  for (let i = 0; i < lista.length; i += LOTE) {
    const { error } = await supabase.rpc("cargar_operaciones_maritima", {
      p_rows: lista.slice(i, i + LOTE),
    });
    if (error) throw new Error(`Error al guardar en la base de datos: ${error.message}`);
  }

  revalidatePath("/operaciones-maritima");
  return { actualizadas: lista.length, total, completo };
}

function valorFormulario(formData: FormData, field: string, tipo: string): string | number | null {
  const raw = String(formData.get(field) ?? "").trim();
  if (raw === "") return null;
  if (tipo === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return raw;
}

export async function guardarOperacionMaritima(idBooking: number, formData: FormData) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operaciones) {
    throw new Error("No tienes permiso para editar operaciones.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Valores originales de Cargolink (la tabla, no la vista) para saber qué
  // quedó distinto y guardarlo como corrección.
  const { data: original, error: originalError } = await supabase
    .from("operaciones_maritima")
    .select(`id_booking, correcciones, ${CAMPOS_CORREGIBLES.map((c) => c.field).join(", ")}`)
    .eq("id_booking", idBooking)
    .maybeSingle();
  if (originalError) throw new Error(originalError.message);
  if (!original) throw new Error("Operación no encontrada.");
  const orig = original as unknown as Record<string, string | number | null>;

  // Un valor igual al de Cargolink (o "Volver al dato de Cargolink") quita la
  // corrección; uno distinto, incluso vacío, la guarda.
  const correcciones: Record<string, string | number | null> = {};
  for (const { field, tipo } of CAMPOS_CORREGIBLES) {
    if (formData.get(`restaurar_${field}`)) continue;
    const valor = valorFormulario(formData, field, tipo);
    if (valor !== (orig[field] ?? null)) correcciones[field] = valor;
  }

  const { data: actualizada, error } = await supabase
    .from("operaciones_maritima")
    .update({
      correcciones,
      operativo: valorFormulario(formData, "operativo", "text"),
      observaciones_internas: valorFormulario(formData, "observaciones_internas", "text"),
      editado_por: user?.email ?? null,
      editado_at: new Date().toISOString(),
    })
    .eq("id_booking", idBooking)
    .select("id_booking");
  if (error) throw new Error(`Error al guardar: ${error.message}`);
  if (!actualizada || actualizada.length === 0) {
    throw new Error("No se guardó: no tienes permiso para editar esta operación.");
  }

  revalidatePath("/operaciones-maritima");
  revalidatePath(`/operaciones-maritima/${idBooking}`);
  redirect(`/operaciones-maritima/${idBooking}?guardado=1`);
}
