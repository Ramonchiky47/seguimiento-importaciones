import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loginCargolink, type CargolinkBooking } from "@/lib/cargolink";
import { ETAPAS_CARGOLINK } from "@/lib/etapasCargolink";
import {
  guardarEtapaEnCargolink,
  guardarTransbordosEnCargolink,
  leerBookingMaritimo,
  leerOrigen,
  leerTransbordos,
  liberarEtapaEnCargolink,
  mapOperacionMaritima,
  type FilaTransbordo,
} from "@/lib/operacionesMaritima";

// Escritura en Cargolink compartida por las acciones de la app (con el permiso
// de editor ya validado) y la aplicación automática de propuestas (sistema).
// Solo servidor: no exponer como acción, porque no revisa permisos.

export type ResultadoEtapa = { ok: boolean; mensaje: string };
// Quién escribe: así queda en la bitácora.
export type Escritor = { supabase: SupabaseClient; email: string | null; nombre: string | null };
export const SISTEMA = { email: "sistema", nombre: "Aplicación por sistema" };
const CUENTAS_SISTEMA = ["ramonf.villanueva@gmail.com"];

// Cómo queda quien escribe en la bitácora. Lo que aplica Ramón desde la app
// (propuestas, correcciones) queda como sistema: lo pidió así.
export function quienBitacora(email: string | null | undefined, operativo?: string | null): { email: string | null; nombre: string | null } {
  if (email && CUENTAS_SISTEMA.includes(email.toLowerCase())) return { ...SISTEMA };
  return { email: email ?? null, nombre: operativo ?? email ?? null };
}

// Pone la fila de la app igual a lo que se acaba de leer de Cargolink. El sistema
// escribe con la clave de servicio (sin usuario), y refrescar_operacion_maritima
// pide permiso de operaciones del usuario: por eso actualiza la tabla directo.
async function refrescarFila(esc: Escritor, booking: CargolinkBooking) {
  const fila = { ...mapOperacionMaritima(booking), sincronizado_at: new Date().toISOString() };
  if (esc.email === SISTEMA.email) {
    const { error } = await esc.supabase.from("operaciones_maritima").update(fila).eq("id_booking", fila.id_booking);
    return error;
  }
  const { error } = await esc.supabase.rpc("refrescar_operacion_maritima", { p_row: fila });
  return error;
}

// El usuario conectado (nombre del operativo ligado a su cuenta, si lo tiene).
export async function escritorUsuario(supabase: SupabaseClient): Promise<Escritor> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: operativo } = user
    ? await supabase.from("catalogo_operativos").select("nombre_operativo").eq("user_id", user.id).maybeSingle()
    : { data: null };
  return { supabase, ...quienBitacora(user?.email, operativo?.nombre_operativo as string | undefined) };
}

