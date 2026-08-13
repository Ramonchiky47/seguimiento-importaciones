"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";

async function requireAdmin() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    throw new Error("Solo un administrador puede gestionar tipos de contenedor.");
  }
}

function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "Ya existe un tipo de contenedor con esa clave.";
  }
  return error.message;
}

export async function createTipoContenedor(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const tipo_contenedor = String(formData.get("tipo_contenedor") ?? "").trim();
  const teu = Number(formData.get("teu"));

  const { error } = await supabase.from("catalogo_tipos_contenedor").insert({ tipo_contenedor, teu });
  if (error) throw new Error(friendlyDbError(error));

  revalidatePath("/catalogos/tipos-contenedor");
  redirect("/catalogos/tipos-contenedor");
}

export async function updateTipoContenedor(tipoContenedor: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const teu = Number(formData.get("teu"));

  const { error } = await supabase
    .from("catalogo_tipos_contenedor")
    .update({ teu })
    .eq("tipo_contenedor", tipoContenedor);
  if (error) throw new Error(friendlyDbError(error));

  revalidatePath("/catalogos/tipos-contenedor");
  redirect("/catalogos/tipos-contenedor");
}

export async function deleteTipoContenedor(tipoContenedor: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("catalogo_tipos_contenedor")
    .delete()
    .eq("tipo_contenedor", tipoContenedor);
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/tipos-contenedor");
}
