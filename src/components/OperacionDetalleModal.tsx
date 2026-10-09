"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ESTADOS, fechaCorta, type EstadoHito } from "@/lib/track";

// Ventana emergente con todos los indicadores de una operación marítima.
// Se abre desde FilaOperacion (evento "abrir-operacion" con el id_booking)
// para no navegar ni perder el scroll de la tabla.
export const EVENTO_ABRIR_OPERACION = "abrir-operacion";

// Etapas de Cargolink (Servicios marítimos) y su par his_mov_* / his_fecha_*.
const ETAPAS_CARGOLINK: { label: string; clave: string }[] = [
  { label: "Origen", clave: "origen" },
  { label: "Detalle de mercancía", clave: "mercancia" },
  { label: "Seguro de mercancía", clave: "seguro" },
  { label: "ATD", clave: "atd" },
  { label: "Aviso ATD", clave: "aviso_atd" },
  { label: "ETA", clave: "eta" },
  { label: "Aviso ETA", clave: "alertFech" },
  { label: "Transbordo", clave: "transbordo" },
  { label: "Transmisión de manifiesto", clave: "manifiesto" },
  { label: "KPIs aviso arribo", clave: "kpi" },
  { label: "House BL telex", clave: "hbl_telex" },
  { label: "Master BL telex", clave: "mbl_telex" },
  { label: "Facturación", clave: "facturacion" },
  { label: "Revalidación", clave: "rev" },
  { label: "ATA", clave: "ata" },
  { label: "Aviso ATA", clave: "alertAta" },
  { label: "Facturas extras", clave: "factura_extra" },
  { label: "KPI aviso demoras", clave: "demoras" },
  { label: "Regreso de vacío", clave: "entrega_vacio" },
  { label: "Corte demoras", clave: "entrega_demoras" },
  { label: "Garantías", clave: "garantia" },
];

