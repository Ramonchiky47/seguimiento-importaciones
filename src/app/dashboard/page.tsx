import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { StatTile } from "@/components/StatTile";
import { HorizontalBarChart } from "@/components/HorizontalBarChart";
import { MonthlyBarChart } from "@/components/MonthlyBarChart";
import { MonthFilter } from "@/components/MonthFilter";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";

export const dynamic = "force-dynamic";

type Row = {
  naviera: string | null;
  agente: string | null;
  pod: string | null;
  pol: string | null;
  oficina: string | null;
  operativo: string | null;
  fecha: string | null;
  estatus: string;
  type: string | null;
  contenedor: string | null;
  cantidad_contenedores_tipo: string | null;
};

// Matches strings like "6 contenedores (Tipo 40 HC,40 OT)" produced by
// buildCantidadContenedoresTipo() in lib/cargolink.ts. When a booking lists
// several types for one total count, the type string is kept combined
// (e.g. "40 HC, 40 OT") instead of guessing a split per type.
function parseContenedoresTipo(text: string | null): { count: number; type: string } | null {
  if (!text) return null;
  const match = text.match(/^(\d+)\s+contenedor(?:es)?\s*\(Tipo\s+(.+)\)\s*$/i);
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return null;
  return { count, type: match[2].trim().replace(/,/g, ", ") };
}

