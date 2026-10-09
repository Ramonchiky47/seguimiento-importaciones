"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ESTADOS, fechaCorta, type EstadoHito } from "@/lib/track";
import { ETAPAS_CARGOLINK, ETAPA_POR_HITO, type AccionEtapa, type EtapaCargolink } from "@/lib/etapasCargolink";
import {
  eliminarFilaTransbordoCargolink,
  guardarEtapaCargolink,
  guardarTransbordosCargolink,
  leerTransbordosCargolink,
  refrescarOperacionDesdeCargolink,
  type FilaTransbordoForm,
} from "@/app/(app)/operaciones-maritima/actions";

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

// Datos de Cargolink que se muestran al abrir cada etapa: [etiqueta, campo
// del booking], y la etapa editable (ETAPAS_CARGOLINK) cuando aplica.
const DETALLE_ETAPA: Record<string, { campos: [string, string][]; editar?: string }> = {
  origen: {
    campos: [
      ["Fecha estimada de salida", "fecha_estimada"],
      ["Número de control (MBL / reserva)", "no_control"],
      ["Control entre agentes (HBL)", "no_agentes"],
      ["Número de viaje", "no_viaje"],
      ["Buque", "buque"],
      ["Shipper", "shipper"],
      ["Dirección de recolección", "dir_recoleccion"],
      ["Agente del cliente", "agente_cliente"],
    ],
  },
  mercancia: {
    campos: [
      ["Mercancía", "mercancia"],
      ["Contenedores", "noContenedores"],
      ["Embalaje", "tipo_embalaje"],
      ["Total de embalajes", "totalEmbalaje"],
      ["Valor de la mercancía", "valor_mercancia"],
      ["Moneda", "moneda"],
      ["Peligroso", "peligroso"],
      ["IMO / UN", "imo"],
    ],
  },
  seguro: {
    campos: [
      ["Seguro", "seguro"],
      ["Asegurar por", "segurar_por"],
      ["Valor asegurado", "valor_mercancia"],
      ["Fecha del seguro", "seguro_fecha"],
      ["Póliza", "numero_poliza_seguro"],
      ["Alcance", "seguro_alcance"],
    ],
  },
  atd: { campos: [["Fecha de zarpe (ATD)", "fecha_atd"]], editar: "atd" },
  aviso_atd: { campos: [["Fecha de zarpe", "fecha_atd"], ["Días restantes para facturar", "dias_restantes_facturacion"]] },
  eta: { campos: [["Fecha estimada de arribo", "buque_eta"]], editar: "eta" },
  alertFech: {
    campos: [["Arribo estimado (ETA)", "buque_eta"], ["Instrucciones de revalidación", "inst_revalidacion"], ["Idioma", "lang"]],
    editar: "aviso_eta",
  },
  transbordo: { campos: [], editar: "transbordo" },
  manifiesto: { campos: [["Fecha de acuse", "fecha_acuse"], ["Número de acuse", "no_acuse"]] },
  kpi: { campos: [] },
  hbl_telex: { campos: [["Fecha HBL telex", "fecha_telex_house_bl"]], editar: "hbl" },
  mbl_telex: { campos: [["Fecha MBL telex", "fecha_telex_master_bl"]], editar: "mbl" },
  facturacion: {
    campos: [
      ["Solicitud de facturación", "fecha_Solfacturacion"],
      ["Folio de factura", "folio_fact"],
      ["Factura", "folioFactura"],
      ["Fecha de factura", "fechaFactura"],
      ["Fecha de pago", "fecha_pago"],
    ],
  },
  rev: { campos: [["Fecha de revalidación", "fecha_revalidacion"], ["Pre-proforma", "fecha_pre_pro"]], editar: "rev" },
  ata: { campos: [["Fecha de arribo efectivo (ATA)", "fecha_ata"], ["Días libres de demora", "dias_demora"]], editar: "ata" },
  alertAta: {
    campos: [["Arribo efectivo (ATA)", "fecha_ata"], ["Días libres de demora", "dias_demora"], ["Instrucciones de revalidación", "inst_revalidacion"]],
    editar: "aviso_ata",
  },
  factura_extra: { campos: [["Solicitud de facturas extras", "fecha_SolFacExtras"]] },
  demoras: { campos: [["Días libres de demora", "dias_demora"]] },
  entrega_vacio: {
    campos: [["Fecha de regreso de vacío", "fecha_maniobra_entrega"], ["Solicitud de garantía", "fecha_solicitud_garantia"]],
    editar: "vacio",
  },
  entrega_demoras: { campos: [] },
  garantia: {
    campos: [
      ["Tipo de solicitud", "garantia_tipo_solicitud"],
      ["Fecha de solicitud", "garantia_fecha_solicitud"],
      ["Solicitud de devolución", "garantia_fecha_solicitud_devolucion"],
      ["Monto", "monto_pago_garantia"],
      ["Moneda", "garantia_moneda"],
      ["Regreso de garantía", "fecha_regreso_garantia"],
      ["Observaciones", "garantia_observaciones"],
    ],
  },
};

