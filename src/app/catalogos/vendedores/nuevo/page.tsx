import Link from "next/link";
import { redirect } from "next/navigation";
import { VendedorForm } from "@/components/VendedorForm";
import { createVendedor } from "../actions";
import { getMyPermissions } from "@/lib/permissions";

export default async function NuevoVendedorPage() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    redirect("/importaciones");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link
            href="/catalogos/vendedores"
            className="mb-1 inline-block text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Volver a vendedores
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Nuevo vendedor</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <VendedorForm action={createVendedor} />
        </div>
      </main>
    </div>
  );
}
