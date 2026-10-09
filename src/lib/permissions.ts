import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type MyPermissions = {
  es_admin: boolean;
  puede_exportar: boolean;
  puede_borrar: boolean;
  puede_operativos: boolean;
  puede_ver_ventas: boolean;
  puede_ver_crm: boolean;
  puede_comisiones: boolean;
  puede_pricing: boolean;
  puede_operaciones: boolean;
  puede_operaciones_exportacion: boolean;
  puede_transporte_terrestre: boolean;
  es_master: boolean;
};

const DEFAULT_PERMISSIONS: MyPermissions = {
  es_admin: false,
  puede_exportar: false,
  puede_borrar: false,
  puede_operativos: false,
  puede_ver_ventas: false,
  puede_ver_crm: false,
  puede_comisiones: false,
  puede_pricing: false,
  puede_operaciones: false,
  puede_operaciones_exportacion: false,
  puede_transporte_terrestre: false,
  es_master: false,
};

// cache(): una sola consulta por petición aunque la llamen el layout, el
// layout de la sección y la página (antes eran 2–3 viajes a Supabase).
export const getMyPermissions = cache(async (): Promise<MyPermissions> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_permissions");
  if (error || !data || !data[0]) return DEFAULT_PERMISSIONS;
  return data[0] as MyPermissions;
});

// Usuario de la sesión, también una sola vez por petición.
export const obtenerUsuario = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
