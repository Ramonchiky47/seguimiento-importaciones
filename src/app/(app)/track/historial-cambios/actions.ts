"use server";

// Historial de cambios: todo pasa por funciones sc_* de la base, que validan el
// acceso a Track y registran cada modificación en el historial.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EventoCambio } from "./tipos";

const RUTA = "/track/historial-cambios";
const PRIORIDADES = ["alta", "media", "baja"];
const ESTADOS = ["pendiente", "en_proceso", "listo", "pospuesto", "cancelado"];
const fechaOk = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export async function crearSolicitud(_prev: { error?: string; ok?: number } | undefined, fd: FormData) {
  const nombre = String(fd.get("nombre") ?? "").trim();
  if (!nombre) return { error: "Escribe el nombre del cambio." };
  const prioridad = String(fd.get("prioridad") ?? "media");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sc_crear", {
    p_nombre: nombre.slice(0, 200),
    p_descripcion: String(fd.get("descripcion") ?? "").slice(0, 5000),
    p_solicitante: String(fd.get("solicitante") ?? "").slice(0, 200),
    p_fecha_solicitud: fechaOk(String(fd.get("fecha_solicitud") ?? "")),
    p_fecha_compromiso: fechaOk(String(fd.get("fecha_compromiso") ?? "")),
    p_alcance: String(fd.get("alcance") ?? "").slice(0, 5000),
    p_prioridad: PRIORIDADES.includes(prioridad) ? prioridad : "media",
  });
  if (error) return { error: "No se pudo guardar la solicitud." };
  revalidatePath(RUTA);
  return { ok: Number(data) };
}

export async function editarSolicitud(id: number, campos: Record<string, string>, nota?: string) {
  const limpio: Record<string, string> = {};
  for (const [k, v] of Object.entries(campos)) {
    if (k === "prioridad" && !PRIORIDADES.includes(v)) continue;
    if (k === "estado" && !ESTADOS.includes(v)) continue;
    if ((k === "fecha_solicitud" || k === "fecha_compromiso") && v && !fechaOk(v)) continue;
    if (["nombre", "descripcion", "solicitante", "alcance", "prioridad", "estado", "fecha_solicitud", "fecha_compromiso"].includes(k))
      limpio[k] = String(v).slice(0, 5000);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("sc_editar", { p_id: id, p_campos: limpio, p_nota: nota?.slice(0, 2000) ?? null });
  revalidatePath(RUTA);
  return error ? { error: "No se pudo guardar el cambio." } : { ok: true };
}

export async function moverSolicitud(id: number, dir: -1 | 1) {
  const supabase = await createClient();
  await supabase.rpc("sc_mover", { p_id: id, p_dir: dir });
  revalidatePath(RUTA);
}

export async function comentarSolicitud(id: number, texto: string) {
  if (!texto.trim()) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.rpc("sc_comentar", { p_id: id, p_texto: texto.slice(0, 5000) });
  revalidatePath(RUTA);
  return error ? { error: "No se pudo enviar el comentario." } : { ok: true };
}

export async function eventosSolicitud(id: number): Promise<EventoCambio[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sc_eventos", { p_id: id });
  return (data ?? []) as EventoCambio[];
}
