import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyPermissions } from "@/lib/permissions";
import { CargaMasivaForm } from "@/components/CargaMasivaForm";
import { bulkImportImportaciones } from "./actions";
import { BULK_IMPORT_FIELDS, FIELD_LABELS } from "@/types/importacion";

export const dynamic = "force-dynamic";

export default async function CargaMasivaPage() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    redirect("/importaciones");
  }

  const headerLine = BULK_IMPORT_FIELDS.map((f) => FIELD_LABELS[f] ?? f).join(",");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <Link
            href="/catalogos"
            className="mb-1 inline-block text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Volver a catálogos
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Carga masiva</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-4 space-y-2 text-xs text-slate-500 dark:text-slate-400">
          <p>
            Pega texto separado por comas (o copiado de Excel, que usa tabs) con el renglón de
            encabezados primero. Si el Booking ya existe, se actualiza el registro; si no existe, se
            crea uno nuevo. El Booking es obligatorio en cada fila.
          </p>
          <p>
            Las fechas deben tener formato AAAA-MM-DD. El campo Seguro acepta SI / NO. Si un dato
            (como una dirección) tiene comas dentro, escríbelo entre comillas dobles, por ejemplo:{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
              &quot;No. 58, Fumin Road, Shanghai&quot;
            </code>
          </p>
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-slate-600 dark:text-slate-300">
              Encabezados esperados (cópialos como primer renglón):
            </p>
            <a
              href="/catalogos/carga-masiva/plantilla"
              className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Descargar plantilla (CSV)
            </a>
          </div>
          <pre className="overflow-x-auto rounded-md border border-slate-200 bg-white p-2 text-[10px] dark:border-slate-700 dark:bg-slate-900">
            {headerLine}
          </pre>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <CargaMasivaForm action={bulkImportImportaciones} headerLine={headerLine} />
        </div>
      </main>
    </div>
  );
}
