"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DATE_FIELDS, TEXT_FIELDS } from "@/types/importacion";
import {
  buscarBookingCargolink,
  listarReferenciasCargolinkPorRango,
  mapCargolinkBookingToImportacion,
  normalizeFecha,
} from "@/lib/cargolink";
import { getMyPermissions } from "@/lib/permissions";

function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505" && error.message.includes("booking")) {
    return "Ya existe un registro con ese número de booking.";
  }
  return error.message;
}

function buildPayload(formData: FormData) {
  const payload: Record<string, string | number | null> = {};

  for (const field of TEXT_FIELDS) {
    if (field === "operativo") continue;
    const value = formData.get(field);
    payload[field] = value ? String(value) : null;
  }

  const operativos = formData
    .getAll("operativo")
    .map((v) => String(v))
    .filter(Boolean);
  payload.operativo = operativos.length > 0 ? operativos.join(", ") : null;

  for (const field of DATE_FIELDS) {
    const value = formData.get(field);
    payload[field] = value ? String(value) : null;
  }

  const diasDemoras = formData.get("dias_demoras");
  payload.dias_demoras = diasDemoras ? Number(diasDemoras) : null;

  payload.estatus = String(formData.get("estatus") || "Vigente");

  return payload;
}

function buildSeguro(formData: FormData): boolean {
  return formData.get("seguro") === "on";
}

export async function createImportacion(formData: FormData) {
  const supabase = await createClient();
  const payload = { ...buildPayload(formData), seguro: buildSeguro(formData) };

  const { error } = await supabase.from("seguimiento_importaciones").insert(payload);

  if (error) {
    throw new Error(friendlyDbError(error));
  }

  revalidatePath("/importaciones");
  redirect("/importaciones");
}

export async function updateImportacion(id: number, formData: FormData) {
  const supabase = await createClient();
  const payload = { ...buildPayload(formData), seguro: buildSeguro(formData) };

  const { error } = await supabase
    .from("seguimiento_importaciones")
    .update(payload)
    .eq("id", id);

  if (error) {
    throw new Error(friendlyDbError(error));
  }

  revalidatePath("/importaciones");
  redirect("/importaciones");
}

export async function actualizarImportacion(id: number) {
  const supabase = await createClient();

  const { data: row, error: rowError } = await supabase
    .from("seguimiento_importaciones")
    .select("id, booking")
    .eq("id", id)
    .maybeSingle();

  if (rowError) throw new Error(rowError.message);
  if (!row) throw new Error("Registro no encontrado.");
  if (!row.booking) throw new Error("Este registro no tiene número de booking capturado.");

  const cargolinkBooking = await buscarBookingCargolink(row.booking);
  if (!cargolinkBooking) {
    throw new Error(`No se encontró el booking ${row.booking} en Cargolink.`);
  }

  const payload = mapCargolinkBookingToImportacion(cargolinkBooking, row.booking);

  // El "ejecutivo" de Cargolink se guarda en nuestro campo "operativo". Si
  // todavía no existe en el catálogo de Operativos, se da de alta aquí mismo
  // (sin usuario asignado) para que no se pierda y quede disponible en el
  // catálogo para asignarle acceso después. La comparación normaliza
  // espacios (además de mayúsculas/minúsculas) porque un simple ILIKE no
  // detecta catálogo ya cargado con espacios dobles como "Vanessa  Cano" —
  // eso generaba entradas duplicadas.
  if (payload.operativo) {
    const normalizar = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
    const ejecutivoNormalizado = normalizar(payload.operativo);
    const { data: operativos } = await supabase
      .from("catalogo_operativos")
      .select("nombre_operativo");
    const yaExiste = (operativos ?? []).some(
      (o) => o.nombre_operativo && normalizar(o.nombre_operativo) === ejecutivoNormalizado,
    );

    if (!yaExiste) {
      await supabase
        .from("catalogo_operativos")
        .insert({ nombre_operativo: payload.operativo, activo: true, user_id: null });
    }
  }

  let oficina: string | null = null;
  if (payload.vendedor) {
    const { data: vendedorRow } = await supabase
      .from("catalogo_vendedores")
      .select("plaza")
      .ilike("vendedor", payload.vendedor)
      .maybeSingle();
    oficina = (vendedorRow?.plaza as string | undefined) ?? null;
  }

  const { error: updateError } = await supabase
    .from("seguimiento_importaciones")
    .update({ ...payload, oficina })
    .eq("id", id);

  if (updateError) throw new Error(updateError.message);

  revalidatePath("/importaciones");
  revalidatePath(`/importaciones/${id}`);
}

