"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ESTADOS, fechaCorta, type EstadoHito } from "@/lib/track";
import { ETAPAS_CARGOLINK, ETAPA_POR_HITO, type AccionEtapa, type EtapaCargolink } from "@/lib/etapasCargolink";
import { guardarEtapaCargolink, refrescarOperacionDesdeCargolink } from "@/app/(app)/operaciones-maritima/actions";

// Ventana emergente con todos los indicadores de una operación marítima.
// Se abre desde FilaOperacion (evento "abrir-operacion" con el id_booking)
// para no navegar ni perder el scroll de la tabla.
export const EVENTO_ABRIR_OPERACION = "abrir-operacion";

// Etapas de Cargolink (Servicios marítimos) en su orden, por fase, y su par
// his_mov_* / his_fecha_*.
const FASES_CARGOLINK: { fase: string; etapas: { label: string; clave: string }[] }[] = [
  {
    fase: "Origen",
    etapas: [
      { label: "Origen", clave: "origen" },
      { label: "Detalle de mercancía", clave: "mercancia" },
      { label: "Seguro de mercancía", clave: "seguro" },
    ],
  },
  {
    fase: "Tránsito",
    etapas: [
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
    ],
  },
  {
    fase: "Entrega",
    etapas: [
      { label: "KPI aviso demoras", clave: "demoras" },
      { label: "Regreso de vacío", clave: "entrega_vacio" },
      { label: "Corte demoras", clave: "entrega_demoras" },
      { label: "Garantías", clave: "garantia" },
    ],
  },
];

const ESTATUS_ETAPA: Record<string, { label: string; clase: string; tarjeta: string }> = {
  FINALIZADO: {
    label: "Finalizado",
    clase: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    tarjeta: "border-green-200 bg-green-50/40 dark:border-green-900 dark:bg-green-950/20",
  },
  EDICION: {
    label: "En edición",
    clase: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
    tarjeta: "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20",
  },
  NO_APLICA: {
    label: "No aplica",
    clase: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    tarjeta: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900",
  },
};
const TARJETA_SIN_COMENZAR = "border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900";

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

