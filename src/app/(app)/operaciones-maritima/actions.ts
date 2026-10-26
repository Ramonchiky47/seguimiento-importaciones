"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { loginCargolink } from "@/lib/cargolink";
import {
  asignarEjecutivoEnCargolink,
  descargarOperacionesRecientes,
  eliminarTransbordoEnCargolink,
  leerBookingMaritimo,
  leerCatalogosSeguro,
  leerCargosBooking,
  listarDocumentosBooking,
  subirDocumentoBooking,
  leerTransbordos,
  listarUsuariosCargolink,
  mapOperacionMaritima,
} from "@/lib/operacionesMaritima";
import {
  escritorUsuario,
  filaParaForm,
  guardarEtapaCon,
  guardarTransbordosCon,
  type FilaTransbordoForm,
  type ResultadoEtapa,
} from "@/lib/escrituraCargolink";

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
  revalidatePath("/track/operaciones");
  return { actualizadas: lista.length, total, completo };
}

export type { ResultadoEtapa } from "@/lib/escrituraCargolink";

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
  return guardarEtapaCon(await escritorUsuario(supabase), idBooking, etapaKey, status, valores);
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
      return { ok: false, mensaje: "Cargolink no regresó el booking (puede estar archivado o no respondió); intenta de nuevo en un momento." };
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

export type { FilaTransbordoForm } from "@/lib/escrituraCargolink";

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
  const { supabase, puedeEditar } = await contextoTransbordo(idBooking);
  if (!puedeEditar) return { ok: false, mensaje: "No tienes autorización para editar en Cargolink (piloto)." };
  return guardarTransbordosCon(await escritorUsuario(supabase), idBooking, status, filasForm);
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

// Listas de Cargolink para el formulario de Seguro.
export async function catalogosCargolink(): Promise<{
  aseguradoras: { valor: string; label: string }[];
  incoterms: { valor: string; label: string }[];
  bancos: { valor: string; label: string }[];
  bancosUSD: { valor: string; label: string }[];
}> {
  const vacio = { aseguradoras: [], incoterms: [], bancos: [], bancosUSD: [] };
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operaciones) return vacio;
  try {
    const session = await loginCargolink();
    return await leerCatalogosSeguro(session);
  } catch {
    return vacio;
  }
}

// ---- Documentos del booking en Cargolink (se suben a un tipo existente).

export type DocumentoBooking = {
  idConfig: string;
  nombre: string;
  idDoc: string | null;
  url: string | null;
  fechaUpload: string | null;
  usuario: string | null;
};

function mapDocumento(d: Record<string, string | null>): DocumentoBooking {
  return {
    idConfig: String(d.id ?? ""),
    nombre: d.nombre ?? "Documento",
    idDoc: d.idDoc ?? null,
    url: d.url ? `https://fwd.cargolink.mx/${d.url}` : null,
    fechaUpload: d.fecha_upload ?? null,
    usuario: d.upload_usuario ?? null,
  };
}

export async function documentosCargolink(idBooking: number): Promise<{ ok: boolean; mensaje: string; documentos: DocumentoBooking[] }> {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operaciones) {
    return { ok: false, mensaje: "Sin permiso de operaciones.", documentos: [] };
  }
  try {
    const session = await loginCargolink();
    const docs = await listarDocumentosBooking(session, idBooking);
    return { ok: true, mensaje: "", documentos: docs.map(mapDocumento) };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "Error al leer documentos.", documentos: [] };
  }
}

const MAX_ARCHIVO = 4 * 1024 * 1024;

