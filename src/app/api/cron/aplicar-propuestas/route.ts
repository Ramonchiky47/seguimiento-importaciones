import { createAdminClient } from "@/lib/supabase/admin";
import { ESTATUS_TRACK, estatusBooking, periodoAtd } from "@/lib/track";
import { SISTEMA, guardarEtapaCon, guardarTransbordosCon, type ResultadoEtapa } from "@/lib/escrituraCargolink";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Aplicación automática de las propuestas de Track > Propuestas con confianza
// alta (las mismas que la pantalla deja marcadas), a las 8:00 y 14:00 desde la
// Mac (com.ramon.aplicar-propuestas). En la bitácora quedan como "Aplicación por
// sistema". Cada guardado en Cargolink tarda unos segundos: se aplica lo que
// quepa en el tiempo y se regresa cuántas faltan para volver a llamar.
// ETA con la etapa ya finalizada en Cargolink (eta_naviera_info): se libera la
// etapa (Liberar etapas) y se guarda la de la naviera, solo si difiere 30 días
// o menos de la de Cargolink, o si la de Cargolink no puede ser real (igual o
// anterior al zarpe, o anterior a un transbordo que reporta la naviera: se
// capturó mal). Las demás diferencias mayores se revisan a mano.
// ATA finalizada que la naviera contradice con su arribo real
// (ata_naviera_info con ATA de la naviera): se libera y se guarda finalizada
// con la de la naviera, si difiere 30 días o menos. La ATA anticipada (la
// naviera aún no arriba) no se puede dejar vacía: sigue a mano.
const PRESUPUESTO_MS = 260_000;
const TIPOS = ["eta_naviera", "ata_naviera", "transbordo", "eta", "eta_finalizar", "dias", "eta_naviera_info", "ata_naviera_info"];
const MAX_DIAS_LIBERAR = 30;

type Propuesta = {
  id_booking: number;
  no_booking: string;
  tipo: string;
  valor: string;
  confianza: string;
  eta_cargolink?: string | null;
  ata_cargolink?: string | null;
  nav_ata?: string | null;
};

const diasEntre = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
// limite: zarpe o último transbordo de la naviera, lo más tardío.
const liberable = (p: Propuesta, limite: string | undefined) => {
  if (!p.eta_cargolink || !p.valor) return false;
  if (Math.abs(diasEntre(p.eta_cargolink, p.valor)) <= MAX_DIAS_LIBERAR) return true;
  return Boolean(limite && p.eta_cargolink.slice(0, 10) <= limite.slice(0, 10));
};
const ataCorregible = (p: Propuesta) =>
  Boolean(p.nav_ata && p.valor && p.nav_ata.slice(0, 10) === p.valor.slice(0, 10)) &&
  (!p.ata_cargolink || Math.abs(diasEntre(p.ata_cargolink, p.valor)) <= MAX_DIAS_LIBERAR);

function aplicar(p: Propuesta): Promise<ResultadoEtapa> {
  const esc = { supabase: createAdminClient(), ...SISTEMA };
  // Igual que "Revisar y confirmar" en la pantalla.
  if (p.tipo === "eta_naviera_info") return guardarEtapaCon(esc, p.id_booking, "eta", "EDICION", { buque_eta: p.valor });
  if (p.tipo === "ata_naviera_info") return guardarEtapaCon(esc, p.id_booking, "ata", "FINALIZADO", { fecha_ata: p.valor });
  if (p.tipo === "eta_naviera" || p.tipo === "eta") return guardarEtapaCon(esc, p.id_booking, "eta", "EDICION", { buque_eta: p.valor });
  if (p.tipo === "ata_naviera") return guardarEtapaCon(esc, p.id_booking, "ata", "EDICION", { fecha_ata: p.valor });
  if (p.tipo === "eta_finalizar") return guardarEtapaCon(esc, p.id_booking, "eta", "FINALIZADO", { buque_eta: p.valor });
  if (p.tipo === "transbordo") return guardarTransbordosCon(esc, p.id_booking, "NO_APLICA", []);
  return guardarEtapaCon(esc, p.id_booking, "ata", "EDICION", { dias_demora: p.valor });
}

export async function GET(request: Request) {
  // Vercel (CRON_SECRET) o la Mac (clave de servicio de Supabase).
  const auth = request.headers.get("authorization") ?? "";
  const claves = [process.env.CRON_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean);
  if (!claves.some((c) => auth === `Bearer ${c}`)) return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });

  const inicio = Date.now();
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("track_propuestas_v2", {
    p_ejecutivos: null,
    p_estatus: estatusBooking(undefined, ESTATUS_TRACK).codigos,
    p_atd: periodoAtd(undefined).codigos,
  });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const todas = ((data ?? []) as Propuesta[]).filter((p) => p.confianza === "alta" && TIPOS.includes(p.tipo));
  const ids = todas.filter((p) => p.tipo === "eta_naviera_info").map((p) => p.id_booking);
  const limites = new Map<number, string>();
  if (ids.length) {
    const [{ data: ops }, { data: navs }] = await Promise.all([
      supabase.from("operaciones_maritima").select("id_booking, etd_atd").in("id_booking", ids),
      supabase.from("tracking_naviera").select("id_booking, transbordos").in("id_booking", ids).eq("ok", true),
    ]);
    for (const o of (ops ?? []) as { id_booking: number; etd_atd: string | null }[]) if (o.etd_atd) limites.set(o.id_booking, o.etd_atd);
    for (const n of (navs ?? []) as { id_booking: number; transbordos: { fecha: string | null }[] | null }[]) {
      for (const t of n.transbordos ?? []) {
        if (t.fecha && t.fecha > (limites.get(n.id_booking) ?? "")) limites.set(n.id_booking, t.fecha);
      }
    }
  }
  const lista = todas.filter((p) =>
    p.tipo === "eta_naviera_info" ? liberable(p, limites.get(p.id_booking)) : p.tipo === "ata_naviera_info" ? ataCorregible(p) : true,
  );

  let aplicadas = 0;
  const errores: { no_booking: string; tipo: string; mensaje: string }[] = [];
  for (const p of lista) {
    if (Date.now() - inicio > PRESUPUESTO_MS) break;
    const r = await aplicar(p);
    if (r.ok) aplicadas++;
    else errores.push({ no_booking: p.no_booking, tipo: p.tipo, mensaje: r.mensaje });
  }
  const revisadas = aplicadas + errores.length;
  return Response.json({ ok: true, total: lista.length, aplicadas, errores, faltan: lista.length - revisadas });
}
