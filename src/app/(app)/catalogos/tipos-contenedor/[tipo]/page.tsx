import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TipoContenedorForm } from "@/components/TipoContenedorForm";
import { updateTipoContenedor } from "../actions";
import { getMyPermissions } from "@/lib/permissions";
import type { CatalogoTipoContenedor } from "@/types/catalogos";

export const dynamic = "force-dynamic";

export default async function EditarTipoContenedorPage({
  params,
}: {
  params: Promise<{ tipo: string }>;
}) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    redirect("/importaciones");
  }

  const { tipo } = await params;
  const tipoContenedor = decodeURIComponent(tipo);
  const supabase = await createClient();

  const { data } = await supabase
    .from("catalogo_tipos_contenedor")
    .select("*")
    .eq("tipo_contenedor", tipoContenedor)
    .maybeSingle();

  if (!data) {
    notFound();
  }

  const row = data as CatalogoTipoContenedor;
  const boundUpdate = updateTipoContenedor.bind(null, row.tipo_contenedor);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link
            href="/catalogos/tipos-contenedor"
            className="mb-1 inline-block text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Volver a tipos de contenedor
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Editar {row.tipo_contenedor}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <TipoContenedorForm action={boundUpdate} initialValue={row} />
        </div>
      </main>
    </div>
  );
}