export async function subirDocumentoCargolink(idBooking: number, formData: FormData): Promise<ResultadoEtapa> {
  const supabase = await createClient();
  const { data: puedeEditar } = await supabase.rpc("puedo_editar_cargolink");
  if (puedeEditar !== true) return { ok: false, mensaje: "No tienes autorización para editar en Cargolink (piloto)." };

  const idConfig = String(formData.get("idConfig") ?? "");
  const archivo = formData.get("archivo");
  if (!idConfig) return { ok: false, mensaje: "Elige el tipo de documento." };
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, mensaje: "Elige un archivo." };
  if (archivo.size > MAX_ARCHIVO) return { ok: false, mensaje: "El archivo pesa más de 4 MB." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: op }, { data: operativo }] = await Promise.all([
    supabase.from("operaciones_maritima").select("no_booking").eq("id_booking", idBooking).maybeSingle(),
    user
      ? supabase.from("catalogo_operativos").select("nombre_operativo").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!op?.no_booking) return { ok: false, mensaje: "Operación no encontrada." };

  const bitacora = async (ok: boolean, mensaje: string, antes: unknown, despues: unknown, valores: unknown) => {
    await supabase.from("bitacora_cargolink").insert({
      id_booking: idBooking,
      no_booking: op.no_booking,
      etapa: "documentos",
      accion: "SUBIR_DOCUMENTO",
      valores,
      valores_antes: antes,
      valores_despues: despues,
      usuario_email: user?.email ?? null,
      usuario_nombre: (operativo?.nombre_operativo as string | undefined) ?? user?.email ?? null,
      ok,
      mensaje,
    });
  };

  try {
    const session = await loginCargolink();
    const antes = (await listarDocumentosBooking(session, idBooking)).map(mapDocumento);
    const tipo = antes.find((d) => d.idConfig === idConfig);
    if (!tipo) return { ok: false, mensaje: "Ese tipo de documento no existe en el booking." };
    const valores = { documento: tipo.nombre, archivo: archivo.name };

    await subirDocumentoBooking(session, idBooking, idConfig, tipo.idDoc, archivo);

    // Confirmar releyendo: el tipo debe tener archivo con fecha de subida nueva.
    const despues = (await listarDocumentosBooking(session, idBooking)).map(mapDocumento);
    const tipoDespues = despues.find((d) => d.idConfig === idConfig);
    const subio = Boolean(tipoDespues?.url) && tipoDespues?.fechaUpload !== tipo.fechaUpload;
    const mensaje = subio
      ? `${archivo.name} subido a Cargolink como ${tipo.nombre}.`
      : "Cargolink no mostró el archivo después de subirlo.";
    await bitacora(
      subio,
      mensaje,
      { documento: tipo.nombre, archivo: tipo.url ? "con archivo" : "sin archivo" },
      { documento: tipo.nombre, archivo: tipoDespues?.url ? `${archivo.name}` : "sin archivo" },
      valores,
    );
    return { ok: subio, mensaje };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al subir a Cargolink.";
    await bitacora(false, msg, null, null, { archivo: archivo.name });
    return { ok: false, mensaje: msg };
  }
}

// ---- Ejecutivo del booking (Track › Sin ejecutivo).

// Usuarios de Cargolink que ya son ejecutivos de algún booking marítimo (los
// operativos); la lista completa de Cargolink incluye vendedores y cuentas
// de sistema.
export async function ejecutivosCargolink(): Promise<{ ok: boolean; mensaje: string; usuarios: { id: string; nombre: string }[] }> {
  const supabase = await createClient();
  const { data: puedeEditar } = await supabase.rpc("puedo_editar_cargolink");
  if (puedeEditar !== true) return { ok: false, mensaje: "Sin permiso para editar en Cargolink.", usuarios: [] };
  try {
    const session = await loginCargolink();
    const [usuarios, { data: ejecutivos }] = await Promise.all([
      listarUsuariosCargolink(session),
      supabase.rpc("operaciones_maritima_ejecutivos", { p_anio: null, p_types: null, p_q: null, p_tarjeta: null, p_hoy: null }),
    ]);
    const nombres = new Set(((ejecutivos ?? []) as { ejecutivo: string }[]).map((e) => e.ejecutivo.trim().toUpperCase()));
    const operativos = usuarios
      .filter((u) => nombres.has(u.nombre.toUpperCase()))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return { ok: true, mensaje: "", usuarios: operativos };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "Error al consultar Cargolink.", usuarios: [] };
  }
}

