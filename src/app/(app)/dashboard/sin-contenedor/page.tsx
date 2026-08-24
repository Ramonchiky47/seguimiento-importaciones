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
  pol: string | null;
  pod: string | null;
  fecha: string | null;
  estatus: string;
  cantidad_contenedores_tipo: string | null;
};

export default async function SinContenedorPage({
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
    .select("id, booking, client, naviera, pol, pod, fecha, estatus, cantidad_contenedores_tipo")
    .ilike("type", "FCLI")
    .or("contenedor.is.null,contenedor.eq.")
    .order("fecha", { ascending: false });

  let rows = ((data ?? []) as Row[]).filter((r) => !r.cantidad_contenedores_tipo?.trim());
  if (mes) rows = rows.filter((r) => r.fecha?.startsWith(mes));
  if (polRaw.length > 0) rows = rows.filter((r) => polRaw.includes(r.pol?.trim() ?? ""));
  if (podRaw.length > 0) rows = rows.filter((r) => podRaw.includes(r.pod?.trim() ?? ""));

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
            Bookings FCLI sin contenedor registrado
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {rows.length} registro{rows.length === 1 ? "" : "s"} ·{" "}
            {activeFilters.length > 0 ? activeFilters.join(" · ") : "Todos los meses"} · Haz clic
            en una fila para corregirla
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
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                    No hay bookings FCLI sin contenedor registrado para estos filtros.
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
