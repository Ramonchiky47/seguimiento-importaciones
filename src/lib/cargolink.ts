const BASE_URL = "https://fwd.cargolink.mx";

export type CargolinkBooking = Record<string, unknown> & {
  no_booking?: string;
  fecha_creacion?: string;
  nameVend?: string;
  nameEjec?: string;
  nameCust?: string;
  nombreNaviera?: string;
  sitioOrigen?: string;
  sitioDestino?: string;
  no_contenedores?: string;
  contenedores?: string;
  // Cargolink a veces devuelve "shipper" como texto simple y a veces como el
  // registro completo del cliente (objeto con razonsocial/alias_cliente).
  shipper?: string | Record<string, unknown>;
  dir_recoleccion?: string;
  fecha_atd?: string;
  buque_eta?: string;
  dias_demora?: string;
  agente_cliente?: string;
  nameAgenExt?: string;
  no_control?: string;
  seguro?: string;
};

function mergeCookies(res: Response, existing: string): string {
  const jar = new Map<string, string>();
  for (const pair of existing.split("; ")) {
    const [key, ...rest] = pair.split("=");
    if (key) jar.set(key, rest.join("="));
  }

  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const raw of setCookie) {
    const [pair] = raw.split(";");
    const [key, ...rest] = pair.split("=");
    if (key) jar.set(key.trim(), rest.join("="));
  }

  return Array.from(jar.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

export type CargolinkSession = { token: string; cookie: string };

export async function loginCargolink(): Promise<CargolinkSession> {
  const usuario = process.env.CARGOLINK_USER;
  const password = process.env.CARGOLINK_PASSWORD;
  if (!usuario || !password) {
    throw new Error(
      "Faltan las credenciales de Cargolink (CARGOLINK_USER / CARGOLINK_PASSWORD) en el servidor.",
    );
  }

  const loginRes = await fetch(`${BASE_URL}/seguridad/control.php?loginfrom=usuario`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ usuario, password }),
  });

  let cookie = mergeCookies(loginRes, "");
  const loginText = await loginRes.text();
  if (!loginRes.ok || !loginText.includes('"activo"')) {
    throw new Error("Falló la autenticación en Cargolink.");
  }

  const tokenRes = await fetch(`${BASE_URL}/templates/b_concentrado/?m=114`, {
    headers: { Cookie: cookie },
  });
  cookie = mergeCookies(tokenRes, cookie);
  const html = await tokenRes.text();
  const match = html.match(/token=([a-f0-9]{32}\d*)/);
  if (!match) {
    throw new Error("No se pudo obtener el token dinámico de sesión de Cargolink.");
  }

  return { token: match[1], cookie };
}

// Variante que reutiliza una sesión ya iniciada (login+token), para no tener
// que loguearse de nuevo en cada booking cuando se consultan varios seguidos.
export async function buscarBookingConSesion(
  session: CargolinkSession,
  noBooking: string,
): Promise<CargolinkBooking | null> {
  const url = `${BASE_URL}/ws/cliente_conexion.php?token=${session.token}&cat=api&fn=consultaBooking&tabla=&limit=0`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: session.cookie },
    body: JSON.stringify({ tipo_fecha: "", pagadoBooking: "", no_booking: noBooking }),
  });

  if (!res.ok) {
    throw new Error(`Cargolink respondió con error ${res.status} al consultar el booking.`);
  }

  const data = await res.json();
  const valores = data?.valores;
  return Array.isArray(valores) && valores.length > 0 ? (valores[0] as CargolinkBooking) : null;
}

export async function buscarBookingCargolink(
  noBooking: string,
): Promise<CargolinkBooking | null> {
  const session = await loginCargolink();
  return buscarBookingConSesion(session, noBooking);
}

const TIPOS_SEGUIMIENTO = new Set(["FCLI", "LCLI"]);
// Tope de seguridad: al ritmo de 50 registros por página, esto cubriría más
// de 100,000 registros. Si algún día se alcanza, es señal de un bug (p. ej.
// una página que nunca regresa vacía) y no de un año con tantos bookings.
const MAX_PAGINAS = 2000;

export type ReferenciaCargolink = { noBooking: string; booking: CargolinkBooking };

