"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createAccesoUser(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const esAdmin = formData.get("es_admin") === "on";

  const { error } = await supabase.rpc("create_app_user", {
    p_email: email,
    p_password: password,
    p_es_admin: esAdmin,
    p_puede_exportar: esAdmin || formData.get("puede_exportar") === "on",
    p_puede_borrar: esAdmin || formData.get("puede_borrar") === "on",
    p_puede_operativos: esAdmin || formData.get("puede_operativos") === "on",
    p_es_master: esAdmin || formData.get("es_master") === "on",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/accesos");
  redirect("/catalogos/accesos");
}

export async function setAccesoUserPassword(userId: string, newPassword: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_app_user_password", {
    p_user_id: userId,
    p_new_password: newPassword,
  });
  if (error) throw new Error(error.message);
}

export async function toggleAccesoUserActivo(userId: string | number, activo: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_app_user_banned", {
    p_user_id: userId,
    p_banned: !activo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/accesos");
}

export async function setAccesoUserPermission(
  userId: string,
  current: {
    es_admin: boolean;
    puede_exportar: boolean;
    puede_borrar: boolean;
    puede_operativos: boolean;
    es_master: boolean;
  },
  field: "es_admin" | "puede_exportar" | "puede_borrar" | "puede_operativos" | "es_master",
  value: boolean,
) {
  const supabase = await createClient();
  const next = { ...current, [field]: value };

  const { error } = await supabase.rpc("set_app_user_permissions", {
    p_user_id: userId,
    p_es_admin: next.es_admin,
    p_puede_exportar: next.puede_exportar,
    p_puede_borrar: next.puede_borrar,
    p_puede_operativos: next.puede_operativos,
    p_es_master: next.es_master,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/accesos");
}
