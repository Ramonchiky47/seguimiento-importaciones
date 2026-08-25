import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { buildExportacionPdf } from "@/lib/exportacionPdf";
import { calcularDiasDemoras } from "@/lib/dateLabels";
import type { Exportacion, Incidencia } from "@/types/exportacion";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.puede_exportar) {
    return new Response("No tienes permiso para exportar.", { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("seguimiento_exportaciones")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return new Response(`Error al generar el PDF: ${error.message}`, { status: 500 });
  }
  if (!row) {
    return new Response("Registro no encontrado.", { status: 404 });
  }

  (row as Exportacion).dias_demoras = calcularDiasDemoras(
    (row as Exportacion).ultimo_dia_libre_demoras,
  );

  const { data: incidenciasData } = await supabase
    .from("incidencias_exportacion")
    .select("*")
    .eq("exportacion_id", id)
    .order("created_at", { ascending: false });

  const doc = buildExportacionPdf(row as Exportacion, (incidenciasData ?? []) as Incidencia[]);
  const arrayBuffer = doc.output("arraybuffer") as ArrayBuffer;

  const fileSlug = ((row as Exportacion).booking || `registro-${id}`).replace(/[^a-zA-Z0-9-]+/g, "-");

  return new Response(arrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileSlug}.pdf"`,
    },
  });
}
