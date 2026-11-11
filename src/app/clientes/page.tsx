import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hoyMexico } from "@/lib/track";
import { armarEmbarque, type FilaPortal } from "@/lib/portalClientes";
import portada from "../../../public/clientes/portada.jpg";

export const dynamic = "force-dynamic";

// Foto de portada: "CMA CGM Seine au port du Havre", Wikimedia Commons, licencia CC0.

export default async function PortalInicio() {
  const supabase = await createClient();
  const hoy = hoyMexico();
  const { data: lista } = await supabase.rpc("portal_clientes_lista");
  const clientes = (lista ?? []) as { clave: string; nombre_visible: string }[];
  const resumen = await Promise.all(
    clientes.map(async (c) => {
      const { data } = await supabase.rpc("portal_clientes_embarques", { p_clave: c.clave });
      const es = ((data ?? []) as FilaPortal[]).map((x) => armarEmbarque(x, hoy));
      return {
        ...c,
        activos: es.length,
        transito: es.filter((e) => e.estado === "transito").length,
        puerto: es.filter((e) => e.estado === "puerto").length,
        urgentes: es.filter((e) => e.urgente).length,
        contenedores: es.reduce((a, e) => a + e.contenedores.length, 0),
      };
    }),
  );

  return (
    <main className="flex-1">
      <section className="relative isolate overflow-hidden">
        <Image src={portada} alt="Buque portacontenedores entrando a puerto" priority placeholder="blur" className="absolute inset-0 -z-10 h-full w-full object-cover" sizes="100vw" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0b1a22]/90 via-[#0b1a22]/65 to-[#0b1a22]/10" />
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-[#9fd6dd] uppercase">AV2 Logistics</p>
          <h1 className="max-w-xl text-4xl font-bold leading-tight text-white text-balance md:text-5xl">Logística Internacional Marítima</h1>
          <p className="mt-4 max-w-lg text-base text-slate-200 md:text-lg">
            Sigue tus embarques desde el puerto de origen hasta la devolución del contenedor: zarpe, llegada, documentos y días libres, explicados en palabras.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Clientes del piloto</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Vista de revisión: entra a cada cliente para ver exactamente lo que verá con su usuario.</p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">En revisión</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {resumen.map((c) => (
            <Link
              key={c.clave}
              href={`/clientes/${c.clave}`}
              className="group grid gap-3 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-[#0e6874] dark:border-slate-700 dark:bg-[#14222a] dark:hover:border-[#4fb3bf]"
            >
              <span className="text-lg font-semibold">{c.nombre_visible}</span>
              <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400">
                {c.activos} embarques activos · {c.contenedores} contenedores
              </span>
              <span className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-[#dcedef] px-2 py-0.5 text-[#0e6874] dark:bg-[#163a40] dark:text-[#4fb3bf]">{c.transito} en tránsito</span>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800 dark:bg-green-950 dark:text-green-300">{c.puerto} en puerto</span>
                {c.urgentes > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800 dark:bg-red-950 dark:text-red-300">{c.urgentes} por vencer días libres</span>}
              </span>
              <span className="text-sm font-semibold text-[#0e6874] group-hover:underline dark:text-[#4fb3bf]">Ver como cliente →</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
