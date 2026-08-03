"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DATE_FIELDS, TEXT_FIELDS } from "@/types/importacion";
import { buscarBookingCargolink, mapCargolinkBookingToImportacion } from "@/lib/cargolink";
import { getMyPermissions } from "@/lib/permissions";

function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505" && error.message.includes("booking")) {
    return "Ya existe un registro con ese número de booking.";
  }
  return error.message;
}

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

  const diasDemoras = formData.get("dias_demoras");
  payload.dias_demoras = diasDemoras ? Number(diasDemoras) : null;

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

  const cargolinkBooking = await buscarBookingCargolink(row.booking);
  if (!cargolinkBooking) {
    throw new Error(`No se encontró el booking ${row.booking} en Cargolink.`);
  }

  const payload = mapCargolinkBookingToImportacion(cargolinkBooking, row.booking);

  let oficina: string | null = null;
  if (payload.vendedor) {
    const { data: vendedorRow } = await supabase
      .from("catalogo_vendedores")
      .select("plaza")
      .ilike("vendedor", payload.vendedor)
      .maybeSingle();
    oficina = (vendedorRow?.plaza as string | undefined) ?? null;
  }

  const { error: updateError } = await supabase
    .from("seguimiento_importaciones")
    .update({ ...payload, oficina })
    .eq("id", id);

  if (updateError) throw new Error(updateError.message);

  revalidatePath("/importaciones");
  revalidatePath(`/importaciones/${id}`);
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