// Solo el mínimo para poder ubicar y filtrar la fila en el listado — el
// resto de los campos (naviera, POL/POD, MBL, fechas de tránsito, etc.) se
// llenan después con el botón "Actualizar" de cada fila, uno a la vez. Traer
// y guardar los ~20 campos completos para cientos de referencias de golpe es
// lo que hacía lento el botón de sincronizar.
export type FilaSincronizacion = {
  booking: string;
  fecha: string | null;
  type: string | null;
  vendedor: string | null;
  oficina: string | null;
  estatus: "Vigente";
};

export type PrevisualizacionSincronizacion = {
  totalRevisados: number;
  filas: FilaSincronizacion[];
};

export type ResultadoSincronizacion = {
  totalRevisados: number;
  nuevos: number;
  insertados: number;
  errores: string[];
};

// Rango fijo pedido por el usuario para no traer el año completo (más
// rápido): desde julio 2026 hasta hoy. "Hoy" se calcula en hora de México
// para que no cambie de día antes de tiempo por UTC.
const SYNC_FECHA_DESDE = "2026-07-01";
function syncFechaHasta(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

// Cuántas filas se mandan por llamada al hacer el upsert masivo. Los
// bookings encontrados pueden ser miles (todo un año), así que se agrupan en
// lotes en vez de mandar una sola llamada gigante o una por fila.
const LOTE_SINCRONIZACION = 200;

// La API de Supabase (PostgREST) recorta cada select a un máximo de filas
// por default (1000), aunque no se pida un .limit() explícito. Con la tabla
// ya por encima de eso, un select simple de "booking" se quedaba corto y el
// set de "ya cargados" salía incompleto — por eso reaparecían como
// "nuevas" referencias que ya estaban. Este helper pagina hasta traerlas
// todas, sin importar qué tan grande crezca la tabla.
async function fetchTodosLosBookings(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string[]> {
  // 500 y no 1000 a propósito: el "max rows" configurado en Supabase puede
  // ser menor a 1000, y si se pidiera más de lo que el server realmente
  // entrega por página, el corte silencioso volvería a pasar.
  const TAM_PAGINA = 500;
  const bookings: string[] = [];
  let desde = 0;

  while (true) {
    const { data, error } = await supabase
      .from("seguimiento_importaciones")
      .select("booking")
      .range(desde, desde + TAM_PAGINA - 1);
    if (error) throw new Error(error.message);

    const pagina = data ?? [];
    for (const r of pagina) {
      if (r.booking) bookings.push(r.booking);
    }
    if (pagina.length < TAM_PAGINA) break;
    desde += TAM_PAGINA;
  }

  return bookings;
}

// Paso 1: trae del Concentrado de Cargolink las referencias FCLI/LCLI del
// rango de fechas, las compara contra lo ya cargado en
// seguimiento_importaciones (sin distinguir mayúsculas/minúsculas, porque
// hay registros históricos con el booking en minúsculas) y regresa solo la
// diferencia YA MAPEADA, lista para mostrarse en la ventana de confirmación
// — no inserta nada todavía.
export async function previsualizarSincronizacion(): Promise<PrevisualizacionSincronizacion> {
  const referencias = await listarReferenciasCargolinkPorRango(SYNC_FECHA_DESDE, syncFechaHasta());

  const supabase = await createClient();

  const [bookingsExistentes, { data: vendedores, error: vendedoresError }] = await Promise.all([
    fetchTodosLosBookings(supabase),
    supabase.from("catalogo_vendedores").select("vendedor, plaza"),
  ]);
  if (vendedoresError) throw new Error(vendedoresError.message);

  const yaCargados = new Set(
    bookingsExistentes.map((b) => b.trim().toUpperCase()).filter(Boolean),
  );

  const plazaPorVendedor = new Map<string, string | null>();
  for (const v of vendedores ?? []) {
    const nombre = (v.vendedor ?? "").trim().toUpperCase();
    if (nombre) plazaPorVendedor.set(nombre, v.plaza);
  }

  const vistos = new Set<string>();
  const aInsertar = referencias.filter((r) => {
    const key = r.noBooking.toUpperCase();
    if (yaCargados.has(key) || vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });

  const filas: FilaSincronizacion[] = aInsertar.map((ref) => {
    const vendedor = ref.booking.nameVend?.trim() || null;
    const type = ref.noBooking.length > 10 ? ref.noBooking.slice(10) : null;
    const oficina = vendedor ? (plazaPorVendedor.get(vendedor.trim().toUpperCase()) ?? null) : null;
    return {
      booking: ref.noBooking,
      fecha: normalizeFecha(ref.booking.fecha_creacion),
      type,
      vendedor,
      oficina,
      estatus: "Vigente" as const,
    };
  });

  return { totalRevisados: referencias.length, filas };
}

// Paso 2: inserta las filas que el usuario confirmó en la ventana de
// previsualización (se reciben ya armadas, no se vuelve a consultar
// Cargolink) y deja registro en sincronizacion_cargolink para poder mostrar
// la hora de la última actualización arriba del listado.
export async function confirmarSincronizacion(
  filas: FilaSincronizacion[],
  totalRevisados: number,
): Promise<ResultadoSincronizacion> {
  const supabase = await createClient();
  const errores: string[] = [];
  let insertados = 0;

  for (let i = 0; i < filas.length; i += LOTE_SINCRONIZACION) {
    const lote = filas.slice(i, i + LOTE_SINCRONIZACION);
    // ignoreDuplicates hace que un choque contra el UNIQUE(booking) se
    // salte esa fila en vez de tumbar todo el lote (defensa extra, aunque
    // ya se filtró contra lo existente en la previsualización).
    const { data, error } = await supabase
      .from("seguimiento_importaciones")
      .upsert(lote, { onConflict: "booking", ignoreDuplicates: true })
      .select("booking");

    if (error) {
      errores.push(`Lote ${Math.floor(i / LOTE_SINCRONIZACION) + 1}: ${friendlyDbError(error)}`);
    } else {
      insertados += data?.length ?? 0;
    }
  }

  await supabase
    .from("sincronizacion_cargolink")
    .insert({ revisados: totalRevisados, nuevos: filas.length, insertados });

  revalidatePath("/importaciones");

  return { totalRevisados, nuevos: filas.length, insertados, errores };
}

// Hora de la última corrida (exitosa o no) de "Actualizar referencias",
// para mostrarla arriba del listado.
export async function obtenerUltimaSincronizacion(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sincronizacion_cargolink")
    .select("ejecutado_en")
    .order("ejecutado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.ejecutado_en as string | undefined) ?? null;
}

export async function addIncidencia(importacionId: number, formData: FormData) {
  const supabase = await createClient();
  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) throw new Error("El texto de la incidencia no puede estar vacío.");

  const { error } = await supabase
    .from("incidencias_importacion")
    .insert({ importacion_id: importacionId, texto });

  if (error) throw new Error(error.message);

  revalidatePath(`/importaciones/${importacionId}`);
}

export async function deleteIncidencia(importacionId: number, incidenciaId: number) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.puede_borrar) throw new Error("No tienes permiso para borrar.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("incidencias_importacion")
    .delete()
    .eq("id", incidenciaId);

  if (error) throw new Error(error.message);

  revalidatePath(`/importaciones/${importacionId}`);
}

export async function deleteImportacion(id: number) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.puede_borrar) throw new Error("No tienes permiso para borrar.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("seguimiento_importaciones")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/importaciones");
}
