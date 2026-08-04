import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMonthLabel } from "@/lib/dateLabels";

export const dynamic = "force-dynamic";

type FieldName = "naviera" | "agente" | "pod" | "pol" | "oficina";

const DIM_CONFIG: Record<string, { field: FieldName; title: string }> = {
  naviera: { field: "naviera", title: "Naviera" },
  agente: { field: "agente", title: "Agente en el extranjero" },
  pod: { field: "pod", title: "POD" },
  pol: { field: "pol", title: "POL" },
  plaza: { field: "oficina", title: "Plaza" },
};

type Row = {
  naviera: string | null;
  agente: string | null;
  pod: string | null;
  pol: string | null;
  oficina: string | null;
  type: string | null;
  fecha: string | null;
};

export default async function DashboardDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ dim: string }>;
  searchParams: Promise<{ mes?: string; pol?: string | string[]; pod?: string | string[] }>;
}) {
  const { dim } = await params;
  const { mes, pol, pod } = await searchParams;
  const polRaw = pol ? (Array.isArray(pol) ? pol : [pol]) : [];
  const podRaw = pod ? (Array.isArray(pod) ? pod : [pod]) : [];
  const config = DIM_CONFIG[dim];
  if (!config) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("seguimiento_importaciones")
    .select("naviera, agente, pod, pol, oficina, type, fecha");
  let rows = (data ?? []) as Row[];

  if (mes) rows = rows.filter((r) => r.fecha?.startsWith(mes));
  if (polRaw.length > 0) rows = rows.filter((r) => polRaw.includes(r.pol?.trim() ?? ""));
  if (podRaw.length > 0) rows = rows.filter((r) => podRaw.includes(r.pod?.trim() ?? ""));

  const serviceTypes = Array.from(
    new Set(rows.map((r) => r.type?.trim().toUpperCase() || "SIN SERVICIO")),
  ).sort();

  const groups = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = r[config.field]?.trim();
    if (!key) continue;
    const service = r.type?.trim().toUpperCase() || "SIN SERVICIO";
    if (!groups.has(key)) groups.set(key, new Map());
    const byService = groups.get(key)!;
    byService.set(service, (byService.get(service) ?? 0) + 1);
  }

  const table = Array.from(groups.entries())
    .map(([label, byService]) => {
      const total = Array.from(byService.values()).reduce((sum, n) => sum + n, 0);
      return { label, total, byService };
    })
    .sort((a, b) => b.total - a.total);

  const backParams = new URLSearchParams();
  if (mes) backParams.set("mes", mes);
  for (const v of polRaw) backParams.append("pol", v);
  for (const v of podRaw) backParams.append("pod", v);
  const backQuery = backParams.toString();
  const backHref = `/dashboard${backQuery ? `?${backQuery}` : ""}`;

  const activeFilters = [
    mes ? formatMonthLabel(mes) : null,
    polRaw.length > 0 ? `POL: ${polRaw.join(", ")}` : null,
    podRaw.length > 0 ? `POD: ${podRaw.join(", ")}` : null,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <Link
            href={backHref}
            className="mb-1 inline-block text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Volver al dashboard
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Detalle: Embarques por {config.title}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {activeFilters.length > 0 ? activeFilters.join(" · ") : "Todos los meses"} · Ordenado de
            mayor a menor
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  {config.title}
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  Total
                </th>
                {serviceTypes.map((service) => (
                  <th
                    key={service}
                    className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400"
                  >
                    {service}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {table.map((row) => (
                <tr key={row.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                    {row.label}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums text-slate-900 dark:text-slate-50">
                    {row.total}
                  </td>
                  {serviceTypes.map((service) => (
                    <td
                      key={service}
                      className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300"
                    >
                      {row.byService.get(service) ?? 0}
                    </td>
                  ))}
                </tr>
              ))}

              {table.length === 0 && (
                <tr>
                  <td
                    colSpan={2 + serviceTypes.length}
                    className="px-4 py-8 text-center text-slate-400 dark:text-slate-500"
                  >
                    No hay datos para estos filtros.
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
