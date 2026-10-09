"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { loginCargolink } from "@/lib/cargolink";
import { ETAPAS_CARGOLINK } from "@/lib/etapasCargolink";
import {
  descargarOperacionesRecientes,
  leerBookingMaritimo,
  guardarEtapaEnCargolink,
  mapOperacionMaritima,
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
  // PILOTO: solo administradores escriben en Cargolink mientras se prueba
  // cada etapa en real. Para abrirlo al equipo: es_admin || puede_operaciones
  // (aquí y en EDICION_SOLO_ADMIN de operaciones-maritima/page.tsx).
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    return { ok: false, mensaje: "Por ahora solo los administradores pueden editar en Cargolink (piloto)." };
  }
  const etapa = ETAPAS_CARGOLINK[etapaKey];
  const accion = etapa?.acciones.find((a) => a.status === status);
  if (!etapa || !accion) return { ok: false, mensaje: "Etapa o acción no válida." };

  const supabase = await createClient();
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

  const bitacora = async (ok: boolean, mensaje: string, cambios: Record<string, string>) => {
    await supabase.from("bitacora_cargolink").insert({
      id_booking: idBooking,
      no_booking: noBooking,
      etapa: etapa.key,
      accion: accion.status,
      valores: cambios,
      usuario_email: user?.email ?? null,
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
