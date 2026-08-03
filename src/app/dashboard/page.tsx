import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { StatTile } from "@/components/StatTile";
import { HorizontalBarChart } from "@/components/HorizontalBarChart";
import { MonthlyBarChart } from "@/components/MonthlyBarChart";
import { MonthFilter } from "@/components/MonthFilter";

export const dynamic = "force-dynamic";

type Row = {
  naviera: string | null;
  agente: string | null;
  pod: string | null;
  pol: string | null;
  oficina: string | null;
  fecha: string | null;
  estatus: string;
};

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
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("seguimiento_importaciones")
    .select("naviera, agente, pod, pol, oficina, fecha, estatus");
  const allRows = (data ?? []) as Row[];

  const availableMonths = Array.from(
    new Set(allRows.map((r) => r.fecha?.slice(0, 7)).filter((m): m is string => Boolean(m))),
  ).sort((a, b) => b.localeCompare(a));

  // The month filter applies only to the "embarques por X" breakdown charts —
  // the monthly trend chart and KPI tiles always reflect the full dataset.
  const filteredRows = mes ? allRows.filter((r) => r.fecha?.startsWith(mes)) : allRows;

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

  const detailHref = (dim: string) => `/dashboard/detalle/${dim}${mes ? `?mes=${mes}` : ""}`;

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

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            El filtro de mes solo afecta las gráficas de embarques de abajo — no afecta la gráfica
            anual de arriba.
          </p>
          <MonthFilter months={availableMonths} />
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
      </main>
    </div>
  );
}
