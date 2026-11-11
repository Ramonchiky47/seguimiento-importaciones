// Portal de clientes (piloto, 11 nov 2026). Convierte los bookings activos de un
// cliente en el estado que ve el cliente y en un texto explicado en palabras.
// Fuente: rpc portal_clientes_embarques (track_embarques + Cargolink + rastreo naviera).

export type FilaPortal = {
  b: string;
  atd: string | null;
  etd: string | null;
  eta: string | null;
  ata: string | null;
  dl: number | null;
  udl: string | null;
  o: string | null;
  d: string | null;
  sh: string | null;
  m: string | null;
  c: string | null;
  inc: string | null;
  mbl: string | null;
  rev: string | null;
  th: string | null;
  tm: string | null;
  rv: string | null;
  bq: string | null;
  ej: string | null;
  nav: string | null;
  en: string | null;
  tr: { lugar?: string }[] | null;
  ue: string | null;
  uef: string | null;
};

export type EstadoCliente = "zarpar" | "transito" | "puerto" | "cierre" | "cerrado";

export type Embarque = {
  booking: string;
  estado: EstadoCliente;
  pasos: number; // pasos completos de 6
  urgente: boolean;
  origen: string;
  destino: string;
  mercancia: string;
  proveedor: string;
  incoterm: string;
  mbl: string;
  buque: string;
  naviera: string;
  etd: string | null;
  atd: string | null;
  eta: string | null;
  ata: string | null;
  ultimoDiaLibre: string | null;
  diasLibres: number | null;
  diasRestantes: number | null;
  documentos: string;
  contenedores: string[];
  transbordos: string[];
  eventoNaviera: string | null;
  texto: string;
};

export const PASOS = ["Reservado", "Zarpó", "En tránsito", "Arribó", "Revalidado", "Concluido"];
export const ETIQUETA: Record<EstadoCliente, string> = {
  zarpar: "Por zarpar",
  transito: "En tránsito",
  puerto: "En puerto",
  cierre: "Por cerrar",
  cerrado: "Concluido",
};

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fecha(v: unknown): string | null {
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !s.startsWith("0000") && s > "2000" ? s : null;
}
export function fc(d: string | null): string {
  if (!d) return "—";
  const [, m, dd] = d.split("-");
  return `${Number(dd)} ${MES[Number(m) - 1]}`;
}
export function difDias(d: string, hoy: string): number {
  return Math.round((Date.parse(d + "T12:00:00Z") - Date.parse(hoy + "T12:00:00Z")) / 864e5);
}
const dias = (n: number) => (Math.abs(n) === 1 ? "1 día" : `${Math.abs(n)} días`);
const limpio = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
function lugar(s: string | null): string {
  const t = limpio(s)
    .replace(/SHNAGHAI/i, "SHANGHAI")
    .replace(/ - CHINA$/i, "")
    .replace(/MAZATLAN-SINAL/i, "MAZATLÁN");
  return t.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (_a, b: string, c: string) => b + c.toUpperCase());
}
function mercancia(s: string | null): string {
  const t = limpio(s)
    .toLowerCase()
    .replace("vesitr", "vestir")
    .replace("furnitrue", "furniture")
    .replace("plegbles", "plegables")
    .replace("vidro", "vidrio")
    .replace("equipo para gimnasio", "equipo de gimnasio")
    .replace(/\.$/, "");
  return t === "furniture" ? "muebles" : t;
}
const buque = (s: string | null) => limpio(s).replace(/\s+V\.?\s*\w+$/i, "").toUpperCase();