// "2026-09-28" o "2026-09-28 10:00:00" → "28 sep"; vacíos de Cargolink → null.
function valorEtapa(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s.startsWith("0000") || s === "0" || s === "0.00" || s === "0.000") return null;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? fechaCorta(s) : s;
}

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
  // Etapa de Cargolink abierta en la ventana de detalle (clave his_mov_*).
  const [etapaAbierta, setEtapaAbierta] = useState<{ clave: string; label: string; n: number } | null>(null);
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
          .order("posicion"),
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
      setEtapaAbierta(null);
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
      {idBooking !== null && op && etapaAbierta && (
        <EtapaDetalle
          etapa={etapaAbierta}
          op={op}
          idBooking={idBooking}
          puedeEditar={puedeEditar}
          onCerrar={() => setEtapaAbierta(null)}
          onGuardado={(mensaje) => {
            huboCambios.current = true;
            setEtapaAbierta(null);
            setAviso(mensaje);
            cargar(idBooking);
          }}
        />
      )}
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
                                    {etapa.filas ? (
                                      <EditorTransbordo
                                        etapa={etapa}
                                        noBooking={String(op.no_booking ?? "")}
                                        idBooking={idBooking}
                                        onGuardado={(mensaje) => {
                                          huboCambios.current = true;
                                          setEditando(null);
                                          setAviso(mensaje);
                                          cargar(idBooking);
                                        }}
                                      />
                                    ) : (
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
                                    )}
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
                                <li key={et.clave} className="flex">
                                  <button
                                    type="button"
                                    onClick={() => setEtapaAbierta({ clave: et.clave, label: et.label, n: inicio + i + 1 })}
                                    aria-label={`Ver datos de ${et.label}`}
                                    className={`flex min-h-[64px] w-full flex-col justify-between gap-1.5 rounded-lg border px-3 py-2 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-700 ${est?.tarjeta ?? TARJETA_SIN_COMENZAR}`}
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
                                  </button>
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

// Transbordo: tabla de filas como en Cargolink (arribo estimado obligatorio,
// punto, arribo efectivo, zarpe estimado y zarpe efectivo). Las filas ya
// guardadas se borran en Cargolink al momento; el resto se manda junto al
// presionar Guardar / Guardar y finalizar / No aplica.
const FILA_VACIA: FilaTransbordoForm = {
  fecha_arribo: "",
  punto: "",
  fecha_arribo_real: "",
  fecha_zarpe: "",
  fecha_zarpe_real: "",
};

