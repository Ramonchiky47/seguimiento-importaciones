"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DATE_FIELDS, TEXT_FIELDS } from "@/types/importacion";
import {
  buscarBookingConSesion,
  listarReferenciasCargolinkPorRango,
  loginCargolink,
  mapCargolinkBookingToImportacion,
  normalizeFecha,
  type CargolinkSession,
} from "@/lib/cargolink";
import { getMyPermissions } from "@/lib/permissions";

function normalizarNombre(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

// El "ejecutivo" de Cargolink se guarda en nuestro campo "operativo". Si
// todavía no existe en el catálogo de Operativos, se da de alta aquí mismo
// (sin usuario asignado) para que no se pierda y quede disponible en el
// catálogo para asignarle acceso después. La comparación normaliza espacios
// (además de mayúsculas/minúsculas) porque un simple ILIKE no detecta
// catálogo ya cargado con espacios dobles como "Vanessa  Cano" — eso
// generaba entradas duplicadas. operativosConocidos se recibe y se muta para
// poder reusarlo en un loop sin volver a consultar el catálogo en cada vuelta.
async function asegurarOperativoEnCatalogo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  operativo: string,
  operativosConocidos: Set<string>,
) {
  const clave = normalizarNombre(operativo);
  if (operativosConocidos.has(clave)) return;

  const { error } = await supabase
    .from("catalogo_operativos")
    .insert({ nombre_operativo: operativo, activo: true, user_id: null });
  if (!error) operativosConocidos.add(clave);
}

// Trae y actualiza los ~20 campos completos de un booking desde Cargolink
// (usado tanto por el botón "Actualizar" de una fila como por la
// sincronización masiva, que ahora enriquece cada registro insertado en vez
// de dejarlo con el set reducido de campos).
async function enriquecerImportacionDesdeCargolink(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: CargolinkSession,
  id: number,
  noBooking: string,
  operativosConocidos: Set<string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cargolinkBooking = await buscarBookingConSesion(session, noBooking);
  if (!cargolinkBooking) {
    return { ok: false, error: `No se encontró el booking ${noBooking} en Cargolink.` };
  }

  const payload = mapCargolinkBookingToImportacion(cargolinkBooking, noBooking);

  if (payload.operativo) {
    await asegurarOperativoEnCatalogo(supabase, payload.operativo, operativosConocidos);
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

  const payloadConOficina: Record<string, unknown> = { ...payload, oficina };

  // Cargolink no siempre tiene todavía todos los campos (p. ej. un booking
  // recién creado sin ETA todavía). Si Cargolink no trae dato para un campo,
  // no se debe borrar lo que ya estaba guardado ahí (capturado a mano o de
  // una sincronización anterior) — "Actualizar" debe completar/refrescar,
  // nunca destruir lo que ya se tenía.
  const camposAFusionar = Object.keys(payloadConOficina);
  const { data: actual } = await supabase
    .from("seguimiento_importaciones")
    .select(camposAFusionar.join(", "))
    .eq("id", id)
    .maybeSingle<Record<string, unknown>>();

  // confirmacion_48_horas y notificacion_arribo_7_dias se calculan a partir
  // de la ETA (ETA - 2 y ETA - 7), pero son solo una sugerencia inicial: el
  // operativo puede ajustarlas a mano según el caso, y una vez que ya tienen
  // un valor, "Actualizar" no debe recalcularlas encima y perder ese ajuste.
  const CAMPOS_SOLO_UNA_VEZ = new Set(["confirmacion_48_horas", "notificacion_arribo_7_dias"]);

  const payloadFinal: Record<string, unknown> = {};
  for (const campo of camposAFusionar) {
    const nuevoValor = payloadConOficina[campo];
    const valorActual = actual?.[campo] ?? null;
    if (CAMPOS_SOLO_UNA_VEZ.has(campo) && valorActual !== null) {
      payloadFinal[campo] = valorActual;
    } else {
      payloadFinal[campo] = nuevoValor !== null ? nuevoValor : valorActual;
    }
  }

  const { error: updateError } = await supabase
    .from("seguimiento_importaciones")
    .update(payloadFinal)
    .eq("id", id);

  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true };
}

