// Datos del correo (Track › Info correos) que se pasan solos a Cargolink
// (indicación de Ramón, 31 oct 2026). Tiene que ser 100 % seguro, así que:
// - Solo se llena lo que en Cargolink está vacío: nunca se sobrescribe ni se
//   finaliza (Guardar = EDICION); lo distinto se queda como "Propuesto" en ámbar.
// - Cada dato pasa reglas estrictas; ante cualquier duda no se pasa y se dice por qué.
// ATA no viene en los correos (es de la naviera) y los contenedores no tienen
// etapa con la que guardarlos en Cargolink: ninguno de los dos se pasa.

export type CorreoInfo = {
  id_booking: number;
  no_booking: string;
  fecha_correo: string | null;
  asunto: string | null;
  datos: Record<string, unknown>;
};
export type OperacionCl = {
  id_booking: number;
  fecha: string | null;
  etd_atd: string | null;
  eta: string | null;
  mbl: string | null;
  buque: string | null;
  no_viaje: string | null;
  hbl: string | null;
  mov_atd: string | null;
  mov_eta: string | null;
  mov_origen: string | null;
};
export type Cambio = { etapa: "atd" | "eta" | "origen"; valores: Record<string, string>; detalle: string };
export type Rechazo = { campo: string; valor: string; motivo: string };

const MESES: Record<string, number> = {
  JAN: 1, ENE: 1, FEB: 2, MAR: 3, APR: 4, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, AGO: 8,
  SEP: 9, SET: 9, OCT: 10, NOV: 11, DEC: 12, DIC: 12,
};
const iso = (y: number, m: number, d: number) => {
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d
    ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    : null;
};
const sumarDias = (f: string, n: number) => new Date(Date.parse(f) + n * 86400000).toISOString().slice(0, 10);

// Fechas posibles del texto tal como viene en el correo. Solo con año escrito;
// "10.1", "20/10" o "22 OCTUBRE" no bastan. Si día y mes se pueden leer de dos
// formas (04/11/2026) regresa las dos.
export function lecturas(texto: string): string[] {
  const t = texto.trim().toUpperCase();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return [iso(+m[1], +m[2], +m[3])].filter(Boolean) as string[];
  m = t.match(/^(\d{1,2})[-/ ]([A-Z]{3})[A-Z]*[-/ ,]+(\d{4})$/);
  if (m && MESES[m[2]]) return [iso(+m[3], MESES[m[2]], +m[1])].filter(Boolean) as string[];
  m = t.match(/^([A-Z]{3})[A-Z]*[-/ ](\d{1,2})[-/ ,]+(\d{4})$/);
  if (m && MESES[m[1]]) return [iso(+m[3], MESES[m[1]], +m[2])].filter(Boolean) as string[];
  m = t.match(/^(\d{4})[-/ ]([A-Z]{3})[A-Z]*[-/ ](\d{1,2})$/);
  if (m && MESES[m[2]]) return [iso(+m[1], MESES[m[2]], +m[3])].filter(Boolean) as string[];
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return [...new Set([iso(+m[3], +m[2], +m[1]), iso(+m[3], +m[1], +m[2])].filter(Boolean) as string[])];
  return [];
}

// Un campo que en la misma cadena de correos va y viene (A → B → A) no es confiable.
function inestable(datos: Record<string, unknown>, campo: string): boolean {
  const cambios = (datos.cambios as { campo: string; despues: unknown }[] | undefined) ?? [];
  const vistos = new Set<string>();
  for (const c of cambios.filter((x) => x.campo === campo)) {
    const v = String(c.despues ?? "");
    if (vistos.has(v)) return true;
    vistos.add(v);
  }
  return false;
}

