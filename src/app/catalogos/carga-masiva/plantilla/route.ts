import { getMyPermissions } from "@/lib/permissions";
import { BULK_IMPORT_FIELDS, FIELD_LABELS } from "@/types/importacion";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const EXAMPLE_ROW: Record<string, string> = {
  booking: "2604-1956-FCLI",
  estatus: "Vigente",
  fecha: "2026-08-01",
  type: "FCLI",
  client: "Cliente de Ejemplo",
  seguro: "SI",
  asegurado_por: "Mercancía",
  pol: "Shanghai",
  pod: "Manzanillo",
  contenedor: "MSKU1234567",
  cantidad_contenedores_tipo: "11 contenedores (Tipo 40 HC)",
  shipper: "ACE UNITED BUILDING SYSTEM ENGINEERING (SHANGHAI) CO., LTD.",
  direccion_recoleccion: "No. 58, Fumin Road, Hengsha, Chongming District, Shanghai, China 200333",
};

export async function GET() {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    return new Response("No tienes permiso para esta acción.", { status: 403 });
  }

  const header = BULK_IMPORT_FIELDS.map((f) => csvEscape(FIELD_LABELS[f] ?? f)).join(",");
  const exampleLine = BULK_IMPORT_FIELDS.map((f) => csvEscape(EXAMPLE_ROW[f] ?? "")).join(",");
  const csv = "﻿" + [header, exampleLine].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="plantilla-carga-masiva.csv"`,
    },
  });
}
