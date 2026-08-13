import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportacionForm } from "@/components/ImportacionForm";
import { IncidenciaForm } from "@/components/IncidenciaForm";
import { CatalogoDeleteButton } from "@/components/CatalogoDeleteButton";
import { updateImportacion, addIncidencia, deleteIncidencia } from "../actions";
import { getMyPermissions } from "@/lib/permissions";
import { calcularDiasDemoras } from "@/lib/dateLabels";
import type { Importacion, Incidencia } from "@/types/importacion";

export const dynamic = "force-dynamic";

export default async function EditarImportacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const myPermissions = await getMyPermissions();
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("seguimiento_importaciones")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    notFound();
  }

  const row = data as Importacion;
  row.dias_demoras = calcularDiasDemoras(row.ultimo_dia_libre_demoras);
  const boundUpdate = updateImportacion.bind(null, row.id);

  const { data: operativosData } = await supabase
    .from("catalogo_operativos")
    .select("nombre_operativo")
    .eq("activo", true)
    .order("nombre_operativo");

  const operativoOptions = (operativosData ?? []).map(
    (o) => o.nombre_operativo as string,
  );
  if (row.operativo && !operativoOptions.includes(row.operativo)) {
    operativoOptions.push(row.operativo);
  }

  const { data: terminalesData } = await supabase
    .from("catalogo_terminales_portuarias")
    .select("nombre")
    .order("nombre");

  const terminalPortuariaOptions = (terminalesData ?? []).map((t) => t.nombre as string);
  if (row.terminal_portuaria && !terminalPortuariaOptions.includes(row.terminal_portuaria)) {
    terminalPortuariaOptions.push(row.terminal_portuaria);
  }

  const { data: incidenciasData } = await supabase
    .from("incidencias_importacion")
    .select("*")
    .eq("importacion_id", row.id)
    .order("created_at", { ascending: false });

  const incidencias = (incidenciasData ?? []) as Incidencia[];
  const boundAddIncidencia = addIncidencia.bind(null, row.id);
  const boundDeleteIncidencia = deleteIncidencia.bind(null, row.id);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div>
            <Link
              href="/importaciones"
              className="mb-1 inline-block text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            >
              ← Volver al listado
            </Link>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {row.booking || `Registro #${row.id}`}
            </h1>
          </div>

          {myPermissions.puede_exportar && (
            <a
              href={`/importaciones/${row.id}/export-pdf`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Exportar a PDF
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <ImportacionForm
            action={boundUpdate}
            initialValue={row}
            operativoOptions={operativoOptions}
            terminalPortuariaOptions={terminalPortuariaOptions}
          />
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Incidencias
          </h2>

          <div className="mb-3">
            <IncidenciaForm action={boundAddIncidencia} />
          </div>

          {incidencias.length === 0 ? (
            <p className="text-[10px] text-slate-400 dark:text-slate-500">Sin incidencias registradas todavía.</p>
          ) : (
            <ul className="space-y-2">
              {incidencias.map((inc) => (
                <li
                  key={inc.id}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-[10px] dark:border-slate-700"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-500 dark:text-slate-400">{inc.fecha}</span>
                    {myPermissions.puede_borrar && (
                      <CatalogoDeleteButton
                        id={inc.id}
                        onDelete={boundDeleteIncidencia}
                        confirmMessage="¿Eliminar esta incidencia?"
                      />
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">{inc.texto}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
