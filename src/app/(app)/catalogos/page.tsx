import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyPermissions } from "@/lib/permissions";

export default async function CatalogosPage() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operativos) {
    redirect("/importaciones");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Catálogos</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {myPermissions.es_admin && (
            <Link
              href="/catalogos/vendedores"
              className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Vendedores</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Vendedor y plaza asignada. Se usa para derivar la Oficina.
              </p>
            </Link>
          )}

          {(myPermissions.es_admin || myPermissions.puede_operativos) && (
            <Link
              href="/catalogos/operativos"
              className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Operativos</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Nombre del operativo y si está activo. Alimenta el selector de Operativo.
              </p>
            </Link>
          )}

          {myPermissions.es_admin && (
            <Link
              href="/catalogos/terminales-portuarias"
              className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                Terminales Portuarias
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Catálogo de terminales portuarias. Alimenta el selector de Terminal Portuaria.
              </p>
            </Link>
          )}

          {myPermissions.es_admin && (
            <Link
              href="/catalogos/tipos-contenedor"
              className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                Tipos de Contenedor
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Tipo de contenedor y su equivalencia en TEU. Se usará para cálculos.
              </p>
            </Link>
          )}

          {myPermissions.es_admin && (
            <Link
              href="/catalogos/accesos"
              className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Accesos</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Usuarios que pueden iniciar sesión en la app. Crea o desactiva accesos.
              </p>
            </Link>
          )}

          {myPermissions.es_admin && (
            <Link
              href="/catalogos/carga-masiva"
              className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Carga masiva</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Pega varias filas desde Excel para crear o actualizar registros de una sola vez.
              </p>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