const vacio = (v: string | null | undefined) => !v || !v.trim() || v.startsWith("0000");
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const MBL = /^([A-Z]{4}[A-Z0-9]{6,16}|\d{9,12})$/;
const HBL = /^[A-Z]{2,5}\d{6,14}$/;
// Nombre del buque (solo letras) y viaje (con algún número): "TS NANSHA 2609E",
// "MSC ANTONIA/QM639A", "WAN HAI A12 V.E012" no (el nombre trae número).
const BUQUE = /^([A-Z][A-Z .'-]*[A-Z])\s*(?:\/\s*|\s+)(?:V\.?\s*)?([A-Z0-9-]*\d[A-Z0-9-]*)$/;
const NO_BUQUE = /\b(ETD|ETA|DEL|TBA|TBC|TBN|PENDING|POR CONFIRMAR|CONFIRM)\b/;

export function cambiosDesdeCorreo(
  c: CorreoInfo,
  op: OperacionCl,
  navEta: string | null,
  usados: { mbl: Set<string>; hbl: Set<string> },
  hoy: string,
): { cambios: Cambio[]; rechazos: Rechazo[] } {
  const d = c.datos;
  const cambios: Cambio[] = [];
  const rechazos: Rechazo[] = [];
  const no = (campo: string, valor: string, motivo: string) => rechazos.push({ campo, valor, motivo });

  // Zarpe (ATD): ya pasó, no antes del booking ni de hace más de 120 días.
  let atd: string | null = null;
  const atdTxt = texto(d.atd);
  if (atdTxt && vacio(op.etd_atd)) {
    const minimo = [op.fecha?.slice(0, 10) ?? "", sumarDias(hoy, -120)].sort().at(-1)!;
    const validas = lecturas(atdTxt).filter((f) => f <= hoy && f >= minimo);
    if (op.mov_atd === "FINALIZADO") no("ATD", atdTxt, "La etapa ya está finalizada en Cargolink.");
    else if (inestable(d, "atd")) no("ATD", atdTxt, "La fecha cambia de ida y vuelta en la cadena de correos.");
    else if (validas.length !== 1) {
      no("ATD", atdTxt, lecturas(atdTxt).some((f) => f > hoy) ? "Fecha futura: es un ETD, aún no zarpa." : "Sin fecha completa (día, mes y año) o se puede leer de dos formas.");
    } else if (validas[0] !== texto(d.atd_iso)) no("ATD", atdTxt, "No coincide con la fecha que leyó el agente.");
    else {
      atd = validas[0];
      cambios.push({ etapa: "atd", valores: { fecha_atd: atd }, detalle: `ATD ${atd} (correo: "${atdTxt}")` });
    }
  }

  // ETA: después del zarpe y a 75 días o menos; si la naviera da otra, manda la naviera.
  const etaTxt = texto(d.eta);
  if (etaTxt && vacio(op.eta)) {
    const base = op.etd_atd?.slice(0, 10) ?? atd;
    const validas = lecturas(etaTxt).filter((f) => base && f > base && f <= sumarDias(base, 75));
    if (!base) no("ETA", etaTxt, "Sin zarpe (ATD) para validar la fecha.");
    else if (op.mov_eta === "FINALIZADO") no("ETA", etaTxt, "La etapa ya está finalizada en Cargolink.");
    else if (inestable(d, "eta")) no("ETA", etaTxt, "La fecha cambia de ida y vuelta en la cadena de correos.");
    else if (validas.length !== 1) no("ETA", etaTxt, "Sin fecha completa, fuera de rango o se puede leer de dos formas.");
    else if (validas[0] !== texto(d.eta_iso)) no("ETA", etaTxt, "No coincide con la fecha que leyó el agente.");
    else if (navEta && navEta.slice(0, 10) !== validas[0]) no("ETA", etaTxt, `La naviera da otra ETA (${navEta.slice(0, 10)}).`);
    else cambios.push({ etapa: "eta", valores: { buque_eta: validas[0] }, detalle: `ETA ${validas[0]} (correo: "${etaTxt}")` });
  }

  // Origen: buque y viaje, MBL y HBL en un solo guardado.
  const origen: Record<string, string> = {};
  const det: string[] = [];
  if (op.mov_origen === "FINALIZADO") {
    if (texto(d.buque) || texto(d.mbl) || texto(d.hbl)) no("Origen", "", "La etapa Origen ya está finalizada en Cargolink.");
  } else {
    const buqueTxt = texto(d.buque).toUpperCase();
    if (buqueTxt && vacio(op.buque)) {
      const m = buqueTxt.match(BUQUE);
      if (!m || NO_BUQUE.test(buqueTxt)) no("Buque", buqueTxt, "No se distingue con claridad el nombre del buque y el viaje.");
      else if (inestable(d, "buque")) no("Buque", buqueTxt, "Cambia de ida y vuelta en la cadena de correos.");
      else {
        origen.buque = m[1].replace(/\s+/g, " ");
        if (vacio(op.no_viaje)) origen.no_viaje = m[2];
        det.push(`Buque ${origen.buque}${origen.no_viaje ? ` viaje ${origen.no_viaje}` : ""} (correo: "${buqueTxt}")`);
      }
    }
    const mbl = texto(d.mbl).toUpperCase();
    if (mbl && vacio(op.mbl)) {
      if (!MBL.test(mbl)) no("MBL", mbl, "No tiene formato de un solo BL (o trae varios / texto).");
      else if (usados.mbl.has(mbl)) no("MBL", mbl, "Ese MBL ya está en otro booking de Cargolink.");
      else if (inestable(d, "mbl")) no("MBL", mbl, "Cambia de ida y vuelta en la cadena de correos.");
      else {
        origen.no_control = mbl;
        det.push(`MBL ${mbl}`);
      }
    }
    const hbl = texto(d.hbl).toUpperCase();
    if (hbl && vacio(op.hbl)) {
      if (!HBL.test(hbl)) no("HBL", hbl, "No tiene formato de un solo HBL (o trae varios / texto).");
      else if (hbl === mbl) no("HBL", hbl, "Es igual al MBL.");
      else if (usados.hbl.has(hbl)) no("HBL", hbl, "Ese HBL ya está en otro booking de Cargolink.");
      else if (inestable(d, "hbl")) no("HBL", hbl, "Cambia de ida y vuelta en la cadena de correos.");
      else {
        origen.no_agentes = hbl;
        det.push(`HBL ${hbl}`);
      }
    }
  }
  if (Object.keys(origen).length) cambios.push({ etapa: "origen", valores: origen, detalle: det.join(" · ") });
  return { cambios, rechazos };
}

// Texto de la bitácora: de qué correo salió.
export function fuenteCorreo(c: CorreoInfo): string {
  const ev = (c.datos.evidencia ?? {}) as { de?: string | null };
  const fecha = c.fecha_correo ? c.fecha_correo.slice(0, 10) : "s/f";
  return `Fuente: correo del ${fecha}${ev.de ? ` de ${ev.de}` : ""}${c.asunto ? ` · "${c.asunto.slice(0, 120)}"` : ""}`;
}