function topGroups(rows: Row[], field: keyof Row, limit: number) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r[field]?.toString().trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function monthlyGroups(rows: Row[]) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.fecha) continue;
    const month = r.fecha.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; pol?: string | string[]; pod?: string | string[] }>;
}) {
  const { mes, pol, pod } = await searchParams;
  const polRaw = pol ? (Array.isArray(pol) ? pol : [pol]) : [];
  const podRaw = pod ? (Array.isArray(pod) ? pod : [pod]) : [];
  const supabase = await createClient();

  const { data } = await supabase
    .from("seguimiento_importaciones")
    .select(
      "naviera, agente, pod, pol, oficina, operativo, fecha, estatus, type, contenedor, cantidad_contenedores_tipo",
    );
  const allRows = (data ?? []) as Row[];

  const availableMonths = Array.from(
    new Set(allRows.map((r) => r.fecha?.slice(0, 7)).filter((m): m is string => Boolean(m))),
  ).sort((a, b) => b.localeCompare(a));
  const availablePol = Array.from(
    new Set(allRows.map((r) => r.pol?.trim()).filter((v): v is string => Boolean(v))),
  ).sort();
  const availablePod = Array.from(
    new Set(allRows.map((r) => r.pod?.trim()).filter((v): v is string => Boolean(v))),
  ).sort();

  // The month/POL/POD filters apply only to the "embarques por X" breakdown
  // charts — the monthly trend chart and KPI tiles always reflect the full dataset.
  const filteredRows = allRows.filter((r) => {
    if (mes && !r.fecha?.startsWith(mes)) return false;
    if (polRaw.length > 0 && !polRaw.includes(r.pol?.trim() ?? "")) return false;
    if (podRaw.length > 0 && !podRaw.includes(r.pod?.trim() ?? "")) return false;
    return true;
  });

  const totalCount = allRows.length;
  const countByEstatus = allRows.reduce(
    (acc, r) => {
      if (r.estatus === "Vigente" || r.estatus === "Finalizado" || r.estatus === "Cancelado") {
        acc[r.estatus]++;
      }
      return acc;
    },
    { Vigente: 0, Finalizado: 0, Cancelado: 0 },
  );

  const byMonth = monthlyGroups(allRows);
  const byNaviera = topGroups(filteredRows, "naviera", 8);
  const byAgente = topGroups(filteredRows, "agente", 8);
  const byPod = topGroups(filteredRows, "pod", 8);
  const byPol = topGroups(filteredRows, "pol", 8);
  const byPlaza = topGroups(filteredRows, "oficina", 8);

  // Solo bookings FCLI: contenedores por tipo (suma) y detección de
  // registros sin contenedor registrado. Respeta los mismos filtros de
  // mes/POL/POD que las gráficas de "embarques por X" de arriba.
  const fclRows = filteredRows.filter((r) => r.type?.trim().toUpperCase() === "FCLI");
  const containerTypeCounts = new Map<string, number>();
  for (const r of fclRows) {
    const parsed = parseContenedoresTipo(r.cantidad_contenedores_tipo);
    if (!parsed) continue;
    containerTypeCounts.set(parsed.type, (containerTypeCounts.get(parsed.type) ?? 0) + parsed.count);
  }
  const byContainerType = Array.from(containerTypeCounts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const totalContenedoresFcl = byContainerType.reduce((sum, d) => sum + d.value, 0);
  const fclSinContenedor = fclRows.filter((r) => !r.contenedor?.trim());

  // Operaciones vigentes por operativo, con desglose FCLI/LCLI. El campo
  // operativo puede traer varios nombres separados por coma en una misma
  // fila (ej. "Adriana del Rosario Avila, EMMANUEL PULIDO"), así que el
  // booking se cuenta una vez por cada nombre listado.
  const vigenteRows = filteredRows.filter((r) => r.estatus === "Vigente");
  const operativoStats = new Map<string, { total: number; fcli: number; lcli: number }>();
  for (const r of vigenteRows) {
    const raw = r.operativo?.trim();
    if (!raw) continue;
    const type = r.type?.trim().toUpperCase();
    for (const name of raw.split(",").map((n) => n.trim()).filter(Boolean)) {
      if (!operativoStats.has(name)) operativoStats.set(name, { total: 0, fcli: 0, lcli: 0 });
      const stat = operativoStats.get(name)!;
      stat.total++;
      if (type === "FCLI") stat.fcli++;
      else if (type === "LCLI") stat.lcli++;
    }
  }
  const operativoTable = Array.from(operativoStats.entries())
    .map(([label, stat]) => ({ label, ...stat }))
    .sort((a, b) => b.total - a.total);

  const operativoBookingsHref = (label: string) => {
    const params = new URLSearchParams();
    params.set("estatus", "Vigente");
    if (mes) params.set("mes", mes);
    for (const v of polRaw) params.append("pol", v);
    for (const v of podRaw) params.append("pod", v);
    return `/dashboard/detalle/operativo/${encodeURIComponent(label)}?${params.toString()}`;
  };

  const detailHref = (dim: string) => {
    const params = new URLSearchParams();
    if (mes) params.set("mes", mes);
    for (const v of polRaw) params.append("pol", v);
    for (const v of podRaw) params.append("pod", v);
    const query = params.toString();
    return `/dashboard/detalle/${dim}${query ? `?${query}` : ""}`;
  };

  const sinContenedorHref = (() => {
    const params = new URLSearchParams();
    if (mes) params.set("mes", mes);
    for (const v of polRaw) params.append("pol", v);
    for (const v of podRaw) params.append("pod", v);
    const query = params.toString();
    return `/dashboard/sin-contenedor${query ? `?${query}` : ""}`;
  })();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Dashboard</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/importaciones"
              className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            >
              ← Seguimiento de Importaciones
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Total de embarques" value={totalCount} />
          <StatTile label="Vigentes" value={countByEstatus.Vigente} />
          <StatTile label="Finalizados" value={countByEstatus.Finalizado} accent="green" />
          <StatTile label="Cancelados" value={countByEstatus.Cancelado} accent="red" />
        </div>

        <MonthlyBarChart title="Embarques por mes" data={byMonth} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Estos filtros solo afectan las gráficas de embarques de abajo — no afectan la gráfica
            anual de arriba.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <MonthFilter months={availableMonths} />
            <MultiSelectFilter paramName="pol" label="POL" options={availablePol} current={polRaw} />
            <MultiSelectFilter paramName="pod" label="POD" options={availablePod} current={podRaw} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <HorizontalBarChart title="Embarques por naviera" data={byNaviera} href={detailHref("naviera")} />
          <HorizontalBarChart
            title="Embarques por agente en el extranjero"
            data={byAgente}
            href={detailHref("agente")}
          />
          <HorizontalBarChart title="Embarques por POD" data={byPod} href={detailHref("pod")} />
          <HorizontalBarChart title="Embarques por POL" data={byPol} href={detailHref("pol")} />
          <HorizontalBarChart title="Embarques por plaza" data={byPlaza} href={detailHref("plaza")} />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Contenedores (solo bookings FCLI)
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Cantidad de contenedores por tipo
                </h3>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  Total: {totalContenedoresFcl}
                </span>
              </div>
              {byContainerType.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">Sin datos.</p>
              ) : (
                <div className="space-y-2">
                  {byContainerType.map((d) => (
                    <div key={d.label} className="flex items-center gap-2 rounded px-1 py-0.5">
                      <span
                        className="w-32 shrink-0 truncate text-xs text-slate-600 dark:text-slate-300"
                        title={d.label}
                      >
                        {d.label}
                      </span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-4 rounded bg-[#2a78d6] dark:bg-[#3987e5]"
                          style={{
                            width: `${Math.max(4, (d.value / Math.max(1, byContainerType[0].value)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-slate-700 dark:text-slate-200">
                        {d.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-500">
                Cuando un booking registra varios tipos para un mismo total (ej. &quot;Tipo 40
                HC,40 OT&quot;), se muestra como una combinación aparte porque no es posible saber
                cuántos de cada tipo corresponden.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Bookings FCLI sin contenedor registrado
              </h3>
              <p className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {fclSinContenedor.length}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                de {fclRows.length} bookings FCLI en total
              </p>
              {fclSinContenedor.length > 0 && (
                <Link
                  href={sinContenedorHref}
                  className="mt-4 inline-block text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Ver registros sin contenedor para corregirlos →
                </Link>
              )}
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Operaciones vigentes por operativo
          </h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                    Operativo
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    FCLI
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    LCLI
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {operativoTable.map((row) => (
                  <tr key={row.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="whitespace-nowrap px-4 py-2">
                      <Link
                        href={operativoBookingsHref(row.label)}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {row.label}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums text-slate-900 dark:text-slate-50">
                      {row.total}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {row.fcli}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {row.lcli}
                    </td>
                  </tr>
                ))}

                {operativoTable.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                      No hay operaciones vigentes para estos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
            Haz clic en un operativo para ver sus bookings y clientes.
          </p>
        </div>
      </main>
    </div>
  );
}
