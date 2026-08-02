import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteOperativo, toggleOperativoActivo } from "./actions";
import { CatalogoDeleteButton } from "@/components/CatalogoDeleteButton";
import { ActivoToggle } from "@/components/ActivoToggle";
import { getMyPermissions } from "@/lib/permissions";
import type { AppUser, CatalogoOperativo } from "@/types/catalogos";

export const dynamic = "force-dynamic";

export default async function OperativosPage() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operativos) {
    redirect("/importaciones");
  }
  const canDelete = myPermissions.es_admin || myPermissions.puede_borrar;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalogo_operativos")
    .select("*")
    .order("nombre_operativo");

  const rows = (data ?? []) as CatalogoOperativo[];

  const { data: usersData } = await supabase.rpc("list_app_users");
  const usersById = new Map(
    ((usersData ?? []) as AppUser[]).map((u) => [u.id, u.email]),
  );

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
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Operativos</h1>
          </div>
          <Link
            href="/catalogos/operativos/nuevo"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            + Nuevo operativo
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
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Nombre operativo</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Usuario</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Activo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300">
                    {row.nombre_operativo}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300">
                    {row.user_id ? (usersById.get(row.user_id) ?? "—") : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <ActivoToggle id={row.id} activo={row.activo} onToggle={toggleOperativoActivo} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/catalogos/operativos/${row.id}`}
                        className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50"
                      >
                        Editar
                      </Link>
                      {canDelete && (
                        <CatalogoDeleteButton id={row.id} onDelete={deleteOperativo} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && !error && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                    No hay operativos todavía.
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