// Asignan ejecutivo los editores de Cargolink y quienes están en
// asignadores_ejecutivo (pantalla Track › Asignar ejecutivos).
async function puedeAsignarEjecutivo(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: editor }, { data: asignador }] = await Promise.all([
    supabase.rpc("puedo_editar_cargolink"),
    supabase.rpc("puedo_asignar_ejecutivo"),
  ]);
  return editor === true || asignador === true;
}

async function contextoAsignacion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: operativo } = user
    ? await supabase.from("catalogo_operativos").select("nombre_operativo").eq("user_id", user.id).maybeSingle()
    : { data: null };
  return {
    supabase,
    email: user?.email ?? null,
    nombre: (operativo?.nombre_operativo as string | undefined) ?? user?.email ?? null,
  };
}

// Asigna un booking (ya con sesión de Cargolink): verifica que siga sin
// ejecutivo, asigna, relee para confirmar, refresca la fila y deja bitácora.
async function asignarUno(
  ctx: Awaited<ReturnType<typeof contextoAsignacion>>,
  session: Awaited<ReturnType<typeof loginCargolink>>,
  usuarios: { id: string; nombre: string }[],
  idBooking: number,
  idUsuario: string,
): Promise<ResultadoEtapa> {
  if (!/^\d{1,6}$/.test(idUsuario)) return { ok: false, mensaje: "Usuario no válido." };
  const { data: op } = await ctx.supabase.from("operaciones_maritima").select("no_booking").eq("id_booking", idBooking).maybeSingle();
  const noBooking = op?.no_booking as string | undefined;
  if (!noBooking) return { ok: false, mensaje: "Operación no encontrada." };

  const bitacora = async (ok: boolean, mensaje: string, antes: string | null, despues: string | null, elegido: string) => {
    await ctx.supabase.from("bitacora_cargolink").insert({
      id_booking: idBooking,
      no_booking: noBooking,
      etapa: "ejecutivo",
      accion: "ASIGNAR_EJECUTIVO",
      valores: { Ejecutivo: elegido },
      valores_antes: { Ejecutivo: antes },
      valores_despues: { Ejecutivo: despues },
      usuario_email: ctx.email,
      usuario_nombre: ctx.nombre,
      ok,
      mensaje,
    });
  };

  try {
    const usuario = usuarios.find((u) => u.id === idUsuario);
    if (!usuario) return { ok: false, mensaje: "Ese usuario no existe en Cargolink." };
    const booking = await leerBookingMaritimo(session, noBooking);
    if (!booking) return { ok: false, mensaje: "Cargolink no regresó el booking (puede estar archivado o no respondió); intenta de nuevo en un momento." };
    const antes = typeof booking.ejecutivo === "string" && booking.ejecutivo.trim() ? booking.ejecutivo.trim() : null;
    if (antes) {
      return { ok: false, mensaje: `En Cargolink ya tiene ejecutivo: ${antes}. Actualiza la página.` };
    }

    await asignarEjecutivoEnCargolink(session, idBooking, idUsuario, { nombre: null, id: null });

    const despues = await leerBookingMaritimo(session, noBooking);
    const nombreDespues = typeof despues?.ejecutivo === "string" && despues.ejecutivo.trim() ? despues.ejecutivo.trim() : null;
    if (despues) {
      await ctx.supabase.rpc("refrescar_operacion_maritima", {
        p_row: { ...mapOperacionMaritima(despues), sincronizado_at: new Date().toISOString() },
      });
    }
    const ok = nombreDespues?.toUpperCase() === usuario.nombre.toUpperCase();
    const mensaje = ok
      ? `${noBooking}: ejecutivo asignado en Cargolink (${usuario.nombre}).`
      : `${noBooking}: Cargolink no confirmó el cambio (ejecutivo actual: ${nombreDespues ?? "sin ejecutivo"}).`;
    await bitacora(ok, mensaje, antes, nombreDespues, usuario.nombre);
    return { ok, mensaje };
  } catch (e) {
    const mensaje = `${noBooking}: ${e instanceof Error ? e.message : "Error al guardar en Cargolink."}`;
    await bitacora(false, mensaje, null, null, idUsuario);
    return { ok: false, mensaje };
  }
}

