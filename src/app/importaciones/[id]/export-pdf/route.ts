import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { buildImportacionPdf } from "@/lib/importacionPdf";
import { calcularDiasDemoras } from "@/lib/dateLabels";
import type { Importacion, Incidencia } from "@/types/importacion";

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
    .from("seguimiento_importaciones")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return new Response(`Error al generar el PDF: ${error.message}`, { status: 500 });
  }
  if (!row) {
    return new Response("Registro no encontrado.", { status: 404 });
  }

  (row as Importacion).dias_demoras = calcularDiasDemoras(
    (row as Importacion).ultimo_dia_libre_demoras,
  );

  const { data: incidenciasData } = await supabase
    .from("incidencias_importacion")
    .select("*")
    .eq("importacion_id", id)
    .order("created_at", { ascending: false });

  const doc = buildImportacionPdf(row as Importacion, (incidenciasData ?? []) as Incidencia[]);
  const arrayBuffer = doc.output("arraybuffer") as ArrayBuffer;

  const fileSlug = ((row as Importacion).booking || `registro-${id}`).replace(/[^a-zA-Z0-9-]+/g, "-");

  return new Response(arrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileSlug}.pdf"`,
    },
  });
}
