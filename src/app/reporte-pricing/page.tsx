import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { parseContenedoresTipo } from "@/lib/contenedores";
import { HorizontalBarChart } from "@/components/HorizontalBarChart";
import { MonthFilter } from "@/components/MonthFilter";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { ClickableRow } from "@/components/ClickableRow";
import { logout } from "@/app/login/actions";

export const dynamic = "force-dynamic";

type Row = {
  booking: string | null;
  naviera: string | null;
  agente: string | null;
  pod: string | null;
  pol: string | null;
  oficina: string | null;
  fecha: string | null;
  estatus: string;
  type: string | null;
  contenedor: string | null;
  cantidad_contenedores_tipo: string | null;
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

export default async function ReportePricingPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; pol?: string | string[]; pod?: string | string[] }>;
}) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_pricing) {
    redirect("/inicio");
  }

  const { mes, pol, pod } = await searchParams;
  const polRaw = pol ? (Array.isArray(pol) ? pol : [pol]) : [];
  const podRaw = pod ? (Array.isArray(pod) ? pod : [pod]) : [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // PostgREST recorta cada select a 1000 filas por default — se pagina igual
  // que en /dashboard para no truncar los totales.
  const allRows: Row[] = [];
  {
    const TAM_PAGINA = 500;
    let desde = 0;
    while (true) {
      const { data } = await supabase
        .from("seguimiento_importaciones")
        .select("booking, naviera, agente, pod, pol, oficina, fecha, estatus, type, contenedor, cantidad_contenedores_tipo")
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

  const filteredRows = allRows.filter((r) => {
    if (mes && !r.fecha?.startsWith(mes)) return false;
    if (polRaw.length > 0 && !polRaw.includes(r.pol?.trim() ?? "")) return false;
    if (podRaw.length > 0 && !podRaw.includes(r.pod?.trim() ?? "")) return false;
    return true;
  });

  const byNaviera = topGroups(filteredRows, "naviera", 8);
  const byAgente = topGroups(filteredRows, "agente", 8);
  const byPod = topGroups(filteredRows, "pod", 8);
  const byPol = topGroups(filteredRows, "pol", 8);
  const byPlaza = topGroups(filteredRows, "oficina", 8);

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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="bg-[#16232f] text-slate-300 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-8 py-3.5">
          <Link href="/inicio" className="flex shrink-0 items-center gap-2.5">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c65a1f" strokeWidth="1.6">
              <circle cx="12" cy="12" r="9" />
              <path d="M15.5 8.5 11 11 8.5 15.5 13 13Z" fill="#c65a1f" stroke="none" />
            </svg>
            <span className="text-[15px] font-bold text-white">TrackAv2</span>
          </Link>
          <span className="text-sm font-medium text-slate-300">Reporte de Pricing</span>
          <a
            href={`/api/sso/pricing?next=${encodeURIComponent("/pricing?panel=pricing")}`}
            className="text-[13px] font-medium text-slate-300 hover:text-white"
          >
            ← Regresar a Pricing
          </a>
          <div className="ml-auto flex items-center gap-5">
            {user?.email && <span className="hidden text-xs text-slate-400 md:inline">{user.email}</span>}
            <form action={logout}>
              <button type="submit" className="text-[13px] font-medium text-slate-300 hover:text-white">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Estos filtros afectan todas las gráficas y tablas de esta página.
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
              catálogo: <strong>{Array.from(tiposSinTeu).sort().join(", ")}</strong>.
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
      </main>
    </div>
  );
}
