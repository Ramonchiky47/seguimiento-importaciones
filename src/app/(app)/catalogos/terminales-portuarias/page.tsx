import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteTerminalPortuaria } from "./actions";
import { CatalogoDeleteButton } from "@/components/CatalogoDeleteButton";
import { getMyPermissions } from "@/lib/permissions";
import type { CatalogoTerminalPortuaria } from "@/types/catalogos";

export const dynamic = "force-dynamic";

export default async function TerminalesPortuariasPage() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    redirect("/importaciones");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogo_terminales_portuarias")
    .select("*")
    .order("nombre");

  const rows = (data ?? []) as CatalogoTerminalPortuaria[];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <Link
              href="/catalogos"
              className="mb-1 inline-block text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            >
              ← Volver a catálogos
            </Link>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Terminales Portuarias
            </h1>
          </div>
          <Link
            href="/catalogos/terminales-portuarias/nuevo"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            + Nueva terminal
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            Error al cargar los datos: {error.message}
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">ID</th>
                <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                  Nombre Terminal Portuaria
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-slate-500 dark:text-slate-400">
                    {row.codigo}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-700 dark:text-slate-300">
                    {row.nombre}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/catalogos/terminales-portuarias/${row.id}`}
                        className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50"
                      >
                        Editar
                      </Link>
                      <CatalogoDeleteButton id={row.id} onDelete={deleteTerminalPortuaria} />
                    </div>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && !error && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-slate-400 dark:text-slate-500">
                    No hay terminales portuarias todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
