"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { loginCargolink } from "@/lib/cargolink";
import { ETAPAS_CARGOLINK } from "@/lib/etapasCargolink";
import {
  descargarOperacionesRecientes,
  eliminarTransbordoEnCargolink,
  guardarEtapaEnCargolink,
  guardarTransbordosEnCargolink,
  leerBookingMaritimo,
  leerTransbordos,
  mapOperacionMaritima,
  type FilaTransbordo,
} from "@/lib/operacionesMaritima";

// Deja margen dentro del maxDuration (300 s) de la página para el upsert.
const PRESUPUESTO_DESCARGA_MS = 200_000;
// El botón Actualizar trae completas las operaciones desde esta fecha; las
// anteriores las mantiene al día la carga programada.
const ACTUALIZAR_DESDE = "2026-01-01";
const LOTE = 500;

export type ResultadoActualizacion = { actualizadas: number; total: number; completo: boolean };

export async function actualizarOperacionesMaritima(): Promise<ResultadoActualizacion> {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    throw new Error("Solo los administradores pueden actualizar desde Cargolink.");
  }

  const { registros, total, completo } = await descargarOperacionesRecientes(
    PRESUPUESTO_DESCARGA_MS,
    ACTUALIZAR_DESDE,
  );

  const sincronizadoAt = new Date().toISOString();
  const filas = new Map<number, Record<string, unknown>>();
  for (const r of registros) {
    const fila = mapOperacionMaritima(r);
    if (Number.isFinite(fila.id_booking)) filas.set(fila.id_booking, { ...fila, sincronizado_at: sincronizadoAt });
  }
  const lista = Array.from(filas.values());

  const supabase = await createClient();
  for (let i = 0; i < lista.length; i += LOTE) {
    const { error } = await supabase
      .from("operaciones_maritima")
      .upsert(lista.slice(i, i + LOTE), { onConflict: "id_booking" });
    if (error) throw new Error(`Error al guardar en la base de datos: ${error.message}`);
  }

  revalidatePath("/operaciones-maritima");
  return { actualizadas: lista.length, total, completo };
}

export type ResultadoEtapa = { ok: boolean; mensaje: string };

