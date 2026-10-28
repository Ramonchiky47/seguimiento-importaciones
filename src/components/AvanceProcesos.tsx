"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AGENTES_RASTREO, tituloAgente } from "@/lib/navieras";

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
  // Rastreo de navieras: avance de cada agente (si uno truena, se sabe cuál).
  por_naviera?: Record<string, { total: number; hechos: number; encontrados: number; estado: string; mensaje: string | null }> | null;
};

const NOMBRE = { bookings: "Carga de bookings (Cargolink)", navieras: "Rastreo de navieras" };
// Navieras con agente, en el orden del rastreo (como las guardan los agentes).
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
        .select("id, proceso, estado, total, hechos, etapa, mensaje, inicio, actualizado_at, fin, por_naviera:reporte->por_naviera")
        .eq("proceso", p)
        .order("inicio", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  return r.map((x) => x.data as Proceso | null).filter((x): x is Proceso => Boolean(x));
}

function Medidor({ p, ahora, onPedido, esAdmin }: { p: Proceso; ahora: number; onPedido: () => void; esAdmin: boolean }) {
  const [pedido, setPedido] = useState<{ cargando: boolean; texto: string | null }>({ cargando: false, texto: null });
  // Rastreo de navieras: todas o solo una.
  const [naviera, setNaviera] = useState("");
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
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-800 dark:text-slate-100">{NOMBRE[p.proceso]}</span>
        <span className="flex items-center gap-2">
          {/* "Correr ahora": solo administradores (la base también lo valida). */}
          {esAdmin && (p.estado !== "corriendo" || detenido) && p.proceso === "navieras" && (
            <select
              value={naviera}
              onChange={(e) => setNaviera(e.target.value)}
              aria-label="Naviera a actualizar"
              className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">Todas</option>
              {AGENTES_RASTREO.map((n) => (
                <option key={n} value={n}>
                  {tituloAgente(n)}
                </option>
              ))}
            </select>
          )}
          {esAdmin && (p.estado !== "corriendo" || detenido) && (
            <button
              type="button"
              disabled={pedido.cargando}
              onClick={async () => {
                setPedido({ cargando: true, texto: null });
                const supabase = createClient();
                const { data, error } =
                  p.proceso === "navieras" && naviera
                    ? await supabase.rpc("solicitar_rastreo_naviera", { p_naviera: naviera })
                    : await supabase.rpc("solicitar_proceso", { p_proceso: p.proceso });
                const r = String(data ?? "");
                setPedido({
                  cargando: false,
                  texto: error
                    ? `No se pudo pedir: ${error.message}`
                    : r === "corriendo"
                      ? "Ya está corriendo."
                      : r === "pendiente"
                        ? "Ya estaba pedido: arranca en menos de 1 minuto."
                        : `Pedido${p.proceso === "navieras" && naviera ? ` (solo ${tituloAgente(naviera)})` : ""}: la Mac lo arranca en menos de 1 minuto.`,
                });
                if (!error) onPedido();
              }}
              className="rounded border border-slate-300 px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {pedido.cargando ? "Pidiendo…" : "Correr ahora"}
            </button>
          )}
          <span className="tabular-nums text-slate-500 dark:text-slate-400">{pct} %</span>
        </span>
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
      {p.proceso === "navieras" && p.por_naviera && Object.keys(p.por_naviera).length > 0 && (
        <ul aria-label="Avance por naviera" className="mt-1 flex flex-wrap gap-1">
          {Object.entries(p.por_naviera).map(([nav, n]) => {
            const pn = n.total ? Math.min(100, Math.round((100 * n.hechos) / n.total)) : 0;
            const tono =
              n.estado === "error"
                ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                : n.estado === "terminado"
                  ? "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                  : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200";
            return (
              <li
                key={nav}
                title={n.estado === "error" ? `Falló: ${n.mensaje ?? ""}` : `${n.hechos} de ${n.total} consultados · ${n.encontrados} encontrados`}
                className={`rounded border px-1.5 py-0.5 text-[11px] tabular-nums ${tono}`}
              >
                {tituloAgente(nav)} {n.estado === "error" ? "✗" : `${pn} %`}
              </li>
            );
          })}
        </ul>
      )}
      {pedido.texto && (
        <p role="status" className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          {pedido.texto}
        </p>
      )}
    </div>
  );
}

export function AvanceProcesos({ esAdmin = false }: { esAdmin?: boolean }) {
  const [{ procesos, ahora }, setLectura] = useState<{ procesos: Proceso[]; ahora: number }>({ procesos: [], ahora: 0 });
  // Tras "Correr ahora", se lee cada 5 s hasta que la corrida aparece.
  const [rapido, setRapido] = useState(false);
  const corriendo = procesos.some((p) => p.estado === "corriendo");

  useEffect(() => {
    let vigente = true;
    // La hora de la lectura (no la del render) decide si un proceso se detuvo.
    const refrescar = () =>
      leer().then((x) => {
        if (!vigente) return;
        setLectura({ procesos: x, ahora: Date.now() });
        if (x.some((p) => p.estado === "corriendo")) setRapido(false);
      });
    refrescar();
    const t = setInterval(refrescar, corriendo || rapido ? 5000 : 60000);
    return () => {
      vigente = false;
      clearInterval(t);
    };
  }, [corriendo, rapido]);

  if (!procesos.length) return null;
  return (
    <section aria-label="Avance de la actualización" className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
      {procesos.map((p) => (
        <Medidor key={p.proceso} p={p} ahora={ahora} onPedido={() => setRapido(true)} esAdmin={esAdmin} />
      ))}
    </section>
  );
}
