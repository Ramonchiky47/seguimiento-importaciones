"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";

async function requireAdmin() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    throw new Error("Solo un administrador puede gestionar terminales portuarias.");
  }
}

function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Ya existe una terminal portuaria con ese nombre.";
  }
  return error.message;
}

export async function createTerminalPortuaria(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const nombre = String(formData.get("nombre") ?? "").trim();

  const { error } = await supabase.from("catalogo_terminales_portuarias").insert({ nombre });
  if (error) throw new Error(friendlyDbError(error));

  revalidatePath("/catalogos/terminales-portuarias");
  redirect("/catalogos/terminales-portuarias");
}

export async function updateTerminalPortuaria(id: number, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const nombre = String(formData.get("nombre") ?? "").trim();

  const { error } = await supabase
    .from("catalogo_terminales_portuarias")
    .update({ nombre })
    .eq("id", id);
  if (error) throw new Error(friendlyDbError(error));

  revalidatePath("/catalogos/terminales-portuarias");
  redirect("/catalogos/terminales-portuarias");
}

export async function deleteTerminalPortuaria(id: number) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_terminales_portuarias").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/terminales-portuarias");
}
