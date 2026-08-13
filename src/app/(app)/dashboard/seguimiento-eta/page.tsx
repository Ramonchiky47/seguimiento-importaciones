import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaHoyMexico } from "@/lib/dateLabels";
import { ClickableRow } from "@/components/ClickableRow";
import { TipoPendienteFilter } from "@/components/TipoPendienteFilter";
import { labelTipoPendiente } from "@/lib/tiposPendiente";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  booking: string | null;
  client: string | null;
  operativo: string | null;
  eta_ata: string | null;
  notificacion_arribo_7_dias: string | null;
  validacion_48_horas_antes_eta: string | null;
  revalidacion_48_horas_antes_eta: string | null;
};

const CAMPO_POR_TIPO: Record<string, keyof Row> = {
  notificacion: "notificacion_arribo_7_dias",
  validacion: "validacion_48_horas_antes_eta",
  revalidacion: "revalidacion_48_horas_antes_eta",
};

export default async function SeguimientoEtaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo: tipoRaw } = await searchParams;
  const tipo = tipoRaw && CAMPO_POR_TIPO[tipoRaw] ? tipoRaw : "notificacion";
  const campo = CAMPO_POR_TIPO[tipo];

  const supabase = await createClient();
  const rows: Row[] = [];
  {
    const TAM_PAGINA = 500;
    let desde = 0;
    while (true) {
      const { data } = await supabase
        .from("seguimiento_importaciones")
        .select(
          "id, booking, client, operativo, eta_ata, notificacion_arribo_7_dias, validacion_48_horas_antes_eta, revalidacion_48_horas_antes_eta",
        )
        .ilike("type", "FCLI")
        .eq("estatus", "Vigente")
        .range(desde, desde + TAM_PAGINA - 1);
      const pagina = (data ?? []) as Row[];
      rows.push(...pagina);
      if (pagina.length < TAM_PAGINA) break;
      desde += TAM_PAGINA;
    }
  }

  const hoy = fechaHoyMexico();

  const pendientes = rows
    .filter((r) => {
      const valor = r[campo] as string | null;
      return valor !== null && valor <= hoy;
    })
    .sort((a, b) => (b.booking ?? "").localeCompare(a.booking ?? ""));

  const sinDatos = rows
    .filter((r) => r[campo] === null)
    .sort((a, b) => (b.booking ?? "").localeCompare(a.booking ?? ""));

  function diasDesde(fecha: string): number {
    const hoyDate = new Date(`${hoy}T00:00:00Z`);
    const fechaDate = new Date(`${fecha}T00:00:00Z`);
    return Math.round((hoyDate.getTime() - fechaDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <Link
            href="/dashboard"
            className="mb-1 inline-block text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Volver al dashboard
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Seguimiento ETA — Bookings FCLI vigentes
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Haz clic en una fila para abrir el booking y editarlo
          </p>
          <div className="mt-3">
            <TipoPendienteFilter current={tipo} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
            Pendientes de hoy — {labelTipoPendiente(tipo)} ({pendientes.length})
          </h2>
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
                    Operativo
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                    ETA / ATA
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                    {labelTipoPendiente(tipo)}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pendientes.map((row) => {
                  const fechaCampo = row[campo] as string;
                  const dias = diasDesde(fechaCampo);
                  return (
                    <ClickableRow key={row.id} href={`/importaciones/${row.id}`}>
                      <td className="whitespace-nowrap px-4 py-2 font-medium text-blue-600 dark:text-blue-400">
                        {row.booking ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                        {row.client ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                        {row.operativo ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                        {row.eta_ata ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                        {fechaCampo}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        {dias > 0 ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            Vencido hace {dias} día{dias === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            Hoy
                          </span>
                        )}
                      </td>
                    </ClickableRow>
                  );
                })}

                {pendientes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                      No hay pendientes de hoy para este tipo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
            Sin datos registrados — {labelTipoPendiente(tipo)} ({sinDatos.length})
          </h2>
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
                    Operativo
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                    ETA / ATA
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sinDatos.map((row) => (
                  <ClickableRow key={row.id} href={`/importaciones/${row.id}`}>
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-blue-600 dark:text-blue-400">
                      {row.booking ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                      {row.client ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                      {row.operativo ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-700 dark:text-slate-300">
                      {row.eta_ata ?? "—"}
                    </td>
                  </ClickableRow>
                ))}

                {sinDatos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                      No hay bookings vigentes sin este dato registrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
