"use client";

// Mi día por etapas (Ramón, 9 nov 2026): cada booking con tres tarjetas
// SALIDA / TRANSITO / ARRIBO, semáforo de tres luces, avance y solo lo que falta.
// "Editar" abre la misma ventana de captura del detalle del booking.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fechaCorta, hoyMexico } from "@/lib/track";
import type { Propuesto } from "@/lib/propuestoHito";
import { CapturaArribo, CapturaSalida, CapturaTransito, VentanaCaptura, resumenGrupo, semaforo, type HitoGrupo } from "@/components/CapturaGrupo";

export type HitoEtapa = HitoGrupo & { regla: string | null; dias_atraso: number | null };
type Op = Record<string, unknown> & { datos?: Record<string, string> };
type Etapa = "salida" | "transito" | "arribo";

const ORDENES: Record<Etapa, number[]> = { salida: [1], transito: [11, 2, 3, 4, 5, 6], arribo: [7, 8, 9, 10] };
const NOMBRE: Record<Etapa, string> = { salida: "Salida", transito: "Tránsito", arribo: "Arribo" };
const NOMBRE_HITO: Record<number, string> = { 1: "ATD - POL", 7: "ATA - POD", 8: "Aviso de ATA - POD" };

// Nivel del semáforo: 0 completa/en tiempo, 1 sin iniciar, 2 próximo, 3 vencido, 4 crítico.
const LUCES = [
  { luces: ["", "", "v"], texto: "text-green-700 dark:text-green-400", borde: "border-green-300 dark:border-green-800", barra: "bg-green-600" },
  { luces: ["", "", "v"], texto: "text-slate-500 dark:text-slate-400", borde: "border-slate-300 dark:border-slate-600", barra: "bg-slate-400" },
  { luces: ["", "a", ""], texto: "text-amber-700 dark:text-amber-400", borde: "border-amber-300 dark:border-amber-700", barra: "bg-amber-500" },
  { luces: ["r", "", ""], texto: "text-red-700 dark:text-red-400", borde: "border-red-300 dark:border-red-800", barra: "bg-red-600" },
  { luces: ["r", "r", ""], texto: "text-red-900 dark:text-red-300", borde: "border-red-800 ring-1 ring-red-800 dark:border-red-500 dark:ring-red-500", barra: "bg-red-800" },
];

function Semaforo({ nivel }: { nivel: number }) {
  const l = LUCES[nivel].luces;
  const color = (x: string) =>
    x === "r" ? "bg-red-500 shadow-[0_0_6px_#ef4444]" : x === "a" ? "bg-amber-400 shadow-[0_0_6px_#f5b301]" : x === "v" ? "bg-green-500 shadow-[0_0_6px_#22c55e]" : "bg-white/25";
  return (
    <span className="inline-flex gap-[3px] rounded-full bg-slate-900 px-[5px] py-[3px] dark:bg-slate-200" aria-hidden="true">
      {l.map((x, i) => (
        <span key={i} className={`size-[9px] rounded-full ${x ? color(x) : "bg-white/25 dark:bg-slate-900/30"}`} />
      ))}
    </span>
  );
}

const fecha = (v: unknown) => {
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !s.startsWith("0000") ? s : "";
};

