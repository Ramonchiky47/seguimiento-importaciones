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
  es_master: false,
};

export async function getMyPermissions(): Promise<MyPermissions> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_permissions");
  if (error || !data || !data[0]) return DEFAULT_PERMISSIONS;
  return data[0] as MyPermissions;
}
