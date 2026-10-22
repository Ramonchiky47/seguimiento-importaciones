import { createAdminClient } from "@/lib/supabase/admin";
import { confirmarSincronizacionCon, previsualizarSincronizacionCon } from "@/lib/sincronizacionImportaciones";

export const dynamic = "force-dynamic";
// Traer y enriquecer los bookings nuevos puede tardar varios minutos.
export const maxDuration = 300;

// Por corrida se agregan como máximo estos bookings (cada uno se enriquece
// con una consulta a Cargolink); si hay más, entran en la siguiente corrida.
const MAX_POR_CORRIDA = 120;

// "Actualizar referencias" de Importaciones, programado en vercel.json a las
// 2 PM y 7 PM (hora de CDMX). Vercel manda Authorization: Bearer CRON_SECRET.
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return Response.json({ ok: false, error: "Falta CRON_SECRET en el servidor." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }
  try {
    const supabase = createAdminClient();
    const previa = await previsualizarSincronizacionCon(supabase);
    const filas = previa.filas.slice(0, MAX_POR_CORRIDA);
    const resultado = await confirmarSincronizacionCon(supabase, filas, previa.totalRevisados);
    return Response.json({
      ok: resultado.errores.length === 0,
      ...resultado,
      pendientesParaSiguienteCorrida: previa.filas.length - filas.length,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Error en la sincronización." }, { status: 500 });
  }
}
