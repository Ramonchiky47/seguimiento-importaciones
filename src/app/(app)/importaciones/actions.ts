"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DATE_FIELDS, TEXT_FIELDS } from "@/types/importacion";
import { loginCargolink } from "@/lib/cargolink";
import {
  cargarOperativosConocidos,
  confirmarSincronizacionCon,
  enriquecerImportacionDesdeCargolink,
  friendlyDbError,
  previsualizarSincronizacionCon,
  type FilaSincronizacion,
  type PrevisualizacionSincronizacion,
  type ResultadoSincronizacion,
} from "@/lib/sincronizacionImportaciones";
import { getMyPermissions } from "@/lib/permissions";

function buildPayload(formData: FormData) {
  const payload: Record<string, string | number | null> = {};

  for (const field of TEXT_FIELDS) {
    if (field === "operativo") continue;
    const value = formData.get(field);
    payload[field] = value ? String(value) : null;
  }

  const operativos = formData
    .getAll("operativo")
    .map((v) => String(v))
    .filter(Boolean);
  payload.operativo = operativos.length > 0 ? operativos.join(", ") : null;

  for (const field of DATE_FIELDS) {
    const value = formData.get(field);
    payload[field] = value ? String(value) : null;
  }

  // dias_demoras ya no se captura: ahora es un cálculo (fecha actual -
  // último día libre de demoras) que se muestra al vuelo, no algo que se
  // guarde — nunca se incluye en el payload.

  const diasLibresDemoras = formData.get("dias_libres_demoras");
  payload.dias_libres_demoras = diasLibresDemoras ? Number(diasLibresDemoras) : null;

  payload.estatus = String(formData.get("estatus") || "Vigente");

  return payload;
}

function buildSeguro(formData: FormData): boolean {
  return formData.get("seguro") === "on";
}

export async function createImportacion(formData: FormData) {
  const supabase = await createClient();
  const payload = { ...buildPayload(formData), seguro: buildSeguro(formData) };

  const { error } = await supabase.from("seguimiento_importaciones").insert(payload);

  if (error) {
    throw new Error(friendlyDbError(error));
  }

  revalidatePath("/importaciones");
  redirect("/importaciones");
}

export async function updateImportacion(id: number, formData: FormData) {
  const supabase = await createClient();
  const payload = { ...buildPayload(formData), seguro: buildSeguro(formData) };

  const { error } = await supabase
    .from("seguimiento_importaciones")
    .update(payload)
    .eq("id", id);

  if (error) {
    throw new Error(friendlyDbError(error));
  }

  revalidatePath("/importaciones");
  redirect("/importaciones");
}

export async function actualizarImportacion(id: number) {
  const supabase = await createClient();

  const { data: row, error: rowError } = await supabase
    .from("seguimiento_importaciones")
    .select("id, booking")
    .eq("id", id)
    .maybeSingle();

  if (rowError) throw new Error(rowError.message);
  if (!row) throw new Error("Registro no encontrado.");
  if (!row.booking) throw new Error("Este registro no tiene número de booking capturado.");

  const session = await loginCargolink();
  const operativosConocidos = await cargarOperativosConocidos(supabase);
  const resultado = await enriquecerImportacionDesdeCargolink(
    supabase,
    session,
    row.id,
    row.booking,
    operativosConocidos,
  );
  if (!resultado.ok) throw new Error(resultado.error);

  revalidatePath("/importaciones");
  revalidatePath(`/importaciones/${id}`);
}

export async function previsualizarSincronizacion(): Promise<PrevisualizacionSincronizacion> {
  const supabase = await createClient();
  return previsualizarSincronizacionCon(supabase);
}

export async function confirmarSincronizacion(
  filas: FilaSincronizacion[],
  totalRevisados: number,
): Promise<ResultadoSincronizacion> {
  const supabase = await createClient();
  const r = await confirmarSincronizacionCon(supabase, filas, totalRevisados);
  revalidatePath("/importaciones");
  return r;
}

// Hora de la última corrida (exitosa o no) de "Actualizar referencias",
// para mostrarla arriba del listado.
export async function obtenerUltimaSincronizacion(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sincronizacion_cargolink")
    .select("ejecutado_en")
    .order("ejecutado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.ejecutado_en as string | undefined) ?? null;
}

export async function addIncidencia(importacionId: number, formData: FormData) {
  const supabase = await createClient();
  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) throw new Error("El texto de la incidencia no puede estar vacío.");

  const { error } = await supabase
    .from("incidencias_importacion")
    .insert({ importacion_id: importacionId, texto });

  if (error) throw new Error(error.message);

  revalidatePath(`/importaciones/${importacionId}`);
}

export async function deleteIncidencia(importacionId: number, incidenciaId: number) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.puede_borrar) throw new Error("No tienes permiso para borrar.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("incidencias_importacion")
    .delete()
    .eq("id", incidenciaId);

  if (error) throw new Error(error.message);

  revalidatePath(`/importaciones/${importacionId}`);
}

export async function deleteImportacion(id: number) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.puede_borrar) throw new Error("No tienes permiso para borrar.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("seguimiento_importaciones")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/importaciones");
}