async function cargarOperativosConocidos(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Set<string>> {
  const { data } = await supabase.from("catalogo_operativos").select("nombre_operativo");
  return new Set(
    (data ?? [])
      .map((o) => (o.nombre_operativo ? normalizarNombre(o.nombre_operativo) : null))
      .filter((n): n is string => Boolean(n)),
  );
}

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

  // dias_demoras ya no se captura: ahora es un cálculo (fecha actual -
  // último día libre de demoras) que se muestra al vuelo, no algo que se
  // guarde — nunca se incluye en el payload.

  const diasLibresDemoras = formData.get("dias_libres_demoras");
  payload.dias_libres_demoras = diasLibresDemoras ? Number(diasLibresDemoras) : null;

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

  const session = await loginCargolink();
  const operativosConocidos = await cargarOperativosConocidos(supabase);
  const resultado = await enriquecerImportacionDesdeCargolink(
    supabase,
    session,
    row.id,
    row.booking,
    operativosConocidos,
  );
  if (!resultado.ok) throw new Error(resultado.error);

  revalidatePath("/importaciones");
  revalidatePath(`/importaciones/${id}`);
}

// Set mínimo para la previsualización (rápida de mostrar en la tabla del
// modal) — una vez que el usuario confirma, confirmarSincronizacion() trae
// el resto de los ~20 campos por cada registro insertado (ver
// enriquecerImportacionDesdeCargolink), así no hay que dar clic en
// "Actualizar" fila por fila después de sincronizar.
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
  enriquecidos: number;
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
// Cargolink para insertarlas), y luego enriquece cada registro insertado con
// los ~20 campos completos (mismo mecanismo que el botón "Actualizar" de una
// fila), reutilizando una sola sesión de Cargolink para todo el lote en vez
// de loguearse por cada booking. Deja registro en sincronizacion_cargolink
// para poder mostrar la hora de la última actualización arriba del listado.
export async function confirmarSincronizacion(
  filas: FilaSincronizacion[],
  totalRevisados: number,
): Promise<ResultadoSincronizacion> {
  const supabase = await createClient();
  const errores: string[] = [];
  const insertadosConId: { id: number; booking: string }[] = [];

  for (let i = 0; i < filas.length; i += LOTE_SINCRONIZACION) {
    const lote = filas.slice(i, i + LOTE_SINCRONIZACION);
    // ignoreDuplicates hace que un choque contra el UNIQUE(booking) se
    // salte esa fila en vez de tumbar todo el lote (defensa extra, aunque
    // ya se filtró contra lo existente en la previsualización).
    const { data, error } = await supabase
      .from("seguimiento_importaciones")
      .upsert(lote, { onConflict: "booking", ignoreDuplicates: true })
      .select("id, booking");

    if (error) {
      errores.push(`Lote ${Math.floor(i / LOTE_SINCRONIZACION) + 1}: ${friendlyDbError(error)}`);
    } else {
      for (const r of data ?? []) insertadosConId.push(r);
    }
  }

  let enriquecidos = 0;
  if (insertadosConId.length > 0) {
    const session = await loginCargolink();
    const operativosConocidos = await cargarOperativosConocidos(supabase);
    for (const { id, booking } of insertadosConId) {
      const resultado = await enriquecerImportacionDesdeCargolink(
        supabase,
        session,
        id,
        booking,
        operativosConocidos,
      );
      if (resultado.ok) {
        enriquecidos++;
      } else {
        errores.push(`${booking}: ${resultado.error}`);
      }
    }
  }

  await supabase.from("sincronizacion_cargolink").insert({
    revisados: totalRevisados,
    nuevos: filas.length,
    insertados: insertadosConId.length,
  });

  revalidatePath("/importaciones");

  return {
    totalRevisados,
    nuevos: filas.length,
    insertados: insertadosConId.length,
    enriquecidos,
    errores,
  };
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
