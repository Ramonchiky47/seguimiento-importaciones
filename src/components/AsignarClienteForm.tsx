"use client";

import { useRef, useState, useTransition } from "react";
import type { ResultadoAsignacion } from "@/app/(app)/track/clientes/actions";

// Alta de un cliente al operativo: campo con sugerencias (datalist) de los
// clientes con operaciones desde 2025.
export function AsignarClienteForm({
  clientes,
  onAsignar,
}: {
  clientes: { id_cliente: number; cliente: string; operaciones: number }[];
  onAsignar: (formData: FormData) => Promise<ResultadoAsignacion>;
}) {
  const [mensaje, setMensaje] = useState<ResultadoAsignacion | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const r = await onAsignar(fd);
          setMensaje(r);
          if (r.ok) formRef.current?.reset();
        })
      }
      className="flex flex-wrap items-end gap-2"
    >
      <label className="flex min-w-80 flex-1 flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
        Agregar cliente
        <input
          name="cliente"
          list="clientes-catalogo"
          required
          autoComplete="off"
          placeholder="Escribe el nombre del cliente…"
          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
        />
        <datalist id="clientes-catalogo">
          {clientes.map((c) => (
            <option key={c.id_cliente} value={`${c.cliente} (#${c.id_cliente})`}>
              {c.operaciones} operaciones
            </option>
          ))}
        </datalist>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {pending ? "Asignando…" : "Asignar"}
      </button>
      {mensaje && (
        <p
          role={mensaje.ok ? "status" : "alert"}
          className={`w-full text-sm ${mensaje.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
        >
          {mensaje.mensaje}
        </p>
      )}
    </form>
  );
}

export function QuitarClienteBoton({
  cliente,
  onQuitar,
}: {
  cliente: string;
  onQuitar: () => Promise<ResultadoAsignacion>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`¿Quitar ${cliente} de este operativo?`)) return;
        startTransition(async () => {
          const r = await onQuitar();
          if (!r.ok) alert(r.mensaje);
        });
      }}
      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
    >
      {pending ? "Quitando…" : "Quitar"}
    </button>
  );
}
