import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { arriboSinConfirmar, detalleNaviera, zarpeSegunNaviera } from "@/lib/detalleNaviera";
import { nombreNaviera } from "@/lib/navieras";
import { repararAcentos } from "@/lib/etapasCargolink";
import { pdfEstatusEmbarque } from "@/lib/pdfEstatusEmbarque";

// PDF "Estatus de embarque" de AV2 Logistics para el cliente
// (?id=<id_booking>, &descargar=1 para descargarlo). Solo si el booking ya tiene
// información de la naviera; no lleva costos ni datos internos.
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

  const [{ data: op }, { data: t }] = await Promise.all([
    supabase.from("operaciones_maritima_vista").select("*").eq("id_booking", idBooking).maybeSingle(),
    supabase
      .from("tracking_naviera")
      .select("naviera, ok, eta_naviera, pod, transbordos, ultimo_evento, ultimo_evento_fecha, ata_naviera, consultado_at, respuesta")
      .eq("id_booking", idBooking)
      .maybeSingle(),
  ]);
  if (!op) return new Response("Operación no encontrada.", { status: 404 });
  if (!t?.ok) return new Response("Este booking todavía no tiene información de la naviera.", { status: 409 });

  const datos = (op.datos ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => {
    const x = v === null || v === undefined ? "" : String(v).trim();
    return x && x !== "0" && !x.startsWith("0000") ? repararAcentos(x) : null;
  };
  const f = (v: unknown) => {
    const x = s(v);
    return x && /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : null;
  };
  const detalle = detalleNaviera(t.naviera, t.respuesta);
  const { data: prov } = s(datos.buque_carrier)
    ? await supabase.from("proveedores_cargolink").select("razonsocial").eq("id_proveedor", String(datos.buque_carrier)).maybeSingle()
    : { data: null };

  try {
    const pdf = await pdfEstatusEmbarque({
      noBooking: String(op.no_booking),
      cliente: s(op.cliente),
      consignatario: s(op.consignatario ?? datos.consignatario),
      // Cargolink a veces guarda el contacto junto al nombre del shipper: solo el nombre.
      proveedor: s(datos.shipper)?.split(/\s+\/\s+|\s+(?:Tel|Direct Line|Mobile)\b/i)[0].trim() ?? null,
      mercancia: s(op.mercancia),
      incoterm: s(op.incoterm ?? datos.intercom),
      servicio: s(op.servicio),
      equipo: s(op.modo_transportacion),
      contenedores: s(op.contenedores),
      mbl: s(op.mbl),
      hbl: s(datos.no_agentes),
      // La línea marítima que respondió (la de Cargolink puede estar mal capturada).
      naviera: nombreNaviera(t.naviera) || s(prov?.razonsocial),
      buque: [s(datos.buque), s(datos.no_viaje)].filter(Boolean).join(" / ") || detalle?.buque || null,
      origen: detalle?.pol ?? s(op.origen),
      destino: s(op.destino),
      puertoDescarga: (t.pod as string | null)?.split(",")[0] ?? detalle?.pod ?? s(op.destino),
      // Si Cargolink aún no tiene el ATD, el zarpe real que reporta la naviera.
      atd: f(datos.fecha_atd) ?? zarpeSegunNaviera(detalle?.eventos ?? []),
      etd: f(datos.fecha_estimada),
      // Si la naviera dice que aún no arriba, manda su ETA y la ATA de Cargolink no cuenta.
      eta: arriboSinConfirmar(f(op.ata), t) ? f(t.eta_naviera) : f(op.eta),
      etaNaviera: f(t.eta_naviera),
      ata: (arriboSinConfirmar(f(op.ata), t) ? null : f(op.ata)) ?? f(t.ata_naviera),
      transbordos: ((t.transbordos ?? []) as { lugar: string; fecha: string | null }[]).filter((x) => x?.lugar),
      revalidacion: f(op.revalidacion),
      diasLibres: Number(op.dias_libres_demora) || null,
      ultimoDiaLibre: f(op.ultimo_dia_libre_demoras),
      regresoVacio: f(op.regreso_vacio),
      ultimoEvento: s(t.ultimo_evento),
      ultimoEventoFecha: f(t.ultimo_evento_fecha),
      consultadoNaviera: s(t.consultado_at)?.slice(0, 10) ?? null,
      eventos: detalle?.eventos ?? [],
    });
    const nombre = `Estatus_embarque_${String(op.no_booking).replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
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
