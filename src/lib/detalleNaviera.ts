// Detalle de lo que respondió la naviera (tracking_naviera.respuesta), en una
// forma común para la ventana "Información de la naviera": puerto de carga,
// puerto de descarga, buque y eventos con fecha, lugar y si ya ocurrieron.
// MSC, Maersk, Yang Ming y ZIM guardan su respuesta original; los agentes que
// leen la página (Evergreen, CMA, ONE, COSCO, Wan Hai) guardan respuesta.detalle.

export type EventoNaviera = { fecha: string | null; evento: string; lugar: string | null; real: boolean; buque?: string | null };
export type DetalleNaviera = { pol: string | null; pod: string | null; buque: string | null; eventos: EventoNaviera[] };

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
const titulo = (s: string) => s.toLowerCase().replace(/(^|[\s,(/-])\p{L}/gu, (m) => m.toUpperCase());
const hoy = () => new Date().toISOString().slice(0, 10);

// "05/12/2026" -> "2026-12-05"; "2026/10/06 13:00" o "2026-10-16T04:30" -> "2026-10-16"
function fecha(v: unknown): string | null {
  const s = txt(v);
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const ultimoBuque = (eventos: EventoNaviera[]) => [...eventos].reverse().find((e) => e.buque)?.buque ?? null;
const ciudad = (s: string) => (s ? titulo(s.split(",")[0].split(" (")[0].trim()) : null);

function msc(r: J): DetalleNaviera {
  const bl = arr(r.BillOfLadings)[0] ?? {};
  const gen = obj(bl.GeneralTrackingInfo);
  const eventos = arr(arr(bl.ContainersInfo)[0]?.Events)
    .sort((a, b) => Number(a.Order ?? 0) - Number(b.Order ?? 0))
    .map((e) => {
      const f = fecha(e.Date);
      const d = arr(e.Detail).map(txt);
      return {
        fecha: f,
        evento: txt(e.Description),
        lugar: ciudad(txt(e.Location)),
        buque: d[0] ? `${d[0]}${d[1] ? ` ${d[1]}` : ""}` : null,
        real: !/estimated/i.test(txt(e.Description)) && Boolean(f && f <= hoy()),
      };
    });
  return { pol: ciudad(txt(gen.PortOfLoad)), pod: ciudad(txt(gen.PortOfDischarge)), buque: ultimoBuque(eventos), eventos };
}

function maersk(r: J): DetalleNaviera {
  const c = arr(r.containers)[0] ?? {};
  const eventos = arr(c.locations).flatMap((l) =>
    arr(l.events).map((e) => ({
      fecha: fecha(e.event_time),
      evento: titulo(txt(e.activity)).replace("Discharg", "Discharge"),
      lugar: ciudad(txt(l.city)),
      buque: txt(e.vessel_name) ? `${txt(e.vessel_name)} ${txt(e.voyage_num)}`.trim() : null,
      real: txt(e.event_time_type) === "ACTUAL",
    })),
  );
  return { pol: ciudad(txt(obj(r.origin).city)), pod: ciudad(txt(obj(r.destination).city)), buque: ultimoBuque(eventos), eventos };
}

function yangMing(r: J): DetalleNaviera {
  const basic = obj(r.basicInfo);
  const ruta = arr(obj(r.routingInfo).routingSchedule).map((x) => ({
    fecha: fecha(x.dateTime),
    evento: txt(x.picQlfr) === "DESTINATION" ? "Llegada a destino" : "Zarpe",
    lugar: ciudad(txt(x.placeName)),
    real: txt(x.dateQlfr) === "Actual",
  }));
  // Por contenedor: eventos DCSA (el más reciente primero).
  const dcsa = arr(r.dcsaStatusInfo).map((x) => ({
    fecha: fecha(x.moveDate),
    evento: txt(x.eventDesc),
    lugar: ciudad(txt(x.atFacility).split(" - ")[0]),
    real: txt(x.eventClassifie) === "Actual",
  }));
  const actual = arr(r.dcsaContainerInfo)[0];
  const ultimo = actual ? [{ fecha: fecha(actual.moveDate), evento: txt(actual.lastEvent), lugar: ciudad(txt(actual.place).split(" - ")[0]), real: true }] : [];
  const buque = txt(basic.vesselName) ? `${txt(basic.vesselName)} ${txt(basic.vesselComn)}`.trim() : null;
  return {
    pol: ciudad(txt(basic.loading)),
    pod: ciudad(txt(basic.discharge)),
    buque,
    eventos: [...ruta, ...ultimo, ...dcsa].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "")),
  };
}

function zim(r: J): DetalleNaviera {
  const item = arr(r.consgListItem)[0] ?? arr(r.unitListItem)[0] ?? {};
  const tramos = arr(obj(item.blRouteLeg ?? item.vpBrl).vpBrl).filter((t) => txt(t.transportType) === "V");
  const cont = arr(obj(obj(item.consDetails).consContainers).consContainersItem)[0];
  const acts = arr(obj((cont ?? item).unitActivities).unitActivitiesItem);
  const eventos = [
    ...acts.map((a) => ({
      fecha: fecha(a.activityDate),
      evento: txt(a.activityDesc),
      lugar: ciudad(txt(a.placeFromDesc)),
      buque: txt(a.vesselName) ? `${txt(a.vesselName)} ${txt(a.voyage)}`.trim() : null,
      real: Boolean(fecha(a.activityDate) && (fecha(a.activityDate) as string) <= hoy()),
    })),
    ...tramos
      .filter((t) => txt(t.arrivalInd) !== "ATA")
      .map((t) => ({ fecha: fecha(t.arrivalDateDt), evento: "Llegada estimada", lugar: ciudad(txt(t.portNameTo)), buque: txt(t.vesselName) || null, real: false })),
  ].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
  const ultimoTramo = tramos[tramos.length - 1];
  return {
    pol: ciudad(txt(tramos[0]?.portNameFrom)),
    pod: ciudad(txt(ultimoTramo?.portNameTo)),
    buque: ultimoTramo ? `${txt(ultimoTramo.vesselName)} ${txt(ultimoTramo.voyage)}${txt(ultimoTramo.leg)}`.trim() : null,
    eventos,
  };
}

export function detalleNaviera(naviera: string, respuesta: unknown): DetalleNaviera | null {
  const r = obj(respuesta);
  if (!Object.keys(r).length) return null;
  if (r.detalle) {
    const d = obj(r.detalle);
    return {
      pol: txt(d.pol) || null,
      pod: txt(d.pod) || null,
      buque: txt(d.buque) || null,
      eventos: arr(d.eventos).map((e) => ({ fecha: fecha(e.fecha), evento: txt(e.evento), lugar: txt(e.lugar) || null, real: Boolean(e.real) })),
    };
  }
  switch (naviera.toUpperCase()) {
    case "MSC":
      return msc(r);
    case "MAERSK":
      return maersk(r);
    case "YANG MING":
      return yangMing(r);
    case "ZIM":
      return zim(r);
    default:
      return null;
  }
}

// Zarpe real según la naviera: el primer evento ya ocurrido de carga o salida del buque.
export function zarpeSegunNaviera(eventos: EventoNaviera[]): string | null {
  return (
    eventos
      .filter((e) => e.real && e.fecha && /load|depart|zarpe|sail|cargado|on board/i.test(e.evento) && !/empty|vac/i.test(e.evento))
      .map((e) => e.fecha as string)
      .sort()[0] ?? null
  );
}
