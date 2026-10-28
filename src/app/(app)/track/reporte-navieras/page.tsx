import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta } from "@/lib/track";
import { nombreNaviera } from "@/lib/navieras";
import { ReconsultarNavieras } from "@/components/ReconsultarNavieras";

export const dynamic = "force-dynamic";

// Reporte que deja el rastreo de navieras al terminar (rastreo_procesos.reporte):
// ETA que se aplazan (para avisar al cliente), problemas de la página de la
// naviera, BL o contenedor que ninguna encontró y bookings sin referencia.
type Fila = {
  id_booking: number;
  no_booking: string;
  cliente: string | null;
  ejecutivo: string | null;
  mbl: string | null;
  contenedores: string | null;
  naviera?: string | null;
  detalle?: string;
  eta_cargolink?: string | null;
  eta_naviera_antes?: string | null;
  eta_naviera?: string | null;
  dias_vs_cargolink?: number | null;
  dias_vs_antes?: number | null;
};
type PorNaviera = Record<string, { total: number; hechos: number; encontrados: number; estado: string; mensaje: string | null }>;
type Reporte = {
  total: number;
  encontrados: number;
  pagina: Fila[];
  no_encontrados: Fila[];
  sin_referencia: Fila[];
  aplazadas: Fila[];
  coloader?: Fila[];
  bl_naviera?: (Fila & { bl_naviera: string })[];
  por_naviera?: PorNaviera;
};

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });
const dias = (d: number | null | undefined) => (d ? `${d > 0 ? "+" : ""}${d} d` : "");

function BookingCelda({ f }: { f: Fila }) {
  return (
    <td className="px-3 py-2">
      <Link href={`/track/interactivo/${f.id_booking}`} className="font-mono text-sm font-semibold text-blue-700 underline dark:text-blue-400">
        {f.no_booking}
      </Link>
      <span className="block text-xs text-slate-500 dark:text-slate-400">
        {f.cliente ?? "—"} · {f.ejecutivo ?? "Sin ejecutivo"}
      </span>
    </td>
  );
}

