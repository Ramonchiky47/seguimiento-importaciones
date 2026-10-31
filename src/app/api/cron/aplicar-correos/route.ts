import { createAdminClient } from "@/lib/supabase/admin";
import { SISTEMA, guardarEtapaCon } from "@/lib/escrituraCargolink";
import { cambiosDesdeCorreo, fuenteCorreo, type Cambio, type CorreoInfo, type OperacionCl, type Rechazo } from "@/lib/correoACargolink";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Pasa a Cargolink lo que trae el último correo de cada booking (ATD, ETA, buque y
// viaje, MBL y HBL) con las reglas de lib/correoACargolink: solo campos vacíos,
// sin finalizar y sin notificar, como "Aplicación por sistema" y con el correo de
// origen en la bitácora. ?probar=1 solo dice qué haría. Lo llama la Mac/SYSMON
// con aplicar_propuestas.py (8:00, 14:00 y al terminar cada actualización).
const PRESUPUESTO_MS = 260_000;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const claves = [process.env.CRON_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean);
  if (!claves.some((c) => auth === `Bearer ${c}`)) return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const probar = new URL(request.url).searchParams.get("probar") === "1";

  const inicio = Date.now();
  const supabase = createAdminClient();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

  const { data: filas, error } = await supabase
    .from("info_correos")
    .select("id_booking, no_booking, fecha_correo, asunto, datos")
    .order("fecha_correo", { ascending: false });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  // El último correo de cada booking.
  const correos = new Map<number, CorreoInfo>();
  for (const f of (filas ?? []) as CorreoInfo[]) if (!correos.has(f.id_booking)) correos.set(f.id_booking, f);
  const ids = [...correos.keys()];

  const ops = new Map<number, OperacionCl>();
  const navEta = new Map<number, string | null>();
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const [{ data: o }, { data: t }] = await Promise.all([
      supabase
        .from("operaciones_maritima")
        .select(
          "id_booking, fecha, etd_atd, eta, mbl, buque:datos->>buque, no_viaje:datos->>no_viaje, hbl:datos->>no_agentes, mov_atd:datos->>his_mov_atd, mov_eta:datos->>his_mov_eta, mov_origen:datos->>his_mov_origen",
        )
        .in("id_booking", lote),
      supabase.from("tracking_naviera").select("id_booking, eta_naviera").eq("ok", true).in("id_booking", lote),
    ]);
    for (const x of (o ?? []) as OperacionCl[]) ops.set(x.id_booking, x);
    for (const x of (t ?? []) as { id_booking: number; eta_naviera: string | null }[]) navEta.set(x.id_booking, x.eta_naviera);
  }

  // MBL / HBL que ya usa otro booking (un BL copiado de otro correo no se pasa).
  const texto = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase() : "");
  const mbls = [...new Set([...correos.values()].map((c) => texto(c.datos.mbl)).filter(Boolean))];
  const hbls = [...new Set([...correos.values()].map((c) => texto(c.datos.hbl)).filter(Boolean))];
  const usadosPor = { mbl: new Map<string, number>(), hbl: new Map<string, number>() };
  for (let i = 0; i < Math.max(mbls.length, hbls.length); i += 200) {
    const [{ data: m }, { data: h }] = await Promise.all([
      mbls.length > i ? supabase.from("operaciones_maritima").select("id_booking, mbl").in("mbl", mbls.slice(i, i + 200)) : { data: [] },
      hbls.length > i
        ? supabase.from("operaciones_maritima").select("id_booking, hbl:datos->>no_agentes").in("datos->>no_agentes", hbls.slice(i, i + 200))
        : { data: [] },
    ]);
    for (const x of (m ?? []) as { id_booking: number; mbl: string }[]) usadosPor.mbl.set(x.mbl.toUpperCase(), x.id_booking);
    for (const x of (h ?? []) as { id_booking: number; hbl: string }[]) usadosPor.hbl.set(x.hbl.toUpperCase(), x.id_booking);
  }
  const usadosPorOtro = (id: number) => ({
    mbl: new Set([...usadosPor.mbl].filter(([, b]) => b !== id).map(([v]) => v)),
    hbl: new Set([...usadosPor.hbl].filter(([, b]) => b !== id).map(([v]) => v)),
  });

  const plan: { id_booking: number; no_booking: string; fuente: string; cambios: Cambio[]; rechazos: Rechazo[] }[] = [];
  for (const c of correos.values()) {
    const op = ops.get(c.id_booking);
    if (!op) continue;
    const r = cambiosDesdeCorreo(c, op, navEta.get(c.id_booking) ?? null, usadosPorOtro(c.id_booking), hoy);
    if (r.cambios.length || r.rechazos.length) plan.push({ id_booking: c.id_booking, no_booking: c.no_booking, fuente: fuenteCorreo(c), ...r });
  }
  const conCambios = plan.filter((p) => p.cambios.length);
  if (probar) return Response.json({ ok: true, probar: true, bookings: conCambios.length, plan });

  let aplicadas = 0;
  let revisadas = 0;
  const resultados: { no_booking: string; etapa: string; detalle: string; ok: boolean; mensaje: string }[] = [];
  for (const p of conCambios) {
    if (Date.now() - inicio > PRESUPUESTO_MS) break;
    for (const c of p.cambios) {
      const r = await guardarEtapaCon({ supabase, ...SISTEMA }, p.id_booking, c.etapa, "EDICION", c.valores, {
        soloVacios: true,
        fuente: `${c.detalle} · ${p.fuente}`,
      });
      if (r.ok) aplicadas++;
      resultados.push({ no_booking: p.no_booking, etapa: c.etapa, detalle: c.detalle, ok: r.ok, mensaje: r.mensaje });
    }
    revisadas++;
  }
  return Response.json({
    ok: true,
    total: conCambios.length,
    aplicadas,
    errores: resultados.filter((r) => !r.ok),
    resultados,
    faltan: conCambios.length - revisadas,
  });
}