// Escribe una etapa en Cargolink desde la ventana de indicadores. Devuelve el
// resultado en vez de lanzar error para que el mensaje real llegue al usuario
// (en producción Next oculta el texto de los errores).
export async function guardarEtapaCargolink(
  idBooking: number,
  etapaKey: string,
  status: string,
  valores: Record<string, string>,
): Promise<ResultadoEtapa> {
  // PILOTO: escriben en Cargolink los administradores y los usuarios de la
  // tabla editores_cargolink (función puedo_editar_cargolink).
  const supabase = await createClient();
  const { data: puedeEditar } = await supabase.rpc("puedo_editar_cargolink");
  if (puedeEditar !== true) {
    return { ok: false, mensaje: "No tienes autorización para editar en Cargolink (piloto)." };
  }
  const etapa = ETAPAS_CARGOLINK[etapaKey];
  const accion = etapa?.acciones.find((a) => a.status === status);
  if (!etapa || !accion) return { ok: false, mensaje: "Etapa o acción no válida." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: op } = await supabase
    .from("operaciones_maritima")
    .select("no_booking")
    .eq("id_booking", idBooking)
    .maybeSingle();
  if (!op?.no_booking) return { ok: false, mensaje: "Operación no encontrada." };
  const noBooking = op.no_booking as string;

  // Nombre del usuario para la bitácora (operativo ligado a su cuenta).
  const { data: operativo } = user
    ? await supabase.from("catalogo_operativos").select("nombre_operativo").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const usuarioNombre = (operativo?.nombre_operativo as string | undefined) ?? user?.email ?? null;

  // Lo que tenía y lo que quedó en Cargolink (campos de la etapa + estatus).
  const camposEtapa = (b: Record<string, unknown> | null) =>
    b ? Object.fromEntries(etapa.campos.map((c) => [c.key, b[c.key] ?? null])) : null;
  let valoresAntes: Record<string, unknown> | null = null;
  let valoresDespues: Record<string, unknown> | null = null;
  let estatusAntes: string | null = null;
  let estatusDespues: string | null = null;

  const bitacora = async (ok: boolean, mensaje: string, cambios: Record<string, string>) => {
    await supabase.from("bitacora_cargolink").insert({
      id_booking: idBooking,
      no_booking: noBooking,
      etapa: etapa.key,
      accion: accion.status,
      valores: cambios,
      valores_antes: valoresAntes,
      valores_despues: valoresDespues,
      estatus_antes: estatusAntes,
      estatus_despues: estatusDespues,
      usuario_email: user?.email ?? null,
      usuario_nombre: usuarioNombre,
      ok,
      mensaje,
    });
  };

  // Solo los campos de la etapa; vacío = no se cambia.
  const cambios: Record<string, string> = {};
  for (const c of etapa.campos) {
    const v = (valores[c.key] ?? "").trim();
    if (v) {
      if (c.tipo === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, mensaje: `${c.label}: fecha no válida.` };
      if (c.tipo === "number" && !/^\d{1,3}$/.test(v)) return { ok: false, mensaje: `${c.label}: número no válido.` };
      cambios[c.key] = v;
    }
  }

  try {
    const session = await loginCargolink();
    const booking = await leerBookingMaritimo(session, noBooking);
    if (!booking) return { ok: false, mensaje: `No se encontró ${noBooking} en Servicios marítimos de Cargolink.` };
    valoresAntes = camposEtapa(booking);
    estatusAntes = (booking[etapa.mov] as string | undefined) || "SIN_COMENZAR";
    if (booking[etapa.mov] === "FINALIZADO") {
      return { ok: false, mensaje: `${etapa.label} ya está finalizada en Cargolink; ahí tampoco se puede editar.` };
    }
    if (accion.resultado !== "NO_APLICA") {
      for (const c of etapa.campos) {
        const valorFinal = cambios[c.key] ?? (booking[c.key] as string | undefined) ?? "";
        if (c.requerido && (!valorFinal || String(valorFinal).startsWith("0000"))) {
          return { ok: false, mensaje: `Falta ${c.label} (Cargolink la pide como obligatoria).` };
        }
      }
    }

    const payload = {
      ...booking,
      ...cambios,
      ...(etapa.desdeEtapa ? { desdeEtapa: etapa.desdeEtapa } : {}),
      // Nunca notificar al cliente desde la app.
      emailCliente: "",
      check_notificacion_arribo: false,
      notificarCliente: false,
      notificarCorresponsal: false,
    };
    const respuesta = await guardarEtapaEnCargolink(session, etapa.fn, accion.status, payload);
    if (respuesta.status_conexion !== "OK") {
      const msg = `Cargolink no confirmó el guardado: ${JSON.stringify(respuesta).slice(0, 200)}`;
      await bitacora(false, msg, cambios);
      return { ok: false, mensaje: msg };
    }

    // Confirmar releyendo de Cargolink: estatus de la etapa y valores.
    const despues = await leerBookingMaritimo(session, noBooking);
    valoresDespues = camposEtapa(despues);
    estatusDespues = despues ? ((despues[etapa.mov] as string | undefined) || "SIN_COMENZAR") : null;
    if (!despues) {
      await bitacora(false, "Guardado, pero no se pudo releer el booking.", cambios);
      return { ok: false, mensaje: "Cargolink aceptó el guardado, pero no se pudo releer el booking para confirmarlo." };
    }
    const noCuadran = Object.entries(cambios).filter(([k, v]) => String(despues[k] ?? "").slice(0, v.length) !== v);
    if (despues[etapa.mov] !== accion.resultado || noCuadran.length > 0) {
      const msg = `Cargolink respondió OK pero quedó: etapa ${String(despues[etapa.mov] ?? "sin estatus")}${
        noCuadran.length ? `, campos sin cambio: ${noCuadran.map(([k]) => k).join(", ")}` : ""
      }.`;
      await bitacora(false, msg, cambios);
      return { ok: false, mensaje: msg };
    }

    const { error: errRefresco } = await supabase.rpc("refrescar_operacion_maritima", {
      p_row: { ...mapOperacionMaritima(despues), sincronizado_at: new Date().toISOString() },
    });
    const mensaje = `${etapa.label}: ${accion.label.toLowerCase()} en Cargolink.${
      errRefresco ? " (La app se actualizará en la próxima carga.)" : ""
    }`;
    await bitacora(true, mensaje, cambios);
    revalidatePath("/operaciones-maritima");
    revalidatePath("/track", "layout");
    return { ok: true, mensaje };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al comunicarse con Cargolink.";
    await bitacora(false, msg, cambios);
    return { ok: false, mensaje: msg };
  }
}

