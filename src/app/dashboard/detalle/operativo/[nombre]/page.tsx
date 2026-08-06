import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMonthLabel } from "@/lib/dateLabels";
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
};

export default async function OperativoBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ nombre: string }>;
  searchParams: Promise<{
    estatus?: string;
    mes?: string;
    pol?: string | string[];
    pod?: string | string[];
  }>;
}) {
  const { nombre } = await params;
  const operativo = decodeURIComponent(nombre);
  const { estatus, mes, pol, pod } = await searchParams;
  const polRaw = pol ? (Array.isArray(pol) ? pol : [pol]) : [];
  const podRaw = pod ? (Array.isArray(pod) ? pod : [pod]) : [];

  const supabase = await createClient();
  let query = supabase
    .from("seguimiento_importaciones")
    .select("id, booking, client, naviera, type, pol, pod, fecha, estatus")
    // El campo puede traer varios operativos separados por coma, por eso se
    // busca como substring y no con igualdad exacta.
    .ilike("operativo", `%${operativo}%`)
    .order("fecha", { ascending: false });

  if (estatus) query = query.eq("estatus", estatus);

  const { data } = await query;
  let rows = (data ?? []) as Row[];

  if (mes) rows = rows.filter((r) => r.fecha?.startsWith(mes));
  if (polRaw.length > 0) rows = rows.filter((r) => polRaw.includes(r.pol?.trim() ?? ""));
  if (podRaw.length > 0) rows = rows.filter((r) => podRaw.includes(r.pod?.trim() ?? ""));

  const backParams = new URLSearchParams();
  if (estatus) backParams.set("estatus", estatus);
  if (mes) backParams.set("mes", mes);
  for (const v of polRaw) backParams.append("pol", v);
  for (const v of podRaw) backParams.append("pod", v);
  const backQuery = backParams.toString();
  const backHref = `/dashboard/detalle/operativo${backQuery ? `?${backQuery}` : ""}`;

  const activeFilters = [
    estatus ? `Estatus: ${estatus}` : null,
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
            ← Volver al detalle por operativo
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Bookings de {operativo}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {rows.length} registro{rows.length === 1 ? "" : "s"}
            {activeFilters.length > 0 ? ` · ${activeFilters.join(" · ")}` : ""} · Haz clic en una
            fila para ver el detalle
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
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
                  Type
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  Naviera
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row) => (
                <ClickableRow key={row.id} href={`/importaciones/${row.id}`}>
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-blue-600 dark:text-blue-400">
                    {row.booking ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                    {row.client ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                    {row.type ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                    {row.naviera ?? "—"}
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
                </ClickableRow>
              ))}

              {rows.length === 0 && (
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
