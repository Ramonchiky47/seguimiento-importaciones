import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import {
  buscarBookingConSesion,
  listarReferenciasCargolinkPorRango,
  loginCargolink,
  mapCargolinkBookingToImportacion,
  normalizeFecha,
  type CargolinkSession,
} from "./cargolink";

function normalizarNombre(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function getBackgroundSupabaseClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceRoleKey || anonKey;

  if (!url || !key) {
    throw new Error("Faltan las variables de entorno NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const client = createSupabaseClient(url, key, {
    auth: { persistSession: false },
  });

  if (!serviceRoleKey) {
    const email = process.env.AGENT_SUPABASE_EMAIL;
    const password = process.env.AGENT_SUPABASE_PASSWORD;
    if (email && password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        console.warn("[SYNC] Error al autenticar usuario de fondo en Supabase:", error.message);
      }
    }
  }

  return client;
}

async function asegurarOperativoEnCatalogo(
  supabase: SupabaseClient,
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

async function enriquecerImportacionDesdeCargolink(
  supabase: SupabaseClient,
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

  const camposAFusionar = Object.keys(payloadConOficina);
  const { data: actual } = await supabase
    .from("seguimiento_importaciones")
    .select(camposAFusionar.join(", "))
    .eq("id", id)
    .maybeSingle<Record<string, unknown>>();

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
  supabase: SupabaseClient,
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

const SYNC_FECHA_DESDE = "2026-07-01";
function syncFechaHasta(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

const LOTE_SINCRONIZACION = 200;

async function fetchTodosLosBookings(supabase: SupabaseClient): Promise<string[]> {
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

export async function previsualizarSincronizacion(
  client?: SupabaseClient,
): Promise<PrevisualizacionSincronizacion> {
  const referencias = await listarReferenciasCargolinkPorRango(SYNC_FECHA_DESDE, syncFechaHasta());
  const supabase = client ?? (await getBackgroundSupabaseClient());

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

export async function confirmarSincronizacion(
  client: SupabaseClient | undefined,
  filas: FilaSincronizacion[],
  totalRevisados: number,
): Promise<ResultadoSincronizacion> {
  const supabase = client ?? (await getBackgroundSupabaseClient());
  const errores: string[] = [];
  const insertadosConId: { id: number; booking: string }[] = [];

  for (let i = 0; i < filas.length; i += LOTE_SINCRONIZACION) {
    const lote = filas.slice(i, i + LOTE_SINCRONIZACION);
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

  try {
    revalidatePath("/importaciones");
  } catch {
    // Si se ejecuta fuera de contexto de Server Components/Actions, ignorar revalidatePath
  }

  return {
    totalRevisados,
    nuevos: filas.length,
    insertados: insertadosConId.length,
    enriquecidos,
    errores,
  };
}

// Función principal para la sincronización automática (utilizada por Cron / Agente)
export async function ejecutarSincronizacionAutomatica(client?: SupabaseClient): Promise<ResultadoSincronizacion> {
  const supabase = client ?? (await getBackgroundSupabaseClient());
  
  // 1. Obtener referencias faltantes desde Cargolink
  const preview = await previsualizarSincronizacion(supabase);
  
  if (preview.filas.length === 0) {
    // Registrar evento de verificación sin nuevos registros
    await supabase.from("sincronizacion_cargolink").insert({
      revisados: preview.totalRevisados,
      nuevos: 0,
      insertados: 0,
    });

    try {
      revalidatePath("/importaciones");
    } catch {
      // Ignorar si se corre fuera de Next.js request context
    }

    return {
      totalRevisados: preview.totalRevisados,
      nuevos: 0,
      insertados: 0,
      enriquecidos: 0,
      errores: [],
    };
  }

  // 2. Insertar y enriquecer automáticamente todas las filas encontradas
  return await confirmarSincronizacion(supabase, preview.filas, preview.totalRevisados);
}
