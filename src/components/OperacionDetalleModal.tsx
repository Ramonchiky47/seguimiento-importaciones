"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ESTADOS, explicarPropuestaDias, fechaCorta, type EstadoHito } from "@/lib/track";
import { NavieraDialog } from "@/components/NavieraDialog";
import { VerCorreo, type Evidencia } from "@/components/VerCorreo";
import { ResumenComercialDialog } from "@/components/ResumenComercialDialog";
import { NAVIERAS_CON_AGENTE, coincideRazonSocial, ligaRastreo, navieraRastreo, nombreNaviera } from "@/lib/navieras";
import type { ResumenNaviera } from "@/lib/detalleNaviera";
import {
  ETAPAS_CARGOLINK,
  ETAPA_POR_HITO,
  instruccionesRevalidacionPorDefecto,
  repararAcentos,
  separarInstrucciones,
  unirInstrucciones,
  type AccionEtapa,
  type RenglonInstruccion,
  type EtapaCargolink,
} from "@/lib/etapasCargolink";
import {
  eliminarFilaTransbordoCargolink,
  catalogosCargolink,
  documentosCargolink,
  subirDocumentoCargolink,
  type DocumentoBooking,
  guardarEtapaCargolink,
  guardarTransbordosCargolink,
  leerTransbordosCargolink,
  refrescarOperacionDesdeCargolink,
  type FilaTransbordoForm,
  propuestaInstruccionesRevalidacion,
  marcarResumenComercialRevisado,
  resumenComercialCargolink,
  type ResumenComercial,
  propuestaDiasLibres,
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
    editar: "origen",
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
      ["Asegurado por (1)", "segurar_por"],
      ["Moneda (1)", "moneda"],
      ["Valor (1)", "valor_mercancia"],
      ["Fecha de aseguramiento (1)", "seguro_fecha"],
      ["Asegurado por (2)", "segurar_por2"],
      ["Moneda (2)", "moneda2"],
      ["Valor (2)", "valor_mercancia2"],
      ["Fecha de aseguramiento (2)", "seguro_fecha2"],
      ["Incoterm", "intercom"],
      ["Alcance", "seguro_alcance"],
      ["Póliza", "numero_poliza_seguro"],
    ],
    editar: "seguro",
  },
  atd: { campos: [["Fecha de zarpe (ATD)", "fecha_atd"]], editar: "atd" },
  aviso_atd: {
    campos: [["Fecha de zarpe", "fecha_atd"], ["Días restantes para facturar", "dias_restantes_facturacion"]],
    editar: "aviso_atd",
  },
  eta: { campos: [["Fecha estimada de arribo", "buque_eta"]], editar: "eta" },
  alertFech: {
    campos: [["Arribo estimado (ETA)", "buque_eta"], ["Instrucciones de revalidación", "inst_revalidacion"], ["Idioma", "lang"]],
    editar: "aviso_eta",
  },
  transbordo: { campos: [], editar: "transbordo" },
  manifiesto: { campos: [["Fecha de acuse", "fecha_acuse"], ["Número de acuse", "no_acuse"]], editar: "manifiesto" },
  kpi: { campos: [], editar: "kpi" },
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
  rev: { campos: [["Fecha de revalidación", "fecha_revalidacion"]], editar: "rev" },
  ata: { campos: [["Fecha de arribo efectivo (ATA)", "fecha_ata"], ["Días libres de demora", "dias_demora"]], editar: "ata" },
  alertAta: {
    campos: [["Arribo efectivo (ATA)", "fecha_ata"], ["Días libres de demora", "dias_demora"], ["Instrucciones de revalidación", "inst_revalidacion"]],
    editar: "aviso_ata",
  },
  factura_extra: { campos: [["Solicitud de facturas extras", "fecha_SolFacExtras"]] },
  demoras: { campos: [["Días libres de demora", "dias_demora"]], editar: "demoras" },
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
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? fechaCorta(s) : repararAcentos(s);
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