// El "Concentrado" de Cargolink pagina con el parámetro de URL "limit", pero
// pese al nombre NO es un offset de filas (probado empíricamente): es un
// número de página de 50 registros, es decir la fila real es
// pagina * 50. Pasar un offset de filas ahí (como hace, incorrectamente,
// ~/Agentes/cargolink_service.py) satura "pagina" y la mayoría de las
// llamadas caen fuera de rango, regresando vacío en silencio.
async function consultarConcentradoPagina(
  token: string,
  cookie: string,
  pagina: number,
  filtros: Record<string, string>,
): Promise<{ valores: CargolinkBooking[]; total: number | string }> {
  const url = `${BASE_URL}/ws/cliente_conexion.php?token=${token}&cat=api&fn=consultaBooking&tabla=&limit=${pagina}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ tipo_fecha: "", pagadoBooking: "", ...filtros }),
  });

  if (!res.ok) {
    throw new Error(`Cargolink respondió con error ${res.status} al consultar el concentrado.`);
  }

  return res.json();
}

// Recorre el Concentrado de Cargolink filtrando por fecha de creación dentro
// del rango dado (fechaDesde/fechaHasta en formato YYYY-MM-DD), y regresa
// solo los bookings cuyo tipo (últimos 4 caracteres del no_booking) es FCLI
// o LCLI — los únicos tipos que sigue este sistema.
export async function listarReferenciasCargolinkPorRango(
  fechaDesde: string,
  fechaHasta: string,
): Promise<ReferenciaCargolink[]> {
  const { token, cookie } = await loginCargolink();
  const filtros = {
    tipo_fecha: "booking.fecha_creacion",
    fechai: fechaDesde,
    fechaf: fechaHasta,
  };

  const encontrados: ReferenciaCargolink[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const respuesta = await consultarConcentradoPagina(token, cookie, pagina, filtros);
    const valores = respuesta.valores ?? [];
    if (valores.length === 0) break;

    for (const b of valores) {
      const noBooking = b.no_booking?.trim();
      if (!noBooking || noBooking.length < 4) continue;
      const tipo = noBooking.slice(-4).toUpperCase();
      if (TIPOS_SEGUIMIENTO.has(tipo)) {
        encontrados.push({ noBooking, booking: b });
      }
    }
  }

  return encontrados;
}

export function normalizeFecha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value || value === "0000-00-00") return null;
  return value.slice(0, 10);
}

function subtractDays(dateStr: string | null, days: number): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Cargolink devuelve el número de contenedores como una lista separada por comas
// en "no_contenedores" (ej. "EGSU9396780,TGBU6717099,...") y el tipo por separado
// en "contenedores" (ej. "40 HC"). Aquí se combinan en un texto tipo
// "11 contenedores (Tipo 40 HC)".
function buildCantidadContenedoresTipo(booking: CargolinkBooking): string | null {
  const numeros = booking.no_contenedores
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!numeros || numeros.length === 0) return null;

  const tipo = booking.contenedores?.trim();
  const plural = numeros.length === 1 ? "contenedor" : "contenedores";
  return tipo ? `${numeros.length} ${plural} (Tipo ${tipo})` : `${numeros.length} ${plural}`;
}

function extractShipperName(shipper: CargolinkBooking["shipper"]): string | null {
  if (typeof shipper === "string") return shipper.trim() || null;
  if (shipper && typeof shipper === "object") {
    const razonsocial = shipper.razonsocial;
    const alias = shipper.alias_cliente;
    const name = (typeof razonsocial === "string" && razonsocial.trim()) || (typeof alias === "string" && alias.trim());
    return name || null;
  }
  return null;
}

export function mapCargolinkBookingToImportacion(booking: CargolinkBooking, noBookingLocal: string) {
  const vendedor = booking.nameVend?.trim() || null;
  const type = noBookingLocal.length > 10 ? noBookingLocal.slice(10) : null;

  // Para bookings tipo FCLI, "Agente" es el agente en el extranjero (nameAgenExt).
  // Para bookings tipo LCLI, Cargolink guarda el coloader dentro de "nombreNaviera"
  // (naviera no aplica para LCLI, por eso ese campo se bloquea en el formulario).
  // Para otros tipos, usamos el agente del cliente hasta que se defina la regla.
  const isLCLI = type === "LCLI";
  const agente =
    type === "FCLI"
      ? booking.nameAgenExt?.trim() || null
      : isLCLI
        ? booking.nombreNaviera?.trim() || null
        : booking.agente_cliente?.trim() || null;

  const etaAta = normalizeFecha(booking.buque_eta);

  return {
    fecha: normalizeFecha(booking.fecha_creacion),
    type,
    vendedor,
    operativo: booking.nameEjec?.trim().replace(/\s+/g, " ") || null,
    client: booking.nameCust?.trim() || null,
    agente,
    naviera: isLCLI ? null : booking.nombreNaviera?.trim() || null,
    pol: booking.sitioOrigen ? String(booking.sitioOrigen).replace(/\s*-\s*$/, "").trim() : null,
    pod: booking.sitioDestino?.trim() || null,
    mbl: booking.no_control?.trim() || null,
    contenedor: booking.no_contenedores?.trim() || null,
    cantidad_contenedores_tipo: buildCantidadContenedoresTipo(booking),
    shipper: extractShipperName(booking.shipper),
    direccion_recoleccion: booking.dir_recoleccion?.trim() || null,
    etd_atd: normalizeFecha(booking.fecha_atd),
    confirmacion_48_horas: subtractDays(normalizeFecha(booking.fecha_atd), 2),
    eta_ata: etaAta,
    notificacion_arribo_7_dias: subtractDays(etaAta, 7),
    dias_demoras:
      booking.dias_demora !== undefined && booking.dias_demora !== null
        ? Number(booking.dias_demora)
        : null,
    seguro: booking.seguro !== undefined ? booking.seguro?.trim().toUpperCase() === "SI" : null,
  };
}
