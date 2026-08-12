import { ImportacionForm } from "@/components/ImportacionForm";
import { createImportacion } from "../actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NuevaImportacionPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalogo_operativos")
    .select("nombre_operativo")
    .eq("activo", true)
    .order("nombre_operativo");

  const operativoOptions = (data ?? []).map((row) => row.nombre_operativo as string);

  const { data: terminalesData } = await supabase
    .from("catalogo_terminales_portuarias")
    .select("nombre")
    .order("nombre");

  const terminalPortuariaOptions = (terminalesData ?? []).map((t) => t.nombre as string);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Nuevo registro</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <ImportacionForm
            action={createImportacion}
            operativoOptions={operativoOptions}
            terminalPortuariaOptions={terminalPortuariaOptions}
          />
        </div>
      </main>
    </div>
  );
}
