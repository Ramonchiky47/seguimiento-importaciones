import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CAMPOS_CORREGIBLES } from "@/lib/operacionesMaritima";
import { guardarOperacionMaritima } from "../actions";

export const dynamic = "force-dynamic";

// Datos de Cargolink que solo se muestran (no se corrigen desde aquí).
const CAMPOS_LECTURA = [
  { field: "fecha", label: "Fecha" },
  { field: "type", label: "Type" },
  { field: "cliente", label: "Cliente" },
  { field: "servicio", label: "Servicio" },
  { field: "modo_transportacion", label: "Modo de transportación" },
  { field: "pod", label: "POD" },
  { field: "origen", label: "Origen" },
  { field: "destino", label: "Destino" },
  { field: "consignatario", label: "Consignatario" },
  { field: "shipper", label: "Shipper" },
  { field: "agente_extranjero", label: "Agente extranjero" },
  { field: "incoterm", label: "Incoterm" },
  { field: "mercancia", label: "Mercancía" },
  { field: "folio_int", label: "Folio" },
  { field: "ultimo_dia_libre_demoras", label: "Último día libre de demoras" },
  { field: "dias_demora", label: "Días demora" },
] as const;

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export default async function OperacionMaritimaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string }>;
}) {
  const { id } = await params;
  const { guardado } = await searchParams;
  const idBooking = Number(id);
  if (!Number.isFinite(idBooking)) notFound();

  const supabase = await createClient();
  const [{ data: vista }, { data: original }, { data: operativosData }] = await Promise.all([
    supabase.from("operaciones_maritima_vista").select("*").eq("id_booking", idBooking).maybeSingle(),
    supabase
      .from("operaciones_maritima")
      .select(CAMPOS_CORREGIBLES.map((c) => c.field).join(", "))
      .eq("id_booking", idBooking)
      .maybeSingle(),
    supabase
      .from("catalogo_operativos")
      .select("nombre_operativo")
      .eq("activo", true)
      .order("nombre_operativo"),
  ]);
  if (!vista) notFound();

  const row = vista as Record<string, unknown>;
  const cargolink = (original ?? {}) as unknown as Record<string, unknown>;
  const correcciones = (row.correcciones ?? {}) as Record<string, unknown>;
  const operativoOptions = (operativosData ?? []).map((o) => o.nombre_operativo as string);
  const operativo = (row.operativo as string | null) ?? "";
  if (operativo && !operativoOptions.includes(operativo)) operativoOptions.push(operativo);

  const editadoAt = row.editado_at
    ? new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Mexico_City",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(row.editado_at as string))
    : null;

  const mostrar = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
  const boundGuardar = guardarOperacionMaritima.bind(null, idBooking);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <Link
            href="/operaciones-maritima"
            className="mb-1 inline-block text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Volver a Operaciones Marítima
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {mostrar(row.no_booking)}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{mostrar(row.cliente)}</p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {guardado && (
          <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
            Cambios guardados.
          </p>
        )}

        <form action={boundGuardar} className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Datos editables</h2>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Lo que cambies aquí se respeta aunque Cargolink se vuelva a cargar. Los campos corregidos
              indican el dato original de Cargolink y se pueden regresar a él.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS_CORREGIBLES.map(({ field, label, tipo }) => {
                const corregido = Object.prototype.hasOwnProperty.call(correcciones, field);
                return (
                  <label key={field} className="block text-xs text-slate-600 dark:text-slate-300">
                    <span className="mb-1 flex items-center gap-2">
                      {label}
                      {corregido && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          corregido
                        </span>
                      )}
                    </span>
                    <input
                      name={field}
                      type={tipo}
                      min={tipo === "number" ? 0 : undefined}
                      defaultValue={(row[field] as string | number | null) ?? ""}
                      className={inputClass}
                    />
                    {corregido && (
                      <span className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-400">
                        <span>Cargolink: {mostrar(cargolink[field])}</span>
                        <span className="flex items-center gap-1">
                          <input type="checkbox" name={`restaurar_${field}`} />
                          Volver al dato de Cargolink
                        </span>
                      </span>
                    )}
                  </label>
                );
              })}
              <label className="block text-xs text-slate-600 dark:text-slate-300">
                <span className="mb-1 block">Operativo</span>
                <select name="operativo" defaultValue={operativo} className={inputClass}>
                  <option value="">— Sin asignar —</option>
                  {operativoOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-600 sm:col-span-2 lg:col-span-3 dark:text-slate-300">
                <span className="mb-1 block">Observaciones internas</span>
                <textarea
                  name="observaciones_internas"
                  rows={3}
                  defaultValue={(row.observaciones_internas as string | null) ?? ""}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-[10px] text-slate-400">
                {editadoAt ? `Última edición: ${mostrar(row.editado_por)} · ${editadoAt}` : "Sin ediciones manuales"}
              </p>
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                Guardar cambios
              </button>
            </div>
          </section>
        </form>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-50">Datos de Cargolink</h2>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {CAMPOS_LECTURA.map(({ field, label }) => (
              <div key={field}>
                <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="text-slate-800 dark:text-slate-200">{mostrar(row[field])}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </div>
  );
}