export function armarEmbarque(x: FilaPortal, hoy: string): Embarque {
  let atd = fecha(x.atd);
  let ata = fecha(x.ata);
  let etd = fecha(x.etd);
  const eta = fecha(x.eta);
  const udl = fecha(x.udl);
  const rev = fecha(x.rev);
  const th = fecha(x.th);
  const tm = fecha(x.tm);
  const rv = fecha(x.rv);
  const en = fecha(x.en);
  const uef = fecha(x.uef);
  // La vista rellena el arribo con la ETA: solo cuenta si ya pasó.
  if (ata && ata > hoy) ata = null;
  if (atd && atd > hoy) {
    etd = etd ?? atd;
    atd = null;
  }
  const contenedores = (x.c ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{4}\d{6,7}$/.test(c));
  const bq = buque(x.bq);
  const o = lugar(x.o);
  const d = lugar(x.d);
  const m = mercancia(x.m);
  const nav = limpio(x.nav);
  const trans = (x.tr ?? []).map((t) => t.lugar ?? "").filter(Boolean);
  const eventoValido = Boolean(x.ue && uef && atd && uef >= atd);

  let estado: EstadoCliente;
  if (!atd) estado = "zarpar";
  else if (!ata) estado = "transito";
  else if (rv) estado = "cerrado";
  else if (udl && udl < hoy) estado = "cierre";
  else estado = "puerto";

  const t: string[] = [];
  if (estado === "zarpar") {
    if (etd && bq) t.push(`Tu carga de ${m} está reservada para salir de ${o} el ${fc(etd)} en el buque ${bq}.`);
    else if (etd) t.push(`Tu carga de ${m} está reservada para salir de ${o} el ${fc(etd)}; la naviera aún no asigna el buque.`);
    else if (bq) t.push(`Tu carga de ${m} ya tiene espacio en el buque ${bq} desde ${o}; la naviera aún no confirma la fecha de salida.`);
    else
      t.push(
        `Estamos coordinando con el proveedor en ${o} la carga de tu mercancía (${m}). En cuanto la naviera confirme buque y fecha de salida lo verás aquí.`,
      );
    if (eta) t.push(`Llegada estimada a ${d}: ${fc(eta)}.`);
  } else if (estado === "transito") {
    t.push(`Zarpó de ${o} el ${fc(atd)} a bordo del ${bq || "buque asignado"}${trans.length ? `, con transbordo en ${trans[0]}` : ""}.`);
    if (eta) {
      const n = difDias(eta, hoy);
      t.push(n > 0 ? `Llega a ${d} el ${fc(eta)}, en ${dias(n)}.` : `Su llegada a ${d} estaba prevista el ${fc(eta)}; estamos confirmando el arribo con la naviera.`);
    }
    if (nav && en && eventoValido && eta && en !== eta) {
      const dd = difDias(en, eta);
      t.push(`${nav} reporta ahora llegada el ${fc(en)}, ${dias(dd)} ${dd > 0 ? "después" : "antes"} de lo previsto; ya lo estamos siguiendo.`);
    }
    if (th && tm) t.push("Los documentos de liberación (telex) ya están listos para cuando arribe.");
    else if (th || tm) t.push("Ya tenemos parte de los documentos de liberación; esperamos el resto antes del arribo.");
  } else {
    t.push(`Arribó a ${d} el ${fc(ata)}${bq ? ` en el ${bq}` : ""}.`);
    if (estado === "cerrado") t.push(`El contenedor vacío se devolvió el ${fc(rv)}. Embarque concluido.`);
    else if (estado === "cierre")
      t.push(`Los días libres terminaron el ${fc(udl)}. Estamos confirmando la devolución del contenedor vacío para cerrar el embarque.`);
    else {
      if (rev) t.push(`La revalidación quedó lista el ${fc(rev)}; la mercancía ya puede despacharse.`);
      else if (th && tm) t.push("Los telex están liberados; estamos revalidando con la naviera.");
      else t.push("Estamos liberando los documentos con la naviera para revalidar.");
      if (udl) {
        const n = difDias(udl, hoy);
        t.push(`Tienes ${x.dl ?? ""} días libres: el último es el ${fc(udl)}${n > 0 ? ` (quedan ${dias(n)})` : " (hoy)"}.`);
      }
    }
  }

  let pasos = 1;
  if (estado === "transito") pasos = 3;
  else if (estado !== "zarpar") pasos = estado === "cerrado" ? 6 : rev ? 5 : 4;
  const diasRestantes = udl ? difDias(udl, hoy) : null;
  const sh = limpio(x.sh);

  return {
    booking: x.b,
    estado,
    pasos,
    urgente: estado === "puerto" && diasRestantes !== null && diasRestantes <= 5,
    origen: o,
    destino: d,
    mercancia: m,
    proveedor: /^\d/.test(sh) ? "" : sh,
    incoterm: limpio(x.inc),
    mbl: limpio(x.mbl),
    buque: bq,
    naviera: nav,
    etd,
    atd,
    eta,
    ata,
    ultimoDiaLibre: udl,
    diasLibres: x.dl,
    diasRestantes,
    documentos: rev ? `Revalidado el ${fc(rev)}` : th && tm ? "Telex liberados" : th || tm ? "Telex en proceso" : estado === "zarpar" ? "" : "En proceso",
    contenedores,
    transbordos: trans,
    eventoNaviera: eventoValido ? `${x.ue} · ${fc(uef)}` : null,
    texto: t.join(" "),
  };
}

function lista(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}
function masFrecuentes(xs: string[], n: number): string[] {
  const c = new Map<string, number>();
  xs.filter(Boolean).forEach((x) => c.set(x, (c.get(x) ?? 0) + 1));
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}
const plural = (n: number, s: string, p = s + "s") => `${n} ${n === 1 ? s : p}`;