const ESTATUS_ETAPA: Record<string, { label: string; clase: string }> = {
  FINALIZADO: { label: "Finalizado", clase: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  EDICION: { label: "En edición", clase: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  NO_APLICA: { label: "No aplica", clase: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

type Operacion = Record<string, unknown> & { datos?: Record<string, string> };
type Hito = {
  orden: number;
  hito: string;
  regla: string;
  fecha_plan: string | null;
  fecha_hecho: string | null;
  hecho: boolean;
  estado: EstadoHito;
  dias_atraso: number | null;
  valor_real: string | null;
};

function texto(v: unknown): string {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

export function OperacionDetalleModal() {
  const [idBooking, setIdBooking] = useState<number | null>(null);
  const [op, setOp] = useState<Operacion | null>(null);
  const [hitos, setHitos] = useState<Hito[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const cerrar = useCallback(() => {
    dialogRef.current?.close();
    setIdBooking(null);
  }, []);

  useEffect(() => {
    const abrir = (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      setIdBooking(id);
      setOp(null);
      setHitos([]);
      setError(null);
      setCargando(true);
      dialogRef.current?.showModal();
      const supabase = createClient();
      Promise.all([
        supabase.from("operaciones_maritima_vista").select("*").eq("id_booking", id).maybeSingle(),
        supabase
          .from("track_hitos")
          .select("orden, hito, regla, fecha_plan, fecha_hecho, hecho, estado, dias_atraso, valor_real")
          .eq("id_booking", id)
          .order("orden"),
      ]).then(([opRes, hitosRes]) => {
        if (opRes.error) setError(opRes.error.message);
        setOp((opRes.data as Operacion | null) ?? null);
        setHitos((hitosRes.data ?? []) as Hito[]);
        setCargando(false);
      });
    };
    window.addEventListener(EVENTO_ABRIR_OPERACION, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_OPERACION, abrir);
  }, []);

  const datos = (op?.datos ?? {}) as Record<string, string>;
  const diasDemora = op?.dias_demora as number | null | undefined;
  const regresado = Boolean(op?.regreso_vacio);
  const demoraTexto =
    diasDemora === null || diasDemora === undefined
      ? "—"
      : regresado && diasDemora === 0
        ? "Sin demora"
        : diasDemora > 0
          ? `${diasDemora} días`
          : `Faltan ${-diasDemora} días`;
  const demoraClase =
    diasDemora !== null && diasDemora !== undefined && diasDemora > 0
      ? "text-red-700 dark:text-red-400"
      : diasDemora !== null && diasDemora !== undefined && diasDemora >= -4 && !regresado
        ? "text-amber-700 dark:text-amber-400"
        : "text-slate-900 dark:text-slate-50";

  const indicador = (label: string, valor: string, clase = "text-slate-900 dark:text-slate-50") => (
    <div className="rounded-[10px] border border-slate-200 px-3 py-2.5 dark:border-slate-700">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${clase}`}>{valor}</p>
    </div>
  );
  const campo = (label: string, valor: string) => (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{valor}</dd>
    </div>
  );

  return (
    <dialog
      ref={dialogRef}
      onClose={() => setIdBooking(null)}
      onClick={(e) => {
        if (e.target === dialogRef.current) cerrar();
      }}
      aria-labelledby="operacion-detalle-titulo"
      className="m-auto max-h-[90vh] w-[min(1100px,calc(100vw-32px))] overflow-hidden rounded-xl bg-slate-50 p-0 shadow-2xl backdrop:bg-slate-900/50 dark:bg-slate-950"
    >
      {idBooking !== null && (
        <div className="flex max-h-[90vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="min-w-0">
              <h2 id="operacion-detalle-titulo" className="font-mono text-lg font-semibold text-slate-900 dark:text-slate-50">
                {op ? texto(op.no_booking) : "Cargando…"}
              </h2>
              {op && (
                <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                  {texto(op.cliente)} · {texto(op.origen)} → {texto(op.destino)} · {texto(op.modo_transportacion)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">Error al cargar: {error}</p>}
            {cargando && <p className="text-sm text-slate-500">Cargando indicadores…</p>}

            {op && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {indicador("Type", texto(op.type))}
                  {indicador("ETA", fechaCorta(op.eta as string | null))}
                  {indicador("ATA", fechaCorta(op.ata as string | null))}
                  {indicador("Días libres", op.dias_libres_demora ? `${op.dias_libres_demora} días` : "—")}
                  {indicador("Último día libre", fechaCorta(op.ultimo_dia_libre_demoras as string | null))}
                  {indicador("Días demora", demoraTexto, demoraClase)}
                </div>

                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Datos generales</h3>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                    {campo("Fecha", fechaCorta(op.fecha as string | null))}
                    {campo("Ejecutivo", texto(op.ejecutivo))}
                    {campo("MBL", texto(op.mbl))}
                    {campo("Contenedores", texto(op.contenedores))}
                    {campo("Servicio", texto(op.servicio))}
                    {campo("POD", texto(op.pod))}
                    {campo("Incoterm", texto(op.incoterm))}
                    {campo("Agente extranjero", texto(op.agente_extranjero))}
                    {campo("Consignatario", texto(op.consignatario))}
                    {campo("Mercancía", texto(op.mercancia))}
                    {campo("Seguro", op.seguro ? "Sí" : "No")}
                    {campo("Folio", texto(op.folio_int))}
                    {campo("ETD/ATD", fechaCorta(op.etd_atd as string | null))}
                    {campo("Revalidación", fechaCorta(op.revalidacion as string | null))}
                    {campo("Telex HBL / MBL", `${fechaCorta(op.telex_house_bl as string | null)} / ${fechaCorta(op.telex_master_bl as string | null)}`)}
                    {campo("Regreso de vacío", fechaCorta(op.regreso_vacio as string | null))}
                  </dl>
                </section>

                <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-50">
                    Hitos de seguimiento (Track)
                  </h3>
                  {hitos.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                      Fuera de seguimiento activo: creada hace más de 180 días o con el vacío ya devuelto.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          <tr>
                            <th scope="col" className="px-4 py-2 font-semibold">Hito</th>
                            <th scope="col" className="px-3 py-2 font-semibold">Compromiso</th>
                            <th scope="col" className="px-3 py-2 font-semibold">Real</th>
                            <th scope="col" className="px-4 py-2 font-semibold">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {hitos.map((h) => {
                            const e = ESTADOS[h.estado] ?? ESTADOS.en_tiempo;
                            return (
                              <tr key={h.orden} className={h.estado === "no_aplica" ? "opacity-50" : ""}>
                                <td className="px-4 py-2">
                                  <span className="font-semibold text-slate-900 dark:text-slate-100">{h.hito}</span>
                                  <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{h.regla}</span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fechaCorta(h.fecha_plan)}</td>
                                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                                  {h.valor_real ?? (h.hecho ? fechaCorta(h.fecha_hecho) : "—")}
                                </td>
                                <td className="whitespace-nowrap px-4 py-2">
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.pill}`}>
                                    {e.label}
                                    {h.dias_atraso ? ` · ${h.dias_atraso} d` : ""}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Etapas en Cargolink</h3>
                  <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {ETAPAS_CARGOLINK.map((et) => {
                      const mov = datos[`his_mov_${et.clave}`];
                      const fecha = datos[`his_fecha_${et.clave}`];
                      const est = mov ? ESTATUS_ETAPA[mov] : undefined;
                      return (
                        <li key={et.clave} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 text-sm dark:border-slate-800">
                          <span className="text-slate-700 dark:text-slate-300">{et.label}</span>
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            {fecha && <span className="text-xs tabular-nums text-slate-500">{fechaCorta(fecha)}</span>}
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                est?.clase ?? "bg-white text-slate-400 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
                              }`}
                            >
                              {est?.label ?? (mov ? mov : "Sin comenzar")}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

function abrir(idBooking: number) {
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_OPERACION, { detail: idBooking }));
}

export function FilaOperacion({
  idBooking,
  className,
  children,
}: {
  idBooking: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <tr
      tabIndex={0}
      aria-label="Ver indicadores de la operación"
      onClick={() => abrir(idBooking)}
      onKeyDown={(e) => {
        if (e.key === "Enter") abrir(idBooking);
      }}
      className={`cursor-pointer focus:outline-2 focus:outline-blue-700 ${className ?? ""}`}
    >
      {children}
    </tr>
  );
}