export async function asignarEjecutivoCargolink(idBooking: number, idUsuario: string): Promise<ResultadoEtapa> {
  const ctx = await contextoAsignacion();
  if (!(await puedeAsignarEjecutivo(ctx.supabase))) return { ok: false, mensaje: "Sin permiso para asignar ejecutivos." };
  try {
    const session = await loginCargolink();
    const usuarios = await listarUsuariosCargolink(session);
    const r = await asignarUno(ctx, session, usuarios, idBooking, idUsuario);
    revalidatePath("/track", "layout");
    return r;
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "Error al consultar Cargolink." };
  }
}

// Varias asignaciones con una sola sesión de Cargolink (pantalla Asignar
// ejecutivos). Se procesan una por una y se regresa el resultado de cada una.
export async function asignarEjecutivosCargolink(
  asignaciones: { idBooking: number; idUsuario: string }[],
): Promise<{ ok: boolean; mensaje: string; resultados: (ResultadoEtapa & { idBooking: number })[] }> {
  const ctx = await contextoAsignacion();
  if (!(await puedeAsignarEjecutivo(ctx.supabase))) {
    return { ok: false, mensaje: "Sin permiso para asignar ejecutivos.", resultados: [] };
  }
  if (asignaciones.length === 0 || asignaciones.length > 60) {
    return { ok: false, mensaje: "Selecciona de 1 a 60 bookings.", resultados: [] };
  }
  try {
    const session = await loginCargolink();
    const usuarios = await listarUsuariosCargolink(session);
    const resultados: (ResultadoEtapa & { idBooking: number })[] = [];
    for (const a of asignaciones) {
      resultados.push({ idBooking: a.idBooking, ...(await asignarUno(ctx, session, usuarios, a.idBooking, a.idUsuario)) });
    }
    revalidatePath("/track", "layout");
    const bien = resultados.filter((r) => r.ok).length;
    return { ok: bien === resultados.length, mensaje: `${bien} de ${resultados.length} asignados en Cargolink.`, resultados };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "Error al consultar Cargolink.", resultados: [] };
  }
}

export type FilaPorAsignar = {
  id_booking: number;
  no_booking: string;
  fecha: string | null;
  type: string | null;
  cliente: string | null;
  origen: string | null;
  destino: string | null;
  etd_atd: string | null;
  eta: string | null;
  propuesta: string | null;
  propuesta_n: number | null;
  propuesta_ultima: string | null;
  otros: number;
  // Usuario de Cargolink de la propuesta.
  propuesta_id: string | null;
};

// Bookings vigentes sin ejecutivo con la propuesta por historial y la lista
// de ejecutivos (usuarios de Cargolink que han llevado bookings marítimos en
// el último año).
export async function datosAsignacionEjecutivos(): Promise<{
  ok: boolean;
  mensaje: string;
  filas: FilaPorAsignar[];
  usuarios: { id: string; nombre: string }[];
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bookings_por_asignar");
  if (error) return { ok: false, mensaje: error.message, filas: [], usuarios: [] };
  const r = data as { filas: Omit<FilaPorAsignar, "propuesta_id">[]; ejecutivos: string[] };
  try {
    const session = await loginCargolink();
    const todos = await listarUsuariosCargolink(session);
    const porNombre = new Map(todos.map((u) => [u.nombre.toUpperCase(), u]));
    const usuarios = r.ejecutivos
      .map((n) => porNombre.get(n.trim().toUpperCase()))
      .filter((u): u is { id: string; nombre: string } => Boolean(u))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const filas = r.filas.map((f) => ({
      ...f,
      propuesta_id: f.propuesta ? (porNombre.get(f.propuesta.trim().toUpperCase())?.id ?? null) : null,
    }));
    return { ok: true, mensaje: "", filas, usuarios };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "Error al consultar Cargolink.", filas: [], usuarios: [] };
  }
}

