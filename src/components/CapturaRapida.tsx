"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { guardarEtapaCargolink } from "@/app/(app)/operaciones-maritima/actions";
import { ETAPAS_CARGOLINK } from "@/lib/etapasCargolink";
import { fechaCorta } from "@/lib/track";

// Pendiente de Mi día que se captura ahí mismo: al darle clic se despliega la fecha
// (propuesta del correo si la hay, si no hoy) y los botones de la etapa. Mismo guardado
// que el Interactivo (Bitácora, sin notificar). Las etapas con listas o textos largos
// (Aviso de ATA) abren la captura completa.
export function CapturaRapida({
  idBooking,
  etapaKey,
  tarea,
  hito,
  corto,
  colorTexto,
  colorPunto,
  fecha,
  regla,
  propuesta,
  puedeEditar,
}: {
  idBooking: number;
  etapaKey: string | null;
  tarea: string | null;
  hito: string;
  corto: string;
  colorTexto: string;
  colorPunto: string;
  fecha: string | null;
  regla: string;
  propuesta: { fecha: string; fuente: string } | null;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const etapa = etapaKey ? ETAPAS_CARGOLINK[etapaKey] : undefined;
  const simple = Boolean(etapa) && etapa!.campos.every((c) => c.tipo === "date" || c.tipo === "number");
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<{ guardando: boolean; ok?: boolean; mensaje?: string }>({ guardando: false });
  const completa = `/track/interactivo/${idBooking}${tarea ? `?editar=${tarea}` : ""}`;

  const abrir = () => {
    if (!abierto && etapa) {
      // Primer campo de fecha: la propuesta del correo, si no hoy.
      const primero = etapa.campos.find((c) => c.tipo === "date");
      setValores(primero ? { [primero.key]: propuesta?.fecha ?? hoy } : {});
      setEstado({ guardando: false });
    }
    setAbierto((x) => !x);
  };

  const guardar = async (status: string) => {
    if (!etapa) return;
    setEstado({ guardando: true });
    const r = await guardarEtapaCargolink(idBooking, etapa.key, status, status === "NO_APLICA" ? {} : valores);
    setEstado({ guardando: false, ok: r.ok, mensaje: r.ok ? "Guardado en Cargolink" : r.mensaje });
    if (r.ok) router.refresh();
  };

  const fila = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${colorPunto}`} aria-hidden="true" />
        <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{hito}</span>
      </span>
      <span className={`whitespace-nowrap text-xs font-bold tabular-nums ${colorTexto}`}>{corto}</span>
      <span className="whitespace-nowrap text-xs tabular-nums text-slate-700 dark:text-slate-300">{fecha ? fechaCorta(fecha) : "Sin fecha"}</span>
      <span className="truncate text-xs text-slate-400 dark:text-slate-500">{regla}</span>
      {/* Botón siempre visible, con borde, para que se vea que el renglón se captura. */}
      <span
        className={`justify-self-end whitespace-nowrap rounded-md border px-2.5 py-0 text-xs leading-5 font-semibold ${
          abierto
            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
            : "border-blue-300 bg-white text-blue-700 group-hover:border-blue-600 group-hover:bg-blue-600 group-hover:text-white dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
        }`}
      >
        {abierto ? "Cerrar" : "Capturar"}
      </span>
    </>
  );
  const claseFila =
    "group flex w-full flex-wrap items-center gap-x-3 gap-y-0 px-3 py-0.5 text-left leading-tight hover:bg-blue-50 sm:grid sm:grid-cols-[minmax(0,9.5rem)_6.5rem_4.5rem_minmax(0,1fr)_auto] dark:hover:bg-slate-800";

  // Sin permiso de escribir en Cargolink o etapa compleja: abre la captura completa.
  if (!puedeEditar || !simple) {
    return (
      <Link href={completa} title={`Capturar o confirmar ${hito}`} className={claseFila}>
        {fila}
      </Link>
    );
  }

  return (
    <div>
      <button type="button" onClick={abrir} aria-expanded={abierto} className={claseFila}>
        {fila}
      </button>
      {abierto && etapa && (
        <div className="flex flex-wrap items-end gap-2 border-t border-blue-100 bg-blue-50/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
          {etapa.campos.map((c) => (
            <label key={c.key} className="flex flex-col text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              {c.label}
              <input
                type={c.tipo === "number" ? "number" : "date"}
                min={c.tipo === "number" ? 0 : undefined}
                value={valores[c.key] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [c.key]: e.target.value }))}
                className={`mt-0.5 rounded-md border px-2 py-1 text-sm font-normal text-slate-900 dark:bg-slate-900 dark:text-slate-100 ${
                  c.tipo === "number" ? "w-20" : ""
                } border-slate-300 dark:border-slate-600`}
              />
            </label>
          ))}
          {propuesta && (
            <span className="pb-1.5 text-[11px] text-slate-500 dark:text-slate-400">Propuesta: {fechaCorta(propuesta.fecha)} ({propuesta.fuente})</span>
          )}
          <span className="flex-1" />
          {etapa.acciones.map((a) => (
            <button
              key={a.status}
              type="button"
              disabled={estado.guardando || (a.status !== "NO_APLICA" && etapa.campos.some((c) => c.requerido && !valores[c.key]))}
              onClick={() => guardar(a.status)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                a.resultado === "FINALIZADO"
                  ? "bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              }`}
            >
              {estado.guardando ? "Guardando…" : a.label}
            </button>
          ))}
          <Link href={completa} className="pb-1.5 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400">
            Captura completa →
          </Link>
          {estado.mensaje && (
            <p role="status" className={`basis-full text-xs font-semibold ${estado.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
              {estado.ok ? "✓ " : ""}
              {estado.mensaje}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
