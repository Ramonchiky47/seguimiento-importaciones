import { createAdminClient } from "@/lib/supabase/admin";
import { SISTEMA, guardarEtapaCon, type ResultadoEtapa } from "@/lib/escrituraCargolink";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Captura puntual pedida por Ramón (datos revisados de correos y naviera): guarda
// etapas en Cargolink como "Aplicación por sistema", siempre sin finalizar
// (Guardar = EDICION) y sin notificar. Solo ATD, ETA y Origen (buque, MBL).
const ETAPAS = ["atd", "eta", "origen"];

type Cambio = { id_booking: number; etapa: string; valores: Record<string, string> };

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const claves = [process.env.CRON_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean);
  if (!claves.some((c) => auth === `Bearer ${c}`)) return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });

  const { cambios } = (await request.json()) as { cambios: Cambio[] };
  const esc = { supabase: createAdminClient(), ...SISTEMA };
  const resultados: (Cambio & ResultadoEtapa)[] = [];
  for (const c of cambios ?? []) {
    const r: ResultadoEtapa = ETAPAS.includes(c.etapa)
      ? await guardarEtapaCon(esc, c.id_booking, c.etapa, "EDICION", c.valores)
      : { ok: false, mensaje: `Etapa no permitida: ${c.etapa}` };
    resultados.push({ ...c, ...r });
  }
  return Response.json({ ok: resultados.every((r) => r.ok), resultados });
}
