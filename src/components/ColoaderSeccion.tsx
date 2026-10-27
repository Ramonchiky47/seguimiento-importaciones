"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fechaCorta } from "@/lib/track";
import { ESTATUS_COLOADER, etiquetaColoader, type EstatusColoader } from "@/lib/coloader";

// Estatus del coloader en bookings LCL: lo que se sabe de Cargolink, qué falta
// para poder rastrearlo con la naviera y lo que el operativo captura con lo que
// informa el coloader (historial con fecha y quién lo capturó).
export function ColoaderSeccion({
  idBooking,
  mbl,
  contenedores,
  agente,
  buque,
  viaje,
  eta,
  puedeEditar,
}: {
  idBooking: number;
  mbl: string | null;
  contenedores: string | null;
  agente: string | null;
  buque: string | null;
  viaje: string | null;
  eta: string | null;
  puedeEditar: boolean;
}) {
  const [lista, setLista] = useState<EstatusColoader[] | null>(null);
  const [form, setForm] = useState({ estatus: "en_transito", fecha: "", eta: "", nota: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leer = useCallback(() => {
    createClient()
      .from("coloader_estatus")
      .select("id, estatus, fecha, eta, nota, usuario_nombre, created_at")
      .eq("id_booking", idBooking)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setLista((data ?? []) as EstatusColoader[]));
  }, [idBooking]);
  useEffect(leer, [leer]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const { error } = await createClient().rpc("registrar_estatus_coloader", {
      p_id_booking: idBooking,
      p_estatus: form.estatus,
      p_fecha: form.fecha || null,
      p_eta: form.eta || null,
      p_nota: form.nota,
    });
    setGuardando(false);
    if (error) return setError(error.message);
    setForm({ ...form, fecha: "", eta: "", nota: "" });
    leer();
  };

  const ultimo = lista?.[0];
  const sinReferencia = !contenedores && !mbl;
  const campo = "min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-50">Estatus del coloader (LCL)</h3>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        {sinReferencia
          ? "Sin BL ni contenedor en Cargolink: no se puede consultar a la naviera."
          : `El BL ${mbl ?? ""} es del coloader y ninguna naviera lo reconoce.`}{" "}
        Pide al coloader el BL master o el contenedor para rastrearlo con la naviera; mientras, captura aquí lo que informa.
      </p>

      <dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-slate-500 dark:text-slate-400">Coloader</dt>
          <dd className="truncate font-medium">{agente ?? "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-slate-500 dark:text-slate-400">BL del coloader</dt>
          <dd className="truncate font-mono font-medium">{mbl ?? "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-slate-500 dark:text-slate-400">Buque · viaje</dt>
          <dd className="truncate font-medium">{buque ? `${buque}${viaje ? ` · ${viaje}` : ""}` : "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-slate-500 dark:text-slate-400">ETA en Cargolink</dt>
          <dd className="font-medium">{fechaCorta(eta)}</dd>
        </div>
      </dl>

      <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
        {lista === null ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : ultimo ? (
          <p className="text-sm">
            <strong>{etiquetaColoader(ultimo.estatus)}</strong>
            {ultimo.fecha ? ` el ${fechaCorta(ultimo.fecha)}` : ""}
            {ultimo.eta ? ` · ETA según coloader ${fechaCorta(ultimo.eta)}` : ""}
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Capturado por {ultimo.usuario_nombre ?? "—"},{" "}
              {new Date(ultimo.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
              {ultimo.nota ? ` · ${ultimo.nota}` : ""}
            </span>
          </p>
        ) : (
          <p className="text-sm text-amber-800 dark:text-amber-300">Sin estatus del coloader capturado.</p>
        )}
      </div>

      {puedeEditar && (
        <form onSubmit={guardar} className="grid grid-cols-2 gap-2">
          <label className="col-span-2 text-xs text-slate-600 dark:text-slate-300">
            Estatus
            <select value={form.estatus} onChange={(e) => setForm({ ...form, estatus: e.target.value })} className={campo}>
              {ESTATUS_COLOADER.map((x) => (
                <option key={x.valor} value={x.valor}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600 dark:text-slate-300">
            Fecha del estatus
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={campo} />
          </label>
          <label className="text-xs text-slate-600 dark:text-slate-300">
            ETA que informa
            <input type="date" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} className={campo} />
          </label>
          <label className="col-span-2 text-xs text-slate-600 dark:text-slate-300">
            Nota
            <input
              type="text"
              maxLength={1000}
              value={form.nota}
              onChange={(e) => setForm({ ...form, nota: e.target.value })}
              placeholder="Ej. correo del coloader, almacén, BL master pendiente"
              className={campo}
            />
          </label>
          <div className="col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={guardando}
              className="min-h-10 rounded-md bg-[#16232f] px-4 text-sm font-semibold text-white hover:bg-[#22364a] disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {guardando ? "Guardando…" : "Guardar estatus"}
            </button>
            {error && <span className="text-xs text-red-700 dark:text-red-400">{error}</span>}
          </div>
        </form>
      )}

      {lista && lista.length > 1 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">Historial ({lista.length})</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {lista.slice(1).map((x) => (
              <li key={x.id} className="text-xs text-slate-600 dark:text-slate-300">
                <strong>{etiquetaColoader(x.estatus)}</strong>
                {x.fecha ? ` ${fechaCorta(x.fecha)}` : ""}
                {x.eta ? ` · ETA ${fechaCorta(x.eta)}` : ""} · {x.usuario_nombre ?? "—"},{" "}
                {new Date(x.created_at).toLocaleDateString("es-MX")}
                {x.nota ? ` · ${x.nota}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
