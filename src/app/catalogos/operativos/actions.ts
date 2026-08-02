"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";

async function requireOperativosAccess() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operativos) {
    throw new Error("No tienes acceso al catálogo de Operativos.");
  }
  return myPermissions;
}

export async function createOperativo(formData: FormData) {
  await requireOperativosAccess();
  const supabase = await createClient();
  const nombre_operativo = String(formData.get("nombre_operativo") ?? "").trim();
  const activo = formData.get("activo") === "on";
  const user_id = String(formData.get("user_id") ?? "").trim() || null;

  const { error } = await supabase
    .from("catalogo_operativos")
    .insert({ nombre_operativo, activo, user_id });
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/operativos");
  redirect("/catalogos/operativos");
}

export async function updateOperativo(id: number, formData: FormData) {
  await requireOperativosAccess();
  const supabase = await createClient();
  const nombre_operativo = String(formData.get("nombre_operativo") ?? "").trim();
  const activo = formData.get("activo") === "on";
  const user_id = String(formData.get("user_id") ?? "").trim() || null;

  const { error } = await supabase
    .from("catalogo_operativos")
    .update({ nombre_operativo, activo, user_id })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/operativos");
  redirect("/catalogos/operativos");
}

export async function deleteOperativo(id: number) {
  const myPermissions = await requireOperativosAccess();
  if (!myPermissions.es_admin && !myPermissions.puede_borrar) {
    throw new Error("No tienes permiso para borrar.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_operativos").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/operativos");
}

export async function toggleOperativoActivo(id: string | number, activo: boolean) {
  await requireOperativosAccess();
  const supabase = await createClient();
  const { error } = await supabase
    .from("catalogo_operativos")
    .update({ activo })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/operativos");
}
