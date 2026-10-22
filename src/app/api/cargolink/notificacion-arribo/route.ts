import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { loginCargolink } from "@/lib/cargolink";
import { descargarNotificacionArribo } from "@/lib/operacionesMaritima";
import { corregirAcentosPdf } from "@/lib/pdfAcentos";

// PDF de notificación de arribo de Cargolink, para verlo en la app
// (?id=<id_booking>&lang=ESP|ING) o descargarlo (&descargar=1).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const idBooking = Number(params.get("id"));
  const lang = params.get("lang") === "ING" ? "ING" : "ESP";
  if (!Number.isInteger(idBooking) || idBooking <= 0) {
    return new Response("Booking no válido.", { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Inicia sesión.", { status: 401 });
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operaciones) {
    return new Response("Sin permiso de operaciones.", { status: 403 });
  }
  // Solo bookings que el usuario puede ver (clientes asignados incluidos).
  const { data: op } = await supabase
    .from("operaciones_maritima_vista")
    .select("no_booking")
    .eq("id_booking", idBooking)
    .maybeSingle();
  if (!op?.no_booking) return new Response("Operación no encontrada.", { status: 404 });

  try {
    const session = await loginCargolink();
    const original = await descargarNotificacionArribo(session, idBooking, lang);
    // Corrige los acentos que Cargolink guarda como "?"; si falla, el original.
    const pdf = await corregirAcentosPdf(original).catch(() => original);
    const nombre = `Notificacion_arribo_${String(op.no_booking).replace(/[^A-Za-z0-9-]/g, "")}_${lang}.pdf`;
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${params.get("descargar") === "1" ? "attachment" : "inline"}; filename="${nombre}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "No se pudo generar el PDF.", { status: 502 });
  }
}
