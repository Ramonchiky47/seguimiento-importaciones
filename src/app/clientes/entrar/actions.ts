"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Acceso al portal de clientes: solo los usuarios de portal_clientes_revisores
// (por ahora Armando y Ramón). Cualquier otro se rechaza aunque tenga cuenta en Track.
export async function entrarPortal(_prev: { error: string } | undefined, formData: FormData) {
  const email = String(formData.get("usuario") ?? "").trim();
  const password = String(formData.get("clave") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Usuario o contraseña incorrectos." };
  const { data: acceso } = await supabase.rpc("portal_clientes_acceso");
  if (acceso !== true) {
    await supabase.auth.signOut();
    return { error: "Este usuario no tiene acceso al portal de clientes." };
  }
  redirect("/clientes");
}

export async function salirPortal() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/clientes/entrar");
}
