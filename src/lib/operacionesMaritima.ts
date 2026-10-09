import { loginCargolink, type CargolinkBooking, type CargolinkSession } from "@/lib/cargolink";

const BASE_URL = "https://fwd.cargolink.mx";

// Mismo mapeo que ~/Agentes/operaciones_maritima/transform.py (la carga
// programada) — si cambia uno, cambiar el otro.
export type OperacionMaritimaRow = Record<string, unknown> & { id_booking: number };

function soloFecha(v: unknown): string | null {
  const s = typeof v === "string" ? v : "";
  if (!s || s.startsWith("0000")) return null;
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function fechaHora(v: unknown): string | null {
  const s = typeof v === "string" ? v : "";
  if (!s || s.startsWith("0000")) return null;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s : null;
}

function entero(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || v === "" || Number.isNaN(n) ? null : Math.trunc(n);
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

const VACIOS = new Set(["", "0000-00-00", "0000-00-00 00:00:00"]);

export function mapOperacionMaritima(x: CargolinkBooking): OperacionMaritimaRow {
  const datos: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) {
    if (k.endsWith("_color") || v === null || (typeof v === "string" && VACIOS.has(v))) continue;
    datos[k] = v;
  }
  const noBooking = typeof x.no_booking === "string" ? x.no_booking : "";
  return {
    id_booking: Number(x.id_booking),
    no_booking: noBooking,
    type: noBooking.slice(10) || null,
    fecha: soloFecha(x.fecha),
    fecha_creacion: fechaHora(x.fecha_creacion),
    folio_int: texto(x.folio_int),
    mbl: texto(x.no_control),
    id_cliente: entero(x.id_cliente),
    cliente: texto(x.razonsocial),
    ejecutivo: texto(x.ejecutivo),
    servicio: texto(x.servicio),
    modo_transportacion: texto(x.modo_transportacion),
    pod: texto(x.sitios),
    origen: texto(x.sitioOrigenNombre),
    destino: texto(x.sitioDestinoNombre),
    consignatario: texto(x.consignatario),
    shipper: texto(x.shipper),
    agente_extranjero: texto(x.nameAgenExt),
    incoterm: texto(x.intercom),
    mercancia: texto(x.mercancia),
    seguro: x.seguro === "SI",
    contenedores: texto(x.noContenedores),
    status_booking: texto(x.status_booking),
    etd_atd: soloFecha(x.fecha_atd),
    eta: soloFecha(x.buque_eta),
    ata: soloFecha(x.fecha_ata),
    revalidacion: soloFecha(x.fecha_revalidacion),
    telex_house_bl: soloFecha(x.fecha_telex_house_bl),
    telex_master_bl: soloFecha(x.fecha_telex_master_bl),
    // "Fecha de regreso de vacío" de la etapa REGRESO DE VACIO en Cargolink
    // (fecha_maniobra_vacio es la cita de maniobra, que este flujo no usa).
    regreso_vacio: soloFecha(x.fecha_maniobra_entrega),
    solicitud_garantia: soloFecha(x.fecha_solicitud_garantia),
    regreso_garantia: soloFecha(x.fecha_regreso_garantia),
    // En Cargolink "dias_demora" son los días libres pactados, no la demora acumulada.
    dias_libres_demora: entero(x.dias_demora),
    ultimo_movimiento_fecha: fechaHora(x.ultimo_movimiento_fecha),
    datos,
  };
}

// Pagina de Operaciones Importacion > Servicios maritimos (40 registros,
// de la mas reciente a la mas antigua). El token del Concentrado que regresa
// loginCargolink tambien sirve para este endpoint.
async function consultarPaginaMaritima(
  session: CargolinkSession,
  pagina: number,
): Promise<{ valores: CargolinkBooking[]; total: number }> {
  const url = `${BASE_URL}/ws/cliente_conexion.php?token=${session.token}&cat=api&fn=consultaBookingConcentrado&limit=${pagina}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: session.cookie },
    body: JSON.stringify({ archivadoOperaciones: "0" }),
  });
  if (!res.ok) {
    throw new Error(`Cargolink respondió con error ${res.status} al consultar Servicios marítimos.`);
  }
  const data = await res.json();
  return { valores: data?.valores ?? [], total: Number(data?.total) || 0 };
}

// Descarga las operaciones más recientes hasta agotar el presupuesto de
// tiempo: la lista completa (~9,000) tarda ~10 min, más que el límite de una
// función en Vercel, así que el botón solo refresca la parte reciente y la
// carga programada en la Mac se encarga del resto.
// Con `desde` (YYYY-MM-DD) se detiene al llegar a operaciones anteriores a esa
// fecha (la lista viene de la más reciente a la más antigua) y "completo"
// significa que se cubrió todo el periodo.
export async function descargarOperacionesRecientes(
  presupuestoMs: number,
  desde?: string,
): Promise<{ registros: CargolinkBooking[]; total: number; completo: boolean }> {
  const inicio = Date.now();
  const session = await loginCargolink();
  const registros: CargolinkBooking[] = [];
  let total = 0;

  for (let pagina = 0; Date.now() - inicio < presupuestoMs; pagina++) {
    let respuesta = await consultarPaginaMaritima(session, pagina);
    // Cargolink a veces regresa una página vacía a media lista; un reintento.
    if (respuesta.valores.length === 0 && registros.length < respuesta.total) {
      await new Promise((r) => setTimeout(r, 2000));
      respuesta = await consultarPaginaMaritima(session, pagina);
    }
    total = respuesta.total || total;
    if (respuesta.valores.length === 0) break;
    if (desde) {
      // El orden no es estrictamente por fecha: se para hasta una página
      // completa anterior a `desde`, no en el primer registro viejo.
      const delPeriodo = respuesta.valores.filter((b) => String(b.fecha ?? "") >= desde);
      registros.push(...delPeriodo);
      if (delPeriodo.length === 0) {
        return { registros, total: registros.length, completo: true };
      }
    } else {
      registros.push(...respuesta.valores);
    }
  }

  return { registros, total, completo: total > 0 && registros.length >= total };
}

// Lee un booking de Servicios marítimos tal como lo carga la pantalla de
// Cargolink (el objeto completo que esa pantalla manda al guardar una etapa).
export async function leerBookingMaritimo(
  session: CargolinkSession,
  noBooking: string,
): Promise<CargolinkBooking | null> {
  const url = `${BASE_URL}/ws/cliente_conexion.php?token=${session.token}&cat=api&fn=consultaBookingConcentrado&limit=0`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: session.cookie },
    body: JSON.stringify({ archivadoOperaciones: "0", no_booking: noBooking }),
  });
  if (!res.ok) throw new Error(`Cargolink respondió con error ${res.status} al leer el booking.`);
  const data = await res.json();
  const valores = (data?.valores ?? []) as CargolinkBooking[];
  return valores.find((b) => b.no_booking === noBooking) ?? null;
}

// Guarda una etapa en Cargolink con el mismo web service que su pantalla.
export async function guardarEtapaEnCargolink(
  session: CargolinkSession,
  fn: string,
  status: string,
  booking: CargolinkBooking,
): Promise<Record<string, unknown>> {
  const url = `${BASE_URL}/ws/cliente_conexion.php?token=${session.token}&cat=api&fn=${fn}&status=${encodeURIComponent(status)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: session.cookie },
    body: JSON.stringify(booking),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cargolink respondió con error ${res.status}.`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

// ---- Transbordos (etapa TRANSBORDO): filas propias, no campos del booking.
export type FilaTransbordo = {
  id_booking_transbordo?: string | number;
  fecha_arribo?: string; // arribo estimado a puerto de transbordo (obligatorio)
  punto?: string;
  fecha_arribo_real?: string;
  fecha_zarpe?: string;
  fecha_zarpe_real?: string;
  [k: string]: unknown;
};

export async function leerTransbordos(session: CargolinkSession, idBooking: number): Promise<FilaTransbordo[]> {
  const url = `${BASE_URL}/ws/cliente_conexion.php?token=${session.token}&cat=api&fn=consultaTransbordo&booking=${idBooking}`;
  const res = await fetch(url, { headers: { Cookie: session.cookie } });
  if (!res.ok) throw new Error(`Cargolink respondió con error ${res.status} al leer transbordos.`);
  const data = await res.json();
  return (data?.valores ?? []) as FilaTransbordo[];
}

// Igual que la pantalla de Cargolink: manda TODAS las filas (las existentes con
// su id_booking_transbordo se actualizan, las nuevas se crean).
export async function guardarTransbordosEnCargolink(
  session: CargolinkSession,
  idBooking: number,
  status: string,
  filas: FilaTransbordo[],
): Promise<Record<string, unknown>> {
  const url = `${BASE_URL}/ws/cliente_conexion.php?token=${session.token}&cat=api&fn=registraTransitoTransbordo&status=${encodeURIComponent(status)}&id_booking=${idBooking}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: session.cookie },
    body: JSON.stringify(filas),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cargolink respondió con error ${res.status}.`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

export async function eliminarTransbordoEnCargolink(session: CargolinkSession, idTransbordo: string | number) {
  const url = `${BASE_URL}/ws/cliente_conexion.php?token=${session.token}&cat=api2&fn=eliminarTransbordo&id=${encodeURIComponent(String(idTransbordo))}`;
  const res = await fetch(url, { method: "POST", headers: { Cookie: session.cookie } });
  if (!res.ok) throw new Error(`Cargolink respondió con error ${res.status} al eliminar el transbordo.`);
}

// Catálogos de la pantalla de Seguro (consultaAseguradoras / consultaIncoterm).
export async function leerCatalogosSeguro(session: CargolinkSession): Promise<{
  aseguradoras: { valor: string; label: string }[];
  incoterms: { valor: string; label: string }[];
}> {
  const get = async (fn: string) => {
    const res = await fetch(`${BASE_URL}/ws/cliente_conexion.php?token=${session.token}&cat=api&fn=${fn}`, {
      headers: { Cookie: session.cookie },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.valores ?? []) as Record<string, string>[];
  };
  const [aseg, inco] = await Promise.all([get("consultaAseguradoras"), get("consultaIncoterm")]);
  return {
    aseguradoras: aseg.map((a) => ({ valor: String(a.id_aseguradora), label: a.nombre })),
    incoterms: inco.map((i) => ({ valor: i.tipo, label: i.tipo })),
  };
}

// Registro de origen del booking (consultaOrigen): contacto, fecha estimada de
// salida, número de control (MBL), control entre agentes (HBL), viaje.
export async function leerOrigen(session: CargolinkSession, idBooking: number): Promise<Record<string, unknown>> {
  const url = `${BASE_URL}/ws/cliente_conexion.php?token=${session.token}&cat=api&fn=consultaOrigen&booking=${idBooking}`;
  const res = await fetch(url, { headers: { Cookie: session.cookie } });
  if (!res.ok) throw new Error(`Cargolink respondió con error ${res.status} al leer el origen.`);
  const data = await res.json();
  const valores = (data?.valores ?? []) as Record<string, unknown>[];
  return valores[0] ?? {};
}
