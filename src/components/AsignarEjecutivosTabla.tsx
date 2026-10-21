"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AbrirOperacionBoton } from "@/components/OperacionDetalleModal";
import { asignarEjecutivosCargolink, type FilaPorAsignar } from "@/app/(app)/operaciones-maritima/actions";
import { fechaCorta } from "@/lib/track";

export function AsignarEjecutivosTabla({
  filas,
  usuarios,
}: {
  filas: FilaPorAsignar[];
  usuarios: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  // Precarga: la propuesta por historial; se marcan los que tienen propuesta.
  const [elegido, setElegido] = useState<Record<number, string>>(() =>
    Object.fromEntries(filas.map((f) => [f.id_booking, f.propuesta_id ?? ""])),
  );
  const [marcado, setMarcado] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(filas.map((f) => [f.id_booking, Boolean(f.propuesta_id)])),
  );
  const [resultado, setResultado] = useState<Record<number, { ok: boolean; mensaje: string }>>({});
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const nombreDe = (id: string) => usuarios.find((u) => u.id === id)?.nombre ?? id;
  const seleccion = filas.filter((f) => marcado[f.id_booking] && elegido[f.id_booking] && !resultado[f.id_booking]?.ok);
  const pendientes = filas.filter((f) => !resultado[f.id_booking]?.ok);
  const todosMarcados = pendientes.length > 0 && pendientes.every((f) => marcado[f.id_booking]);

  const asignar = () => {
    if (seleccion.length === 0) return;
    const lista = seleccion.map((f) => `• ${f.no_booking} → ${nombreDe(elegido[f.id_booking])}`).join("\n");
    if (!window.confirm(`Se asignará en Cargolink el ejecutivo de ${seleccion.length} booking(s):\n\n${lista}\n\n¿Continuar?`)) return;
    setAviso(null);
    startTransition(async () => {
      const r = await asignarEjecutivosCargolink(seleccion.map((f) => ({ idBooking: f.id_booking, idUsuario: elegido[f.id_booking] })));
      setAviso({ ok: r.ok, mensaje: r.mensaje });
      setResultado((prev) => ({
        ...prev,
        ...Object.fromEntries(r.resultados.map((x) => [x.idBooking, { ok: x.ok, mensaje: x.mensaje }])),
      }));
      router.refresh();
    });
  };

  if (filas.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        No hay bookings vigentes sin ejecutivo. 🎉
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="font-semibold">{pendientes.length}</span> por asignar ·{" "}
          {filas.filter((f) => f.propuesta_id).length} con propuesta
        </p>
        <button
          type="button"
          onClick={asignar}
          disabled={pending || seleccion.length === 0}
          className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {pending ? "Asignando en Cargolink…" : `Asignar seleccionados (${seleccion.length})`}
        </button>
      </div>
      {aviso && (
        <p
          role={aviso.ok ? "status" : "alert"}
          className={`rounded-md px-4 py-2 text-sm ${aviso.ok ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}
        >
          {aviso.mensaje}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th scope="col" className="px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos"
                  checked={todosMarcados}
                  onChange={(e) =>
                    setMarcado((m) => ({ ...m, ...Object.fromEntries(pendientes.map((f) => [f.id_booking, e.target.checked])) }))
                  }
                />
              </th>
              {["Booking", "Fecha", "Cliente", "Ruta", "Ejecutivo a asignar", "Historial"].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filas.map((f) => {
              const res = resultado[f.id_booking];
              const hecho = res?.ok === true;
              const valor = elegido[f.id_booking] ?? "";
              const cambiado = Boolean(f.propuesta_id) && valor !== f.propuesta_id;
              const opciones =
                f.propuesta_id && !usuarios.some((u) => u.id === f.propuesta_id)
                  ? [...usuarios, { id: f.propuesta_id, nombre: f.propuesta ?? f.propuesta_id }]
                  : usuarios;
              return (
                <tr key={f.id_booking} className={hecho ? "bg-green-50 dark:bg-green-950/40" : ""}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${f.no_booking}`}
                      disabled={hecho}
                      checked={Boolean(marcado[f.id_booking]) && !hecho}
                      onChange={(e) => setMarcado((m) => ({ ...m, [f.id_booking]: e.target.checked }))}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <AbrirOperacionBoton
                      idBooking={f.id_booking}
                      className="font-mono text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      {f.no_booking}
                    </AbrirOperacionBoton>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fechaCorta(f.fecha)}</td>
                  <td className="max-w-56 truncate px-3 py-2">{f.cliente ?? "—"}</td>
                  <td className="max-w-48 truncate px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {f.origen ?? "—"} → {f.destino ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {hecho ? (
                      <span className="text-sm font-semibold text-green-800 dark:text-green-300">✓ {nombreDe(valor)}</span>
                    ) : (
                      <select
                        value={valor}
                        aria-label={`Ejecutivo para ${f.no_booking}`}
                        onChange={(e) => {
                          const v = e.target.value;
                          setElegido((x) => ({ ...x, [f.id_booking]: v }));
                          if (v) setMarcado((m) => ({ ...m, [f.id_booking]: true }));
                        }}
                        className={`min-h-10 min-w-48 rounded-md border bg-white px-2 text-sm dark:bg-slate-900 ${
                          cambiado ? "border-amber-500" : "border-slate-300 dark:border-slate-600"
                        }`}
                      >
                        <option value="">— Elige —</option>
                        {opciones.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nombre}
                            {u.id === f.propuesta_id ? " (propuesta)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    {res && !res.ok && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{res.mensaje}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {f.propuesta ? (
                      <>
                        {f.propuesta} · {f.propuesta_n} {f.propuesta_n === 1 ? "booking" : "bookings"}, último {fechaCorta(f.propuesta_ultima)}
                        {f.otros > 0 && ` · +${f.otros} ejecutivo${f.otros === 1 ? "" : "s"} más`}
                      </>
                    ) : (
                      <span className="font-semibold text-red-700 dark:text-red-400">Sin historial: elige uno</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
