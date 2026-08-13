"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";

async function requireAdmin() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) throw new Error("Solo un administrador puede gestionar vendedores.");
}

export async function createVendedor(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const vendedor = String(formData.get("vendedor") ?? "").trim();
  const plaza = String(formData.get("plaza") ?? "").trim();

  const { error } = await supabase.from("catalogo_vendedores").insert({ vendedor, plaza });
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/vendedores");
  redirect("/catalogos/vendedores");
}

export async function updateVendedor(id: number, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const vendedor = String(formData.get("vendedor") ?? "").trim();
  const plaza = String(formData.get("plaza") ?? "").trim();

  const { error } = await supabase
    .from("catalogo_vendedores")
    .update({ vendedor, plaza })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/vendedores");
  redirect("/catalogos/vendedores");
}

export async function deleteVendedor(id: number) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_vendedores").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/vendedores");
}
