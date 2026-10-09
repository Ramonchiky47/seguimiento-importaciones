import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AbrirOperacionBoton } from "@/components/OperacionDetalleModal";
import { ETAPAS_CARGOLINK } from "@/lib/etapasCargolink";
import { fechaCorta } from "@/lib/track";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Bitácora de lo que la app escribió en Cargolink (bitacora_cargolink).
type Registro = {
  id: number;
  created_at: string;
  id_booking: number;
  no_booking: string;
  etapa: string;
  accion: string;
  valores: Record<string, unknown> | null;
  valores_antes: Record<string, unknown> | null;
  valores_despues: Record<string, unknown> | null;
  estatus_antes: string | null;
  estatus_despues: string | null;
  usuario_email: string | null;
  usuario_nombre: string | null;
  ok: boolean;
  mensaje: string | null;
};

const ESTATUS_LABEL: Record<string, string> = {
  SIN_COMENZAR: "Sin comenzar",
  EDICION: "En edición",
  FINALIZADO: "Finalizado",
  NO_APLICA: "No aplica",
};

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

// "Estatus: En edición" + cada campo de la etapa con su etiqueta.
function describir(etapaKey: string, estatus: string | null, valores: Record<string, unknown> | null): string[] {
  const etapa = ETAPAS_CARGOLINK[etapaKey];
  const lineas: string[] = [];
  if (estatus) lineas.push(`Estatus: ${ESTATUS_LABEL[estatus] ?? estatus}`);
  for (const [k, v] of Object.entries(valores ?? {})) {
    // Transbordo: lista de filas.
    if (k === "transbordos" && Array.isArray(v)) {
      if (v.length === 0) lineas.push("Sin filas");
      v.forEach((fila: Record<string, string>, i: number) => {
        const partes = (etapa?.filas ?? [])
          .filter((c) => fila[c.key])
          .map((c) => `${c.label.replace(" a puerto transbordo", "").replace(" de puerto transbordo", "")}: ${c.tipo === "date" ? fechaCorta(fila[c.key]) : fila[c.key]}`);
        lineas.push(`${i + 1}) ${partes.join(" · ") || "—"}`);
      });
      continue;
    }
    const campo = etapa?.campos.find((c) => c.key === k);
    const s = v === null || v === undefined || v === "" || String(v).startsWith("0000") ? "—" : String(v);
    const valor = campo?.tipo === "date" && s !== "—" ? fechaCorta(s) : s;
    lineas.push(`${campo?.label ?? k}: ${valor}`);
  }
  return lineas;
}

export default async function BitacoraPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; usuario?: string; desde?: string; hasta?: string; page?: string }>;
}) {
  const { q, usuario, desde, hasta, page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const term = (q ?? "").replace(/[,()%]/g, " ").trim();
  const fechaValida = (f?: string) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null);
  const desdeOk = fechaValida(desde);
  const hastaOk = fechaValida(hasta);

  const supabase = await createClient();
  let query = supabase
    .from("bitacora_cargolink")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (term) query = query.ilike("no_booking", `%${term}%`);
  if (usuario) query = query.eq("usuario_email", usuario);
  // Fechas en hora del centro de México.
  if (desdeOk) query = query.gte("created_at", `${desdeOk}T00:00:00-06:00`);
  if (hastaOk) query = query.lte("created_at", `${hastaOk}T23:59:59-06:00`);

  const [{ data, error, count }, { data: usuariosData }] = await Promise.all([
    query,
    supabase.from("bitacora_cargolink").select("usuario_email, usuario_nombre").limit(1000),
  ]);
  const registros = (data ?? []) as Registro[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const usuarios = Array.from(
    new Map(
      ((usuariosData ?? []) as { usuario_email: string | null; usuario_nombre: string | null }[])
        .filter((u) => u.usuario_email)
        .map((u) => [u.usuario_email as string, u.usuario_nombre ?? u.usuario_email]),
    ),
  ).sort((a, b) => String(a[1]).localeCompare(String(b[1]), "es"));

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (usuario) params.set("usuario", usuario);
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
        Cada cambio que se hizo en Cargolink desde la app. En Cargolink aparecen a nombre de rvillanueva; aquí queda
        quién lo hizo.
      </p>

      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
          Booking
          <input name="q" defaultValue={q ?? ""} placeholder="Ej. 2606-2865" className={`${inputClass} w-44`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
          Usuario
          <select name="usuario" defaultValue={usuario ?? ""} className={inputClass}>
            <option value="">Todos</option>
            {usuarios.map(([email, nombre]) => (
              <option key={email} value={email}>
                {nombre}
              </option>
            ))}
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
          className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Filtrar
        </button>
        {(q || usuario || desdeOk || hastaOk) && (
          <Link href="?" className="self-center text-xs font-medium text-blue-700 hover:underline dark:text-blue-400">
            Quitar filtros
          </Link>
        )}
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Error al cargar la bitácora: {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              {["Fecha y hora", "Usuario", "Correo", "Booking", "Tipo de transacción", "Tenía", "Cambió a", "Resultado"].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top dark:divide-slate-800">
            {registros.map((r) => {
              const etapa = ETAPAS_CARGOLINK[r.etapa];
              const accion = etapa?.acciones.find((a) => a.status === r.accion);
              // Registros anteriores a esta versión no guardaban "después":
              // se muestra lo que se pidió cambiar.
              const despues = r.valores_despues ?? r.valores;
              return (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{fechaHora(r.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                    {r.usuario_nombre ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400">{r.usuario_email ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <AbrirOperacionBoton
                      idBooking={r.id_booking}
                      className="font-mono text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      {r.no_booking}
                    </AbrirOperacionBoton>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{etapa?.label ?? r.etapa}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {r.accion === "ELIMINAR_FILA" ? "Borrar fila" : (accion?.label ?? r.accion)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                    {r.valores_antes || r.estatus_antes
                      ? describir(r.etapa, r.estatus_antes, r.valores_antes).map((l) => <p key={l}>{l}</p>)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-900 dark:text-slate-100">
                    {describir(r.etapa, r.estatus_despues, despues).map((l) => (
                      <p key={l}>{l}</p>
                    ))}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        r.ok
                          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      }`}
                    >
                      {r.ok ? "Aplicado" : "Error"}
                    </span>
                    {!r.ok && r.mensaje && <p className="mt-1 max-w-64 text-xs text-red-700 dark:text-red-400">{r.mensaje}</p>}
                  </td>
                </tr>
              );
            })}
            {registros.length === 0 && !error && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                  No hay cambios registrados con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalCount > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <p>
            Mostrando {from + 1}–{Math.min(from + PAGE_SIZE, totalCount)} de {totalCount} cambios
          </p>
          <div className="flex items-center gap-1">
            <Link href={pageHref(currentPage - 1)} aria-disabled={currentPage === 1} className={pagerClass(currentPage === 1)}>
              ‹ Anterior
            </Link>
            <span className="px-2">
              Página {currentPage} de {totalPages}
            </span>
            <Link
              href={pageHref(currentPage + 1)}
              aria-disabled={currentPage >= totalPages}
              className={pagerClass(currentPage >= totalPages)}
            >
              Siguiente ›
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
