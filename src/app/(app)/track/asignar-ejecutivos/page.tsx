import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { datosAsignacionEjecutivos } from "@/app/(app)/operaciones-maritima/actions";
import { AsignarEjecutivosTabla } from "@/components/AsignarEjecutivosTabla";

export const dynamic = "force-dynamic";

// Bookings vigentes sin ejecutivo (todos los clientes) con un ejecutivo
// propuesto por historial; quien asigna decide si se queda o lo cambia.
// Solo administradores y asignadores_ejecutivo (Adriana Ávila, Jair Pineda).
export default async function AsignarEjecutivosPage() {
  const supabase = await createClient();
  const { data: puede } = await supabase.rpc("puedo_asignar_ejecutivo");
  if (puede !== true) redirect("/track/mi-dia");

  const { ok, mensaje, filas, usuarios } = await datosAsignacionEjecutivos();

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Bookings vigentes sin ejecutivo en Cargolink. La propuesta es el ejecutivo que más bookings ha llevado de ese
        cliente en los últimos 12 meses (o 24, si no hay); puedes dejarla o cambiarla antes de asignar.
      </p>
      {!ok && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          No se pudo cargar: {mensaje}
        </p>
      )}
      {ok && <AsignarEjecutivosTabla filas={filas} usuarios={usuarios} />}
    </main>
  );
}
