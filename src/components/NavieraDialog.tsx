"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { detalleNaviera, type DetalleNaviera, type EventoNaviera } from "@/lib/detalleNaviera";
import { fechaCorta } from "@/lib/track";

export type ResumenNaviera = {
  naviera: string;
  referencia: string | null;
  eta_naviera: string | null;
  pod: string | null;
  transbordos: { lugar: string; fecha: string | null }[] | null;
  ultimo_evento: string | null;
  ultimo_evento_fecha: string | null;
  ata_naviera: string | null;
  consultado_at: string;
};

type Nodo = { lugar: string; tipo: "Origen" | "Transbordo" | "Destino"; fecha: string | null; real: boolean };

const mismoLugar = (a: string | null, b: string | null) =>
  Boolean(a && b && (a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase())));

// Origen → transbordos → destino, con la fecha de zarpe / llegada de cada punto
// y si ya ocurrió según los eventos reales de la naviera.
function ruta(t: ResumenNaviera, d: DetalleNaviera | null, origen: string | null, destino: string | null): Nodo[] {
  const eventos = d?.eventos ?? [];
  const en = (lugar: string) => eventos.filter((e) => mismoLugar(e.lugar, lugar));
  const pol = d?.pol ?? origen ?? "Origen";
  const zarpe = en(pol).find((e) => /depart|zarpe|loaded|load|sail/i.test(e.evento));
  const nodos: Nodo[] = [{ lugar: pol, tipo: "Origen", fecha: zarpe?.fecha ?? null, real: Boolean(zarpe?.real) || eventos.some((e) => e.real && !mismoLugar(e.lugar, pol) && e.lugar !== null) }];
  for (const x of t.transbordos ?? []) {
    const ev = en(x.lugar);
    nodos.push({ lugar: x.lugar, tipo: "Transbordo", fecha: x.fecha ?? ev[0]?.fecha ?? null, real: ev.some((e) => e.real) });
  }
  const pod = (t.pod ?? d?.pod ?? destino ?? "Destino").split(",")[0];
  nodos.push({ lugar: pod, tipo: "Destino", fecha: t.ata_naviera ?? t.eta_naviera, real: Boolean(t.ata_naviera) });
  return nodos;
}

// Diagrama de la ruta: tramos recorridos en línea continua, pendientes en
// punteada, y el buque en el tramo donde va.
function DiagramaRuta({ nodos, buque }: { nodos: Nodo[]; buque: string | null }) {
  const ancho = 720;
  const x = (i: number) => 60 + (i * (ancho - 120)) / Math.max(1, nodos.length - 1);
  const ultimoReal = nodos.reduce((k, n, i) => (n.real ? i : k), -1);
  const llego = nodos[nodos.length - 1].real;
  // Posición del buque: en destino si llegó; si no, a la mitad del tramo siguiente al último punto alcanzado.
  const posBuque = llego ? x(nodos.length - 1) : ultimoReal < 0 ? x(0) : (x(ultimoReal) + x(Math.min(ultimoReal + 1, nodos.length - 1))) / 2;
  return (
    <figure className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-3 dark:border-slate-800 dark:bg-slate-950">
      <svg viewBox={`0 0 ${ancho} 150`} className="h-auto w-full text-slate-700 dark:text-slate-200" role="img" aria-label={`Ruta: ${nodos.map((n) => n.lugar).join(" → ")}`}>
        {nodos.slice(1).map((n, i) => {
          const recorrido = i < ultimoReal || (llego && i < nodos.length - 1);
          return (
            <line
              key={`l${i}`}
              x1={x(i)}
              y1={70}
              x2={x(i + 1)}
              y2={70}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={recorrido ? undefined : "2 9"}
              className={recorrido ? "stroke-blue-600 dark:stroke-blue-400" : "stroke-slate-400 dark:stroke-slate-600"}
            />
          );
        })}
        {nodos.map((n, i) => (
          <g key={`n${i}`}>
            <circle
              cx={x(i)}
              cy={70}
              r={n.tipo === "Transbordo" ? 8 : 11}
              strokeWidth={3}
              className={n.real ? "fill-blue-600 stroke-blue-600 dark:fill-blue-400 dark:stroke-blue-400" : "fill-white stroke-slate-400 dark:fill-slate-900 dark:stroke-slate-500"}
            />
            <text x={x(i)} y={30} textAnchor="middle" className="fill-current text-[13px] font-bold">
              {n.lugar.length > 18 ? `${n.lugar.slice(0, 17)}…` : n.lugar}
            </text>
            <text x={x(i)} y={46} textAnchor="middle" className="fill-slate-500 text-[11px] dark:fill-slate-400">
              {n.tipo}
            </text>
            <text x={x(i)} y={104} textAnchor="middle" className="fill-current text-[12px] font-semibold">
              {n.fecha ? fechaCorta(n.fecha) : "—"}
            </text>
            <text x={x(i)} y={120} textAnchor="middle" className={`text-[11px] ${n.real ? "fill-green-700 dark:fill-green-400" : "fill-amber-700 dark:fill-amber-400"}`}>
              {n.tipo === "Origen" ? (n.real ? "Zarpó" : "Por zarpar") : n.tipo === "Destino" ? (n.real ? "Arribó (ATA)" : "ETA") : n.real ? "Pasó" : "Estimado"}
            </text>
          </g>
        ))}
        {/* Buque */}
        <g transform={`translate(${posBuque - 14}, ${llego ? 128 : 52})`} className="fill-blue-700 dark:fill-blue-300">
          <path d="M2 10h24l-4 7H6z" />
          <rect x="9" y="3" width="9" height="6" rx="1" />
        </g>
      </svg>
      {buque && <figcaption className="px-2 text-center text-xs text-slate-500 dark:text-slate-400">Buque: {buque}</figcaption>}
    </figure>
  );
}

