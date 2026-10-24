"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Medidores de los procesos de la Mac (tabla rastreo_procesos): carga de
// bookings de Cargolink y rastreo de navieras. Cada 5 s mientras corren.
type Proceso = {
  id: number;
  proceso: "bookings" | "navieras";
  estado: "corriendo" | "terminado" | "error";
  total: number | null;
  hechos: number;
  etapa: string | null;
  mensaje: string | null;
  inicio: string;
  actualizado_at: string;
  fin: string | null;
};

const NOMBRE = { bookings: "Carga de bookings (Cargolink)", navieras: "Rastreo de navieras" };
// Sin señales en este tiempo, se da por detenido (la Mac se apagó o se durmió).
const SIN_SENAL_MIN = 20;

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function leer(): Promise<Proceso[]> {
  const supabase = createClient();
  const r = await Promise.all(
    (["bookings", "navieras"] as const).map((p) =>
      supabase
        .from("rastreo_procesos")
        .select("id, proceso, estado, total, hechos, etapa, mensaje, inicio, actualizado_at, fin")
        .eq("proceso", p)
        .order("inicio", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  return r.map((x) => x.data as Proceso | null).filter((x): x is Proceso => Boolean(x));
}

function Medidor({ p, ahora }: { p: Proceso; ahora: number }) {
  const detenido = p.estado === "corriendo" && ahora - Date.parse(p.actualizado_at) > SIN_SENAL_MIN * 60000;
  const pct = p.estado === "terminado" ? 100 : p.total ? Math.min(100, Math.round((100 * p.hechos) / p.total)) : 0;
  const color =
    p.estado === "error" || detenido ? "bg-red-600" : p.estado === "terminado" ? "bg-green-600" : "bg-[#c65a1f]";
  const texto =
    p.estado === "corriendo"
      ? detenido
        ? `Sin avance desde ${hora(p.actualizado_at)} (¿la Mac se apagó?)`
        : `${p.total ? `${p.hechos} de ${p.total}` : "Iniciando"}${p.etapa ? ` · ${p.etapa}` : ""}`
      : p.estado === "error"
        ? `Falló ${hora(p.fin ?? p.actualizado_at)}: ${p.mensaje ?? ""}`
        : `Terminó ${hora(p.fin ?? p.actualizado_at)}${p.mensaje ? ` · ${p.mensaje}` : ""}`;
  return (
    <div className="min-w-0 flex-1 basis-64">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-800 dark:text-slate-100">{NOMBRE[p.proceso]}</span>
        <span className="tabular-nums text-slate-500 dark:text-slate-400">{pct} %</span>
      </div>
      <div
        role="progressbar"
        aria-label={NOMBRE[p.proceso]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <div className={`h-full rounded-full transition-all ${color} ${p.estado === "corriendo" && !detenido ? "animate-pulse" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400" title={texto}>
        {texto}
        {p.proceso === "navieras" && p.estado === "terminado" && (
          <>
            {" · "}
            <Link href="/track/reporte-navieras" className="font-semibold text-blue-700 underline dark:text-blue-400">
              Ver reporte
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

export function AvanceProcesos() {
  const [{ procesos, ahora }, setLectura] = useState<{ procesos: Proceso[]; ahora: number }>({ procesos: [], ahora: 0 });
  const corriendo = procesos.some((p) => p.estado === "corriendo");

  useEffect(() => {
    let vigente = true;
    // La hora de la lectura (no la del render) decide si un proceso se detuvo.
    const refrescar = () => leer().then((x) => vigente && setLectura({ procesos: x, ahora: Date.now() }));
    refrescar();
    const t = setInterval(refrescar, corriendo ? 5000 : 60000);
    return () => {
      vigente = false;
      clearInterval(t);
    };
  }, [corriendo]);

  if (!procesos.length) return null;
  return (
    <section aria-label="Avance de la actualización" className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
      {procesos.map((p) => (
        <Medidor key={p.proceso} p={p} ahora={ahora} />
      ))}
    </section>
  );
}
