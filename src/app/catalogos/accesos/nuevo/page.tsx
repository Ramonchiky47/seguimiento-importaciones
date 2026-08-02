import Link from "next/link";
import { redirect } from "next/navigation";
import { AccesoForm } from "@/components/AccesoForm";
import { createAccesoUser } from "../actions";
import { getMyPermissions } from "@/lib/permissions";

export default async function NuevoAccesoPage() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    redirect("/importaciones");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link
            href="/catalogos/accesos"
            className="mb-1 inline-block text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Volver a accesos
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Nuevo acceso</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <AccesoForm action={createAccesoUser} />
        </div>
      </main>
    </div>
  );
}
