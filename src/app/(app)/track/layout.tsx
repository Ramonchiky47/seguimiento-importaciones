import { redirect } from "next/navigation";
import { getMyPermissions } from "@/lib/permissions";
import { TrackTabs } from "@/components/TrackTabs";
import { OperacionDetalleModal } from "@/components/OperacionDetalleModal";
import { createClient } from "@/lib/supabase/server";

export default async function TrackLayout({ children }: { children: React.ReactNode }) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operaciones) {
    redirect("/inicio");
  }
  // Admins y usuarios autorizados en editores_cargolink (piloto).
  const supabase = await createClient();
  const { data: puedeEditarCargolink } = await supabase.rpc("puedo_editar_cargolink");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-6 pt-4">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Track</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Seguimiento por hitos de Operaciones Marítima · lo marcado en Cargolink cuenta como hecho
          </p>
          <div className="mt-2">
            <TrackTabs />
          </div>
        </div>
      </header>
      {children}
      {/* Misma ventana de indicadores y edición que Operaciones Marítima. */}
      <OperacionDetalleModal puedeEditar={puedeEditarCargolink === true} />
    </div>
  );
}
