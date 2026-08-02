import { createClient } from "@/lib/supabase/server";

export type MyPermissions = {
  es_admin: boolean;
  puede_exportar: boolean;
  puede_borrar: boolean;
  puede_operativos: boolean;
  puede_vendedores: boolean;
  puede_accesos: boolean;
  es_master: boolean;
};

const DEFAULT_PERMISSIONS: MyPermissions = {
  es_admin: false,
  puede_exportar: false,
  puede_borrar: false,
  puede_operativos: false,
  puede_vendedores: false,
  puede_accesos: false,
  es_master: false,
};

export async function getMyPermissions(): Promise<MyPermissions> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_permissions");
  if (error || !data || !data[0]) return DEFAULT_PERMISSIONS;
  return data[0] as MyPermissions;
}