export function EtapasBooking({
  op,
  hitos,
  puedeEditar,
  propuestos,
}: {
  op: Op;
  hitos: HitoEtapa[];
  puedeEditar: boolean;
  propuestos?: Record<number, Propuesto[]>;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<Etapa | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const hoy = hoyMexico();
  const ata = fecha(op.ata) || null;
  const datos = (op.datos ?? {}) as Record<string, string>;
  // Sin ETD capturado pero con ATD: el ETD es la misma fecha del ATD (Ramón, 9 nov).
  const etd = fecha(datos.fecha_estimada) || fecha(op.etd_atd);

  const tarjetas = (Object.keys(ORDENES) as Etapa[]).map((et) => {
    const hs = ORDENES[et].map((o) => hitos.find((h) => h.orden === o)).filter((h): h is HitoEtapa => Boolean(h) && h!.estado !== "no_aplica");
    // ETD - POL cuenta en Salida: hecho si está capturado en Origen.
    const total = hs.length + (et === "salida" ? 1 : 0);
    const hechos = hs.filter((h) => h.hecho).length + (et === "salida" && etd ? 1 : 0);
    const pendientes = hs.filter((h) => !h.hecho).map((h) => ({ h, s: semaforo(h, ata, hoy) }));
    if (et === "salida" && !etd) pendientes.unshift({ h: { orden: 0, hito: "ETD - POL", fecha_plan: null, fecha_hecho: null, hecho: false, estado: "falta_dato", regla: null, dias_atraso: null }, s: { label: "Falta dato", clase: "", nivel: 2 } });
    const peor = pendientes.reduce((n, p) => Math.max(n, p.s.nivel), 0);
    // Nivel del semáforo de la tarjeta.
    const nivel = pendientes.length === 0 ? 0 : peor >= 4 ? 4 : peor === 3 ? 3 : peor === 2 ? 2 : hechos === 0 ? 1 : 0;
    const peorP = pendientes.find((p) => p.s.nivel === peor);
    const estado =
      pendientes.length === 0
        ? "Completa"
        : nivel === 4
          ? "Crítico · ya arribó"
          : nivel === 3 || nivel === 2
            ? (peorP?.s.label ?? "")
            : et === "arribo" && !ata
              ? "Esperando arribo"
              : "En tiempo";
    const resumen =
      et === "salida"
        ? `ETD ${etd ? fechaCorta(etd) : "—"} · ATD ${fecha(op.etd_atd) ? fechaCorta(fecha(op.etd_atd)) : "—"}`
        : resumenGrupo(et === "transito" ? "Transito" : "Arribo", op).texto;
    return { et, total, hechos, pendientes, nivel, estado, resumen };
  });
  const total = tarjetas.reduce((n, t) => n + t.total, 0);
  const hechos = tarjetas.reduce((n, t) => n + t.hechos, 0);
  const pct = total ? Math.round((100 * hechos) / total) : 0;

  const props = {
    op,
    idBooking: Number(op.id_booking),
    hitos,
    propuestos,
    onCancelar: () => setAbierta(null),
    onGuardado: (mensaje: string) => {
      setAbierta(null);
      setAviso(mensaje);
      router.refresh();
    },
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
        Avance {hechos} de {total} · {pct} %
        <span className="h-2 w-36 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <span className="block h-full rounded-full bg-green-600" style={{ width: `${pct}%` }} />
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {tarjetas.map((t) => {
          const L = LUCES[t.nivel];
          return (
            <section key={t.et} className={`grid min-w-0 content-start gap-1 rounded-xl border bg-white/80 px-3 py-2 dark:bg-slate-900/60 ${L.borde}`}>
              <div className="flex items-center gap-2">
                <Semaforo nivel={t.nivel} />
                <span className="text-xs font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100">{NOMBRE[t.et]}</span>
                <span className="ml-auto text-xs text-slate-500 tabular-nums dark:text-slate-400">
                  {t.hechos} de {t.total}
                </span>
              </div>
              <span className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <span className={`block h-full ${L.barra}`} style={{ width: `${t.total ? (100 * t.hechos) / t.total : 0}%` }} />
              </span>
              <span className={`text-xs font-bold ${L.texto}`}>{t.estado}</span>
              <span className="truncate text-xs text-slate-500 dark:text-slate-400" title={t.resumen}>
                {t.resumen}
              </span>
              {t.pendientes.length === 0 ? (
                <span className="text-xs font-semibold text-green-700 dark:text-green-400">✓ Sin pendientes</span>
              ) : (
                <ul className="grid gap-0.5">
                  {t.pendientes.map(({ h, s }) => {
                    const punto = s.nivel >= 4 ? "bg-red-800" : s.nivel === 3 ? "bg-red-600" : s.nivel === 2 ? "bg-amber-500" : "bg-slate-400";
                    const txt = s.nivel >= 4 ? "text-red-900 dark:text-red-300" : s.nivel === 3 ? "text-red-700 dark:text-red-400" : s.nivel === 2 ? "text-amber-700 dark:text-amber-400" : "text-slate-500 dark:text-slate-400";
                    const etiqueta =
                      s.nivel >= 4
                        ? "crítico"
                        : h.dias_atraso
                          ? `${h.dias_atraso} d tarde`
                          : s.nivel === 2 && h.fecha_plan
                            ? `vence ${fechaCorta(h.fecha_plan)}`
                            : h.fecha_plan
                              ? fechaCorta(h.fecha_plan)
                              : s.label.toLowerCase();
                    return (
                      <li key={h.orden} className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-1.5 text-[13px] leading-tight">
                        <span className={`size-2 rounded-full ${punto}`} aria-hidden="true" />
                        <span className="truncate text-slate-800 dark:text-slate-100">{NOMBRE_HITO[h.orden] ?? h.hito}</span>
                        <span className={`text-xs font-bold whitespace-nowrap ${txt}`}>{etiqueta}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => {
                    setAviso(null);
                    setAbierta(t.et);
                  }}
                  className="mt-0.5 justify-self-end rounded-md bg-slate-900 px-3 py-0.5 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
                >
                  Editar
                </button>
              )}
            </section>
          );
        })}
      </div>
      {aviso && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-1.5 text-xs text-green-800 dark:bg-green-950 dark:text-green-300">
          {aviso}
        </p>
      )}
      {abierta && (
        <VentanaCaptura titulo={`Captura de ${NOMBRE[abierta].toLowerCase()} · ${String(op.no_booking ?? "")}`} onCerrar={() => setAbierta(null)}>
          {abierta === "salida" ? <CapturaSalida {...props} /> : abierta === "transito" ? <CapturaTransito {...props} /> : <CapturaArribo {...props} />}
        </VentanaCaptura>
      )}
    </div>
  );
}
