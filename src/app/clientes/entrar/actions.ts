"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_PORTAL } from "@/lib/portalSesion";

const ERROR = "Usuario o contraseña incorrectos.";

// Acceso al portal de clientes.
// - Con correo: usuario de Seguimiento Importaciones que esté en portal_clientes_revisores.
// - Sin correo: usuario propio del cliente (portal_usuarios); 5 intentos fallidos bloquean 15 min.
export async function entrarPortal(_prev: { error: string } | undefined, formData: FormData) {
  const usuario = String(formData.get("usuario") ?? "").trim();
  const clave = String(formData.get("clave") ?? "");
  if (!usuario || !clave || usuario.length > 120 || clave.length > 200) return { error: ERROR };
  const supabase = await createClient();

  if (!usuario.includes("@")) {
    const { data } = await supabase.rpc("portal_entrar", { p_usuario: usuario, p_clave: clave });
    const s = (data ?? [])[0] as { token: string; cliente_clave: string } | undefined;
    if (!s) return { error: ERROR };
    (await cookies()).set(COOKIE_PORTAL, s.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/clientes",
      maxAge: 12 * 60 * 60,
    });
    redirect(`/clientes/${s.cliente_clave}`);
  }

  const { error } = await supabase.auth.signInWithPassword({ email: usuario, password: clave });
  if (error) return { error: ERROR };
  const { data: acceso } = await supabase.rpc("portal_clientes_acceso");
  if (acceso !== true) {
    await supabase.auth.signOut();
    return { error: "Este usuario no tiene acceso al portal de clientes." };
  }
  redirect("/clientes");
}

export async function salirPortal() {
  const supabase = await createClient();
  const jar = await cookies();
  const token = jar.get(COOKIE_PORTAL)?.value;
  if (token) {
    await supabase.rpc("portal_salir", { p_token: token });
    jar.delete({ name: COOKIE_PORTAL, path: "/clientes" });
  } else {
    await supabase.auth.signOut();
  }
  redirect("/clientes/entrar");
}
