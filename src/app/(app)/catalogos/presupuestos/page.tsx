import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyPermissions } from "@/lib/permissions";

export default async function CatalogosPresupuestosPage() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    redirect("/catalogos");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <Link href="/catalogos" className="mb-1 block text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
            ← Catálogos
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Presupuestos</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/catalogos/vendedores"
            className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
          >
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Vendedores</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Vendedor y plaza asignada. Se usa para derivar la Oficina.
            </p>
          </Link>

          <a
            href={`/api/sso/webapp?next=${encodeURIComponent("/catalogos/desarrolladores")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
          >
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Desarrolladores</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Catálogo de desarrolladores de la app de reporte de vendedores.
            </p>
          </a>

          <a
            href={`/api/sso/webapp?next=${encodeURIComponent("/catalogos/presupuesto")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
          >
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Presupuesto</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Catálogo de presupuesto de la app de reporte de vendedores.
            </p>
          </a>
        </div>
      </main>
    </div>
  );
}
