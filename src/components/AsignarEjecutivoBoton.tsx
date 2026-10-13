"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { asignarEjecutivoCargolink, ejecutivosCargolink } from "@/app/(app)/operaciones-maritima/actions";

// Booking sin ejecutivo: elige un operativo de Cargolink y lo asigna allá
// (misma función que Operaciones › Asignar ejecutivos). Vive dentro de una
// fila clicable, así que no deja pasar clics ni teclas a la fila.
export function AsignarEjecutivoBoton({ idBooking, noBooking }: { idBooking: number; noBooking: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[] | null>(null);
  const [elegido, setElegido] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [cargando, startCarga] = useTransition();
  const [guardando, startGuardado] = useTransition();

  const abrir = () => {
    setMensaje(null);
    setElegido("");
    dialogRef.current?.showModal();
    if (!usuarios) {
      startCarga(async () => {
        const r = await ejecutivosCargolink();
        if (r.ok) setUsuarios(r.usuarios);
        else setMensaje({ ok: false, mensaje: r.mensaje });
      });
    }
  };

  const guardar = () => {
    const usuario = usuarios?.find((u) => u.id === elegido);
    if (!usuario) return;
    if (!window.confirm(`Se asignará a ${usuario.nombre} como ejecutivo de ${noBooking} en Cargolink. ¿Continuar?`)) return;
    startGuardado(async () => {
      const r = await asignarEjecutivoCargolink(idBooking, usuario.id);
      setMensaje(r);
      if (r.ok) {
        dialogRef.current?.close();
        router.refresh();
      }
    });
  };

  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={abrir}
        className="rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
      >
        Asignar
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`asignar-ejecutivo-${idBooking}`}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <div className="space-y-4 p-5">
          <h2 id={`asignar-ejecutivo-${idBooking}`} className="text-base font-semibold">
            Asignar ejecutivo · <span className="font-mono">{noBooking}</span>
          </h2>
          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
            Usuario de Cargolink
            <select
              value={elegido}
              onChange={(e) => setElegido(e.target.value)}
              disabled={cargando || !usuarios}
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">{cargando ? "Cargando usuarios…" : "Elige un ejecutivo"}</option>
              {(usuarios ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
          {mensaje && (
            <p role={mensaje.ok ? "status" : "alert"} className={`text-sm ${mensaje.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
              {mensaje.mensaje}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="min-h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={!elegido || guardando}
              className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {guardando ? "Guardando en Cargolink…" : "Asignar en Cargolink"}
            </button>
          </div>
        </div>
      </dialog>
    </span>
  );
}
