import { createClient } from "@supabase/supabase-js";

// Cliente con la clave de servicio: SOLO para tareas programadas del
// servidor (sin usuario). Nunca importarlo desde código del navegador.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
