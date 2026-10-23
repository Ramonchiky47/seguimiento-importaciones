import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { detalleNaviera, zarpeSegunNaviera } from "@/lib/detalleNaviera";
import { nombreNaviera } from "@/lib/navieras";
import { repararAcentos } from "@/lib/etapasCargolink";
import { calcularTareas, type HitoTrack } from "@/lib/trackNew";
import { resumenComercialCargolink } from "@/app/(app)/operaciones-maritima/actions";
import { pdfPulsoOperacion, type PagoConcepto } from "@/lib/pdfPulsoOperacion";

// PDF "Pulso de la operación" (?id=<id_booking>, &descargar=1 para descargarlo):
// resumen ejecutivo interno para Dirección con naviera, Comercial y Operaciones.
// Lleva costos y profit: no es para el cliente.
const ESTATUS_BOOKING: Record<string, string> = { "1": "VIGENTE", "2": "FINALIZADO", "0": "CANCELADO" };
const ETAPA_MOV: Record<string, string> = { FINALIZADO: "Finalizada", NO_APLICA: "No aplica", EDICION: "En edición" };

// Cargolink: "Pagado / FFP: … / FS: <folio de la solicitud de pago>", "Pago pend / …" o "Sin solicitud".
function pago(factura: string): { pago: PagoConcepto; solicitud: string | null } {
  const partes = (factura || "").split("/").map((x) => x.trim());
  const solicitud = partes.find((x) => /^FS:/i.test(x))?.replace(/^FS:\s*/i, "") || null;
  if (/pagad/i.test(partes[0] ?? "")) return { pago: "pagado", solicitud };
  if (/pend/i.test(partes[0] ?? "") || solicitud) return { pago: "pendiente", solicitud };
  return { pago: "sin", solicitud };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const idBooking = Number(params.get("id"));
  if (!Number.isInteger(idBooking) || idBooking <= 0) return new Response("Booking no válido.", { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Inicia sesión.", { status: 401 });
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operaciones) return new Response("Sin permiso de operaciones.", { status: 403 });

  const [{ data: op }, { data: t }, { data: hitos }, comercial] = await Promise.all([
    supabase.from("operaciones_maritima_vista").select("*").eq("id_booking", idBooking).maybeSingle(),
    supabase
      .from("tracking_naviera")
      .select("naviera, ok, eta_naviera, pod, transbordos, ultimo_evento, ultimo_evento_fecha, ata_naviera, consultado_at, respuesta")
      .eq("id_booking", idBooking)
      .maybeSingle(),
    supabase
      .from("track_hitos")
      .select("orden, hito, regla, fecha_plan, fecha_hecho, hecho, estado, dias_atraso, valor_real")
      .eq("id_booking", idBooking)
      .order("posicion"),
    resumenComercialCargolink(idBooking),
  ]);
  if (!op) return new Response("Operación no encontrada.", { status: 404 });

  const datos = (op.datos ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => {
    const x = v === null || v === undefined ? "" : String(v).trim();
    return x && x !== "0" && x !== "null" && !x.startsWith("0000") ? repararAcentos(x) : null;
  };
  const f = (v: unknown) => {
    const x = s(v);
    return x && /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : null;
  };
  const n = (v: unknown) => Number(v) || null;
  const etapa = (mov: string) => {
    const m = s(datos[`his_mov_${mov}`]);
    return m ? (ETAPA_MOV[m] ?? m) : null;
  };
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  const naviera = t?.ok ? t : null;
  const detalle = naviera ? detalleNaviera(naviera.naviera, naviera.respuesta) : null;
  const { data: prov } = s(datos.buque_carrier)
    ? await supabase.from("proveedores_cargolink").select("razonsocial").eq("id_proveedor", String(datos.buque_carrier)).maybeSingle()
    : { data: null };

  // Una ATA a futuro en Cargolink no es arribo.
  const ataCargolink = f(op.ata);
  const ata = (ataCargolink && ataCargolink <= hoy ? ataCargolink : null) ?? f(naviera?.ata_naviera);
  const atdNaviera = zarpeSegunNaviera(detalle?.eventos ?? []);
  const atd = f(op.etd_atd) ?? f(datos.fecha_atd) ?? atdNaviera;
  const arribo = Boolean(ata);
  const diasDemora = op.dias_demora === null || op.dias_demora === undefined ? null : Number(op.dias_demora);
  const numeros = (s(op.contenedores) ?? "").split(/[,;\s]+/).filter(Boolean);
  const tipos = (s(op.modo_transportacion) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const equipos = Array.from({ length: Math.max(numeros.length, tipos.length) }, (_, i) => ({
    numero: numeros[i] ?? null,
    tipo: tipos[i] ?? tipos[0] ?? null,
  }));
  // En FCL el embalaje repite los equipos; en LCL son pallets, cajas, bultos…
  const tipoEmbalaje = s(datos.tipo_embalaje);
  const embalajeEsEquipo = !tipoEmbalaje || tipoEmbalaje === s(op.modo_transportacion);

  try {
    const pdf = await pdfPulsoOperacion({
      ruta: {
        noBooking: String(op.no_booking),
        cliente: s(op.cliente),
        consignatario: s(op.consignatario ?? datos.consignatario),
        proveedor: s(datos.shipper)?.split(/\s+\/\s+|\s+(?:Tel|Direct Line|Mobile)\b/i)[0].trim() ?? null,
        mercancia: s(op.mercancia),
        incoterm: s(op.incoterm ?? datos.intercom),
        servicio: s(op.servicio),
        equipo: s(op.modo_transportacion),
        contenedores: s(op.contenedores),
        mbl: s(op.mbl),
        hbl: s(datos.no_agentes),
        naviera: (naviera && nombreNaviera(naviera.naviera)) || s(prov?.razonsocial),
        buque: [s(datos.buque), s(datos.no_viaje)].filter(Boolean).join(" / ") || detalle?.buque || null,
        origen: detalle?.pol ?? s(op.origen),
        destino: s(op.destino),
        puertoDescarga: (naviera?.pod as string | null)?.split(",")[0] ?? detalle?.pod ?? s(op.destino),
        atd,
        etd: f(datos.fecha_estimada),
        eta: f(op.eta),
        etaNaviera: f(naviera?.eta_naviera),
        ata,
        transbordos: ((naviera?.transbordos ?? []) as { lugar: string; fecha: string | null }[]).filter((x) => x?.lugar),
        revalidacion: f(op.revalidacion),
        diasLibres: n(op.dias_libres_demora),
        ultimoDiaLibre: f(op.ultimo_dia_libre_demoras),
        regresoVacio: f(op.regreso_vacio),
        ultimoEvento: s(naviera?.ultimo_evento),
        ultimoEventoFecha: f(naviera?.ultimo_evento_fecha),
        consultadoNaviera: s(naviera?.consultado_at)?.slice(0, 10) ?? null,
        eventos: detalle?.eventos ?? [],
      },
      ejecutivo: s(op.ejecutivo),
      estatusBooking: ESTATUS_BOOKING[String(op.status_booking)] ?? "—",
      etapa: arribo ? (diasDemora !== null && diasDemora > 0 && !op.regreso_vacio ? "EN DEMORA" : "EN PUERTO") : atd && atd <= hoy ? "EN TRÁNSITO" : "POR ZARPAR",
      referencia: s(datos.referencia),
      agenteExtranjero: s(op.agente_extranjero ?? datos.nameAgenExt),
      ventaPor: s(datos.venta_por),
      credito: s(datos.credito),
      peligroso: s(datos.peligroso),
      equipos,
      embalaje: embalajeEsEquipo ? { cantidad: null, tipo: null } : { cantidad: n(datos.totalEmbalaje), tipo: tipoEmbalaje },
      atdNaviera,
      ataFutura: ataCargolink && ataCargolink > hoy ? ataCargolink : null,
      seguro: {
        contratado: Boolean(op.seguro),
        etapa: etapa("seguro"),
        poliza: s(datos.numero_poliza_seguro),
        monto: n(datos.valor_mercancia),
        aseguraPor: s(datos.segurar_por),
        fecha: f(datos.seguro_fecha),
        alcance: s(datos.seguro_alcance),
        monto2: n(datos.valor_mercancia2),
        aseguraPor2: s(datos.segurar_por2),
        moneda: s(datos.moneda),
      },
      comercial: {
        ok: comercial.ok,
        mensaje: comercial.mensaje,
        conceptos: comercial.conceptos.map((c) => ({
          tipo: c.tipo,
          concepto: c.concepto,
          proveedor: c.proveedor,
          costo: c.costo,
          costoMoneda: c.costoMoneda,
          venta: c.venta,
          ventaMoneda: c.ventaMoneda,
          ...pago(c.factura),
        })),
        venta: comercial.totales.venta,
        costo: comercial.totales.costo,
        profit: comercial.totales.profit,
        cambios: comercial.cambios.map((c) => c.texto),
        avisoCargolink: comercial.avisoCargolink,
      },
      facturacion: {
        etapa: etapa("facturacion"),
        solicitud: f(datos.fecha_Solfacturacion),
        folio: s(datos.folioFactura),
        fechaFactura: f(datos.fechaFactura),
        fechaPago: f(datos.fecha_pago),
        enviado: s(datos.enviado_facturacion) === "1",
        facturado: s(datos.facturado_booking) === "1",
        diasRestantes: datos.dias_restantes_facturacion === undefined || datos.dias_restantes_facturacion === null ? null : Number(datos.dias_restantes_facturacion),
      },
      garantia: {
        etapa: etapa("garantia"),
        tipo: s(datos.garantia_tipo_solicitud),
        monto: n(datos.monto_pago_garantia),
        moneda: s(datos.garantia_moneda),
        solicitud: f(datos.garantia_fecha_solicitud ?? datos.fecha_solicitud_garantia),
        solicitudDevolucion: f(datos.garantia_fecha_solicitud_devolucion),
        regreso: f(datos.fecha_regreso_garantia),
      },
      diasDemora,
      tareas: calcularTareas(op as Record<string, unknown>, (hitos ?? []) as HitoTrack[]),
    });
    const nombre = `Pulso_operacion_${String(op.no_booking).replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${params.get("descargar") === "1" ? "attachment" : "inline"}; filename="${nombre}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "No se pudo generar el PDF.", { status: 500 });
  }
}
