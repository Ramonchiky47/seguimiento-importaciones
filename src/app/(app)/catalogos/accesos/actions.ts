"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createAccesoUser(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const esAdmin = formData.get("es_admin") === "on";

  const { data: newUserId, error } = await supabase.rpc("create_app_user", {
    p_email: email,
    p_password: password,
    p_es_admin: esAdmin,
    p_puede_exportar: esAdmin || formData.get("puede_exportar") === "on",
    p_puede_borrar: esAdmin || formData.get("puede_borrar") === "on",
    p_puede_operativos: esAdmin || formData.get("puede_operativos") === "on",
    p_es_master: esAdmin || formData.get("es_master") === "on",
  });
  if (error) throw new Error(error.message);

  const { error: permError } = await supabase.rpc("set_app_user_permissions", {
    p_user_id: newUserId,
    p_es_admin: esAdmin,
    p_puede_exportar: esAdmin || formData.get("puede_exportar") === "on",
    p_puede_borrar: esAdmin || formData.get("puede_borrar") === "on",
    p_puede_operativos: esAdmin || formData.get("puede_operativos") === "on",
    p_es_master: esAdmin || formData.get("es_master") === "on",
    p_puede_ver_ventas: formData.get("puede_ver_ventas") === "on",
    p_puede_ver_crm: formData.get("puede_ver_crm") === "on",
    p_puede_comisiones: formData.get("puede_comisiones") === "on",
    p_puede_pricing: formData.get("puede_pricing") === "on",
    p_puede_operaciones: formData.get("puede_operaciones") === "on",
    p_puede_operaciones_exportacion: formData.get("puede_operaciones_exportacion") === "on",
  });
  if (permError) throw new Error(permError.message);

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

export async function deleteAccesoUser(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_app_user", {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/accesos");
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
    puede_ver_ventas: boolean;
    puede_ver_crm: boolean;
    puede_comisiones: boolean;
    puede_pricing: boolean;
    puede_operaciones: boolean;
    puede_operaciones_exportacion: boolean;
  },
  field:
    | "es_admin"
    | "puede_exportar"
    | "puede_borrar"
    | "puede_operativos"
    | "es_master"
    | "puede_ver_ventas"
    | "puede_ver_crm"
    | "puede_comisiones"
    | "puede_pricing"
    | "puede_operaciones"
    | "puede_operaciones_exportacion",
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
    p_puede_ver_ventas: next.puede_ver_ventas,
    p_puede_ver_crm: next.puede_ver_crm,
    p_puede_comisiones: next.puede_comisiones,
    p_puede_pricing: next.puede_pricing,
    p_puede_operaciones: next.puede_operaciones,
    p_puede_operaciones_exportacion: next.puede_operaciones_exportacion,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/catalogos/accesos");
}
