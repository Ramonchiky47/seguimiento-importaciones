import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ESTADOS, fechaCorta, hoyMexico, type EstadoHito } from "@/lib/track";
import { AbrirOperacionBoton } from "@/components/OperacionDetalleModal";

export const dynamic = "force-dynamic";

type Hito = {
  orden: number;
  hito: string;
  regla: string;
  fecha_plan: string | null;
  fecha_hecho: string | null;
  hecho: boolean;
  estado: EstadoHito;
  dias_atraso: number | null;
  // Dato no-fecha que se muestra en "Real" (p. ej. "21 días" de días libres).
  valor_real: string | null;
};

export default async function EmbarqueTrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idBooking = Number(id);
  if (!Number.isFinite(idBooking)) notFound();

  const supabase = await createClient();
  const [{ data: op }, { data: hitosData }, { data: track }] = await Promise.all([
    supabase.from("operaciones_maritima_vista").select("*").eq("id_booking", idBooking).maybeSingle(),
    supabase
      .from("track_hitos")
      .select("orden, hito, regla, fecha_plan, fecha_hecho, hecho, estado, dias_atraso, valor_real")
      .eq("id_booking", idBooking)
      .order("orden"),
    supabase.from("track_embarques").select("etapa, semaforo").eq("id_booking", idBooking).maybeSingle(),
  ]);
  if (!op) notFound();

  const o = op as Record<string, string | number | null>;
  const hitos = (hitosData ?? []) as Hito[];
  const semaforo = (track?.semaforo ?? null) as EstadoHito | null;

  // Medidor de días libres: del ATA al último día libre.
  const libres = Number(o.dias_libres_demora) || 0;
  const ata = o.ata as string | null;
  const ultimo = o.ultimo_dia_libre_demoras as string | null;
  const regreso = o.regreso_vacio as string | null;
  const diasDemora = o.dias_demora as number | null;
  let usados = 0;
  if (ata && libres > 0) {
    const fin = regreso ?? hoyMexico();
    usados = Math.max(0, Math.round((Date.parse(fin) - Date.parse(ata)) / 86_400_000) + 1);
  }
  const pctUsado = libres > 0 ? Math.min(100, (100 * usados) / libres) : 0;

  const dato = (label: string, valor: React.ReactNode) => (
    <div>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">{valor}</dd>
    </div>
  );

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/track/embarques" className="text-sm text-blue-700 hover:underline dark:text-blue-400">
          ← Volver a Embarques
        </Link>
        <AbrirOperacionBoton
          idBooking={idBooking}
          className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
        >
          Ver indicadores y editar en Cargolink
        </AbrirOperacionBoton>
      </div>

      <section className="flex flex-wrap items-center gap-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-60 flex-1">
          <p className="font-mono text-xl font-semibold text-slate-900 dark:text-slate-50">{o.no_booking}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {o.cliente ?? "—"} · {o.origen ?? "—"} → {o.destino ?? "—"} · {o.modo_transportacion ?? o.servicio ?? "—"}
          </p>
        </div>
        <dl className="grid flex-[2] grid-cols-2 gap-4 sm:grid-cols-4">
          {dato("Ejecutivo", o.ejecutivo ?? "—")}
          {dato("MBL", <span className="font-mono">{o.mbl ?? "—"}</span>)}
          {dato("Etapa", track?.etapa ?? "Sin seguimiento activo")}
          {dato(
            "Semáforo",
            semaforo ? (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADOS[semaforo].pill}`}>{ESTADOS[semaforo].label}</span>
            ) : (
              "—"
            ),
          )}
        </dl>
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <section className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Hitos del embarque</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">Compromiso = regla · Real = marcado en Cargolink</span>
          </div>
          {hitos.length === 0 ? (
            <p className="px-4 py-8 text-sm text-slate-500">
              Este embarque ya no está en seguimiento activo (más de 180 días o vacío ya devuelto).
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-2 font-semibold">Hito</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Compromiso</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Real</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {hitos.map((h) => {
                  const e = ESTADOS[h.estado] ?? ESTADOS.en_tiempo;
                  return (
                    <tr key={h.orden} className={h.estado === "no_aplica" ? "opacity-50" : ""}>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{h.hito}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{h.regla}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{fechaCorta(h.fecha_plan)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{h.valor_real ?? (h.hecho ? fechaCorta(h.fecha_hecho) : "—")}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.pill}`}>
                          {e.label}
                          {h.dias_atraso ? ` · ${h.dias_atraso} d` : ""}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Días libres de demora</h2>
          {libres > 0 && ata ? (
            <>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>ATA {fechaCorta(ata)}</span>
                <span>Último día libre {fechaCorta(ultimo)}</span>
              </div>
              <div
                role="img"
                aria-label={`${Math.min(usados, libres)} de ${libres} días libres usados`}
                className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
              >
                <div
                  className={`h-full ${diasDemora !== null && diasDemora > 0 ? "bg-red-700" : pctUsado >= 80 ? "bg-amber-600" : "bg-blue-700"}`}
                  style={{ width: `${pctUsado}%` }}
                />
              </div>
              {regreso ? (
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Vacío devuelto el {fechaCorta(regreso)} ·{" "}
                  {diasDemora && diasDemora > 0 ? `${diasDemora} días de demora` : "sin demora"}
                </p>
              ) : diasDemora !== null && diasDemora > 0 ? (
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">{diasDemora} días en demora</p>
              ) : (
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                    {Math.max(0, -(diasDemora ?? 0))}
                  </span>{" "}
                  días libres restantes · {Math.min(usados, libres)} de {libres} usados
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {ata ? "Sin días libres capturados en Cargolink." : "Aún sin ATA."}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
