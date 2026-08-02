"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { parseBulkImportText } from "@/lib/bulkImportacion";

export type BulkImportResult = {
  created: number;
  updated: number;
  errors: string[];
  warnings: string[];
};

export async function bulkImportImportaciones(text: string): Promise<BulkImportResult> {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    throw new Error("Solo un administrador puede usar la carga masiva.");
  }

  const { rows, rejected } = parseBulkImportText(text);

  const errors: string[] = rejected.map((r) => `Línea ${r.line}: ${r.reason}`);
  const warnings: string[] = [];
  let created = 0;
  let updated = 0;

  const supabase = await createClient();

  for (const row of rows) {
    for (const w of row.warnings) {
      warnings.push(`Línea ${row.line}: ${w}`);
    }

    const booking = String(row.payload.booking);
    const { data: existing, error: lookupError } = await supabase
      .from("seguimiento_importaciones")
      .select("id")
      .eq("booking", booking)
      .maybeSingle();

    if (lookupError) {
      errors.push(`Línea ${row.line} (${booking}): ${lookupError.message}`);
      continue;
    }

    if (existing) {
      const { error } = await supabase
        .from("seguimiento_importaciones")
        .update(row.payload)
        .eq("id", existing.id);
      if (error) {
        errors.push(`Línea ${row.line} (${booking}): ${error.message}`);
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase.from("seguimiento_importaciones").insert(row.payload);
      if (error) {
        errors.push(`Línea ${row.line} (${booking}): ${error.message}`);
      } else {
        created++;
      }
    }
  }

  if (created > 0 || updated > 0) {
    revalidatePath("/importaciones");
  }

  return { created, updated, errors, warnings };
}