export type Operacion = Record<string, unknown> & { datos?: Record<string, string> };
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
  // Último correo del booking que leyó el agente de correos (Track › Info correos).
  const [correo, setCorreo] = useState<CorreoBooking | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  // Etapa de Cargolink abierta en la ventana de detalle (clave his_mov_*).
  const [etapaAbierta, setEtapaAbierta] = useState<{ clave: string; label: string; n: number } | null>(null);
  const [pdfNotArribo, setPdfNotArribo] = useState(false);
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
        supabase
          .from("info_correos")
          .select("fecha_correo, datos")
          .eq("id_booking", id)
          .order("fecha_correo", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]).then(([opRes, hitosRes, correoRes]) => {
        if (idActual.current !== id) return;
        if (opRes.error) setError(opRes.error.message);
        setOp((opRes.data as Operacion | null) ?? null);
        setHitos((hitosRes.data ?? []) as Hito[]);
        setCorreo((correoRes.data as CorreoBooking | null) ?? null);
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
      setCorreo(null);
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
      onClose={(e) => {
        // React propaga el "close" de la ventana de una etapa (diálogo
        // anidado): solo se cierra el booking si se cerró este diálogo.
        if (e.target !== dialogRef.current) return;
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
      {idBooking !== null && op && pdfNotArribo && (
        <NotArriboDialog idBooking={idBooking} noBooking={texto(op.no_booking)} onCerrar={() => setPdfNotArribo(false)} />
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
            <div className="flex shrink-0 items-center gap-2">
            {/* Mismo booking en la vista interactiva (recorrido por fases). */}
            {idBooking !== null && (
              <button
                type="button"
                onClick={() => {
                  const id = idBooking;
                  cerrar();
                  router.push(`/track/interactivo/${id}`);
                }}
                className="flex min-h-10 items-center gap-1.5 rounded-md bg-[#16232f] px-3 text-sm font-semibold text-white hover:bg-[#22364a] dark:bg-slate-100 dark:text-slate-900"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 12h3l2-5 4 10 2-5h5" />
                </svg>
                Cambio interactivo
              </button>
            )}
            {op && correo?.datos?.evidencia && (
              <BotonCorreo correo={correo} op={op} />
            )}
            {op && (
              <details className="relative">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
                  Acciones
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.closest("details")?.removeAttribute("open");
                      setPdfNotArribo(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                      <path d="M14 3v5h5" />
                    </svg>
                    PDF NOT arribo
                  </button>
                </div>
              </details>
            )}
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

                <NavieraSeccion
                  key={`naviera-${idBooking}`}
                  idBooking={idBooking}
                  carrier={datos.buque_carrier ?? null}
                  mbl={(op.mbl as string | null) ?? null}
                  contenedores={(op.contenedores as string | null) ?? null}
                  eta={(op.eta as string | null) ?? null}
                  ata={(op.ata as string | null) ?? null}
                  noBooking={texto(op.no_booking)}
                  origen={(op.origen as string | null) ?? null}
                  destino={(op.destino as string | null) ?? null}
                />

                <ResumenComercialSeccion key={idBooking} idBooking={idBooking} datos={datos} noBooking={texto(op.no_booking)} />

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
                            // Finalizada: se puede corregir si Cargolink permite liberarla.
                            const editable =
                              puedeEditar && Boolean(etapa) && movEtapa !== "NO_APLICA" && (movEtapa !== "FINALIZADO" || Boolean(etapa?.tablaLiberar));
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

type CorreoBooking = {
  fecha_correo: string | null;
  datos: { evidencia?: Evidencia; atd_iso?: string | null; eta_iso?: string | null } | null;
};

// Correo con instrucciones del booking junto a "Cambio interactivo". Se actualiza solo:
// el agente de correos (9, 15 y 22 h) reescribe info_correos al encontrar algo nuevo.
// Si el zarpe o la ETA del correo no coinciden con Cargolink, se marca en ámbar.
function BotonCorreo({ correo, op }: { correo: CorreoBooking; op: Operacion }) {
  const d = correo.datos ?? {};
  const distinta = (deCorreo?: string | null, deCargolink?: unknown) =>
    Boolean(deCorreo && String(deCargolink ?? "").slice(0, 10) !== deCorreo.slice(0, 10));
  const cambios = [
    distinta(d.atd_iso, op.etd_atd) && `zarpe ${fechaCorta(d.atd_iso as string)}`,
    distinta(d.eta_iso, op.eta) && `ETA ${fechaCorta(d.eta_iso as string)}`,
  ].filter(Boolean) as string[];
  const fecha = correo.fecha_correo
    ? new Date(correo.fecha_correo).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" })
    : "";
  return (
    <VerCorreo
      evidencia={d.evidencia as Evidencia}
      booking={String(op.no_booking ?? "")}
      className={`flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold ${
        cambios.length
          ? "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      }`}
      boton={
        <>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          Correo {fecha}
          {cambios.length > 0 && <span className="text-xs font-normal">· trae {cambios.join(" y ")}</span>}
        </>
      }
    />
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
export function EditorEtapa({
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
      if (c.tipo === "date") return [c.key, s.startsWith("0000") ? "" : s.slice(0, 10)];
      // Cargolink guarda "0" / "0.00" cuando no hay dato.
      if ((c.tipo === "decimal" || c.tipo === "select") && /^0(\.0+)?$/.test(s)) return [c.key, ""];
      return [c.key, s];
    }),
  );
  // Instrucciones de revalidación: sin texto guardado, el que propone Cargolink.
  const diasDemora = (op.dias_libres_demora as number | null) ?? datos.dias_demora;
  const textoPorDefecto = (lang: string) => instruccionesRevalidacionPorDefecto(lang || "ESP", diasDemora);
  for (const c of etapa.campos) {
    if (c.propuesta && /^0?$/.test(inicial[c.key] ?? "")) inicial[c.key] = "";
    if (c.porDefecto === "instrucciones_revalidacion") {
      inicial[c.key] = inicial[c.key] ? repararAcentos(inicial[c.key]) : textoPorDefecto(inicial.lang ?? "ESP");
    }
  }
  // Algún dato marcado como necesario sin capturar en Cargolink: título en rojo.
  const faltaCaptura = etapa.campos.some((c) => {
    if (!c.marcarSiFalta) return false;
    const v = c.actual.startsWith("datos.") ? datos[c.actual.slice(6)] : op[c.actual];
    return v === null || v === undefined || /^\s*0?\s*$/.test(String(v));
  });
  const [valores, setValores] = useState<Record<string, string>>(inicial);
  // Propuestas por historial para campos vacíos (días libres por naviera).
  const camposPropuesta = etapa.campos.filter((c) => c.propuesta && !inicial[c.key]);
  const [propuestas, setPropuestas] = useState<Record<string, { valor: string; explicacion: string }>>({});
  useEffect(() => {
    if (camposPropuesta.length === 0) return;
    let vigente = true;
    propuestaDiasLibres([idBooking]).then((r) => {
      const p = r[String(idBooking)];
      if (!vigente || !p) return;
      const nuevas = Object.fromEntries(camposPropuesta.map((c) => [c.key, { valor: String(p.dias), explicacion: explicarPropuestaDias(p) }]));
      setPropuestas(nuevas);
      setValores((v) => ({ ...v, ...Object.fromEntries(camposPropuesta.filter((c) => !v[c.key]).map((c) => [c.key, String(p.dias)])) }));
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idBooking]);
  // Listas que vienen de Cargolink (aseguradoras, incoterms).
  const usaCatalogos = etapa.campos.some((c) => c.catalogo);
  const [catalogos, setCatalogos] = useState<Record<string, { valor: string; label: string }[]>>({});
  useEffect(() => {
    if (!usaCatalogos) return;
    let vigente = true;
    catalogosCargolink().then((r) => {
      if (vigente) setCatalogos(r);
    });
    return () => {
      vigente = false;
    };
  }, [usaCatalogos]);
  const opcionesDe = (c: EtapaCargolink["campos"][number]) => {
    const base = c.opciones ?? (c.catalogo ? (catalogos[c.catalogo] ?? []) : []);
    const actual = valores[c.key];
    // Conserva el valor actual aunque no venga en la lista.
    return actual && !base.some((o) => o.valor === actual) ? [...base, { valor: actual, label: actual }] : base;
  };
  const grupos = Array.from(new Set(etapa.campos.map((c) => c.grupo ?? "")));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Aviso de ATA: ver / imprimir el PDF NOT arribo desde el formulario.
  const [verPdf, setVerPdf] = useState(false);
  // Instrucciones propuestas por historial (cliente + naviera).
  const campoInstrucciones = etapa.campos.find((c) => c.porDefecto === "instrucciones_revalidacion");
  const [propuesta, setPropuesta] = useState<Awaited<ReturnType<typeof propuestaInstruccionesRevalidacion>>>(null);
  const textoPropuesta = (p: NonNullable<typeof propuesta>, lang: string) =>
    unirInstrucciones([
      ...p.renglones.map((r) => ({ etiqueta: repararAcentos(r.etiqueta), valor: repararAcentos(r.valor) })),
      lang === "ING"
        ? { etiqueta: "Days free of delays", valor: `${diasDemora ?? 0} days.` }
        : { etiqueta: "Días libres de demoras", valor: `${diasDemora ?? 0} días.` },
    ]);
  useEffect(() => {
    if (!campoInstrucciones) return;
    let vigente = true;
    propuestaInstruccionesRevalidacion(idBooking).then((p) => {
      if (!vigente || !p || p.renglones.length === 0) return;
      setPropuesta(p);
      // Sin instrucciones guardadas en Cargolink: se precarga la propuesta en
      // lugar del texto genérico (si no se ha tocado).
      if (!datos[campoInstrucciones.actual.slice(6)]) {
        setValores((v) =>
          v[campoInstrucciones.key] === textoPorDefecto(v.lang ?? "")
            ? { ...v, [campoInstrucciones.key]: textoPropuesta(p, v.lang ?? "") }
            : v,
        );
      }
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idBooking]);
  const descripcionPropuesta = propuesta
    ? `Según ${propuesta.muestra === 1 ? "el último booking" : `los últimos ${propuesta.muestra} bookings`} ${
        propuesta.nivel === 1 ? "de este cliente con la misma naviera" : propuesta.nivel === 2 ? "de este cliente" : "con esta naviera"
      }${propuesta.ultimo ? ` (último: ${propuesta.ultimo})` : ""}.`
    : null;

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
      `${etapa.label}: ${accion.label}.\n${detalle}\nNo se notificará al cliente.` +
      // Avisa si se va a guardar un valor propuesto sin cambiarlo.
      etapa.campos
        .filter((c) => propuestas[c.key] && valores[c.key] === propuestas[c.key].valor)
        .map((c) => `\n\nIncluye una PROPUESTA: ${c.label} = ${valores[c.key]}. Confírmala o cámbiala antes de continuar.`)
        .join("") +
      `\n\n¿Continuar?`;
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
      <p className={`text-sm font-semibold ${faltaCaptura ? "text-red-700 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}>
        {etapa.label}{" "}
        <span className={`font-normal ${faltaCaptura ? "text-red-700 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
          · se guarda en Cargolink sin notificar al cliente
        </span>
        {datos[etapa.mov] === "FINALIZADO" && (
          <span className="mt-0.5 block text-xs font-semibold text-amber-800 dark:text-amber-300">
            Etapa finalizada en Cargolink: al guardar se libera (Liberar etapas) y se corrige.
          </span>
        )}
        {faltaCaptura && (
          <span className="mt-0.5 block text-xs font-semibold">
            Falta capturar en Cargolink:{" "}
            {etapa.campos
              .filter((c) => {
                if (!c.marcarSiFalta) return false;
                const v = c.actual.startsWith("datos.") ? datos[c.actual.slice(6)] : op[c.actual];
                return v === null || v === undefined || /^\s*0?\s*$/.test(String(v));
              })
              .map((c) => c.label.toLowerCase())
              .join(" y ")}
          </span>
        )}
      </p>
      {grupos.map((g) => (
        <fieldset key={g || "campos"} className="space-y-2">
          {g && <legend className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{g}</legend>}
          <div className="flex flex-wrap gap-3">
            {etapa.campos
              .filter((c) => (c.grupo ?? "") === g)
              .map((c) => {
                const clase =
                  "min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
                const cambiar = (valor: string) =>
                  setValores((v) => {
                    const nuevo = { ...v, [c.key]: valor };
                    // Al cambiar el idioma, si las instrucciones siguen siendo el
                    // texto por defecto, se cambian al del otro idioma.
                    if (c.key === "lang") {
                      for (const t of etapa.campos.filter((x) => x.porDefecto === "instrucciones_revalidacion")) {
                        if (v[t.key] === textoPorDefecto(v.lang ?? "")) nuevo[t.key] = textoPorDefecto(valor);
                      }
                    }
                    return nuevo;
                  });
                if (c.porDefecto === "instrucciones_revalidacion") {
                  return (
                    <CampoInstrucciones
                      key={c.key}
                      label={c.label}
                      valor={valores[c.key] ?? ""}
                      porDefecto={textoPorDefecto(valores.lang ?? "")}
                      propuesta={propuesta ? { texto: textoPropuesta(propuesta, valores.lang ?? ""), descripcion: descripcionPropuesta ?? "" } : null}
                      guardado={repararAcentos(String(datos[c.actual.slice(6)] ?? ""))}
                      onCambiar={cambiar}
                    />
                  );
                }
                if (c.tipo === "textarea") {
                  return (
                    <CampoTextoLargo
                      key={c.key}
                      label={c.label}
                      valor={valores[c.key] ?? ""}
                      porDefecto={c.porDefecto ? textoPorDefecto(valores.lang ?? "") : null}
                      onCambiar={cambiar}
                    />
                  );
                }
                const botonPdf =
                  etapa.key === "aviso_ata" && c.key === "id_banco_usd" ? (
                    <div className="flex flex-col justify-end">
                      <button
                        type="button"
                        onClick={() => setVerPdf(true)}
                        title="Muestra el PDF con lo guardado en Cargolink; guarda primero si cambiaste algo."
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                          <path d="M14 3v5h5" />
                        </svg>
                        PDF NOT arribo
                      </button>
                    </div>
                  ) : null;
                return (
                  <Fragment key={c.key}>
                  <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                    <span>
                      {c.label}
                      {c.requerido && <span className="text-red-600"> *</span>}
                    </span>
                    {c.tipo === "select" ? (
                      <select value={valores[c.key] ?? ""} onChange={(e) => cambiar(e.target.value)} className={`${clase} min-w-40`}>
                        <option value="">—</option>
                        {opcionesDe(c).map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        {propuestas[c.key] && valores[c.key] === propuestas[c.key].valor && (
                          <span className="self-start rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            Propuesta · aún no guardada
                          </span>
                        )}
                        <input
                          type={c.tipo === "decimal" ? "text" : c.tipo}
                          inputMode={c.tipo === "decimal" ? "decimal" : undefined}
                          min={c.tipo === "number" ? 0 : undefined}
                          max={c.tipo === "number" ? 365 : undefined}
                          value={valores[c.key] ?? ""}
                          onChange={(e) => cambiar(e.target.value)}
                          className={`${clase} ${c.tipo === "text" ? "min-w-72" : ""} ${
                            propuestas[c.key] && valores[c.key] === propuestas[c.key].valor
                              ? "border-2 border-dashed border-blue-500! bg-blue-50 font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200"
                              : ""
                          }`}
                        />
                        {propuestas[c.key] && (
                          <span className="max-w-64 text-[11px] text-blue-800 dark:text-blue-300">
                            {valores[c.key] === propuestas[c.key].valor ? "" : `Propuesta: ${propuestas[c.key].valor}. `}
                            {propuestas[c.key].explicacion} Revisa y presiona Guardar.
                          </span>
                        )}
                      </>
                    )}
                  </label>
                  {botonPdf}
                  </Fragment>
                );
              })}
          </div>
        </fieldset>
      ))}
      {verPdf && (
        <NotArriboDialog
          idBooking={idBooking}
          noBooking={String(op.no_booking ?? "")}
          verDirecto={valores.lang === "ING" ? "ING" : "ESP"}
          onCerrar={() => setVerPdf(false)}
        />
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

export function EditorTransbordo({
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
  // Finalizada: se puede corregir si Cargolink permite liberarla (se libera al guardar).
  const puedeEditarEtapa = puedeEditar && editable && mov !== "NO_APLICA" && (mov !== "FINALIZADO" || Boolean(editable.tablaLiberar));
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
      onClose={(e) => {
        if (e.target === ref.current) onCerrar();
      }}
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

        {etapa.clave === "seguro" && (
          <DocumentosCargolink idBooking={idBooking} noBooking={String(op.no_booking ?? "")} puedeSubir={puedeEditar} />
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

// Documentos del booking en Cargolink: cada tipo configurado (MANIFIESTO,
// ACUSE, …) con su archivo; se sube a un tipo existente.
export function DocumentosCargolink({
  idBooking,
  noBooking,
  puedeSubir,
}: {
  idBooking: number;
  noBooking: string;
  puedeSubir: boolean;
}) {
  const [docs, setDocs] = useState<DocumentoBooking[] | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const recargar = useCallback(() => {
    documentosCargolink(idBooking).then((r) => {
      setDocs(r.documentos);
      if (!r.ok) setMensaje({ ok: false, texto: r.mensaje });
    });
  }, [idBooking]);

  useEffect(() => {
    let vigente = true;
    documentosCargolink(idBooking).then((r) => {
      if (!vigente) return;
      setDocs(r.documentos);
      if (!r.ok) setMensaje({ ok: false, texto: r.mensaje });
    });
    return () => {
      vigente = false;
    };
  }, [idBooking]);

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Documentos en Cargolink</h4>
      {docs === null ? (
        <p className="text-sm text-slate-500">Leyendo documentos de Cargolink…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">El booking no tiene tipos de documento configurados en Cargolink.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {docs.map((d) => (
            <li key={`${d.idConfig}-${d.idDoc ?? "nuevo"}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-medium text-slate-800 dark:text-slate-200">{d.nombre}</span>
              {d.url ? (
                <span className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  {d.usuario ?? ""} {d.fechaUpload ? `· ${fechaCorta(d.fechaUpload)}` : ""}
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 hover:underline dark:text-blue-400">
                    Ver archivo
                  </a>
                </span>
              ) : (
                <span className="text-xs text-slate-400">Sin archivo</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeSubir && docs && docs.length > 0 && (
        <form
          ref={formRef}
          action={(fd) => {
            const tipo = docs.find((d) => d.idConfig === fd.get("idConfig"));
            const archivo = fd.get("archivo");
            const nombreArchivo = archivo instanceof File ? archivo.name : "";
            const reemplaza = tipo?.url ? ` Reemplazará el archivo que ya tiene ${tipo.nombre}.` : "";
            if (
              !window.confirm(
                `Este archivo se subirá a Cargolink, en el booking ${noBooking}, como ${tipo?.nombre ?? "documento"}: ${nombreArchivo}.${reemplaza}\n\n¿Continuar?`,
              )
            ) {
              return;
            }
            setMensaje(null);
            startTransition(async () => {
              const r = await subirDocumentoCargolink(idBooking, fd);
              setMensaje({ ok: r.ok, texto: r.mensaje });
              if (r.ok) formRef.current?.reset();
              recargar();
            });
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
            Tipo de documento
            <select
              name="idConfig"
              required
              defaultValue=""
              className="min-h-10 min-w-48 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="" disabled>
                Elige…
              </option>
              {docs.map((d) => (
                <option key={`${d.idConfig}-${d.idDoc ?? "nuevo"}`} value={d.idConfig}>
                  {d.nombre}
                  {d.url ? " (reemplazar)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
            Archivo (máx. 4 MB)
            <input
              name="archivo"
              type="file"
              required
              className="min-h-10 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {pending ? "Subiendo…" : "Subir a Cargolink"}
          </button>
        </form>
      )}
      {mensaje && (
        <p
          role={mensaje.ok ? "status" : "alert"}
          className={`text-sm ${mensaje.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
        >
          {mensaje.texto}
        </p>
      )}
    </section>
  );
}

// Acciones › PDF NOT arribo: elige idioma, ve el PDF de Cargolink y lo
// descarga (ruta /api/cargolink/notificacion-arribo).
export function NotArriboDialog({
  idBooking,
  noBooking,
  onCerrar,
  verDirecto,
}: {
  idBooking: number;
  noBooking: string;
  onCerrar: () => void;
  // Desde Aviso de ATA: abre el PDF directo en el idioma del formulario.
  verDirecto?: "ESP" | "ING";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [lang, setLang] = useState<"ESP" | "ING">(verDirecto ?? "ESP");
  const [viendo, setViendo] = useState<"ESP" | "ING" | null>(verDirecto ?? null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const url = (l: "ESP" | "ING", descargar = false) =>
    `/api/cargolink/notificacion-arribo?id=${idBooking}&lang=${l}${descargar ? "&descargar=1" : ""}`;

  return (
    <dialog
      ref={ref}
      onClose={(e) => {
        if (e.target === ref.current) onCerrar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="not-arribo-titulo"
      className={`m-auto flex flex-col rounded-xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 dark:bg-slate-900 ${
        viendo ? "h-[90vh] w-[min(1000px,calc(100vw-32px))]" : "w-[min(420px,calc(100vw-32px))]"
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">{noBooking}</p>
          <h3 id="not-arribo-titulo" className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Notificación de arribo{viendo ? ` · ${viendo === "ESP" ? "Español" : "Inglés"}` : ""}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {viendo && (
            <>
              <button
                type="button"
                onClick={() => setViendo(null)}
                className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cambiar idioma
              </button>
              <a
                href={url(viendo, true)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
                </svg>
                Descargar
              </a>
            </>
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

      {viendo ? (
        <iframe
          key={viendo}
          src={url(viendo)}
          title={`Notificación de arribo ${noBooking}`}
          className="min-h-0 w-full flex-1 rounded-b-xl bg-slate-100"
        />
      ) : (
        <div className="space-y-4 p-5">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">Idioma del PDF</legend>
            {(
              [
                ["ESP", "Español"],
                ["ING", "Inglés"],
              ] as const
            ).map(([valor, label]) => (
              <label
                key={valor}
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 text-sm has-checked:border-blue-700 has-checked:bg-blue-50 dark:border-slate-700 dark:has-checked:bg-blue-950"
              >
                <input type="radio" name="lang-not-arribo" value={valor} checked={lang === valor} onChange={() => setLang(valor)} />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setViendo(lang)}
              className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
            >
              Ver PDF
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

// Texto largo (p. ej. instrucciones de revalidación): se ve en el formulario
// y se captura en una ventana emergente; se guarda en Cargolink con los
// botones de la etapa.
function CampoTextoLargo({
  label,
  valor,
  porDefecto,
  onCambiar,
}: {
  label: string;
  valor: string;
  porDefecto: string | null;
  onCambiar: (valor: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [borrador, setBorrador] = useState(valor);
  const abrir = () => {
    setBorrador(valor);
    ref.current?.showModal();
  };
  return (
    <div className="flex w-full flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      <div className="flex flex-wrap items-start gap-2">
        <p className="min-h-10 min-w-0 flex-1 whitespace-pre-line rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          {valor || "—"}
        </p>
        <button
          type="button"
          onClick={abrir}
          className="min-h-10 shrink-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Editar
        </button>
      </div>
      <dialog
        ref={ref}
        onClick={(e) => {
          e.stopPropagation();
          if (e.target === ref.current) ref.current?.close();
        }}
        onClose={(e) => e.stopPropagation()}
        aria-labelledby="texto-largo-titulo"
        className="m-auto w-[min(680px,calc(100vw-32px))] rounded-xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 dark:bg-slate-900"
      >
        <div className="space-y-3 p-5">
          <h4 id="texto-largo-titulo" className="text-base font-semibold text-slate-900 dark:text-slate-50">
            {label}
          </h4>
          <label className="sr-only" htmlFor="texto-largo-campo">
            {label}
          </label>
          <textarea
            id="texto-largo-campo"
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            rows={12}
            maxLength={2000}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Al aceptar, el texto queda en el formulario; se guarda en Cargolink al presionar Guardar o Finalizar.
          </p>
          <div className="flex flex-wrap justify-between gap-2">
            {porDefecto ? (
              <button
                type="button"
                onClick={() => setBorrador(porDefecto)}
                className="min-h-10 rounded-md px-3 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                Usar texto por defecto
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => ref.current?.close()}
                className="min-h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onCambiar(borrador);
                  ref.current?.close();
                }}
                className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}

// Instrucciones de revalidación: un renglón por instrucción ("Etiqueta:
// valor"); el valor es opcional y editable. Los renglones sin valor no se
// mandan a Cargolink, pero las etiquetas del texto por defecto siempre
// aparecen para poder llenarlas.
function CampoInstrucciones({
  label,
  valor,
  porDefecto,
  propuesta,
  guardado,
  onCambiar,
}: {
  label: string;
  valor: string;
  porDefecto: string;
  // Instrucciones según el historial del cliente / naviera.
  propuesta: { texto: string; descripcion: string } | null;
  // Lo que hoy está guardado en Cargolink.
  guardado: string;
  onCambiar: (valor: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const conEtiquetasBase = (texto: string): RenglonInstruccion[] => {
    const renglones = separarInstrucciones(texto);
    const faltan = separarInstrucciones(porDefecto)
      .filter((b) => b.etiqueta && !renglones.some((r) => r.etiqueta.toLowerCase() === b.etiqueta.toLowerCase()))
      .map((b) => ({ etiqueta: b.etiqueta, valor: "" }));
    return [...renglones, ...faltan];
  };
  const [renglones, setRenglones] = useState<RenglonInstruccion[]>([]);
  const abrir = () => {
    setRenglones(conEtiquetasBase(valor));
    ref.current?.showModal();
  };
  const cambiar = (i: number, campo: keyof RenglonInstruccion, v: string) =>
    setRenglones((rs) => rs.map((r, j) => (j === i ? { ...r, [campo]: v } : r)));
  const vista = separarInstrucciones(valor);
  // Lo que se ve ya está guardado en Cargolink (instrucciones reales) o es la
  // propuesta del historial sin guardar.
  const esGuardado = Boolean(guardado.trim()) && valor.trim() === guardado.trim();
  const esPropuesta = !esGuardado && Boolean(propuesta) && valor === propuesta?.texto;
  const claseInput =
    "min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="flex w-full flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      {/* Leyenda: guardado en Cargolink o, si no, de dónde sale el texto. */}
      {esGuardado && (
        <span className="self-start rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-green-800 dark:bg-green-950 dark:text-green-300">
          Guardado en Cargolink
        </span>
      )}
      {!esGuardado && (
        <span
          className={`self-start rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
            propuesta && valor === propuesta.texto
              ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
              : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          }`}
        >
          {propuesta && valor === propuesta.texto
            ? "Propuesta · aún no guardada en Cargolink"
            : valor === porDefecto
              ? "Texto por defecto · aún no guardado en Cargolink"
              : "Modificado · aún no guardado en Cargolink"}
        </span>
      )}
      <div className="flex flex-col items-start gap-2">
        <ul className="min-h-10 w-full min-w-0 space-y-0.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          {vista.length === 0 && <li>—</li>}
          {vista.map((r, i) => (
            <li key={i}>
              * {esPropuesta && <span className="font-semibold text-blue-700 dark:text-blue-400">Propuesta · </span>}
              {r.etiqueta && <span className="font-semibold">{r.etiqueta}: </span>}
              {r.valor}
            </li>
          ))}
        </ul>
        {propuesta && (
          <p className="text-xs text-blue-800 dark:text-blue-300">
            {esPropuesta
              ? "Propuesta según historial, aún no guardada. "
              : valor === propuesta.texto
                ? "Coincide con la propuesta según historial. "
                : "Hay una propuesta según historial (botón Editar › Usar propuesta). "}
            {propuesta.descripcion}
          </p>
        )}
        <button
          type="button"
          onClick={abrir}
          className="min-h-10 shrink-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Editar
        </button>
      </div>
      <dialog
        ref={ref}
        onClick={(e) => {
          e.stopPropagation();
          if (e.target === ref.current) ref.current?.close();
        }}
        onClose={(e) => e.stopPropagation()}
        aria-labelledby="instrucciones-titulo"
        className="m-auto w-[min(720px,calc(100vw-32px))] rounded-xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 dark:bg-slate-900"
      >
        <div className="space-y-3 p-5">
          <h4 id="instrucciones-titulo" className="text-base font-semibold text-slate-900 dark:text-slate-50">
            {label}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Lo que va después de los dos puntos es opcional: si lo dejas vacío, ese renglón no se incluye.
          </p>
          <ul className="space-y-2">
            {renglones.map((r, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] items-center gap-2">
                <input
                  value={r.etiqueta}
                  onChange={(e) => cambiar(i, "etiqueta", e.target.value)}
                  aria-label={`Instrucción ${i + 1}: etiqueta`}
                  placeholder="Etiqueta"
                  className={`${claseInput} font-semibold`}
                />
                <input
                  value={r.valor}
                  onChange={(e) => cambiar(i, "valor", e.target.value)}
                  aria-label={`${r.etiqueta || `Instrucción ${i + 1}`}: valor`}
                  placeholder="(opcional)"
                  className={claseInput}
                />
                <button
                  type="button"
                  onClick={() => setRenglones((rs) => rs.filter((_, j) => j !== i))}
                  aria-label={`Quitar ${r.etiqueta || `instrucción ${i + 1}`}`}
                  className="flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-red-700 dark:hover:bg-slate-800"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setRenglones((rs) => [...rs, { etiqueta: "", valor: "" }])}
            className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            + Agregar instrucción
          </button>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <p className="mb-1 font-semibold">Así se guardará en Cargolink:</p>
            <p className="whitespace-pre-line">{unirInstrucciones(renglones).replace(/ \n/g, "\n") || "—"}</p>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {propuesta && (
                <button
                  type="button"
                  onClick={() => setRenglones(conEtiquetasBase(propuesta.texto))}
                  title={propuesta.descripcion}
                  className="min-h-10 rounded-md px-3 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  Usar propuesta del historial
                </button>
              )}
              <button
                type="button"
                onClick={() => setRenglones(conEtiquetasBase(porDefecto))}
                className="min-h-10 rounded-md px-3 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                Usar texto por defecto
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => ref.current?.close()}
                className="min-h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onCambiar(unirInstrucciones(renglones));
                  ref.current?.close();
                }}
                className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
              >
                Aceptar
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Se guarda en Cargolink al presionar Guardar o Finalizar.</p>
        </div>
      </dialog>
    </div>
  );
}

// Resumen comercial: conceptos, costos y ventas que capturó Comercial en
// Cargolink, con aviso ⚠ si algo cambió desde la última revisión de
// Operaciones (foto en resumen_comercial_base).
export function ResumenComercialSeccion({
  idBooking,
  datos,
  noBooking,
}: {
  idBooking: number;
  // Booking comercial completo (operaciones_maritima.datos) para la ventana "Ver completo".
  datos?: Record<string, unknown>;
  noBooking?: string;
}) {
  const [r, setR] = useState<ResumenComercial | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [completo, setCompleto] = useState(false);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let vigente = true;
    resumenComercialCargolink(idBooking).then((x) => {
      if (vigente) {
        setR(x);
        if (x.cambios.length > 0 || x.avisoCargolink) setAbierto(true);
      }
    });
    return () => {
      vigente = false;
    };
  }, [idBooking]);

  const dinero = (n: number | null, m = "") =>
    n === null ? "—" : `${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${m ? ` ${m}` : ""}`;
  const cambiados = new Map((r?.cambios ?? []).filter((c) => c.id).map((c) => [c.id as string, c.tipo]));
  const hayCambios = (r?.cambios.length ?? 0) > 0;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {completo && r && datos && (
        <ResumenComercialDialog noBooking={noBooking ?? ""} datos={datos} r={r} onCerrar={() => setCompleto(false)} />
      )}
      <div className="flex items-center gap-2 pr-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
          Resumen comercial (conceptos y costos)
          {hayCambios && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800 dark:bg-red-950 dark:text-red-300">
              ⚠ Cambio de Comercial
            </span>
          )}
          {r?.avisoCargolink && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              ⚠ Cargolink: cambio de servicio sin revisar
            </span>
          )}
          {!r && <span className="text-xs font-normal text-slate-500">Cargando…</span>}
        </span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={abierto ? "rotate-180" : ""}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {datos && (
        <button
          type="button"
          disabled={!r}
          onClick={() => setCompleto(true)}
          className="min-h-10 shrink-0 rounded-md bg-[#16232f] px-3 text-sm font-semibold text-white hover:bg-[#22364a] disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          Ver completo
        </button>
      )}
      </div>

      {abierto && r && (
        <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
          {!r.ok && <p className="text-sm text-red-700 dark:text-red-400">No se pudo leer de Cargolink: {r.mensaje}</p>}
          {r.ok && r.mensaje && <p className="text-xs text-amber-800 dark:text-amber-300">{r.mensaje}</p>}

          {hayCambios && (
            <div role="alert" className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <p className="font-semibold">
                ⚠ Comercial cambió el booking después de la revisión
                {r.revisadoAt ? ` del ${new Date(r.revisadoAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}` : ""}
                {r.revisadoPor ? ` (${r.revisadoPor})` : ""}:
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {r.cambios.map((c, i) => (
                  <li key={i}>{c.texto}</li>
                ))}
              </ul>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const x = await marcarResumenComercialRevisado(idBooking, r.firma);
                    if (x.ok) setR({ ...r, cambios: [], revisadoAt: new Date().toISOString() });
                    else alert(x.mensaje);
                  })
                }
                className="min-h-10 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {pending ? "Guardando…" : "Enterado, ya lo revisé"}
              </button>
            </div>
          )}

          {r.ok && (
            <>
              {/* Datos clave en una línea. */}
              <dl className="flex flex-wrap gap-1.5 text-xs">
                {r.datos.map((d) => (
                  <div
                    key={d.label}
                    className="flex items-baseline gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <dt className="text-slate-500 dark:text-slate-400">{d.label}</dt>
                    <dd className="max-w-56 truncate font-semibold text-slate-900 dark:text-slate-100" title={d.valor}>
                      {d.valor || "—"}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 font-semibold">Concepto</th>
                      <th scope="col" className="px-2 py-1.5 font-semibold">Proveedor</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-semibold">Cant.</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-semibold">Costo</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-semibold">Venta</th>
                      <th scope="col" className="px-2 py-1.5 font-semibold">Factura / pago</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {r.conceptos.map((c) => {
                      const cambio = cambiados.get(c.id);
                      const [estadoPago, ...detallePago] = (c.factura || "—").split(" / ");
                      const clasePago = /pagado/i.test(estadoPago)
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                        : /pend/i.test(estadoPago)
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
                      return (
                        <tr key={c.id} className={`align-top ${cambio ? "bg-red-50 dark:bg-red-950/40" : ""}`}>
                          <td className="px-2 py-1.5">
                            <span className="flex items-start gap-1.5">
                              {cambio && (
                                <span title={cambio === "nuevo" ? "Concepto nuevo" : "Concepto modificado"} className="font-bold text-red-700 dark:text-red-400">
                                  ⚠
                                </span>
                              )}
                              <span>
                                <span className="mr-1 rounded bg-slate-100 px-1 py-px text-[10px] font-semibold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  {c.tipo}
                                </span>
                                <span className="font-medium text-slate-900 dark:text-slate-100">{c.concepto}</span>
                                {c.observaciones && <span className="block text-[11px] text-slate-500">{c.observaciones}</span>}
                              </span>
                            </span>
                          </td>
                          <td className="max-w-40 truncate px-2 py-1.5 text-slate-600 dark:text-slate-300" title={c.proveedor ?? undefined}>
                            {c.proveedor ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{c.cantidad}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" title={c.costoBase || undefined}>
                            {dinero(c.costo, c.costoMoneda)}
                            {c.costoBase && <span className="block text-[10px] lowercase text-slate-500">{c.costoBase}</span>}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" title={c.ventaBase || undefined}>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{dinero(c.venta, c.ventaMoneda)}</span>
                            {(c.ventaBase || c.pdd) && (
                              <span className="block text-[10px] lowercase text-slate-500">{[c.ventaBase, c.pdd].filter(Boolean).join(" · ")}</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5" title={detallePago.join(" / ") || undefined}>
                            <span className={`whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold ${clasePago}`}>{estadoPago}</span>
                            {detallePago.length > 0 && (
                              <span className="mt-0.5 block max-w-44 truncate text-[10px] text-slate-500">{detallePago.join(" / ")}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {r.conceptos.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-2 py-4 text-center text-slate-500">Comercial no ha capturado conceptos.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {r.conceptos.length > 0 && (
                <div className="flex flex-wrap justify-end gap-2 text-xs">
                  {[
                    ["Costo sin IVA", r.totales.costo, "text-slate-900 dark:text-slate-100"],
                    ["Venta sin IVA", r.totales.venta, "text-slate-900 dark:text-slate-100"],
                    ["Profit", r.totales.profit, (r.totales.profit ?? 0) < 0 ? "text-red-700 dark:text-red-400" : "text-green-800 dark:text-green-300"],
                  ].map(([label, valor, clase]) => (
                    <div key={label as string} className="rounded-md border border-slate-200 px-3 py-1.5 text-right dark:border-slate-700">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label as string}</p>
                      <p className={`text-sm font-bold tabular-nums ${clase as string}`}>
                        {dinero(valor as number | null, r.totales.moneda ?? "")}
                        {label === "Profit" && r.totales.venta ? (
                          <span className="ml-1 text-[11px] font-semibold">
                            ({Math.round((1000 * (r.totales.profit ?? 0)) / r.totales.venta) / 10} %)
                          </span>
                        ) : null}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Totales como en el llenado del booking (sin impuestos). Referencia para avisar cambios:{" "}
                {r.revisadoAt ? new Date(r.revisadoAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—"}
                {r.revisadoPor ? ` (${r.revisadoPor})` : ""}.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

type TrackingNaviera = {
  naviera: string;
  referencia: string | null;
  ok: boolean;
  error: string | null;
  eta_naviera: string | null;
  pod: string | null;
  transbordos: { lugar: string; fecha: string | null }[] | null;
  ultimo_evento: string | null;
  ultimo_evento_fecha: string | null;
  ata_naviera: string | null;
  consultado_at: string;
  // BL que muestra la página de la naviera (MSC por contenedor, PIL por BL).
  bl_msc?: string | null;
  bl_pagina?: string | null;
};
type SolicitudTracking = { estado: "pendiente" | "en_proceso" | "hecho" | "error"; mensaje: string | null; solicitado_at: string };

async function leerTrackingNaviera(idBooking: number) {
  const supabase = createClient();
  const [tr, so] = await Promise.all([
    supabase
      .from("tracking_naviera")
      .select(
        "naviera, referencia, ok, error, eta_naviera, pod, transbordos, ultimo_evento, ultimo_evento_fecha, ata_naviera, consultado_at, bl_msc:respuesta->BillOfLadings->0->>BillOfLadingNumber, bl_pagina:respuesta->>bl",
      )
      .eq("id_booking", idBooking)
      .maybeSingle(),
    supabase.from("tracking_solicitudes").select("estado, mensaje, solicitado_at").eq("id_booking", idBooking).maybeSingle(),
  ]);
  return { tracking: (tr.data as TrackingNaviera | null) ?? null, solicitud: (so.data as SolicitudTracking | null) ?? null };
}

// Lo que dice la naviera: el último dato registrado (rastreo de las 7 PM o
// consultas anteriores). Solo se consulta de nuevo con "Actualizar desde…".
export function NavieraSeccion({
  idBooking,
  carrier,
  mbl,
  contenedores,
  eta,
  ata,
  noBooking,
  origen,
  destino,
  onActualizada,
}: {
  // Avisa lo último que respondió la naviera (al abrir y al terminar una consulta).
  onActualizada?: (n: ResumenNaviera) => void;
  idBooking: number;
  carrier: string | null;
  mbl: string | null;
  contenedores: string | null;
  eta: string | null;
  ata: string | null;
  noBooking?: string;
  origen?: string | null;
  destino?: string | null;
}) {
  const [verCompleta, setVerCompleta] = useState(false);
  // La naviera la decide el MBL/contenedor; la de Cargolink solo si no la delatan.
  const detectada = navieraRastreo(mbl, contenedores, carrier);
  // Reconocida y sin agente (ZIM, PIL, …): no se consulta. Si no se reconoce, se prueban todos los agentes.
  const sinAgente = Boolean(detectada.naviera && !NAVIERAS_CON_AGENTE.includes(detectada.naviera));
  const [razonSocial, setRazonSocial] = useState<string | null>(null);
  const [t, setT] = useState<TrackingNaviera | null>(null);
  const [sol, setSol] = useState<SolicitudTracking | null>(null);
  const [leido, setLeido] = useState(false);
  const [errorPedir, setErrorPedir] = useState<string | null>(null);
  const esperando = sol?.estado === "pendiente" || sol?.estado === "en_proceso";

  const leer = useCallback(() => leerTrackingNaviera(idBooking), [idBooking]);
  const aplicar = useCallback((x: Awaited<ReturnType<typeof leerTrackingNaviera>>) => {
    setT(x.tracking);
    setSol(x.solicitud);
    setLeido(true);
    if (x.tracking?.ok) onActualizada?.(x.tracking);
    return x;
  }, [onActualizada]);

  const pedir = useCallback(async () => {
    setErrorPedir(null);
    const { error } = await createClient().rpc("solicitar_tracking_naviera", { p_id_booking: idBooking });
    if (error) setErrorPedir(error.message);
    else setSol({ estado: "pendiente", mensaje: null, solicitado_at: new Date().toISOString() });
  }, [idBooking]);

  useEffect(() => {
    if (!carrier) return;
    createClient()
      .from("proveedores_cargolink")
      .select("razonsocial")
      .eq("id_proveedor", carrier)
      .maybeSingle()
      .then(({ data }) => setRazonSocial((data?.razonsocial as string | undefined) ?? null));
  }, [carrier]);
  // Cargolink tiene capturada otra naviera que la del MBL/contenedor.
  // La real: la que encontró el embarque o, si aún no hay datos, la de la referencia.
  const navieraReal = t?.ok ? nombreNaviera(t.naviera) : detectada.porReferencia;
  const navieraMal =
    navieraReal && razonSocial && !coincideRazonSocial(navieraReal, razonSocial) ? (
      <p role="alert" className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        ⚠ En Cargolink la naviera es <strong>{razonSocial}</strong>, pero el MBL o contenedor ({mbl || contenedores}) es de{" "}
        <strong>{navieraReal}</strong>. Corrige la naviera en Cargolink.
      </p>
    ) : null;

  useEffect(() => {
    if (sinAgente) return;
    // Solo el último dato registrado; a la naviera se consulta con el botón.
    leer().then(aplicar);
  }, [sinAgente, leer, aplicar]);

  useEffect(() => {
    if (!esperando) return;
    const intervalo = setInterval(() => leer().then(aplicar), 5000);
    return () => clearInterval(intervalo);
  }, [esperando, leer, aplicar]);

  // La que encontró el embarque (puede ser otra si la de la referencia no lo tenía).
  const naviera = t?.ok ? nombreNaviera(t.naviera) : (detectada.naviera ?? "la naviera");
  const liga = ligaRastreo(t?.ok ? nombreNaviera(t.naviera) : detectada.naviera, mbl, contenedores);
  const verEnSitio = liga && (
    <a
      href={liga}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
    >
      Ver en el sitio de {t?.ok ? naviera : detectada.naviera}
      <span aria-hidden="true">↗</span>
    </a>
  );
  if (sinAgente)
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
          Información de la naviera{detectada.naviera ? ` (${detectada.naviera})` : ""}
        </h3>
        {navieraMal}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Todavía no hay agente de rastreo para {detectada.naviera ?? "esta naviera"}. Hoy se consultan {NAVIERAS_CON_AGENTE.join(", ")}.
        </p>
        {verEnSitio && <div className="mt-1">{verEnSitio}</div>}
      </section>
    );
  const blNaviera = t?.ok ? ((t.bl_msc || t.bl_pagina || "").trim().toUpperCase() || null) : null;
  // TS Lines: datos del itinerario del buque, no del contenedor.
  const porItinerario = Boolean(t?.ok && t.naviera.toUpperCase() === "TS LINES");
  const difEta = t?.ok && t.eta_naviera && eta ? Math.round((Date.parse(t.eta_naviera) - Date.parse(eta.slice(0, 10))) / 86400000) : null;
  const difAta = t?.ok && t.ata_naviera && ata ? Math.round((Date.parse(t.ata_naviera) - Date.parse(ata.slice(0, 10))) / 86400000) : null;
  const dif = (d: number | null, base: string | null) =>
    base === null ? (
      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Cargolink sin capturar</span>
    ) : d === 0 ? (
      <span className="text-xs font-semibold text-green-700 dark:text-green-400">✓ Igual que Cargolink</span>
    ) : d !== null ? (
      <span className="text-xs font-semibold text-red-700 dark:text-red-400">
        Cargolink {fechaCorta(base)} ({d > 0 ? "+" : ""}
        {d} días)
      </span>
    ) : null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          Información de la naviera{t?.ok || detectada.naviera ? ` (${naviera})` : ""}
          {t && (
            <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
              Último dato registrado: {new Date(t.consultado_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
              {t.referencia ? ` · ${t.referencia}` : ""}
            </span>
          )}
        </h3>
        <span className="flex flex-wrap items-center gap-2">
          {t?.ok && (
            <button
              type="button"
              onClick={() => setVerCompleta(true)}
              className="min-h-10 rounded-md bg-[#16232f] px-3 text-sm font-semibold text-white hover:bg-[#22364a] dark:bg-slate-100 dark:text-slate-900"
            >
              Ver información completa
            </button>
          )}
          {verEnSitio}
          <button
            type="button"
            disabled={esperando}
            onClick={pedir}
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {esperando ? "Consultando…" : `Actualizar desde ${t?.ok || detectada.naviera ? naviera : "las navieras"}`}
          </button>
        </span>
      </div>

      {verCompleta && t?.ok && (
        <NavieraDialog
          idBooking={idBooking}
          noBooking={noBooking ?? ""}
          nombre={naviera}
          tracking={t}
          eta={eta}
          ata={ata}
          origen={origen ?? null}
          destino={destino ?? null}
          liga={liga}
          onCerrar={() => setVerCompleta(false)}
        />
      )}
      {navieraMal}
      {blNaviera && blNaviera !== (mbl ?? "").trim().toUpperCase() && (
        <p className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          BL según {naviera}: <strong className="font-mono">{blNaviera}</strong>
          {(mbl ?? "").trim() ? ` · en Cargolink: ${mbl}` : " · en Cargolink no hay BL capturado"}. Revísalo y captúralo en Cargolink.
        </p>
      )}
      {esperando && (
        <p role="status" className="mb-3 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-9-9" />
          </svg>
          Consultando a {naviera}… el agente de la Mac lo atiende en 1 a 2 minutos; puedes seguir trabajando.
        </p>
      )}
      {sol?.estado === "error" && sol.mensaje && <p className="mb-3 text-xs text-red-700 dark:text-red-400">Última consulta: {sol.mensaje}</p>}
      {errorPedir && <p className="mb-3 text-xs text-red-700 dark:text-red-400">No se pudo pedir la consulta: {errorPedir}</p>}
      {leido && !t && !esperando && (
        <p className="text-sm text-slate-500">Sin información registrada de la naviera. Usa “Actualizar desde…” para consultarla.</p>
      )}
      {t && !t.ok && <p className="text-sm text-red-700 dark:text-red-400">{t.error ?? `${naviera} no regresó información.`}</p>}

      {t?.ok && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-xs text-slate-500 dark:text-slate-400">ETA según {naviera}</dt>
            <dd className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fechaCorta(t.eta_naviera)}</dd>
            <dd>{t.eta_naviera && dif(difEta, eta)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-slate-500 dark:text-slate-400">ATA según {naviera}</dt>
            <dd className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.ata_naviera ? fechaCorta(t.ata_naviera) : "Aún no arriba"}</dd>
            <dd>{t.ata_naviera && dif(difAta, ata)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-slate-500 dark:text-slate-400">Puerto de descarga</dt>
            <dd className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{t.pod ?? "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-slate-500 dark:text-slate-400">Transbordos</dt>
            <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {t.transbordos && t.transbordos.length > 0
                ? t.transbordos.map((x) => `${x.lugar}${x.fecha ? ` (${fechaCorta(x.fecha)})` : ""}`).join(", ")
                : porItinerario
                  ? "No lo informa"
                  : "Directo"}
            </dd>
          </div>
          <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-4">
            <dt className="text-xs text-slate-500 dark:text-slate-400">Último evento</dt>
            <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {t.ultimo_evento ?? "—"}
              {t.ultimo_evento_fecha ? ` · ${fechaCorta(t.ultimo_evento_fecha)}` : ""}
            </dd>
          </div>
        </dl>
      )}
      {t?.ok && !t.eta_naviera && (
        <p role="note" className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {naviera} no da ETA para este embarque: usa la ETA de Operaciones (Cargolink).
        </p>
      )}
      {porItinerario && (
        <p role="note" className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {naviera} pide captcha en su rastreo: estos datos salen de su consulta de D/O y del itinerario del buque (llegadas y zarpes por
          puerto). No incluye eventos del contenedor ni transbordos.
        </p>
      )}
      {t?.ok && (difEta || difAta) ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          La información de la naviera no se escribe sola en Cargolink: confírmala en Track › Propuestas o en la etapa correspondiente.
        </p>
      ) : null}
    </section>
  );
}