export function OperacionDetalleModal({ puedeEditar }: { puedeEditar: boolean }) {
  const [idBooking, setIdBooking] = useState<number | null>(null);
  const [op, setOp] = useState<Operacion | null>(null);
  const [hitos, setHitos] = useState<Hito[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Estado del refresco contra Cargolink al abrir la ventana.
  const [refresco, setRefresco] = useState<{ estado: "cargando" | "ok" | "error"; mensaje: string } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Booking abierto ahora; respuestas de uno anterior se ignoran.
  const idActual = useRef<number | null>(null);
  // Si se refrescó desde Cargolink o se guardó una etapa, la tabla de atrás
  // quedó desactualizada: se recarga al cerrar la ventana.
  const huboCambios = useRef(false);
  const router = useRouter();

  const cerrar = useCallback(() => {
    dialogRef.current?.close();
    setIdBooking(null);
  }, []);

  const cargar = useCallback((id: number) => {
      const supabase = createClient();
      return Promise.all([
        supabase.from("operaciones_maritima_vista").select("*").eq("id_booking", id).maybeSingle(),
        supabase
          .from("track_hitos")
          .select("orden, hito, regla, fecha_plan, fecha_hecho, hecho, estado, dias_atraso, valor_real")
          .eq("id_booking", id)
          .order("orden"),
      ]).then(([opRes, hitosRes]) => {
        if (idActual.current !== id) return;
        if (opRes.error) setError(opRes.error.message);
        setOp((opRes.data as Operacion | null) ?? null);
        setHitos((hitosRes.data ?? []) as Hito[]);
        setCargando(false);
      });
  }, []);

  useEffect(() => {
    const abrir = (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      idActual.current = id;
      setIdBooking(id);
      setOp(null);
      setHitos([]);
      setError(null);
      setEditando(null);
      setAviso(null);
      setCargando(true);
      dialogRef.current?.showModal();
      // Primero lo que ya tiene la app (inmediato); luego se relee el booking
      // de Cargolink y, si llegó bien, se vuelve a cargar con lo actualizado.
      cargar(id);
      setRefresco({ estado: "cargando", mensaje: "Actualizando desde Cargolink…" });
      refrescarOperacionDesdeCargolink(id).then((r) => {
        if (idActual.current !== id) return;
        if (r.ok) {
          huboCambios.current = true;
          setRefresco({ estado: "ok", mensaje: "Datos actualizados desde Cargolink" });
          cargar(id);
        } else {
          setRefresco({ estado: "error", mensaje: `No se pudo actualizar desde Cargolink: ${r.mensaje}` });
        }
      });
    };
    window.addEventListener(EVENTO_ABRIR_OPERACION, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_OPERACION, abrir);
  }, [cargar]);

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
      onClose={() => {
        setIdBooking(null);
        if (huboCambios.current) {
          huboCambios.current = false;
          router.refresh();
        }
      }}
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
              {refresco && (
                <p
                  role="status"
                  className={`mt-1 flex items-center gap-1.5 text-xs ${
                    refresco.estado === "error"
                      ? "text-red-700 dark:text-red-400"
                      : refresco.estado === "ok"
                        ? "text-green-700 dark:text-green-400"
                        : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {refresco.estado === "cargando" && (
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin" aria-hidden="true">
                      <path d="M21 12a9 9 0 1 1-9-9" />
                    </svg>
                  )}
                  {refresco.mensaje}
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
                  {aviso && (
                    <p role="status" className="border-b border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
                      {aviso}
                    </p>
                  )}
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
                            <th scope="col" className="px-3 py-2 font-semibold">Estado</th>
                            <th scope="col" className="px-4 py-2 font-semibold">Etapa en Cargolink</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {hitos.map((h) => {
                            const e = ESTADOS[h.estado] ?? ESTADOS.en_tiempo;
                            const etapa = ETAPAS_CARGOLINK[ETAPA_POR_HITO[h.orden]];
                            const movEtapa = etapa ? datos[etapa.mov] : undefined;
                            const editable = puedeEditar && Boolean(etapa) && movEtapa !== "FINALIZADO" && movEtapa !== "NO_APLICA";
                            const estEtapa = movEtapa ? ESTATUS_ETAPA[movEtapa] : undefined;
                            return (
                              <Fragment key={h.orden}>
                              <tr className={h.estado === "no_aplica" ? "opacity-50" : ""}>
                                <td className="px-4 py-2">
                                  <span className="font-semibold text-slate-900 dark:text-slate-100">{h.hito}</span>
                                  <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{h.regla}</span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fechaCorta(h.fecha_plan)}</td>
                                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                                  {h.valor_real ?? (h.hecho ? fechaCorta(h.fecha_hecho) : "—")}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2">
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.pill}`}>
                                    {e.label}
                                    {h.dias_atraso ? ` · ${h.dias_atraso} d` : ""}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-4 py-2">
                                  <span className="flex items-center gap-2">
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estEtapa?.clase ?? "text-slate-500 ring-1 ring-slate-200 dark:ring-slate-700"}`}>
                                      {estEtapa?.label ?? "Sin comenzar"}
                                    </span>
                                    {editable && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAviso(null);
                                          setEditando(editando === h.orden ? null : h.orden);
                                        }}
                                        aria-expanded={editando === h.orden}
                                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                                      >
                                        {editando === h.orden ? "Cerrar" : "Editar"}
                                      </button>
                                    )}
                                  </span>
                                </td>
                              </tr>
                              {editando === h.orden && etapa && op && (
                                <tr>
                                  <td colSpan={5} className="bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
                                    <EditorEtapa
                                      etapa={etapa}
                                      op={op}
                                      idBooking={idBooking}
                                      onGuardado={(mensaje) => {
                                        huboCambios.current = true;
                                        setEditando(null);
                                        setAviso(mensaje);
                                        cargar(idBooking);
                                      }}
                                    />
                                  </td>
                                </tr>
                              )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Etapas en Cargolink</h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">En el orden de Cargolink · fecha = cuándo se marcó</span>
                  </div>
                  <div className="space-y-4">
                    {FASES_CARGOLINK.map((fase, iFase) => {
                      const inicio = FASES_CARGOLINK.slice(0, iFase).reduce((n, f) => n + f.etapas.length, 0);
                      return (
                        <div key={fase.fase}>
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{fase.fase}</p>
                          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {fase.etapas.map((et, i) => {
                              const mov = datos[`his_mov_${et.clave}`];
                              const fecha = datos[`his_fecha_${et.clave}`];
                              const est = mov ? ESTATUS_ETAPA[mov] : undefined;
                              return (
                                <li
                                  key={et.clave}
                                  className={`flex min-h-[64px] flex-col justify-between gap-1.5 rounded-lg border px-3 py-2 ${est?.tarjeta ?? TARJETA_SIN_COMENZAR}`}
                                >
                                  <span className="flex items-baseline gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                                    <span className="text-xs tabular-nums text-slate-400">{inicio + i + 1}</span>
                                    {et.label}
                                  </span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                        est?.clase ?? "text-slate-500 ring-1 ring-slate-200 dark:text-slate-400 dark:ring-slate-700"
                                      }`}
                                    >
                                      {est?.label ?? (mov ? mov : "Sin comenzar")}
                                    </span>
                                    {fecha && <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{fechaCorta(fecha)}</span>}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

export function abrirOperacion(idBooking: number) {
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_OPERACION, { detail: idBooking }));
}