// Al abrir la ventana de indicadores: relee ESE booking de Cargolink (solo
// lectura) y actualiza su fila en la app, para no depender de la última
// carga programada.
export async function refrescarOperacionDesdeCargolink(idBooking: number): Promise<ResultadoEtapa> {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operaciones) {
    return { ok: false, mensaje: "Sin permiso de operaciones." };
  }
  const supabase = await createClient();
  const { data: op } = await supabase
    .from("operaciones_maritima")
    .select("no_booking")
    .eq("id_booking", idBooking)
    .maybeSingle();
  if (!op?.no_booking) return { ok: false, mensaje: "Operación no encontrada." };

  try {
    const session = await loginCargolink();
    const booking = await leerBookingMaritimo(session, op.no_booking as string);
    if (!booking) {
      return { ok: false, mensaje: "No aparece en Servicios marítimos de Cargolink (¿archivado?)." };
    }
    const { error } = await supabase.rpc("refrescar_operacion_maritima", {
      p_row: { ...mapOperacionMaritima(booking), sincronizado_at: new Date().toISOString() },
    });
    if (error) return { ok: false, mensaje: `No se pudo actualizar en la app: ${error.message}` };
    return { ok: true, mensaje: "Actualizado desde Cargolink." };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "Error al consultar Cargolink." };
  }
}

// ---- Transbordo: filas propias en Cargolink (consultaTransbordo /
// registraTransitoTransbordo / eliminarTransbordo).

export type FilaTransbordoForm = {
  id_booking_transbordo?: string;
  fecha_arribo: string;
  punto: string;
  fecha_arribo_real: string;
  fecha_zarpe: string;
  fecha_zarpe_real: string;
};

const CAMPOS_FECHA_TRANSBORDO = ["fecha_arribo", "fecha_arribo_real", "fecha_zarpe", "fecha_zarpe_real"] as const;

function fechaCargolink(v: unknown): string {
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !s.startsWith("0000") ? s : "";
}

function filaParaForm(f: FilaTransbordo): FilaTransbordoForm {
  return {
    id_booking_transbordo: f.id_booking_transbordo ? String(f.id_booking_transbordo) : undefined,
    fecha_arribo: fechaCargolink(f.fecha_arribo),
    punto: typeof f.punto === "string" ? f.punto : "",
    fecha_arribo_real: fechaCargolink(f.fecha_arribo_real),
    fecha_zarpe: fechaCargolink(f.fecha_zarpe),
    fecha_zarpe_real: fechaCargolink(f.fecha_zarpe_real),
  };
}

// Contexto común: permiso de editor, booking y bitácora.
async function contextoTransbordo(idBooking: number) {
  const supabase = await createClient();
  const { data: puedeEditar } = await supabase.rpc("puedo_editar_cargolink");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: op } = await supabase
    .from("operaciones_maritima")
    .select("no_booking")
    .eq("id_booking", idBooking)
    .maybeSingle();
  const { data: operativo } = user
    ? await supabase.from("catalogo_operativos").select("nombre_operativo").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const bitacora = async (registro: {
    accion: string;
    ok: boolean;
    mensaje: string;
    valores?: unknown;
    valores_antes?: unknown;
    valores_despues?: unknown;
    estatus_antes?: string | null;
    estatus_despues?: string | null;
  }) => {
    await supabase.from("bitacora_cargolink").insert({
      id_booking: idBooking,
      no_booking: (op?.no_booking as string | undefined) ?? String(idBooking),
      etapa: "transbordo",
      usuario_email: user?.email ?? null,
      usuario_nombre: (operativo?.nombre_operativo as string | undefined) ?? user?.email ?? null,
      ...registro,
    });
  };
  return { supabase, puedeEditar: puedeEditar === true, noBooking: op?.no_booking as string | undefined, bitacora };
}

