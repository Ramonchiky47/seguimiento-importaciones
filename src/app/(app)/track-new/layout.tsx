import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyPermissions } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

// Track New: misma información y captura que Track, con la vista guiada por
// fases. Convive con Track mientras se decide con cuál quedarse.
export default async function TrackNewLayout({ children }: { children: React.ReactNode }) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operaciones) redirect("/inicio");
  const supabase = await createClient();
  const { data: asigna } = await supabase.rpc("puedo_asignar_ejecutivo");

  const enlaces = [
    { href: "/track-new", label: "Bandeja" },
    { href: "/track/viajes", label: "Por viaje" },
    { href: "/track/tablero", label: "Tablero" },
    { href: "/track/bitacora", label: "Bitácora" },
    { href: "/track/cambios-cargolink", label: "Cambios en Cargolink" },
    ...(asigna === true ? [{ href: "/track/asignar-ejecutivos", label: "Asignar ejecutivos" }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-50">Track New</h1>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              Versión de prueba
            </span>
          </div>
          <nav aria-label="Secciones de Track New" className="flex flex-wrap gap-1">
            {enlaces.map((e) => (
              <Link
                key={e.href}
                href={e.href}
                className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                {e.label}
              </Link>
            ))}
            <Link
              href="/track/mi-dia"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Ir a Track clásico
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