// Botón (p. ej. el número de booking en una lista) que abre la ventana.
export function AbrirOperacionBoton({
  idBooking,
  className,
  children,
}: {
  idBooking: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={() => abrirOperacion(idBooking)} className={className}>
      {children}
    </button>
  );
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
      onClick={() => abrirOperacion(idBooking)}
      onKeyDown={(e) => {
        if (e.key === "Enter") abrirOperacion(idBooking);
      }}
      className={`cursor-pointer focus:outline-2 focus:outline-blue-700 ${className ?? ""}`}
    >
      {children}
    </tr>
  );
}

// Formulario de una etapa: mismos campos y botones que su pantalla en
// Cargolink. Finalizar y "No aplica" piden confirmación porque en Cargolink
// ya no se pueden deshacer.
function EditorEtapa({
  etapa,
  op,
  idBooking,
  onGuardado,
}: {
  etapa: EtapaCargolink;
  op: Operacion;
  idBooking: number;
  onGuardado: (mensaje: string) => void;
}) {
  const datos = (op.datos ?? {}) as Record<string, string>;
  const inicial = Object.fromEntries(
    etapa.campos.map((c) => {
      const v = c.actual.startsWith("datos.") ? datos[c.actual.slice(6)] : op[c.actual];
      const s = v === null || v === undefined ? "" : String(v);
      return [c.key, c.tipo === "date" ? (s.startsWith("0000") ? "" : s.slice(0, 10)) : s];
    }),
  );
  const [valores, setValores] = useState<Record<string, string>>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ejecutar = (accion: AccionEtapa) => {
    // Toda acción escribe en Cargolink: siempre se confirma.
    const detalle =
      accion.resultado === "NO_APLICA"
        ? "La etapa quedará como No aplica y ya no se podrá editar."
        : accion.resultado === "FINALIZADO"
          ? "La etapa quedará finalizada y ya no se podrá editar."
          : "La etapa quedará en edición (se puede volver a cambiar).";
    const texto =
      `Este cambio se reflejará en Cargolink, en el booking ${String(op.no_booking ?? "")}.\n\n` +
      `${etapa.label}: ${accion.label}.\n${detalle}\nNo se notificará al cliente.\n\n¿Continuar?`;
    if (!window.confirm(texto)) return;
    setError(null);
    startTransition(async () => {
      const r = await guardarEtapaCargolink(idBooking, etapa.key, accion.status, valores);
      if (r.ok) onGuardado(r.mensaje);
      else setError(r.mensaje);
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {etapa.label} <span className="font-normal text-slate-500 dark:text-slate-400">· se guarda en Cargolink sin notificar al cliente</span>
      </p>
      {etapa.campos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {etapa.campos.map((c) => (
            <label key={c.key} className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
              <span>
                {c.label}
                {c.requerido && <span className="text-red-600"> *</span>}
              </span>
              <input
                type={c.tipo}
                min={c.tipo === "number" ? 0 : undefined}
                max={c.tipo === "number" ? 365 : undefined}
                value={valores[c.key] ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [c.key]: e.target.value }))}
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {etapa.acciones.map((a) => (
          <button
            key={a.status}
            type="button"
            disabled={pending}
            onClick={() => ejecutar(a)}
            className={`min-h-10 rounded-md px-4 text-sm font-semibold disabled:opacity-50 ${
              a.resultado === "FINALIZADO"
                ? "bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
                : a.resultado === "NO_APLICA"
                  ? "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                  : "border border-slate-900 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-300 dark:bg-slate-900 dark:text-slate-100"
            }`}
          >
            {a.label}
          </button>
        ))}
        {pending && <span className="self-center text-sm text-slate-500">Guardando en Cargolink…</span>}
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
