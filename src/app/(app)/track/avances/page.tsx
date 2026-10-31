import { AvanceProcesos } from "@/components/AvanceProcesos";
import { getMyPermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Avances de descarga: carga de bookings de Cargolink y rastreo de navieras (antes en el
// encabezado de Track; aquí para dejar limpia la pantalla).
export default async function AvancesPage() {
  const permisos = await getMyPermissions();
  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Avance de la carga de bookings desde Cargolink y del rastreo en las páginas de las navieras.
      </p>
      <AvanceProcesos esAdmin={permisos.es_admin === true} />
    </main>
  );
}