export async function leerTransbordosCargolink(
  idBooking: number,
): Promise<{ ok: boolean; mensaje: string; filas: FilaTransbordoForm[]; estatus: string | null }> {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operaciones) {
    return { ok: false, mensaje: "Sin permiso de operaciones.", filas: [], estatus: null };
  }
  const { noBooking } = await contextoTransbordo(idBooking);
  if (!noBooking) return { ok: false, mensaje: "Operación no encontrada.", filas: [], estatus: null };
  try {
    const session = await loginCargolink();
    const [filas, booking] = await Promise.all([leerTransbordos(session, idBooking), leerBookingMaritimo(session, noBooking)]);
    return {
      ok: true,
      mensaje: "",
      filas: filas.map(filaParaForm),
      estatus: (booking?.his_mov_transbordo as string | undefined) || null,
    };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "Error al leer transbordos.", filas: [], estatus: null };
  }
}

export async function guardarTransbordosCargolink(
  idBooking: number,
  status: string,
  filasForm: FilaTransbordoForm[],
): Promise<ResultadoEtapa> {
  const etapa = ETAPAS_CARGOLINK.transbordo;
  const accion = etapa.acciones.find((a) => a.status === status);
  if (!accion) return { ok: false, mensaje: "Acción no válida." };
  const { supabase, puedeEditar, noBooking, bitacora } = await contextoTransbordo(idBooking);
  if (!puedeEditar) return { ok: false, mensaje: "No tienes autorización para editar en Cargolink (piloto)." };
  if (!noBooking) return { ok: false, mensaje: "Operación no encontrada." };

  // Validar: fechas YYYY-MM-DD y arribo estimado obligatorio (salvo No aplica).
  const filas = filasForm.filter((f) => CAMPOS_FECHA_TRANSBORDO.some((k) => f[k]) || f.punto.trim() || f.id_booking_transbordo);
  for (const [i, f] of filas.entries()) {
    for (const k of CAMPOS_FECHA_TRANSBORDO) {
      if (f[k] && !/^\d{4}-\d{2}-\d{2}$/.test(f[k])) return { ok: false, mensaje: `Fila ${i + 1}: fecha no válida.` };
    }
    if (accion.resultado !== "NO_APLICA" && !f.fecha_arribo) {
      return { ok: false, mensaje: `Fila ${i + 1}: falta el arribo estimado a puerto transbordo (obligatorio en Cargolink).` };
    }
  }
  if (accion.resultado !== "NO_APLICA" && filas.length === 0) {
    return { ok: false, mensaje: "Agrega al menos un transbordo, o usa No aplica." };
  }

  try {
    const session = await loginCargolink();
    const [booking, existentes] = await Promise.all([
      leerBookingMaritimo(session, noBooking),
      leerTransbordos(session, idBooking),
    ]);
    if (!booking) return { ok: false, mensaje: `No se encontró ${noBooking} en Servicios marítimos de Cargolink.` };
    const estatusAntes = (booking.his_mov_transbordo as string | undefined) || "SIN_COMENZAR";
    if (estatusAntes === "FINALIZADO") {
      return { ok: false, mensaje: "Transbordo ya está finalizado en Cargolink; ahí tampoco se puede editar." };
    }

    // Mismo formato que la pantalla de Cargolink: cada fecha como Date de
    // medianoche local (CDMX) serializado, y las filas existentes con todos
    // sus datos originales más los cambios.
    const iso = (fecha: string) => `${fecha}T06:00:00.000Z`;
    const porId = new Map(existentes.map((e) => [String(e.id_booking_transbordo), e]));
    const payload: FilaTransbordo[] = filas.map((f) => {
      const base: FilaTransbordo = f.id_booking_transbordo ? { ...(porId.get(f.id_booking_transbordo) ?? {}) } : {};
      for (const k of CAMPOS_FECHA_TRANSBORDO) {
        if (f[k]) base[k] = iso(f[k]);
        else delete base[k];
      }
      base.punto = f.punto.trim();
      return base;
    });

    const valoresAntes = { transbordos: existentes.map(filaParaForm) };
    const respuesta = await guardarTransbordosEnCargolink(session, idBooking, accion.status, payload);
    if (respuesta.status_conexion && respuesta.status_conexion !== "OK") {
      const msg = `Cargolink no confirmó el guardado: ${JSON.stringify(respuesta).slice(0, 200)}`;
      await bitacora({ accion: accion.status, ok: false, mensaje: msg, valores: { transbordos: filas }, valores_antes: valoresAntes, estatus_antes: estatusAntes });
      return { ok: false, mensaje: msg };
    }

    // Confirmar releyendo: estatus de la etapa y que cada arribo estimado quedó.
    const [despues, filasDespues] = await Promise.all([
      leerBookingMaritimo(session, noBooking),
      leerTransbordos(session, idBooking),
    ]);
    const estatusDespues = (despues?.his_mov_transbordo as string | undefined) || "SIN_COMENZAR";
    const valoresDespues = { transbordos: filasDespues.map(filaParaForm) };
    const arribosDespues = new Set(filasDespues.map((r) => fechaCargolink(r.fecha_arribo)));
    const faltan = filas.filter((f) => f.fecha_arribo && !arribosDespues.has(f.fecha_arribo));
    if (estatusDespues !== accion.resultado || faltan.length > 0) {
      const msg = `Cargolink respondió pero quedó: etapa ${estatusDespues}${faltan.length ? `, ${faltan.length} fila(s) sin guardar` : ""}.`;
      await bitacora({ accion: accion.status, ok: false, mensaje: msg, valores: { transbordos: filas }, valores_antes: valoresAntes, valores_despues: valoresDespues, estatus_antes: estatusAntes, estatus_despues: estatusDespues });
      return { ok: false, mensaje: msg };
    }

    if (despues) {
      await supabase.rpc("refrescar_operacion_maritima", {
        p_row: { ...mapOperacionMaritima(despues), sincronizado_at: new Date().toISOString() },
      });
    }
    const mensaje = `Transbordo: ${accion.label.toLowerCase()} en Cargolink (${filasDespues.length} fila(s)).`;
    await bitacora({ accion: accion.status, ok: true, mensaje, valores: { transbordos: filas }, valores_antes: valoresAntes, valores_despues: valoresDespues, estatus_antes: estatusAntes, estatus_despues: estatusDespues });
    revalidatePath("/operaciones-maritima");
    revalidatePath("/track", "layout");
    return { ok: true, mensaje };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al comunicarse con Cargolink.";
    await bitacora({ accion: accion.status, ok: false, mensaje: msg, valores: { transbordos: filas } });
    return { ok: false, mensaje: msg };
  }
}

