"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";

export type ResultadoAsignacion = { ok: boolean; mensaje: string };

// El campo del formulario trae "NOMBRE DEL CLIENTE (#123)" (de la lista de
// sugerencias); se toma el id del final.
function idDeCliente(texto: string): number | null {
  const m = texto.match(/\(#(\d+)\)\s*$/);
  return m ? Number(m[1]) : null;
}

export async function asignarCliente(operativoId: number, formData: FormData): Promise<ResultadoAsignacion> {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) return { ok: false, mensaje: "Solo los administradores asignan clientes." };

  const texto = String(formData.get("cliente") ?? "").trim();
  const idCliente = idDeCliente(texto);
  if (!idCliente) return { ok: false, mensaje: "Elige un cliente de la lista de sugerencias." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: cliente } = await supabase
    .from("operaciones_maritima")
    .select("cliente")
    .eq("id_cliente", idCliente)
    .limit(1)
    .maybeSingle();
  if (!cliente) return { ok: false, mensaje: "Cliente no encontrado en Operaciones Marítima." };

  const { error } = await supabase.from("track_clientes_asignados").insert({
    operativo_id: operativoId,
    id_cliente: idCliente,
    cliente: cliente.cliente,
    asignado_por: user?.email ?? null,
  });
  if (error) {
    return {
      ok: false,
      mensaje: error.code === "23505" ? "Ese cliente ya está asignado a este operativo." : `No se pudo asignar: ${error.message}`,
    };
  }
  revalidatePath("/track", "layout");
  return { ok: true, mensaje: `${cliente.cliente} asignado.` };
}

export async function quitarCliente(asignacionId: number): Promise<ResultadoAsignacion> {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) return { ok: false, mensaje: "Solo los administradores quitan clientes." };
  const supabase = await createClient();
  const { error } = await supabase.from("track_clientes_asignados").delete().eq("id", asignacionId);
  if (error) return { ok: false, mensaje: `No se pudo quitar: ${error.message}` };
  revalidatePath("/track", "layout");
  return { ok: true, mensaje: "Cliente quitado." };
}
