import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { obtenerUsuario } from "@/lib/permissions";

// Sesión del portal de clientes. Dos formas de entrar:
// - revisor: usuario de Seguimiento Importaciones en portal_clientes_revisores (ve todos los clientes);
// - cliente: usuario propio del portal (portal_usuarios), cookie httpOnly con token; ve solo su cliente.
export const COOKIE_PORTAL = "portal_sesion";

// Prueba con usuarios de cliente (12 nov 2026): Ramón pidió cerrar el acceso por
// correo (Armando y Ramón). Para reabrirlo, cambiar a true.
export const REVISORES_ACTIVOS = false;

export type SesionPortal =
  | { tipo: "revisor"; email: string }
  | { tipo: "cliente"; usuario: string; clave: string; nombre: string; token: string }
  | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const sesionPortal = cache(async (): Promise<SesionPortal> => {
  const supabase = await createClient();
  const token = (await cookies()).get(COOKIE_PORTAL)?.value ?? "";
  if (UUID.test(token)) {
    const { data } = await supabase.rpc("portal_sesion", { p_token: token });
    const s = (data ?? [])[0] as { usuario: string; clave: string; nombre_visible: string } | undefined;
    if (s) return { tipo: "cliente", usuario: s.usuario, clave: s.clave, nombre: s.nombre_visible, token };
  }
  const user = REVISORES_ACTIVOS ? await obtenerUsuario() : null;
  if (user) {
    const { data: acceso } = await supabase.rpc("portal_clientes_acceso");
    if (acceso === true) return { tipo: "revisor", email: user.email ?? "" };
  }
  return null;
});
