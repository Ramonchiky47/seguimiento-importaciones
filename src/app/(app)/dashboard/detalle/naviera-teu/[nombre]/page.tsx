import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMonthLabel } from "@/lib/dateLabels";
import { parseContenedoresTipo } from "@/lib/contenedores";
import { ClickableRow } from "@/components/ClickableRow";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  booking: string | null;
  client: string | null;
  naviera: string | null;
  type: string | null;
  pol: string | null;
  pod: string | null;
  fecha: string | null;
  estatus: string;
  contenedor: string | null;
  cantidad_contenedores_tipo: string | null;
};

export default async function NavieraTeuBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ nombre: string }>;
  searchParams: Promise<{
    mes?: string;
    pol?: string | string[];
    pod?: string | string[];
  }>;
}) {
  const { nombre } = await params;
  const naviera = decodeURIComponent(nombre);
  const esSinNaviera = naviera === "Sin naviera";
  const { mes, pol, pod } = await searchParams;
  const polRaw = pol ? (Array.isArray(pol) ? pol : [pol]) : [];
  const podRaw = pod ? (Array.isArray(pod) ? pod : [pod]) : [];

  const supabase = await createClient();

  const { data: tiposContenedorData } = await supabase
    .from("catalogo_tipos_contenedor")
    .select("tipo_contenedor, teu");
  const teuPorTipo = new Map<string, number>();
  for (const t of (tiposContenedorData ?? []) as { tipo_contenedor: string; teu: number }[]) {
    teuPorTipo.set(t.tipo_contenedor.trim().toUpperCase(), Number(t.teu));
  }

  let query = supabase
    .from("seguimiento_importaciones")
    .select("id, booking, client, naviera, type, pol, pod, fecha, estatus, contenedor, cantidad_contenedores_tipo")
    .ilike("type", "FCLI")
    .order("fecha", { ascending: false });

  query = esSinNaviera ? query.or("naviera.is.null,naviera.eq.") : query.eq("naviera", naviera);

  const { data } = await query;
  let rows = (data ?? []) as Row[];

  if (mes) rows = rows.filter((r) => r.fecha?.startsWith(mes));
  if (polRaw.length > 0) rows = rows.filter((r) => polRaw.includes(r.pol?.trim() ?? ""));
  if (podRaw.length > 0) rows = rows.filter((r) => podRaw.includes(r.pod?.trim() ?? ""));

  const rowsConTeu = rows.map((r) => {
    let teu = 0;
    let faltaTeu = false;
    for (const { type, count } of parseContenedoresTipo(r.booking, r.cantidad_contenedores_tipo)) {
      const teuUnitario = teuPorTipo.get(type.trim().toUpperCase());
      if (teuUnitario === undefined) faltaTeu = true;
      else teu += count * teuUnitario;
    }
    return { ...r, teu, faltaTeu };
  });
  const totalTeu = rowsConTeu.reduce((sum, r) => sum + r.teu, 0);

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
        <div className="mx-auto max-w-6xl px-6 py-4">
          <Link
            href={backHref}
            className="mb-1 inline-block text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Volver al dashboard
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Bookings FCLI de {naviera}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {rows.length} registro{rows.length === 1 ? "" : "s"} · {totalTeu.toLocaleString("es-MX", { maximumFractionDigits: 2 })} TEU
            {activeFilters.length > 0 ? ` · ${activeFilters.join(" · ")}` : ""} · Haz clic en una
            fila para ver el detalle
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  Booking
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  Contenedores
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  POL
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  POD
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  Estatus
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">
                  TEU
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rowsConTeu.map((row) => (
                <ClickableRow key={row.id} href={`/importaciones/${row.id}`}>
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-blue-600 dark:text-blue-400">
                    {row.booking ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                    {row.client ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                    {row.cantidad_contenedores_tipo ?? row.contenedor ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                    {row.pol ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                    {row.pod ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                    {row.fecha ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                    {row.estatus}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-900 dark:text-slate-50">
                    {row.faltaTeu ? (
                      <span
                        className="text-amber-600 dark:text-amber-400"
                        title="Uno o más tipos de este booking no tienen TEU registrado"
                      >
                        {row.teu} ⚠
                      </span>
                    ) : (
                      row.teu
                    )}
                  </td>
                </ClickableRow>
              ))}

              {rowsConTeu.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                    No hay bookings para estos filtros.
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
