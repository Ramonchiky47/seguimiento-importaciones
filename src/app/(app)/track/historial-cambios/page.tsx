import { createClient } from "@/lib/supabase/server";
import { obtenerUsuario } from "@/lib/permissions";
import { HistorialCambios } from "./HistorialCambios";
import type { SolicitudCambio } from "./tipos";

export const dynamic = "force-dynamic";

// Historial de cambios: solicitudes de cambio a la app, priorizadas, con su historial
// de modificaciones y conversación por usuario.
export default async function HistorialCambiosPage() {
  const supabase = await createClient();
  const [{ data, error }, usuario] = await Promise.all([supabase.rpc("sc_lista"), obtenerUsuario()]);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      {error ? (
        <p className="text-sm text-red-700">No se pudo cargar el historial de cambios.</p>
      ) : (
        <HistorialCambios solicitudes={(data ?? []) as SolicitudCambio[]} hoy={hoy} usuario={usuario?.email ?? ""} />
      )}
    </main>
  );
}
