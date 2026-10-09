import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { AsignarClienteForm, QuitarClienteBoton } from "@/components/AsignarClienteForm";
import { asignarCliente, quitarCliente } from "./actions";

export const dynamic = "force-dynamic";

// Prueba de Track: clientes asignados por operativo. Un operativo con al menos
// un cliente asignado solo ve esos clientes en Track (vista track_hitos).
type Operativo = { id: number; nombre_operativo: string; activo: boolean; user_id: string | null };
type Asignacion = {
  id: number;
  operativo_id: number;
  id_cliente: number;
  cliente: string | null;
  asignado_por: string | null;
  created_at: string;
};

export default async function ClientesAsignadosPage({
  searchParams,
}: {
  searchParams: Promise<{ operativo?: string }>;
}) {
  const { operativo } = await searchParams;
  const myPermissions = await getMyPermissions();
  const esAdmin = myPermissions.es_admin;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: operativosData }, { data: asignacionesData }, { data: catalogoData }] = await Promise.all([
    supabase.from("catalogo_operativos").select("id, nombre_operativo, activo, user_id").order("nombre_operativo"),
    supabase.from("track_clientes_asignados").select("*").order("cliente"),
    esAdmin ? supabase.rpc("track_clientes_catalogo") : Promise.resolve({ data: [] }),
  ]);
  const operativos = ((operativosData ?? []) as Operativo[]).filter((o) => o.activo);
  const asignaciones = (asignacionesData ?? []) as Asignacion[];
  const catalogo = (catalogoData ?? []) as { id_cliente: number; cliente: string; operaciones: number }[];
  const operacionesPorCliente = new Map(catalogo.map((c) => [c.id_cliente, c.operaciones]));
  const porOperativo = new Map<number, Asignacion[]>();
  for (const a of asignaciones) porOperativo.set(a.operativo_id, [...(porOperativo.get(a.operativo_id) ?? []), a]);

  // Admin elige el operativo; los demás ven el suyo.
  const propio = operativos.find((o) => o.user_id === user?.id) ?? null;
  const seleccionado = esAdmin ? (operativos.find((o) => String(o.id) === operativo) ?? null) : propio;
  const asignados = seleccionado ? (porOperativo.get(seleccionado.id) ?? []) : [];
  const boundAsignar = seleccionado ? asignarCliente.bind(null, seleccionado.id) : null;

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Prueba: un operativo con clientes asignados solo ve esos clientes en Mi día, Tablero y Embarques. Sin
        clientes asignados ve todo.
      </p>

      <div className="flex flex-wrap items-start gap-4">
        {esAdmin && (
          <nav
            aria-label="Operativos"
            className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:w-72 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="border-b border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Operativos
            </p>
            <ul className="max-h-[65vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {operativos.map((o) => {
                const n = porOperativo.get(o.id)?.length ?? 0;
                const activo = seleccionado?.id === o.id;
                return (
                  <li key={o.id}>
                    <Link
                      href={`?operativo=${o.id}`}
                      aria-current={activo ? "page" : undefined}
                      className={`flex items-center justify-between gap-2 px-4 py-2.5 text-sm ${
                        activo
                          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                          : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className="truncate">
                        {o.nombre_operativo}
                        {!o.user_id && <span className="ml-1 text-xs opacity-60">(sin usuario)</span>}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 text-xs font-semibold ${activo ? "bg-white/20" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                        {n}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <section className="min-w-0 flex-[999_1_480px] space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {!seleccionado ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {esAdmin
                ? "Elige un operativo para ver y asignar sus clientes."
                : "Tu usuario no está ligado a un operativo; ves todos los clientes."}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {esAdmin ? seleccionado.nombre_operativo : "Tus clientes asignados"}
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {asignados.length === 0
                    ? "Sin clientes asignados: ve todos los clientes"
                    : `${asignados.length} ${asignados.length === 1 ? "cliente" : "clientes"} · solo ve estos en Track`}
                </span>
              </div>
              {esAdmin && !seleccionado.user_id && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Este operativo no tiene usuario en la app: la asignación no tendrá efecto hasta que se le ligue uno en
                  Catálogos › Operativos.
                </p>
              )}
              {esAdmin && boundAsignar && <AsignarClienteForm clientes={catalogo} onAsignar={boundAsignar} />}

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">Cliente</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Operaciones desde 2025</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Asignado por</th>
                      {esAdmin && <th scope="col" className="px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {asignados.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{a.cliente ?? `#${a.id_cliente}`}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{operacionesPorCliente.get(a.id_cliente) ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{a.asignado_por ?? "—"}</td>
                        {esAdmin && (
                          <td className="px-3 py-2 text-right">
                            <QuitarClienteBoton cliente={a.cliente ?? `#${a.id_cliente}`} onQuitar={quitarCliente.bind(null, a.id)} />
                          </td>
                        )}
                      </tr>
                    ))}
                    {asignados.length === 0 && (
                      <tr>
                        <td colSpan={esAdmin ? 4 : 3} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                          Sin clientes asignados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