function EditorTransbordo({
  etapa,
  noBooking,
  idBooking,
  onGuardado,
}: {
  etapa: EtapaCargolink;
  noBooking: string;
  idBooking: number;
  onGuardado: (mensaje: string) => void;
}) {
  const [filas, setFilas] = useState<FilaTransbordoForm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const aplicarLectura = useCallback((r: Awaited<ReturnType<typeof leerTransbordosCargolink>>) => {
    if (!r.ok) setError(r.mensaje);
    setFilas(r.filas.length > 0 ? r.filas : [{ ...FILA_VACIA }]);
  }, []);

  // Recarga después de borrar una fila (desde un evento, no un efecto).
  const leer = useCallback(() => {
    setFilas(null);
    leerTransbordosCargolink(idBooking).then(aplicarLectura);
  }, [idBooking, aplicarLectura]);

  useEffect(() => {
    let vigente = true;
    leerTransbordosCargolink(idBooking).then((r) => {
      if (vigente) aplicarLectura(r);
    });
    return () => {
      vigente = false;
    };
  }, [idBooking, aplicarLectura]);

  const cambiar = (i: number, key: keyof FilaTransbordoForm, valor: string) =>
    setFilas((fs) => (fs ?? []).map((f, j) => (j === i ? { ...f, [key]: valor } : f)));

  const quitar = (i: number) => {
    const fila = filas?.[i];
    if (!fila) return;
    if (!fila.id_booking_transbordo) {
      setFilas((fs) => (fs ?? []).filter((_, j) => j !== i));
      return;
    }
    if (!window.confirm(`Esta fila ya está guardada: se borrará en Cargolink, en el booking ${noBooking}. ¿Continuar?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await eliminarFilaTransbordoCargolink(idBooking, fila.id_booking_transbordo as string);
      if (!r.ok) setError(r.mensaje);
      leer();
    });
  };

  const ejecutar = (accion: AccionEtapa) => {
    const detalle =
      accion.resultado === "NO_APLICA"
        ? "La etapa quedará como No aplica y ya no se podrá editar."
        : accion.resultado === "FINALIZADO"
          ? "La etapa quedará finalizada y ya no se podrá editar."
          : "La etapa quedará en edición (se puede volver a cambiar).";
    const texto =
      `Este cambio se reflejará en Cargolink, en el booking ${noBooking}.\n\n` +
      `Transbordo: ${accion.label} (${(filas ?? []).length} fila(s)).\n${detalle}\nNo se notificará al cliente.\n\n¿Continuar?`;
    if (!window.confirm(texto)) return;
    setError(null);
    startTransition(async () => {
      const r = await guardarTransbordosCargolink(idBooking, accion.status, filas ?? []);
      if (r.ok) onGuardado(r.mensaje);
      else setError(r.mensaje);
    });
  };

  const columnas = etapa.filas ?? [];
  const inputClass =
    "min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Transbordo <span className="font-normal text-slate-500 dark:text-slate-400">· se guarda en Cargolink sin notificar al cliente</span>
      </p>
      {filas === null ? (
        <p className="text-sm text-slate-500">Leyendo transbordos de Cargolink…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th scope="col" className="w-10 px-2 py-2">
                  <span className="sr-only">Quitar</span>
                </th>
                {columnas.map((c) => (
                  <th key={c.key} scope="col" className="min-w-36 px-2 py-2 font-semibold">
                    {c.label}
                    {c.requerido && <span className="text-red-600"> *</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filas.map((f, i) => (
                <tr key={f.id_booking_transbordo ?? `nueva-${i}`}>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => quitar(i)}
                      disabled={pending}
                      aria-label={f.id_booking_transbordo ? "Borrar fila en Cargolink" : "Quitar fila"}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                      </svg>
                    </button>
                  </td>
                  {columnas.map((c) => (
                    <td key={c.key} className="px-2 py-2">
                      <input
                        type={c.tipo}
                        aria-label={`${c.label}, fila ${i + 1}`}
                        value={f[c.key as keyof FilaTransbordoForm] ?? ""}
                        onChange={(e) => cambiar(i, c.key as keyof FilaTransbordoForm, e.target.value)}
                        className={inputClass}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end border-t border-slate-100 p-2 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setFilas((fs) => [...(fs ?? []), { ...FILA_VACIA }])}
              className="min-h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              + Agregar fila
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {etapa.acciones.map((a) => (
          <button
            key={a.status}
            type="button"
            disabled={pending || filas === null}
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

// Ventana con los datos de una etapa de Cargolink (y su editor si aplica).
function EtapaDetalle({
  etapa,
  op,
  idBooking,
  puedeEditar,
  onCerrar,
  onGuardado,
}: {
  etapa: { clave: string; label: string; n: number };
  op: Operacion;
  idBooking: number;
  puedeEditar: boolean;
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const datos = (op.datos ?? {}) as Record<string, string>;
  const mov = datos[`his_mov_${etapa.clave}`];
  const fecha = datos[`his_fecha_${etapa.clave}`];
  const est = mov ? ESTATUS_ETAPA[mov] : undefined;
  const detalle = DETALLE_ETAPA[etapa.clave] ?? { campos: [] };
  const editable = detalle.editar ? ETAPAS_CARGOLINK[detalle.editar] : undefined;
  const puedeEditarEtapa = puedeEditar && editable && mov !== "FINALIZADO" && mov !== "NO_APLICA";
  const campos = detalle.campos
    .map(([label, key]) => [label, valorEtapa(datos[key] ?? op[key])] as const)
    .filter(([, v]) => v !== null);
  const [filasTransbordo, setFilasTransbordo] = useState<FilaTransbordoForm[] | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // Transbordo: sus filas se leen de Cargolink.
  useEffect(() => {
    if (etapa.clave !== "transbordo" || puedeEditarEtapa) return;
    let vigente = true;
    leerTransbordosCargolink(idBooking).then((r) => {
      if (vigente) setFilasTransbordo(r.filas);
    });
    return () => {
      vigente = false;
    };
  }, [etapa.clave, idBooking, puedeEditarEtapa]);

  return (
    <dialog
      ref={ref}
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="etapa-detalle-titulo"
      className="m-auto max-h-[85vh] w-[min(760px,calc(100vw-32px))] overflow-y-auto rounded-xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 dark:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Etapa {etapa.n} · {String(op.no_booking ?? "")}
          </p>
          <h3 id="etapa-detalle-titulo" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {etapa.label}
          </h3>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${est?.clase ?? "text-slate-500 ring-1 ring-slate-200 dark:ring-slate-700"}`}>
              {est?.label ?? (mov ? mov : "Sin comenzar")}
            </span>
            {fecha && <span className="text-xs text-slate-500 dark:text-slate-400">Marcada el {fechaCorta(fecha)}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Cerrar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="space-y-4 p-5">
        {campos.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {campos.map(([label, valor]) => (
              <div key={label} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="whitespace-pre-line break-words text-sm font-medium text-slate-900 dark:text-slate-100">{valor}</dd>
              </div>
            ))}
          </dl>
        ) : (
          etapa.clave !== "transbordo" && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Esta etapa no tiene datos capturados en Cargolink (solo su estatus).</p>
          )
        )}

        {etapa.clave === "transbordo" && !puedeEditarEtapa && (
          filasTransbordo === null ? (
            <p className="text-sm text-slate-500">Leyendo transbordos de Cargolink…</p>
          ) : filasTransbordo.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Sin filas de transbordo.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    {(ETAPAS_CARGOLINK.transbordo.filas ?? []).map((c) => (
                      <th key={c.key} scope="col" className="px-2 py-2 font-semibold">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filasTransbordo.map((f, i) => (
                    <tr key={f.id_booking_transbordo ?? i}>
                      {(ETAPAS_CARGOLINK.transbordo.filas ?? []).map((c) => (
                        <td key={c.key} className="px-2 py-2">
                          {valorEtapa(f[c.key as keyof FilaTransbordoForm]) ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {puedeEditarEtapa && editable && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            {editable.filas ? (
              <EditorTransbordo etapa={editable} noBooking={String(op.no_booking ?? "")} idBooking={idBooking} onGuardado={onGuardado} />
            ) : (
              <EditorEtapa etapa={editable} op={op} idBooking={idBooking} onGuardado={onGuardado} />
            )}
          </div>
        )}
        {!puedeEditarEtapa && editable && puedeEditar && (
          <p className="text-xs text-slate-500 dark:text-slate-400">Etapa {est?.label.toLowerCase() ?? "cerrada"} en Cargolink: ya no se puede editar.</p>
        )}
      </div>
    </dialog>
  );
}