// Borra una fila ya guardada en Cargolink (como el bote de basura de su pantalla).
export async function eliminarFilaTransbordoCargolink(idBooking: number, idTransbordo: string): Promise<ResultadoEtapa> {
  const { puedeEditar, noBooking, bitacora } = await contextoTransbordo(idBooking);
  if (!puedeEditar) return { ok: false, mensaje: "No tienes autorización para editar en Cargolink (piloto)." };
  if (!noBooking) return { ok: false, mensaje: "Operación no encontrada." };
  try {
    const session = await loginCargolink();
    const [booking, existentes] = await Promise.all([leerBookingMaritimo(session, noBooking), leerTransbordos(session, idBooking)]);
    if (booking?.his_mov_transbordo === "FINALIZADO") {
      return { ok: false, mensaje: "Transbordo ya está finalizado en Cargolink; no se pueden borrar filas." };
    }
    const fila = existentes.find((e) => String(e.id_booking_transbordo) === idTransbordo);
    if (!fila) return { ok: false, mensaje: "Esa fila ya no existe en Cargolink." };
    await eliminarTransbordoEnCargolink(session, idTransbordo);
    const despues = await leerTransbordos(session, idBooking);
    const sigue = despues.some((e) => String(e.id_booking_transbordo) === idTransbordo);
    const mensaje = sigue ? "Cargolink no borró la fila." : "Fila de transbordo borrada en Cargolink.";
    await bitacora({
      accion: "ELIMINAR_FILA",
      ok: !sigue,
      mensaje,
      valores_antes: { transbordos: [filaParaForm(fila)] },
      valores_despues: { transbordos: despues.map(filaParaForm) },
    });
    revalidatePath("/track", "layout");
    return { ok: !sigue, mensaje };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "Error al comunicarse con Cargolink." };
  }
}