export function NavieraDialog({
  idBooking,
  noBooking,
  nombre,
  tracking,
  eta,
  ata,
  origen,
  destino,
  liga,
  onCerrar,
}: {
  idBooking: number;
  noBooking: string;
  nombre: string;
  tracking: ResumenNaviera;
  eta: string | null;
  ata: string | null;
  origen: string | null;
  destino: string | null;
  liga: string | null;
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [detalle, setDetalle] = useState<DetalleNaviera | null | undefined>(undefined);

  useEffect(() => {
    ref.current?.showModal();
    createClient()
      .from("tracking_naviera")
      .select("respuesta")
      .eq("id_booking", idBooking)
      .maybeSingle()
      .then(({ data }) => setDetalle(detalleNaviera(tracking.naviera, data?.respuesta)));
  }, [idBooking, tracking.naviera]);

  const nodos = ruta(tracking, detalle ?? null, origen, destino);
  const eventos: EventoNaviera[] = [...(detalle?.eventos ?? [])].sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999"));
  const dif = (a: string | null, b: string | null) => (a && b ? Math.round((Date.parse(a) - Date.parse(b.slice(0, 10))) / 86400000) : null);
  const difEta = dif(tracking.eta_naviera, eta);
  const dato = (label: string, valor: string, nota?: React.ReactNode) => (
    <div className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="truncate text-base font-extrabold text-slate-900 dark:text-slate-50">{valor}</p>
      {nota}
    </div>
  );

  return (
    <dialog
      ref={ref}
      onClose={(e) => {
        if (e.target === ref.current) onCerrar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="naviera-titulo"
      className="m-auto max-h-[90vh] w-[min(960px,calc(100vw-32px))] overflow-hidden rounded-xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 dark:bg-slate-900"
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {noBooking}
              {tracking.referencia ? ` · ${tracking.referencia}` : ""} · consultado el{" "}
              {new Date(tracking.consultado_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
            </p>
            <h3 id="naviera-titulo" className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Información de la naviera · {nombre}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {liga && (
              <a
                href={liga}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm font-medium text-blue-700 hover:bg-slate-50 dark:border-slate-600 dark:text-blue-400 dark:hover:bg-slate-800"
              >
                Ver en el sitio <span aria-hidden="true">↗</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Cerrar"
              className="flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <DiagramaRuta nodos={nodos} buque={detalle?.buque ?? null} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {dato(
              `ETA ${nombre}`,
              fechaCorta(tracking.eta_naviera),
              eta ? (
                <p className={`text-xs font-semibold ${difEta === 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                  {difEta === 0 ? "✓ Igual que Cargolink" : `Cargolink ${fechaCorta(eta)} (${difEta && difEta > 0 ? "+" : ""}${difEta} d)`}
                </p>
              ) : (
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Cargolink sin ETA</p>
              ),
            )}
            {dato(
              `ATA ${nombre}`,
              tracking.ata_naviera ? fechaCorta(tracking.ata_naviera) : "Aún no arriba",
              tracking.ata_naviera && ata && dif(tracking.ata_naviera, ata) !== 0 ? (
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">Cargolink {fechaCorta(ata)}</p>
              ) : null,
            )}
            {dato("Puerto de descarga", tracking.pod ?? detalle?.pod ?? "—")}
            {dato("Transbordos", tracking.transbordos?.length ? String(tracking.transbordos.length) : "Directo")}
          </div>

          <section aria-labelledby="eventos-titulo" className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <h4 id="eventos-titulo" className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50">
              Eventos según {nombre}
            </h4>
            {detalle === undefined && <p className="px-4 py-4 text-sm text-slate-500">Cargando…</p>}
            {detalle !== undefined && eventos.length === 0 && (
              <p className="px-4 py-4 text-sm text-slate-500">
                {tracking.ultimo_evento
                  ? `Último evento: ${tracking.ultimo_evento}${tracking.ultimo_evento_fecha ? ` · ${fechaCorta(tracking.ultimo_evento_fecha)}` : ""}. El detalle de eventos se guarda en la siguiente consulta.`
                  : "Sin eventos registrados."}
              </p>
            )}
            {eventos.length > 0 && (
              <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                {eventos.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
                    <span className="w-16 shrink-0 tabular-nums font-semibold text-slate-900 dark:text-slate-100">{e.fecha ? fechaCorta(e.fecha) : "—"}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        e.real ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      }`}
                    >
                      {e.real ? "Real" : "Estimado"}
                    </span>
                    <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-200">{e.evento}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {[e.lugar, e.buque].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Información de la naviera, solo de referencia: no se escribe sola en Cargolink. Para usarla, confírmala en Track › Propuestas o en la etapa.
          </p>
        </div>
      </div>
    </dialog>
  );
}