// Instrucciones de revalidación propuestas por historial (función
// propuesta_instrucciones: mismo cliente + naviera, luego cliente, luego naviera).
export async function propuestaInstruccionesRevalidacion(idBooking: number): Promise<{
  nivel: 1 | 2 | 3 | null;
  muestra: number;
  ultimo: string | null;
  renglones: { etiqueta: string; valor: string; n: number }[];
} | null> {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operaciones) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("propuesta_instrucciones", { p_id_booking: idBooking });
  if (error || !data) return null;
  return data as { nivel: 1 | 2 | 3 | null; muestra: number; ultimo: string | null; renglones: { etiqueta: string; valor: string; n: number }[] };
}

// ---- Resumen comercial: conceptos y costos capturados por Comercial, con
// aviso si cambian después de que Operaciones los revisó.

export type ConceptoComercial = {
  id: string;
  tipo: string;
  concepto: string;
  proveedor: string | null;
  cantidad: number;
  costo: number;
  costoMoneda: string;
  costoBase: string;
  venta: number;
  ventaMoneda: string;
  ventaBase: string;
  pdd: string;
  observaciones: string;
  factura: string;
  // Detalle para la ventana del resumen comercial.
  costoIva: number;
  costoTotal: number;
  ventaIva: number;
  ventaTotal: number;
  invoice: string;
  solicitado: string;
};

type FirmaComercial = {
  conceptos: { id: string; tipo: string; concepto: string; proveedor: string; cantidad: number; costo: number; costoMoneda: string; venta: number; ventaMoneda: string; ventaBase: string }[];
  datos: Record<string, string>;
};

export type CambioComercial = { tipo: "nuevo" | "eliminado" | "modificado" | "dato"; id?: string; texto: string };

export type ResumenComercial = {
  ok: boolean;
  mensaje: string;
  conceptos: ConceptoComercial[];
  // Como en el llenado del booking (sin impuestos): profit = profit_estimado,
  // venta sin IVA y costo = venta − profit, en la moneda principal.
  totales: { venta: number | null; costo: number | null; profit: number | null; moneda: string | null };
  datos: { label: string; valor: string }[];
  firma: FirmaComercial | null;
  cambios: CambioComercial[];
  revisadoAt: string | null;
  revisadoPor: string | null;
  // Aviso propio de Cargolink cuando Comercial cambia el servicio.
  avisoCargolink: boolean;
};

const TIPOS_CARGO: Record<string, string> = {
  detalle_maritimo: "Marítimo",
  detalle_origen: "Origen",
  detalle_destino: "Destino",
  detalle_terrestre: "Terrestre",
  detalle_aduana: "Aduana",
  detalle_seguro: "Seguro",
  detalle_aereo: "Aéreo",
  detalle_ferrocarril: "Ferrocarril",
  detalle_general: "General",
};
const DATOS_COMERCIALES: [string, string][] = [
  ["servicio", "Servicio"],
  ["modo_transportacion", "Equipo"],
  ["contenedores", "Contenedores"],
  ["incoterm", "Incoterm"],
  ["seguro", "Seguro"],
  ["mercancia", "Mercancía"],
];

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const txt = (v: unknown) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v));