/** Resumen del cliente en 2–4 párrafos, armado con sus datos del día. */
export function narrativa(es: Embarque[], hoy: string): string[] {
  const p: string[] = [];
  const conts = es.reduce((a, e) => a + e.contenedores.length, 0);
  p.push(
    `Hoy tienes ${plural(es.length, "embarque activo", "embarques activos")} con nosotros${conts ? ` y ${plural(conts, "contenedor", "contenedores")} en movimiento` : ""}, principalmente de ${lista(masFrecuentes(es.map((e) => e.mercancia), 2))} desde ${lista(masFrecuentes(es.map((e) => e.origen), 3))} hacia ${lista(masFrecuentes(es.map((e) => e.destino), 2))}.`,
  );

  const urg = es.filter((e) => e.urgente).sort((a, b) => (a.ultimoDiaLibre ?? "").localeCompare(b.ultimoDiaLibre ?? ""));
  const enPuerto = es.filter((e) => e.estado === "puerto");
  if (urg.length) {
    const grupos = new Map<string, Embarque[]>();
    urg.forEach((e) => {
      const k = `${e.ultimoDiaLibre}|${e.buque}`;
      grupos.set(k, [...(grupos.get(k) ?? []), e]);
    });
    const frases = [...grupos.entries()].slice(0, 3).map(([k, l]) => {
      const [d, bq] = k.split("|");
      const nc = l.reduce((a, e) => a + e.contenedores.length, 0);
      const q = difDias(d, hoy);
      const v = l.length === 1 ? "termina" : "terminan";
      return `${l.length === 1 ? "el booking " + l[0].booking : plural(l.length, "booking")}${bq ? ` del ${bq}` : ""} (${plural(nc, "contenedor", "contenedores")}) ${q <= 0 ? `${v} hoy sus días libres` : `${v} sus días libres el ${fc(d)}, en ${dias(q)}`}`;
    });
    const resto = enPuerto.filter((e) => !e.urgente);
    const listos = resto.filter((e) => e.pasos >= 5).length;
    p.push(
      `Lo más urgente: ${frases.join("; ")}. Te ayudamos a programar el retiro a tiempo.` +
        (resto.length
          ? ` ${resto.length === 1 ? "Tu otro embarque en puerto sigue" : `Tus otros ${resto.length} embarques en puerto siguen`} dentro de días libres${listos ? ` (${listos === resto.length ? (resto.length === 1 ? "ya revalidado" : "todos revalidados") : `${listos} revalidados`})` : ""}.`
          : ""),
    );
  } else if (enPuerto.length) {
    const prim = [...enPuerto].sort((a, b) => (a.ultimoDiaLibre ?? "9").localeCompare(b.ultimoDiaLibre ?? "9"))[0];
    const listos = enPuerto.filter((e) => e.pasos >= 5).length;
    p.push(
      `${enPuerto.length === 1 ? "Tu embarque en puerto está" : `Tus ${enPuerto.length} embarques en puerto están`} dentro de sus días libres${listos ? ` (${listos === enPuerto.length ? "todos" : listos} ya revalidado${listos === 1 ? "" : "s"})` : ""}; el primero en vencer es el ${prim.buque ? `del ${prim.buque}` : prim.booking}, el ${fc(prim.ultimoDiaLibre)}.`,
    );
  }

  const tr = es.filter((e) => e.estado === "transito" && e.eta && e.eta >= hoy).sort((a, b) => (a.eta ?? "").localeCompare(b.eta ?? ""));
  const zar = es.filter((e) => e.estado === "zarpar").length;
  const frasesTr: string[] = [];
  if (es.some((e) => e.estado === "transito")) {
    const porBuque = new Map<string, { eta: string; n: number }>();
    tr.forEach((e) => {
      const k = e.buque || e.booking;
      if (!porBuque.has(k)) porBuque.set(k, { eta: e.eta!, n: 0 });
      porBuque.get(k)!.n += e.contenedores.length;
    });
    const prox = [...porBuque.entries()].slice(0, 4).map(([bq, v]) => `${bq} el ${fc(v.eta)}`);
    frasesTr.push(
      `En el mar ${es.filter((e) => e.estado === "transito").length === 1 ? "viene 1 booking" : `vienen ${es.filter((e) => e.estado === "transito").length} bookings`}${prox.length ? `; las próximas llegadas son ${lista(prox)}` : ""}.`,
    );
  }
  if (zar) frasesTr.push(`${zar === 1 ? "Tenemos 1 booking reservado" : `Tenemos ${zar} bookings reservados`} en origen esperando salida.`);
  if (frasesTr.length) p.push(frasesTr.join(" "));

  const cierre = es.filter((e) => e.estado === "cierre").length;
  if (cierre) p.push(`${plural(cierre, "booking")} ya terminaron sus días libres; estamos confirmando la devolución del vacío para cerrarlos.`);
  return p;
}
