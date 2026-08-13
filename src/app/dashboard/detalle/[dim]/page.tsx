import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMonthLabel } from "@/lib/dateLabels";

export const dynamic = "force-dynamic";

type FieldName = "naviera" | "agente" | "pod" | "pol" | "oficina" | "operativo";

const DIM_CONFIG: Record<string, { field: FieldName; title: string; multiValue?: boolean }> = {
  naviera: { field: "naviera", title: "Naviera" },
  agente: { field: "agente", title: "Agente en el extranjero" },
  pod: { field: "pod", title: "POD" },
  pol: { field: "pol", title: "POL" },
  plaza: { field: "oficina", title: "Plaza" },
  operativo: { field: "operativo", title: "Operativo", multiValue: true },
};

type Row = {
  naviera: string | null;
  agente: string | null;
  pod: string | null;
  pol: string | null;
  oficina: string | null;
  operativo: string | null;
  type: string | null;
  fecha: string | null;
  estatus: string;
};

export default async function DashboardDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ dim: string }>;
  searchParams: Promise<{
    mes?: string;
    pol?: string | string[];
    pod?: string | string[];
    estatus?: string;
  }>;
}) {
  const { dim } = await params;
  const { mes, pol, pod, estatus } = await searchParams;
  const polRaw = pol ? (Array.isArray(pol) ? pol : [pol]) : [];
  const podRaw = pod ? (Array.isArray(pod) ? pod : [pod]) : [];
  const config = DIM_CONFIG[dim];
  if (!config) notFound();

  const supabase = await createClient();
  // Paginado — PostgREST recorta a 1000 filas por default y la tabla ya
  // pasó de eso (ver mismo fix en dashboard/page.tsx).
  let rows: Row[] = [];
  {
    const TAM_PAGINA = 500;
    let desde = 0;
    while (true) {
      const { data } = await supabase
        .from("seguimiento_importaciones")
        .select("naviera, agente, pod, pol, oficina, operativo, type, fecha, estatus")
        .range(desde, desde + TAM_PAGINA - 1);
      const pagina = (data ?? []) as Row[];
      rows.push(...pagina);
      if (pagina.length < TAM_PAGINA) break;
      desde += TAM_PAGINA;
    }
  }

  if (mes) rows = rows.filter((r) => r.fecha?.startsWith(mes));
  if (polRaw.length > 0) rows = rows.filter((r) => polRaw.includes(r.pol?.trim() ?? ""));
  if (podRaw.length > 0) rows = rows.filter((r) => podRaw.includes(r.pod?.trim() ?? ""));
  if (estatus) rows = rows.filter((r) => r.estatus === estatus);

  const serviceTypes = Array.from(
    new Set(rows.map((r) => r.type?.trim().toUpperCase() || "SIN SERVICIO")),
  ).sort();

  // Cuando el campo puede traer varios valores en una sola fila (ej.
  // "Adriana del Rosario Avila, EMMANUEL PULIDO" en operativo), se cuenta el
  // booking una vez por cada valor listado, igual que hace la restricción de
  // visibilidad por operativo (que también trata el campo como una lista).
  const groups = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const raw = r[config.field]?.trim();
    if (!raw) continue;
    const keys = config.multiValue
      ? raw.split(",").map((k) => k.trim()).filter(Boolean)
      : [raw];
    const service = r.type?.trim().toUpperCase() || "SIN SERVICIO";
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, new Map());
      const byService = groups.get(key)!;
      byService.set(service, (byService.get(service) ?? 0) + 1);
    }
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
    estatus ? `Estatus: ${estatus}` : null,
    mes ? formatMonthLabel(mes) : null,
    polRaw.length > 0 ? `POL: ${polRaw.join(", ")}` : null,
    podRaw.length > 0 ? `POD: ${podRaw.join(", ")}` : null,
  ].filter(Boolean);

  const rowHref = (label: string) => {
    if (!config.multiValue) return null;
    const params = new URLSearchParams();
    if (estatus) params.set("estatus", estatus);
    if (mes) params.set("mes", mes);
    for (const v of polRaw) params.append("pol", v);
    for (const v of podRaw) params.append("pod", v);
    const query = params.toString();
    return `/dashboard/detalle/${dim}/${encodeURIComponent(label)}${query ? `?${query}` : ""}`;
  };

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
              {table.map((row) => {
                const href = rowHref(row.label);
                const cells = (
                  <>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                      {href ? (
                        <Link href={href} className="text-blue-600 hover:underline dark:text-blue-400">
                          {row.label}
                        </Link>
                      ) : (
                        row.label
                      )}
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
                  </>
                );
                return (
                  <tr key={row.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    {cells}
                  </tr>
                );
              })}

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