function compararFirmas(base: FirmaComercial, actual: FirmaComercial): CambioComercial[] {
  const cambios: CambioComercial[] = [];
  const antes = new Map(base.conceptos.map((c) => [c.id, c]));
  const ahora = new Map(actual.conceptos.map((c) => [c.id, c]));
  const fmt = (n: number, m: string) => `${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${m}`;
  for (const c of actual.conceptos) {
    const a = antes.get(c.id);
    if (!a) {
      cambios.push({ tipo: "nuevo", id: c.id, texto: `Nuevo concepto ${c.tipo}: ${c.concepto} (venta ${fmt(c.venta, c.ventaMoneda)}, costo ${fmt(c.costo, c.costoMoneda)})` });
      continue;
    }
    const partes: string[] = [];
    if (a.venta !== c.venta || a.ventaMoneda !== c.ventaMoneda) partes.push(`venta ${fmt(a.venta, a.ventaMoneda)} → ${fmt(c.venta, c.ventaMoneda)}`);
    if (a.costo !== c.costo || a.costoMoneda !== c.costoMoneda) partes.push(`costo ${fmt(a.costo, a.costoMoneda)} → ${fmt(c.costo, c.costoMoneda)}`);
    if (a.cantidad !== c.cantidad) partes.push(`cantidad ${a.cantidad} → ${c.cantidad}`);
    if (a.ventaBase !== c.ventaBase) partes.push(`base de venta ${a.ventaBase || "—"} → ${c.ventaBase || "—"}`);
    if (a.proveedor !== c.proveedor) partes.push(`proveedor ${a.proveedor || "—"} → ${c.proveedor || "—"}`);
    if (a.concepto !== c.concepto) partes.push(`concepto ${a.concepto} → ${c.concepto}`);
    if (partes.length) cambios.push({ tipo: "modificado", id: c.id, texto: `${c.tipo} · ${c.concepto}: ${partes.join("; ")}` });
  }
  for (const a of base.conceptos) {
    if (!ahora.has(a.id)) cambios.push({ tipo: "eliminado", id: a.id, texto: `Se quitó ${a.tipo}: ${a.concepto} (venta ${fmt(a.venta, a.ventaMoneda)})` });
  }
  for (const [k, label] of DATOS_COMERCIALES) {
    if ((base.datos[k] ?? "") !== (actual.datos[k] ?? "")) {
      cambios.push({ tipo: "dato", texto: `${label}: ${base.datos[k] || "—"} → ${actual.datos[k] || "—"}` });
    }
  }
  return cambios;
}

// La moneda con más venta manda; las otras se convierten con el tipo de cambio del booking.
function totalesSinIva(ventaPorMoneda: Map<string, number>, tc: number, profit: number | null): ResumenComercial["totales"] {
  const [moneda] = [...ventaPorMoneda.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null];
  let venta = 0;
  for (const [m, v] of ventaPorMoneda) {
    venta += m === moneda || !tc ? v : moneda === "USD" && m === "MXN" ? v / tc : moneda === "MXN" && m === "USD" ? v * tc : v;
  }
  venta = Math.round(venta * 100) / 100;
  return { venta, costo: profit === null ? null : Math.round((venta - profit) * 100) / 100, profit, moneda };
}