// Guarda una etapa en Cargolink a nombre de quien escribe (esc): el usuario de
// la app (acciones, que validan el permiso de editor antes) o el sistema
// (aplicación automática de propuestas). Relee Cargolink para confirmar,
// actualiza la fila en la app y deja todo en bitacora_cargolink.
export async function guardarEtapaCon(
  esc: Escritor,
  idBooking: number,
  etapaKey: string,
  status: string,
  valores: Record<string, string>,
): Promise<ResultadoEtapa> {
  const etapa = ETAPAS_CARGOLINK[etapaKey];
  const accion = etapa?.acciones.find((a) => a.status === status);
  if (!etapa || !accion) return { ok: false, mensaje: "Etapa o acción no válida." };

  const { supabase } = esc;
  const { data: op } = await supabase
    .from("operaciones_maritima")
    .select("no_booking")
    .eq("id_booking", idBooking)
    .maybeSingle();
  if (!op?.no_booking) return { ok: false, mensaje: "Operación no encontrada." };
  const noBooking = op.no_booking as string;


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
      usuario_email: esc.email,
      usuario_nombre: esc.nombre,
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
      if (c.tipo === "decimal" && !/^\d{1,12}(\.\d{1,2})?$/.test(v)) return { ok: false, mensaje: `${c.label}: importe no válido.` };
      if (c.tipo === "text" && v.length > 300) return { ok: false, mensaje: `${c.label}: máximo 300 caracteres.` };
      if (c.tipo === "textarea" && v.length > 2000) return { ok: false, mensaje: `${c.label}: máximo 2,000 caracteres.` };
      if (c.tipo === "select" && c.opciones && !c.opciones.some((o) => o.valor === v)) {
        return { ok: false, mensaje: `${c.label}: opción no válida.` };
      }
      cambios[c.key] = v;
    }
  }

  try {
    const session = await loginCargolink();
    let booking = await leerBookingMaritimo(session, noBooking);
    if (!booking) return { ok: false, mensaje: `No se encontró ${noBooking} en Servicios marítimos de Cargolink.` };
    // Origen: sus datos viven en el registro de origen (consultaOrigen).
    const esOrigen = etapa.guardado === "origen";
    const origen = esOrigen ? await leerOrigen(session, idBooking) : {};
    valoresAntes = camposEtapa({ ...booking, ...origen });
    estatusAntes = (booking[etapa.mov] as string | undefined) || "SIN_COMENZAR";
    let liberada = false;
    // Etapa finalizada: si ya tiene lo que se pide no hay nada que hacer; si
    // no, se libera (Liberar etapas) para poder corregirla.
    const actual: Record<string, unknown> = { ...booking, ...origen };
    const pendientes = Object.entries(cambios).filter(([k, v]) => String(actual[k] ?? "").slice(0, v.length) !== v);
    if (booking[etapa.mov] === "FINALIZADO" && pendientes.length === 0) {
      valoresDespues = valoresAntes;
      estatusDespues = estatusAntes;
      const errRefresco = await refrescarFila(esc, booking);
      const msg = `${etapa.label}: ya estaba finalizada en Cargolink con ese valor; no hubo que cambiar nada.`;
      await bitacora(true, msg, cambios);
      if (!errRefresco) {
        revalidatePath("/operaciones-maritima");
        revalidatePath("/track", "layout");
      }
      return { ok: true, mensaje: msg };
    }
    if (booking[etapa.mov] === "FINALIZADO" && etapa.tablaLiberar) {
      if (await liberarEtapaEnCargolink(session, noBooking, etapa.tablaLiberar)) {
        const reabierto = await leerBookingMaritimo(session, noBooking);
        if (reabierto && reabierto[etapa.mov] !== "FINALIZADO") {
          booking = reabierto;
          liberada = true;
        }
      }
      if (!liberada) {
        const msg = `${etapa.label}: no se pudo liberar la etapa finalizada en Cargolink.`;
        await bitacora(false, msg, cambios);
        return { ok: false, mensaje: msg };
      }
    }
    if (booking[etapa.mov] === "FINALIZADO") {
      // La app la tenía abierta (aún no se reflejaba): se actualiza con lo de
      // Cargolink para que deje de proponerse.
      const errRefresco = await refrescarFila(esc, booking);
      const msg = `${etapa.label} ya está finalizada en Cargolink; ahí tampoco se puede editar.${
        errRefresco ? "" : " La app ya se actualizó."
      }`;
      await bitacora(false, msg, cambios);
      if (!errRefresco) {
        revalidatePath("/operaciones-maritima");
        revalidatePath("/track", "layout");
      }
      return { ok: false, mensaje: msg };
    }
    if (accion.resultado !== "NO_APLICA") {
      for (const c of etapa.campos) {
        const valorFinal = cambios[c.key] ?? (booking[c.key] as string | undefined) ?? "";
        if (c.requerido && (!valorFinal || String(valorFinal).startsWith("0000"))) {
          return { ok: false, mensaje: `Falta ${c.label} (Cargolink la pide como obligatoria).` };
        }
      }
    }

    const cambiosOrigen = Object.fromEntries(
      Object.entries(cambios).filter(([k]) => etapa.campos.find((c) => c.key === k)?.fuente === "origen"),
    );
    const cambiosBooking = Object.fromEntries(Object.entries(cambios).filter(([k]) => !(k in cambiosOrigen)));
    const payload = {
      ...booking,
      ...cambiosBooking,
      ...(etapa.desdeEtapa ? { desdeEtapa: etapa.desdeEtapa } : {}),
      // Nunca notificar al cliente desde la app.
      emailCliente: "",
      check_notificacion_arribo: false,
      notificarCliente: false,
      notificarCorresponsal: false,
    };
    // Origen manda {alta: origen, booking} como su pantalla en Cargolink.
    const cuerpo = esOrigen ? ({ alta: { ...origen, ...cambiosOrigen }, booking: payload } as unknown as CargolinkBooking) : payload;
    let respuesta = await guardarEtapaEnCargolink(session, etapa.fn, accion.status, cuerpo);
    // Seguro: Cargolink guarda primero la etapa y luego los datos del seguro.
    if (etapa.fn2 && respuesta.status_conexion === "OK") {
      respuesta = await guardarEtapaEnCargolink(session, etapa.fn2, accion.status, payload);
    }
    if (respuesta.status_conexion !== "OK") {
      const msg = `Cargolink no confirmó el guardado: ${JSON.stringify(respuesta).slice(0, 200)}`;
      await bitacora(false, msg, cambios);
      return { ok: false, mensaje: msg };
    }

    // Confirmar releyendo de Cargolink: estatus de la etapa y valores.
    const despuesBooking = await leerBookingMaritimo(session, noBooking);
    const despuesOrigen = esOrigen && despuesBooking ? await leerOrigen(session, idBooking) : {};
    const despues = despuesBooking ? { ...despuesBooking, ...despuesOrigen } : null;
    valoresDespues = camposEtapa(despues);
    estatusDespues = despues ? ((despues[etapa.mov] as string | undefined) || "SIN_COMENZAR") : null;
    if (!despues) {
      await bitacora(false, "Guardado, pero no se pudo releer el booking.", cambios);
      return { ok: false, mensaje: "Cargolink aceptó el guardado, pero no se pudo releer el booking para confirmarlo." };
    }
    const noCuadran = Object.entries(cambios).filter(
      ([k, v]) => !etapa.campos.find((c) => c.key === k)?.sinVerificar && String(despues[k] ?? "").slice(0, v.length) !== v,
    );
    if (despues[etapa.mov] !== accion.resultado || noCuadran.length > 0) {
      const msg = `Cargolink respondió OK pero quedó: etapa ${String(despues[etapa.mov] ?? "sin estatus")}${
        noCuadran.length ? `, campos sin cambio: ${noCuadran.map(([k]) => k).join(", ")}` : ""
      }.`;
      await bitacora(false, msg, cambios);
      return { ok: false, mensaje: msg };
    }

    const errRefresco = await refrescarFila(esc, despuesBooking as CargolinkBooking);
    const mensaje = `${etapa.label}: ${liberada ? "liberada (estaba finalizada) y " : ""}${accion.label.toLowerCase()} en Cargolink.${
      errRefresco ? " (La app se actualizará en la próxima carga.)" : ""
    }`;
    await bitacora(true, mensaje, cambios);
    revalidatePath("/operaciones-maritima");
    revalidatePath("/track/operaciones");
    revalidatePath("/track", "layout");
    return { ok: true, mensaje };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al comunicarse con Cargolink.";
    await bitacora(false, msg, cambios);
    return { ok: false, mensaje: msg };
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

export const CAMPOS_FECHA_TRANSBORDO = ["fecha_arribo", "fecha_arribo_real", "fecha_zarpe", "fecha_zarpe_real"] as const;

export function fechaCargolink(v: unknown): string {
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !s.startsWith("0000") ? s : "";
}

export function filaParaForm(f: FilaTransbordo): FilaTransbordoForm {
  return {
    id_booking_transbordo: f.id_booking_transbordo ? String(f.id_booking_transbordo) : undefined,
    fecha_arribo: fechaCargolink(f.fecha_arribo),
    punto: typeof f.punto === "string" ? f.punto : "",
    fecha_arribo_real: fechaCargolink(f.fecha_arribo_real),
    fecha_zarpe: fechaCargolink(f.fecha_zarpe),
    fecha_zarpe_real: fechaCargolink(f.fecha_zarpe_real),
  };
}

export async function guardarTransbordosCon(
  esc: Escritor,
  idBooking: number,
  status: string,
  filasForm: FilaTransbordoForm[],
): Promise<ResultadoEtapa> {
  const etapa = ETAPAS_CARGOLINK.transbordo;
  const accion = etapa.acciones.find((a) => a.status === status);
  if (!accion) return { ok: false, mensaje: "Acción no válida." };
  const { supabase } = esc;
  const { data: op } = await supabase.from("operaciones_maritima").select("no_booking").eq("id_booking", idBooking).maybeSingle();
  const noBooking = op?.no_booking as string | undefined;
  if (!noBooking) return { ok: false, mensaje: "Operación no encontrada." };
  const bitacora = (registro: Record<string, unknown>) =>
    supabase.from("bitacora_cargolink").insert({
      id_booking: idBooking,
      no_booking: noBooking,
      etapa: "transbordo",
      usuario_email: esc.email,
      usuario_nombre: esc.nombre,
      ...registro,
    });

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

    if (despues) await refrescarFila(esc, despues);
    const mensaje = `Transbordo: ${accion.label.toLowerCase()} en Cargolink (${filasDespues.length} fila(s)).`;
    await bitacora({ accion: accion.status, ok: true, mensaje, valores: { transbordos: filas }, valores_antes: valoresAntes, valores_despues: valoresDespues, estatus_antes: estatusAntes, estatus_despues: estatusDespues });
    revalidatePath("/operaciones-maritima");
    revalidatePath("/track/operaciones");
    revalidatePath("/track", "layout");
    return { ok: true, mensaje };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al comunicarse con Cargolink.";
    await bitacora({ accion: accion.status, ok: false, mensaje: msg, valores: { transbordos: filas } });
    return { ok: false, mensaje: msg };
  }
}

