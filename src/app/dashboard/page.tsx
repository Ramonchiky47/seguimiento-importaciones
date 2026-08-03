import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { StatTile } from "@/components/StatTile";
import { HorizontalBarChart } from "@/components/HorizontalBarChart";
import { MonthlyBarChart } from "@/components/MonthlyBarChart";

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

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("seguimiento_importaciones")
    .select("naviera, agente, pod, pol, oficina, fecha, estatus");
  const rows = (data ?? []) as Row[];

  const totalCount = rows.length;
  const countByEstatus = rows.reduce(
    (acc, r) => {
      if (r.estatus === "Vigente" || r.estatus === "Finalizado" || r.estatus === "Cancelado") {
        acc[r.estatus]++;
      }
      return acc;
    },
    { Vigente: 0, Finalizado: 0, Cancelado: 0 },
  );

  const byMonth = monthlyGroups(rows);
  const byNaviera = topGroups(rows, "naviera", 8);
  const byAgente = topGroups(rows, "agente", 8);
  const byPod = topGroups(rows, "pod", 8);
  const byPol = topGroups(rows, "pol", 8);
  const byPlaza = topGroups(rows, "oficina", 8);

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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <HorizontalBarChart title="Embarques por naviera" data={byNaviera} />
          <HorizontalBarChart title="Embarques por agente en el extranjero" data={byAgente} />
          <HorizontalBarChart title="Embarques por POD" data={byPod} />
          <HorizontalBarChart title="Embarques por POL" data={byPol} />
          <HorizontalBarChart title="Embarques por plaza" data={byPlaza} />
        </div>
      </main>
    </div>
  );
}
