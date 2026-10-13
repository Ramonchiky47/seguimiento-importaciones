import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { AbrirOperacionBoton } from "@/components/OperacionDetalleModal";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Cambios que llegan DE Cargolink a la app (trigger sobre
// operaciones_maritima al sincronizar). Solo administradores.
type Cambio = {
  id: number;
  id_booking: number;
  no_booking: string | null;
  cliente: string | null;
  ejecutivo: string | null;
  etiqueta: string;
  valor_antes: string | null;
  valor_despues: string | null;
  fecha_cargolink: string | null;
  origen: string;
  detectado_por: string | null;
  detectado_at: string;
};

const ESTATUS_ETAPA: Record<string, string> = {
  FINALIZADO: "Finalizado",
  EDICION: "En edición",
  NO_APLICA: "No aplica",
  PENDIENTE: "Pendiente",
};
const ESTATUS_BOOKING: Record<string, string> = { "1": "Vigente", "2": "Finalizado", "0": "Cancelado" };

function valor(v: string | null, etiqueta: string): string {
  if (v === null || v === "" || v.startsWith("0000")) return "—";
  if (etiqueta === "Estatus del booking") return ESTATUS_BOOKING[v] ?? v;
  if (ESTATUS_ETAPA[v]) return ESTATUS_ETAPA[v];
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  }
  return v;
}

const fechaHora = (iso: string | null, conZona: boolean) =>
  iso
    ? new Intl.DateTimeFormat("es-MX", {
        ...(conZona ? { timeZone: "America/Mexico_City" } : { timeZone: "UTC" }),
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(conZona ? iso : `${iso.replace(" ", "T")}Z`))
    : "—";

export default async function CambiosCargolinkPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; origen?: string; desde?: string; hasta?: string; page?: string }>;
}) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) redirect("/track/mi-dia");

  const { q, origen, desde, hasta, page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const term = (q ?? "").replace(/[,()%]/g, " ").trim();
  const fechaValida = (f?: string) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null);
  const desdeOk = fechaValida(desde);
  const hastaOk = fechaValida(hasta);
  const origenOk = origen === "Cargolink" || origen === "App" ? origen : null;

  const supabase = await createClient();
  let query = supabase
    .from("bitacora_cambios_cargolink")
    .select("*", { count: "exact" })
    .order("detectado_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (term) query = query.or(`no_booking.ilike.%${term}%,cliente.ilike.%${term}%,ejecutivo.ilike.%${term}%`);
  if (origenOk) query = query.eq("origen", origenOk);
  if (desdeOk) query = query.gte("detectado_at", `${desdeOk}T00:00:00-06:00`);
  if (hastaOk) query = query.lte("detectado_at", `${hastaOk}T23:59:59-06:00`);
  const { data, error, count } = await query;
  const cambios = (data ?? []) as Cambio[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (origenOk) params.set("origen", origenOk);
    if (desdeOk) params.set("desde", desdeOk);
    if (hastaOk) params.set("hasta", hastaOk);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `?${s}` : "?";
  };
  const pagerClass = (disabled: boolean) =>
    `rounded-md border border-slate-300 px-2 py-1 dark:border-slate-700 ${
      disabled ? "pointer-events-none opacity-40" : "hover:bg-slate-50 dark:hover:bg-slate-800"
    }`;
  const inputClass =
    "min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900";

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Cambios que llegaron de Cargolink a la app (carga de 2 PM y 7 PM, botón Actualizar o al abrir un booking). Cargolink
        no informa quién hizo el cambio; &quot;Fecha en Cargolink&quot; es la hora del movimiento de la etapa. Solo
        administradores.
      </p>

      <form className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
          Booking, cliente o ejecutivo
          <input name="q" defaultValue={q ?? ""} placeholder="Ej. 2606-2865" className={`${inputClass} w-64`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
          Origen
          <select name="origen" defaultValue={origenOk ?? ""} className={inputClass}>
            <option value="">Todos</option>
            <option value="Cargolink">Hecho en Cargolink</option>
            <option value="App">Hecho desde la app</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
          Desde
          <input type="date" name="desde" defaultValue={desdeOk ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
          Hasta
          <input type="date" name="hasta" defaultValue={hastaOk ?? ""} className={inputClass} />
        </label>
        <button
          type="submit"
          className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          Filtrar
        </button>
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          No se pudo leer la bitácora: {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              {["Detectado", "Booking", "Cliente", "Ejecutivo", "Qué cambió", "Tenía", "Cambió a", "Fecha en Cargolink", "Origen"].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {cambios.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums" title={c.detectado_por ?? undefined}>
                  {fechaHora(c.detectado_at, true)}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <AbrirOperacionBoton
                    idBooking={c.id_booking}
                    className="font-mono text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
                  >
                    {c.no_booking ?? c.id_booking}
                  </AbrirOperacionBoton>
                </td>
                <td className="max-w-48 truncate px-3 py-2">{c.cliente ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">{c.ejecutivo ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">{c.etiqueta}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-500 dark:text-slate-400">{valor(c.valor_antes, c.etiqueta)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-900 dark:text-slate-100">{valor(c.valor_despues, c.etiqueta)}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fechaHora(c.fecha_cargolink, false)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      c.origen === "App"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {c.origen === "App" ? "Desde la app" : "Cargolink"}
                  </span>
                </td>
              </tr>
            ))}
            {cambios.length === 0 && !error && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                  Sin cambios registrados con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalCount > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <p>
            Mostrando {from + 1}–{Math.min(from + PAGE_SIZE, totalCount)} de {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <Link href={pageHref(currentPage - 1)} aria-disabled={currentPage === 1} className={pagerClass(currentPage === 1)}>
              ‹ Anterior
            </Link>
            <span className="px-2">
              Página {currentPage} de {totalPages}
            </span>
            <Link href={pageHref(currentPage + 1)} aria-disabled={currentPage >= totalPages} className={pagerClass(currentPage >= totalPages)}>
              Siguiente ›
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
