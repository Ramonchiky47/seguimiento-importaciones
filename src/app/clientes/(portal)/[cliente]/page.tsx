import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hoyMexico } from "@/lib/track";
import { armarEmbarque, difDias, fc, narrativa, type FilaPortal } from "@/lib/portalClientes";
import { PortalClienteVista } from "@/components/ListaEmbarquesCliente";

export const dynamic = "force-dynamic";

export default async function PortalCliente({ params }: { params: Promise<{ cliente: string }> }) {
  const { cliente } = await params;
  const supabase = await createClient();
  const hoy = hoyMexico();
  const [{ data: lista }, { data }] = await Promise.all([
    supabase.rpc("portal_clientes_lista"),
    supabase.rpc("portal_clientes_embarques", { p_clave: cliente }),
  ]);
  const info = ((lista ?? []) as { clave: string; nombre_visible: string }[]).find((c) => c.clave === cliente);
  if (!info) notFound();
  const filas = (data ?? []) as FilaPortal[];
  const es = filas.map((x) => armarEmbarque(x, hoy));
  const parrafos = narrativa(es, hoy);
  const ejecutivo = filas.map((f) => f.ej).find(Boolean) ?? "";

  // Avisos: días libres por vencer (agrupados por fecha) y arribos atrasados.
  const avisos: { tipo: "crit" | "warn"; etiqueta: string; texto: string }[] = [];
  const porFecha = new Map<string, typeof es>();
  es.filter((e) => e.urgente)
    .sort((a, b) => (a.ultimoDiaLibre ?? "").localeCompare(b.ultimoDiaLibre ?? ""))
    .forEach((e) => porFecha.set(e.ultimoDiaLibre!, [...(porFecha.get(e.ultimoDiaLibre!) ?? []), e]));
  [...porFecha.entries()].slice(0, 3).forEach(([d, l]) => {
    const nc = l.reduce((a, e) => a + e.contenedores.length, 0);
    const q = difDias(d, hoy);
    avisos.push({
      tipo: "crit",
      etiqueta: "Días libres",
      texto: `${l.length === 1 ? "El booking " + l[0].booking : l.length + " bookings"} (${nc} contenedor${nc === 1 ? "" : "es"}${l[0].buque ? ", " + l[0].buque : ""}) ${q <= 0 ? "terminan hoy" : `terminan el ${fc(d)}, en ${q} día${q === 1 ? "" : "s"}`}.`,
    });
  });
  es.filter((e) => e.estado === "transito" && e.eta && e.eta < hoy).forEach((e) =>
    avisos.push({ tipo: "warn", etiqueta: "Arribo", texto: `${e.booking}${e.buque ? ` (${e.buque})` : ""} tenía llegada el ${fc(e.eta)}. Estamos confirmando el arribo con la naviera.` }),
  );

  // Próximas llegadas por fecha y buque.
  const prox = new Map<string, typeof es>();
  es.filter((e) => e.estado === "transito" && e.eta && e.eta >= hoy).forEach((e) => {
    const k = `${e.eta}|${e.buque}`;
    prox.set(k, [...(prox.get(k) ?? []), e]);
  });
  const llegadas = [...prox.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 10);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-14 sm:px-6">
      <p className="mb-4 rounded-md bg-amber-100 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Vista de revisión: así verá el portal {info.nombre_visible} con su usuario. <Link href="/clientes" className="font-semibold underline">Cambiar de cliente</Link>
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase dark:text-slate-400">Embarques activos al {fc(hoy)}</p>
          <h1 className="text-3xl font-bold text-balance">{info.nombre_visible}</h1>
        </div>
        {ejecutivo && (
          <div className="text-sm sm:text-right">
            <span className="text-slate-500 dark:text-slate-400">Tu ejecutivo de cuenta</span>
            <br />
            <b>{ejecutivo}</b>
          </div>
        )}
      </div>

      <PortalClienteVista embarques={es}>
      <div className="mt-5 grid max-w-[72ch] gap-2.5 text-base leading-relaxed">
        {parrafos.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>

      {avisos.length > 0 && (
        <div className="mt-4 grid gap-2">
          {avisos.map((a) => (
            <div
              key={a.texto}
              className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg px-3 py-2.5 text-sm ${a.tipo === "crit" ? "bg-red-50 dark:bg-red-950/60" : "bg-amber-50 dark:bg-amber-950/60"}`}
            >
              <span className={`pt-px text-xs font-bold tracking-wider uppercase ${a.tipo === "crit" ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>{a.etiqueta}</span>
              <span>{a.texto}</span>
            </div>
          ))}
        </div>
      )}

      <section className="mt-8 grid gap-3">
        <h2 className="text-xl font-semibold">Próximas llegadas</h2>
        {llegadas.length ? (
          <div className="flex gap-2.5 overflow-x-auto pb-1.5">
            {llegadas.map(([k, l]) => {
              const [d, bq] = k.split("|");
              const nc = l.reduce((a, e) => a + e.contenedores.length, 0);
              return (
                <div key={k} className="grid flex-[0_0_190px] gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-[#14222a]">
                  <span className="text-xl font-semibold">
                    {fc(d)} <small className="text-xs font-medium text-slate-500 dark:text-slate-400">en {difDias(d, hoy)} d</small>
                  </span>
                  <span className="text-[13px] font-semibold">{bq || "Buque por confirmar"}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {l.length} booking{l.length > 1 ? "s" : ""} · {nc} cont. · {l[0].destino}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-[#14222a]">
            No hay buques en camino por ahora.
          </p>
        )}
      </section>

      </PortalClienteVista>
    </main>
  );
}