function Seccion({
  titulo,
  ayuda,
  n,
  tono,
  accion,
  children,
}: {
  titulo: string;
  ayuda: string;
  n: number;
  tono: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
          {titulo} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${tono}`}>{n}</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{ayuda}</p>
        {n > 0 && accion}
      </div>
      {n === 0 ? <p className="px-4 py-4 text-sm text-slate-500">Nada pendiente.</p> : <div className="overflow-x-auto">{children}</div>}
    </section>
  );
}

const TH = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

export default async function ReporteNavierasPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const supabase = await createClient();
  const { data: corridas } = await supabase
    .from("rastreo_procesos")
    .select("id, estado, total, hechos, mensaje, inicio, fin")
    .eq("proceso", "navieras")
    // Solo corridas con reporte completo (mientras corre, reporte solo trae el avance por naviera).
    .not("reporte->total", "is", null)
    .order("inicio", { ascending: false })
    .limit(10);
  const lista = (corridas ?? []) as { id: number; inicio: string; fin: string | null; mensaje: string | null }[];
  const elegida = lista.find((c) => String(c.id) === id) ?? lista[0];
  const { data } = elegida
    ? await supabase.from("rastreo_procesos").select("reporte").eq("id", elegida.id).maybeSingle()
    : { data: null };
  const r = (data?.reporte ?? null) as Reporte | null;
  // Problemas de página agrupados por naviera.
  const pagina = [...(r?.pagina ?? [])].sort(
    (a, b) => (a.naviera ?? "").localeCompare(b.naviera ?? "") || a.no_booking.localeCompare(b.no_booking),
  );
  // Cómo están ahora (el reporte es la foto de la corrida): consulta en curso o dato nuevo.
  const idsPagina = pagina.map((f) => f.id_booking);
  const [{ data: navAhora }, { data: solAhora }] = idsPagina.length
    ? await Promise.all([
        supabase.from("tracking_naviera").select("id_booking, ok, eta_naviera, ata_naviera, error, consultado_at").in("id_booking", idsPagina),
        supabase.from("tracking_solicitudes").select("id_booking, estado, mensaje, solicitado_at, atendido_at").in("id_booking", idsPagina),
      ])
    : [{ data: [] }, { data: [] }];
  const nav = new Map(
    ((navAhora ?? []) as { id_booking: number; ok: boolean; eta_naviera: string | null; ata_naviera: string | null; error: string | null; consultado_at: string }[]).map(
      (x) => [x.id_booking, x],
    ),
  );
  type Sol = { id_booking: number; estado: string; mensaje: string | null; solicitado_at: string; atendido_at: string | null };
  const sol = new Map(((solAhora ?? []) as Sol[]).map((x) => [x.id_booking, x]));
  const enCola = (id: number) => ["pendiente", "en_proceso"].includes(sol.get(id)?.estado ?? "");
  const corte = elegida ? (elegida.fin ?? elegida.inicio) : "";
  // Ya resuelto: la naviera respondió con dato después del reporte.
  const actualizado = (id: number) => {
    const t = nav.get(id);
    return Boolean(t?.ok && t.consultado_at > corte);
  };
  const enCurso = idsPagina.some((i) => enCola(i) && !actualizado(i));
  // Lo que falta: el botón solo vuelve a consultar estos; los ya actualizados salen de la lista.
  const idsPendientes = idsPagina.filter((i) => !actualizado(i));
  const paginaVisible = pagina.filter((f) => !actualizado(f.id_booking));
  const resueltos = pagina.length - paginaVisible.length;
  const ahora = (id: number) => {
    const t = nav.get(id);
    const s = sol.get(id);
    if (t && actualizado(id)) {
      const reconsultando = enCola(id) && s && t.consultado_at < s.solicitado_at ? " · reconsultando…" : "";
      return {
        texto: `✓ Actualizado ${hora(t.consultado_at)} · ${t.ata_naviera ? `ATA ${fechaCorta(t.ata_naviera)}` : `ETA ${fechaCorta(t.eta_naviera)}`}${reconsultando}`,
        clase: "text-green-700 dark:text-green-400",
      };
    }
    if (enCola(id)) return { texto: "En consulta…", clase: "text-amber-700 dark:text-amber-400" };
    if (s?.estado === "error" && s.atendido_at && s.atendido_at > corte) {
      // Ya tenía dato bueno: falló la consulta (ventana de Chrome o página), no el BL.
      if (t?.ok || s.mensaje?.startsWith("No se pudo actualizar")) {
        return { texto: `${s.mensaje ?? "No se pudo actualizar"} (${hora(s.atendido_at)})`, clase: "text-amber-700 dark:text-amber-400" };
      }
      return { texto: `Ninguna naviera lo encontró (${hora(s.atendido_at)}): revisar BL o contenedor`, clase: "text-red-700 dark:text-red-400" };
    }
    if (t && !t.ok && t.consultado_at > corte) return { texto: `Sigue sin dato: ${t.error ?? ""}`, clase: "text-red-700 dark:text-red-400" };
    return { texto: "Sin consultar desde el reporte", clase: "text-slate-500" };
  };

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      {!r || !elegida ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Todavía no hay reporte: se genera al terminar el rastreo de navieras (7 PM).
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Rastreo del <strong>{hora(elegida.fin ?? elegida.inicio)}</strong> · {r.encontrados} de {r.total} bookings con información de la naviera.
            </p>
            {lista.length > 1 && (
              <nav aria-label="Corridas anteriores" className="flex flex-wrap gap-1 text-xs">
                {lista.map((c) => (
                  <Link
                    key={c.id}
                    href={`?id=${c.id}`}
                    aria-current={c.id === elegida.id ? "page" : undefined}
                    className={`rounded-md border px-2 py-1 ${c.id === elegida.id ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"}`}
                  >
                    {hora(c.fin ?? c.inicio)}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          {r.por_naviera && Object.keys(r.por_naviera).length > 0 && (
            <section aria-label="Avance por naviera" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="border-b border-slate-200 px-4 py-3 text-base font-bold text-slate-900 dark:border-slate-800 dark:text-slate-50">Por naviera</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th scope="col" className={TH}>Naviera</th>
                      <th scope="col" className={TH}>Consultados</th>
                      <th scope="col" className={TH}>Encontrados</th>
                      <th scope="col" className={TH}>Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Object.entries(r.por_naviera).map(([nav, n]) => (
                      <tr key={nav} className="align-top">
                        <td className="px-3 py-2 font-semibold">{nombreNaviera(nav)}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {n.hechos} de {n.total}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{n.encontrados}</td>
                        <td className={`px-3 py-2 text-sm ${n.estado === "error" ? "font-semibold text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                          {n.estado === "error" ? `Falló: ${n.mensaje ?? ""}` : n.estado === "terminado" ? "✓ Terminó" : n.estado}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <Seccion
            titulo="ETA que se aplazan · avisar al cliente"
            ayuda="La naviera da una ETA posterior a la capturada en Cargolink o a la que daba antes."
            n={r.aplazadas.length}
            tono="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
          >
            <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th scope="col" className={TH}>Booking · cliente · ejecutivo</th>
                  <th scope="col" className={TH}>Naviera</th>
                  <th scope="col" className={TH}>Cargolink → naviera</th>
                  <th scope="col" className={TH}>Naviera antes → ahora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {r.aplazadas.map((f) => (
                  <tr key={f.id_booking} className="align-top">
                    <BookingCelda f={f} />
                    <td className="px-3 py-2">{nombreNaviera(f.naviera ?? "")}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {f.eta_cargolink ? (
                        <>
                          {fechaCorta(f.eta_cargolink)} → <strong>{fechaCorta(f.eta_naviera)}</strong>{" "}
                          <span className={(f.dias_vs_cargolink ?? 0) > 0 ? "font-semibold text-red-700 dark:text-red-400" : "text-slate-500"}>
                            {dias(f.dias_vs_cargolink)}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-500">Sin ETA en Cargolink · naviera {fechaCorta(f.eta_naviera)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {f.eta_naviera_antes && f.eta_naviera_antes !== f.eta_naviera ? (
                        <>
                          {fechaCorta(f.eta_naviera_antes)} → <strong>{fechaCorta(f.eta_naviera)}</strong>{" "}
                          <span className={(f.dias_vs_antes ?? 0) > 0 ? "font-semibold text-red-700 dark:text-red-400" : "text-slate-500"}>
                            {dias(f.dias_vs_antes)}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-500">Sin cambio</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Seccion>

          <Seccion
            titulo="Problemas de la página de la naviera"
            ayuda={`La página pidió verificación, no respondió o falló: se vuelve a intentar en la siguiente corrida.${
              resueltos ? ` ${resueltos} ya se actualizaron y salieron de la lista.` : ""
            }`}
            n={paginaVisible.length}
            tono="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            accion={
              <ReconsultarNavieras
                key={elegida.id}
                ids={idsPendientes}
                enCurso={enCurso}
                navieras={Object.fromEntries(paginaVisible.map((f) => [f.id_booking, f.naviera ?? null]))}
              />
            }
          >
            <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th scope="col" className={TH}>Booking · cliente · ejecutivo</th>
                  <th scope="col" className={TH}>Naviera</th>
                  <th scope="col" className={TH}>Qué pasó</th>
                  <th scope="col" className={TH}>Ahora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginaVisible.map((f) => (
                  <tr key={f.id_booking} className="align-top">
                    <BookingCelda f={f} />
                    <td className="px-3 py-2">{nombreNaviera(f.naviera ?? "")}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{f.detalle}</td>
                    <td className={`px-3 py-2 text-sm font-semibold ${ahora(f.id_booking).clase}`}>{ahora(f.id_booking).texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Seccion>

          <Seccion
            titulo="Ninguna naviera lo encuentra · revisar BL o contenedor"
            ayuda="Puede estar mal capturado en Cargolink, ser de una naviera sin agente o ser un consolidado."
            n={r.no_encontrados.length}
            tono="bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
          >
            <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th scope="col" className={TH}>Booking · cliente · ejecutivo</th>
                  <th scope="col" className={TH}>BL</th>
                  <th scope="col" className={TH}>Contenedores</th>
                  <th scope="col" className={TH}>Navieras probadas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {r.no_encontrados.map((f) => (
                  <tr key={f.id_booking} className="align-top">
                    <BookingCelda f={f} />
                    <td className="px-3 py-2 font-mono text-xs">{f.mbl ?? "—"}</td>
                    <td className="max-w-56 truncate px-3 py-2 font-mono text-xs" title={f.contenedores ?? undefined}>
                      {f.contenedores ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{f.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Seccion>

          <Seccion
            titulo="Ya zarpó y no tiene BL ni contenedor en Cargolink"
            ayuda="Sin una referencia válida no se puede rastrear: capturarla en Cargolink."
            n={r.sin_referencia.length}
            tono="bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
          >
            <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th scope="col" className={TH}>Booking · cliente · ejecutivo</th>
                  <th scope="col" className={TH}>BL capturado</th>
                  <th scope="col" className={TH}>Contenedores capturados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {r.sin_referencia.map((f) => (
                  <tr key={f.id_booking} className="align-top">
                    <BookingCelda f={f} />
                    <td className="px-3 py-2 font-mono text-xs">{f.mbl || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{f.contenedores || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Seccion>

          <Seccion
            titulo="BL según la naviera · capturar en Cargolink"
            ayuda="Se rastreó por contenedor y la naviera muestra un BL que falta en Cargolink o es otro (el de la agencia)."
            n={(r.bl_naviera ?? []).length}
            tono="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
          >
            <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th scope="col" className={TH}>Booking · cliente · ejecutivo</th>
                  <th scope="col" className={TH}>Naviera</th>
                  <th scope="col" className={TH}>BL de la naviera</th>
                  <th scope="col" className={TH}>En Cargolink</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(r.bl_naviera ?? []).map((f) => (
                  <tr key={f.id_booking} className="align-top">
                    <BookingCelda f={f} />
                    <td className="px-3 py-2">{nombreNaviera(f.naviera ?? "")}</td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold">{f.bl_naviera}</td>
                    <td className="px-3 py-2 font-mono text-xs">{f.mbl || "Sin BL"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Seccion>

          {/* LCL: no es error del rastreo; el estatus lo captura el operativo con el coloader. */}
          <Seccion
            titulo="LCL con coloader · estatus en el detalle"
            ayuda="Su BL es del coloader y ninguna naviera lo reconoce: captura el estatus del coloader en el detalle o pide el BL master o el contenedor."
            n={(r.coloader ?? []).length}
            tono="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
          >
            <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th scope="col" className={TH}>Booking · cliente · ejecutivo</th>
                  <th scope="col" className={TH}>BL del coloader</th>
                  <th scope="col" className={TH}>Contenedores capturados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(r.coloader ?? []).map((f) => (
                  <tr key={f.id_booking} className="align-top">
                    <BookingCelda f={f} />
                    <td className="px-3 py-2 font-mono text-xs">{f.mbl || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{f.contenedores || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Seccion>
        </>
      )}
    </main>
  );
}
