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
// o menos de la de Cargolink; las diferencias mayores se revisan a mano.
const PRESUPUESTO_MS = 260_000;
const TIPOS = ["eta_naviera", "ata_naviera", "transbordo", "eta", "eta_finalizar", "dias", "eta_naviera_info"];
const MAX_DIAS_LIBERAR = 30;

type Propuesta = { id_booking: number; no_booking: string; tipo: string; valor: string; confianza: string; eta_cargolink?: string | null };

const diasEntre = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
const liberable = (p: Propuesta) =>
  Boolean(p.eta_cargolink && p.valor) && Math.abs(diasEntre(p.eta_cargolink as string, p.valor)) <= MAX_DIAS_LIBERAR;

function aplicar(p: Propuesta): Promise<ResultadoEtapa> {
  const esc = { supabase: createAdminClient(), ...SISTEMA };
  // Igual que "Revisar y confirmar" en la pantalla.
  if (p.tipo === "eta_naviera_info") return guardarEtapaCon(esc, p.id_booking, "eta", "EDICION", { buque_eta: p.valor }, { liberar: true });
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
  const lista = ((data ?? []) as Propuesta[]).filter((p) => p.confianza === "alta" && TIPOS.includes(p.tipo) && (p.tipo !== "eta_naviera_info" || liberable(p)));

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