export async function resumenComercialCargolink(idBooking: number): Promise<ResumenComercial> {
  const vacio: ResumenComercial = {
    ok: false,
    mensaje: "",
    conceptos: [],
    totales: { venta: null, costo: null, profit: null, moneda: null },
    datos: [],
    firma: null,
    cambios: [],
    revisadoAt: null,
    revisadoPor: null,
    avisoCargolink: false,
  };
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operaciones) return { ...vacio, mensaje: "Sin permiso de operaciones." };
  const supabase = await createClient();
  const { data: op } = await supabase
    .from("operaciones_maritima_vista")
    .select("servicio, modo_transportacion, contenedores, incoterm, seguro, mercancia, datos")
    .eq("id_booking", idBooking)
    .maybeSingle();
  if (!op) return { ...vacio, mensaje: "Operación no encontrada." };

  try {
    const session = await loginCargolink();
    const r = await leerCargosBooking(session, idBooking);
    // Sin los bloques de cargos es una mala lectura, no que Comercial quitó todo
    // (si no, se marcarían cambios falsos contra la revisión).
    if (!Object.keys(TIPOS_CARGO).some((k) => Array.isArray(r[k]))) {
      throw new Error("Cargolink no devolvió los cargos del booking; intenta de nuevo.");
    }
    const conceptos: ConceptoComercial[] = [];
    // Venta sin IVA por moneda: v_total ya trae la cantidad y el IVA.
    const ventaPorMoneda = new Map<string, number>();
    let tc = 0;
    for (const [clave, tipo] of Object.entries(TIPOS_CARGO)) {
      for (const x of (Array.isArray(r[clave]) ? r[clave] : []) as Record<string, unknown>[]) {
        const m = txt(x.v_moneda) || "USD";
        ventaPorMoneda.set(m, (ventaPorMoneda.get(m) ?? 0) + num(x.v_total) / (1 + num(x.v_iva) / 100));
        tc ||= num(x.tipo_cambio);
        conceptos.push({
          id: txt(x.id_booking_cargo),
          tipo,
          concepto: txt(x.nombre_tipo) || txt((x.conceptos as Record<string, unknown> | undefined)?.nombre_tipo),
          proveedor: txt(x.razonsocial) || null,
          cantidad: num(x.multiplica_por ?? x.v_multiplica_por) || 1,
          costo: num(x.costo),
          costoMoneda: txt(x.c_moneda),
          costoBase: txt(x.c_basado),
          venta: num(x.venta),
          ventaMoneda: txt(x.v_moneda),
          ventaBase: txt(x.v_basado),
          pdd: txt(x.v_pdd),
          observaciones: [txt(x.v_observaciones), txt(x.c_observaciones)].filter(Boolean).join(" · "),
          factura: txt(x.no_facturas),
          costoIva: num(x.c_iva),
          costoTotal: num(x.c_total),
          ventaIva: num(x.v_iva),
          ventaTotal: num(x.v_total),
          invoice: [txt(x.serieInvoice), txt(x.invoice)].filter(Boolean).join("-"),
          solicitado: txt(x.solicitado),
        });
      }
    }
    const datosOp = op as Record<string, unknown>;
    const datos = DATOS_COMERCIALES.map(([k, label]) => ({
      label,
      valor: k === "seguro" ? (datosOp.seguro ? "Sí" : "No") : txt(datosOp[k]),
    }));
    const firma: FirmaComercial = {
      conceptos: conceptos
        .map((c) => ({
          id: c.id,
          tipo: c.tipo,
          concepto: c.concepto,
          proveedor: c.proveedor ?? "",
          cantidad: c.cantidad,
          costo: c.costo,
          costoMoneda: c.costoMoneda,
          venta: c.venta,
          ventaMoneda: c.ventaMoneda,
          ventaBase: c.ventaBase,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      datos: Object.fromEntries(DATOS_COMERCIALES.map(([k], i) => [k, datos[i].valor])),
    };
    const { data: base, error } = await supabase.rpc("resumen_comercial_comparar", { p_id_booking: idBooking, p_firma: firma });
    const b = (base ?? null) as { firma: FirmaComercial; tomada_at: string; revisado_por: string | null } | null;
    return {
      ok: true,
      mensaje: error ? `No se pudo comparar contra la revisión anterior: ${error.message}` : "",
      conceptos,
      totales: totalesSinIva(ventaPorMoneda, tc, r.profit_estimado === undefined ? null : num(r.profit_estimado)),
      datos,
      firma,
      cambios: b ? compararFirmas(b.firma, firma) : [],
      revisadoAt: b?.tomada_at ?? null,
      revisadoPor: b?.revisado_por ?? null,
      avisoCargolink: txt((datosOp.datos as Record<string, unknown> | null)?.aviso_servicio_pendiente) === "1",
    };
  } catch (e) {
    return { ...vacio, mensaje: e instanceof Error ? e.message : "Error al consultar Cargolink." };
  }
}

// "Enterado": lo que hoy tiene el booking queda como la referencia.
export async function marcarResumenComercialRevisado(idBooking: number, firma: unknown): Promise<ResultadoEtapa> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resumen_comercial_revisado", { p_id_booking: idBooking, p_firma: firma });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/track", "layout");
  return { ok: true, mensaje: "Cambios marcados como revisados." };
}

// Días libres de demora propuestos por historial (función
// propuesta_dias_libres: cliente + naviera, luego cliente, luego naviera).
export type PropuestaDiasLibres = { dias: number; nivel: 1 | 2 | 3; coinciden: number; muestra: number; ultimo: string | null };

export async function propuestaDiasLibres(ids: number[]): Promise<Record<string, PropuestaDiasLibres>> {
  const myPermissions = await getMyPermissions();
  if ((!myPermissions.es_admin && !myPermissions.puede_operaciones) || ids.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase.rpc("propuesta_dias_libres", { p_ids: ids.slice(0, 200) });
  return (data ?? {}) as Record<string, PropuestaDiasLibres>;
}
