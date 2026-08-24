import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { toggleAccesoUserActivo, setAccesoUserPermission, setAccesoUserPassword, deleteAccesoUser } from "./actions";
import { ActivoToggle } from "@/components/ActivoToggle";
import { PermisosRow } from "@/components/PermisosRow";
import { PasswordEditor } from "@/components/PasswordEditor";
import { DeleteUserButton } from "@/components/DeleteUserButton";
import type { AppUser } from "@/types/catalogos";

export const dynamic = "force-dynamic";

export default async function AccesosPage() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    redirect("/importaciones");
  }

  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("list_app_users");

  const rows = (data ?? []) as AppUser[];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <Link
              href="/catalogos"
              className="mb-1 inline-block text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            >
              ← Volver a catálogos
            </Link>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Accesos</h1>
          </div>
          <Link
            href="/catalogos/accesos/nuevo"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            + Nuevo acceso
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          Usuarios que pueden iniciar sesión en esta app. Solo un administrador ve y gestiona esta pantalla.
          Administrador = acceso total. Los demás solo ven las tarjetas de inicio (Operativos, Ventas, Comercial,
          Administración) cuya casilla tengan marcada.
        </p>

        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            Error al cargar los datos: {error.message}
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Correo</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Operativo</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Permisos</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Contraseña</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Activo</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row) => {
                const isActive = !row.banned_until || new Date(row.banned_until) < new Date();
                const boundSetPermission = setAccesoUserPermission.bind(null, row.id);
                return (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300">{row.email}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300">
                      {row.operativo_asociado || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <PermisosRow
                        email={row.email}
                        initial={{
                          es_admin: row.es_admin ?? false,
                          puede_exportar: row.puede_exportar ?? false,
                          puede_borrar: row.puede_borrar ?? false,
                          puede_operativos: row.puede_operativos ?? false,
                          es_master: row.es_master ?? false,
                          puede_ver_ventas: row.puede_ver_ventas ?? false,
                          puede_ver_crm: row.puede_ver_crm ?? false,
                          puede_comisiones: row.puede_comisiones ?? false,
                          puede_pricing: row.puede_pricing ?? false,
                        }}
                        onChange={boundSetPermission}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <PasswordEditor id={row.id} onSave={setAccesoUserPassword} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <ActivoToggle id={row.id} activo={isActive} onToggle={toggleAccesoUserActivo} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.id !== currentUser?.id && (
                        <DeleteUserButton id={row.id} email={row.email} onDelete={deleteAccesoUser} />
                      )}
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                    No hay accesos todavía.
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
