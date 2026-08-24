import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calcularDiasDemoras, fechaHoyMexico } from "@/lib/dateLabels";
import { parseContenedoresTipo } from "@/lib/contenedores";
import { StatTile } from "@/components/StatTile";
import { HorizontalBarChart } from "@/components/HorizontalBarChart";
import { MonthlyBarChart } from "@/components/MonthlyBarChart";
import { MonthFilter } from "@/components/MonthFilter";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { ClickableRow } from "@/components/ClickableRow";

export const dynamic = "force-dynamic";

type Row = {
  booking: string | null;
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
  ultimo_dia_libre_demoras: string | null;
  notificacion_arribo_7_dias: string | null;
  validacion_48_horas_antes_eta: string | null;
  revalidacion_48_horas_antes_eta: string | null;
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
  searchParams: Promise<{ mes?: string; pol?: string | string[]; pod?: string | string[] }>;
}) {
  const { mes, pol, pod } = await searchParams;
  const polRaw = pol ? (Array.isArray(pol) ? pol : [pol]) : [];
  const podRaw = pod ? (Array.isArray(pod) ? pod : [pod]) : [];
  const supabase = await createClient();

  // PostgREST recorta cada select a un máximo de filas por default (1000),
  // aunque no se pida un .limit() explícito — con la tabla ya por encima de
  // eso, un select simple se quedaba corto y todos los totales del Dashboard
  // (embarques, contenedores, etc.) salían truncados sin avisar. Se pagina
  // igual que fetchTodosLosBookings() en importaciones/actions.ts.
  const allRows: Row[] = [];
  {
    const TAM_PAGINA = 500;
    let desde = 0;
    while (true) {
      const { data } = await supabase
        .from("seguimiento_importaciones")
        .select(
          "booking, naviera, agente, pod, pol, oficina, operativo, fecha, estatus, type, contenedor, cantidad_contenedores_tipo, ultimo_dia_libre_demoras, notificacion_arribo_7_dias, validacion_48_horas_antes_eta, revalidacion_48_horas_antes_eta",
        )
        .range(desde, desde + TAM_PAGINA - 1);
      const pagina = (data ?? []) as Row[];
      allRows.push(...pagina);
      if (pagina.length < TAM_PAGINA) break;
      desde += TAM_PAGINA;
    }
  }

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
    for (const { type, count } of parseContenedoresTipo(r.booking, r.cantidad_contenedores_tipo)) {
      containerTypeCounts.set(type, (containerTypeCounts.get(type) ?? 0) + count);
    }
  }
  const byContainerType = Array.from(containerTypeCounts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const totalContenedoresFcl = byContainerType.reduce((sum, d) => sum + d.value, 0);
  const fclSinContenedor = fclRows.filter((r) => !r.contenedor?.trim() && !r.cantidad_contenedores_tipo?.trim());

  // TEU por Naviera y Contenedor — cantidad de cada tipo × su TEU en el
  // catálogo Tipos de Contenedor. Si un tipo no está registrado en el
  // catálogo (o es una combinación ambigua tipo "20, 40 HC"), su TEU no se
  // puede calcular: se muestra la cantidad de contenedores en vez de un
  // valor y se avisa abajo de la tabla qué tipos faltan por registrar.
  const { data: tiposContenedorData } = await supabase
    .from("catalogo_tipos_contenedor")
    .select("tipo_contenedor, teu");
  const teuPorTipo = new Map<string, number>();
  for (const t of (tiposContenedorData ?? []) as { tipo_contenedor: string; teu: number }[]) {
    teuPorTipo.set(t.tipo_contenedor.trim().toUpperCase(), Number(t.teu));
  }

  type CeldaTeu = { count: number; teu: number | null };
  const navieraTipoTeu = new Map<string, Map<string, CeldaTeu>>();
  const tiposPresentesTeu = new Set<string>();
  const tiposSinTeu = new Set<string>();

  for (const r of fclRows) {
    const naviera = r.naviera?.trim() || "Sin naviera";
    for (const { type, count } of parseContenedoresTipo(r.booking, r.cantidad_contenedores_tipo)) {
      tiposPresentesTeu.add(type);
      const teuUnitario = teuPorTipo.get(type.trim().toUpperCase());
      if (teuUnitario === undefined) tiposSinTeu.add(type);

      if (!navieraTipoTeu.has(naviera)) navieraTipoTeu.set(naviera, new Map());
      const tiposDeNaviera = navieraTipoTeu.get(naviera)!;
      const celda = tiposDeNaviera.get(type) ?? { count: 0, teu: teuUnitario === undefined ? null : 0 };
      celda.count += count;
      if (teuUnitario !== undefined) {
        celda.teu = (celda.teu ?? 0) + count * teuUnitario;
      }
      tiposDeNaviera.set(type, celda);
    }
  }

  const tiposTeuOrdenados = Array.from(tiposPresentesTeu).sort();
  const teuPorNavieraTable = Array.from(navieraTipoTeu.entries())
    .map(([naviera, tipos]) => {
      const totalTeu = Array.from(tipos.values()).reduce((sum, c) => sum + (c.teu ?? 0), 0);
      const totalContenedores = Array.from(tipos.values()).reduce((sum, c) => sum + c.count, 0);
      return { naviera, tipos, totalTeu, totalContenedores };
    })
    .sort((a, b) => b.totalTeu - a.totalTeu);
  const granTotalTeu = teuPorNavieraTable.reduce((sum, r) => sum + r.totalTeu, 0);
  const granTotalContenedoresTeu = teuPorNavieraTable.reduce((sum, r) => sum + r.totalContenedores, 0);
  const byTeuNaviera = teuPorNavieraTable.map((r) => ({ label: r.naviera, value: r.totalTeu }));

  // Centro de seguimiento — qué necesita atención hoy. Siempre sobre el
  // dataset completo (allRows), sin los filtros de mes/POL/POD de las
  // gráficas de abajo, porque esto responde "¿qué reviso ahora?", no
  // "¿cómo se ve un periodo?".
  const hoy = fechaHoyMexico();
  const vigentesFcli = allRows.filter(
    (r) => r.estatus === "Vigente" && r.type?.trim().toUpperCase() === "FCLI",
  );
  const esPendiente = (valor: string | null) => valor !== null && valor <= hoy;
  const pendientesNotificacion = vigentesFcli.filter((r) => esPendiente(r.notificacion_arribo_7_dias)).length;
  const pendientesValidacion = vigentesFcli.filter((r) => esPendiente(r.validacion_48_horas_antes_eta)).length;
  const pendientesRevalidacion = vigentesFcli.filter((r) => esPendiente(r.revalidacion_48_horas_antes_eta)).length;
  const pendientesTotal = vigentesFcli.filter(
    (r) =>
      esPendiente(r.notificacion_arribo_7_dias) ||
      esPendiente(r.validacion_48_horas_antes_eta) ||
      esPendiente(r.revalidacion_48_horas_antes_eta),
  ).length;

  const demorasActivas = allRows.filter(
    (r) => r.estatus === "Vigente" && (calcularDiasDemoras(r.ultimo_dia_libre_demoras) ?? -Infinity) >= 0,
  ).length;

  const sinContenedorVigente = allRows.filter(
    (r) =>
      r.estatus === "Vigente" &&
      r.type?.trim().toUpperCase() === "FCLI" &&
      !r.contenedor?.trim() &&
      !r.cantidad_contenedores_tipo?.trim(),
  ).length;

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

  const teuNavieraHref = (naviera: string) => {
    const params = new URLSearchParams();
    if (mes) params.set("mes", mes);
    for (const v of polRaw) params.append("pol", v);
    for (const v of podRaw) params.append("pod", v);
    const query = params.toString();
    return `/dashboard/detalle/naviera-teu/${encodeURIComponent(naviera)}${query ? `?${query}` : ""}`;
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
        <div className="mx-auto max-w-7xl px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Centro de seguimiento
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Lo que necesita tu atención hoy, seguido de métricas y reportes
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Qué necesita tu atención hoy
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Link
              href="/dashboard/seguimiento-eta"
              className="rounded-lg border border-slate-200 bg-white p-5 hover:border-[#c65a1f] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-[#c65a1f]"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Pendientes de hoy
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {pendientesTotal}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Notif. {pendientesNotificacion} · Valid. {pendientesValidacion} · Reval.{" "}
                {pendientesRevalidacion}
              </p>
            </Link>

            <Link
              href="/importaciones?estatus=Vigente"
              className="rounded-lg border border-slate-200 bg-white p-5 hover:border-[#c65a1f] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-[#c65a1f]"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Demoras activas
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-red-600 dark:text-red-400">
                {demorasActivas}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Bookings vigentes ya en días de demora
              </p>
            </Link>

            <Link
              href="/dashboard/sin-contenedor"
              className="rounded-lg border border-slate-200 bg-white p-5 hover:border-[#c65a1f] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-[#c65a1f]"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Sin contenedor registrado
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {sinContenedorVigente}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Bookings FCLI vigentes sin ese dato
              </p>
            </Link>
          </div>
        </div>

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
          {tiposSinTeu.size > 0 && (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              ⚠ Tipo{tiposSinTeu.size === 1 ? "" : "s"} de contenedor sin TEU registrado en el
              catálogo: <strong>{Array.from(tiposSinTeu).sort().join(", ")}</strong>. Regístra
              {tiposSinTeu.size === 1 ? "lo" : "los"} en{" "}
              <Link href="/catalogos/tipos-contenedor" className="underline">
                Catálogos → Tipos de Contenedor
              </Link>{" "}
              para que las cantidades de TEU de abajo queden completas.
            </p>
          )}
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
                Si un booking tiene, por ejemplo, 2 contenedores de 2 tipos distintos, se cuenta 1
                de cada tipo. Solo cuando el total no alcanza para repartir uno por tipo (ej.
                &quot;6 contenedores (Tipo 40 HC,40 OT)&quot;) se deja como combinación aparte,
                porque no es posible saber cuántos son de cada tipo.
              </p>
            </div>

            <HorizontalBarChart
              title="TEU por naviera (solo FCLI)"
              data={byTeuNaviera}
              totalLabel={`Total: ${granTotalTeu.toLocaleString("es-MX", { maximumFractionDigits: 2 })} TEU`}
            />

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

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Seguimiento ETA — FCLI vigentes
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Notificación de arribo, validación y revalidación 48 hr pendientes o sin datos
                registrados
              </p>
              <Link
                href="/dashboard/seguimiento-eta"
                className="mt-4 inline-block text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Ver reporte de seguimiento →
              </Link>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              TEU por Naviera y Contenedor
            </h2>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              Total: {granTotalTeu.toLocaleString("es-MX", { maximumFractionDigits: 2 })} TEU ·{" "}
              {granTotalContenedoresTeu} contenedores
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                    Naviera
                  </th>
                  {tiposTeuOrdenados.map((tipo) => (
                    <th
                      key={tipo}
                      className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400"
                    >
                      {tipo}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    Total TEU
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {teuPorNavieraTable.map((row) => (
                  <ClickableRow key={row.naviera} href={teuNavieraHref(row.naviera)}>
                    <td className="whitespace-nowrap px-4 py-2 text-blue-600 dark:text-blue-400">
                      {row.naviera}
                    </td>
                    {tiposTeuOrdenados.map((tipo) => {
                      const celda = row.tipos.get(tipo);
                      return (
                        <td
                          key={tipo}
                          className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300"
                        >
                          {!celda ? (
                            "—"
                          ) : celda.teu === null ? (
                            <span
                              className="text-amber-600 dark:text-amber-400"
                              title="Sin TEU registrado en el catálogo Tipos de Contenedor"
                            >
                              {celda.count} ⚠
                            </span>
                          ) : (
                            celda.teu.toLocaleString("es-MX", { maximumFractionDigits: 2 })
                          )}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums text-slate-900 dark:text-slate-50">
                      {row.totalTeu.toLocaleString("es-MX", { maximumFractionDigits: 2 })}
                    </td>
                  </ClickableRow>
                ))}

                {teuPorNavieraTable.length === 0 && (
                  <tr>
                    <td
                      colSpan={tiposTeuOrdenados.length + 2}
                      className="px-4 py-8 text-center text-slate-400 dark:text-slate-500"
                    >
                      No hay datos para estos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
              {teuPorNavieraTable.length > 0 && (
                <tfoot className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                      Total
                    </td>
                    {tiposTeuOrdenados.map((tipo) => {
                      const totalTipo = teuPorNavieraTable.reduce(
                        (sum, r) => sum + (r.tipos.get(tipo)?.teu ?? 0),
                        0,
                      );
                      return (
                        <td
                          key={tipo}
                          className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300"
                        >
                          {totalTipo.toLocaleString("es-MX", { maximumFractionDigits: 2 })}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                      {granTotalTeu.toLocaleString("es-MX", { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
            Haz clic en una naviera para ver sus bookings FCLI.
          </p>
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
