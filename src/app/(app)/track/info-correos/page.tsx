import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fechaCorta } from "@/lib/track";
import { getMyPermissions } from "@/lib/permissions";
import { RevisarCorreos } from "@/components/RevisarCorreos";

export const dynamic = "force-dynamic";

// Info correos: datos del embarque que manda el agente de origen por correo
// (tabla info_correos, la llena info_correos.py en la Mac) contra lo capturado
// en Cargolink. Cada dato dice si coincide, si es distinto o si falta en Cargolink.

type Datos = Record<string, string | null | undefined>;
type Correo = {
  id: number;
  id_booking: number;
  no_booking: string;
  asunto: string | null;
  reenviado_por: string | null;
  fecha_correo: string | null;
  agente_origen: string | null;
  formato: "completo" | "parcial";
  datos: Datos;
  liga: string | null;
};
type Booking = {
  id_booking: number;
  no_booking: string;
  cliente: string | null;
  ejecutivo: string | null;
  mbl: string | null;
  contenedores: string | null;
  etd_atd: string | null;
  eta: string | null;
  ata: string | null;
  origen: string | null;
  destino: string | null;
  shipper: string | null;
  consignatario: string | null;
  buque: string | null;
  viaje: string | null;
  carrier: string | null;
  agente_ext: string | null;
  sitio_origen: string | null;
  sitio_destino: string | null;
};
type Estado = "igual" | "distinto" | "falta_cl" | "sin_dato";

const TH = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const limpio = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// Palabras que no distinguen a una empresa (razón social, país, giro).
const COMUNES = new Set(["SA", "DE", "CV", "SAPI", "RL", "SRL", "CO", "LTD", "LIMITED", "INC", "LLC", "MEXICO", "CHINA", "LOGISTICS", "LOGISTIC", "INTERNATIONAL", "SHIPPING", "SHENZHEN", "GROUP", "THE", "Y", "AND"]);
const palabras = (s: string | null | undefined) =>
  new Set((s ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !COMUNES.has(w)));
const ciudad = (s: string | null | undefined) => limpio((s ?? "").split(",")[0].split(" - ")[0]);
// Alias de navieras que usan los agentes de origen.
const NAVIERA_ALIAS: [RegExp, RegExp][] = [
  [/^MSK|MAERSK/i, /MAERSK|SEALAND/i],
  [/^MSC/i, /MEDITERRANEAN|\bMSC\b/i],
  [/COSCO/i, /COSCO|OOCL/i],
  [/^CMA/i, /CMA/i],
  [/^ONE\b|OCEAN NETWORK/i, /OCEAN NETWORK|\bONE\b/i],
  [/HPL|HAPAG/i, /HAPAG/i],
  [/YANG ?MING|^YML/i, /YANG ?MING/i],
  [/EVERGREEN|^EMC/i, /EVERGREEN/i],
  [/WAN ?HAI|^WHL/i, /WAN HAI/i],
  [/ZIM/i, /\bZIM\b/i],
];

function comparar(campo: string, correo: string | null | undefined, cl: string | null | undefined): Estado {
  if (!correo) return "sin_dato";
  if (!cl) return "falta_cl";
  switch (campo) {
    case "portador": {
      const par = NAVIERA_ALIAS.find(([a]) => a.test(correo));
      return par ? (par[1].test(cl) ? "igual" : "distinto") : limpio(cl).includes(limpio(correo)) ? "igual" : "distinto";
    }
    case "pol":
    case "pod":
    case "destino":
      return ciudad(cl).includes(ciudad(correo)) || ciudad(correo).includes(ciudad(cl)) ? "igual" : "distinto";
    case "contenedores": {
      const a = new Set(limpio(correo).match(/[A-Z]{4}\d{7}/g) ?? []);
      const b = new Set(limpio(cl).match(/[A-Z]{4}\d{7}/g) ?? []);
      return a.size === b.size && [...a].every((c) => b.has(c)) ? "igual" : "distinto";
    }
    case "booking":
      return limpio(correo) === limpio(cl) ? "igual" : "distinto";
    case "cliente":
    case "agente": {
      const a = palabras(correo);
      return [...palabras(cl)].some((w) => a.has(w)) ? "igual" : "distinto";
    }
    case "remitente":
    case "consignatario":
      return limpio(cl).slice(0, 12) === limpio(correo).slice(0, 12) || limpio(correo).includes(limpio(cl)) ? "igual" : "distinto";
    case "atd":
    case "eta":
      return correo === cl.slice(0, 10) ? "igual" : "distinto";
    default:
      return limpio(correo) === limpio(cl) ? "igual" : "distinto";
  }
}

const ESTADO: Record<Estado, { texto: string; clase: string }> = {
  igual: { texto: "✓ Igual", clase: "text-green-700 dark:text-green-400" },
  distinto: { texto: "≠ Distinto", clase: "font-semibold text-red-700 dark:text-red-400" },
  falta_cl: { texto: "Falta en Cargolink", clase: "font-semibold text-amber-700 dark:text-amber-400" },
  sin_dato: { texto: "El correo no lo trae", clase: "text-slate-400" },
};

function filas(c: Correo, b: Booking | undefined) {
  const d = c.datos;
  const atdCl = b?.etd_atd ?? null;
  const etaCl = b?.ata ?? b?.eta ?? null;
  return [
    { campo: "booking", etiqueta: "Número de booking", correo: d.booking_correo, cl: b?.no_booking },
    { campo: "cliente", etiqueta: "Cliente", correo: d.cliente_correo, cl: b?.cliente },
    { campo: "agente", etiqueta: "Agente extranjero", correo: d.agente_correo ?? c.agente_origen, cl: b?.agente_ext },
    { campo: "portador", etiqueta: "Portador (naviera)", correo: d.portador, cl: b?.carrier },
    { campo: "buque", etiqueta: "Buque", correo: d.buque?.replace(/\s+\S*\d\S*$/, ""), cl: b?.buque },
    { campo: "viaje", etiqueta: "Viaje", correo: d.buque?.match(/\s(\S*\d\S*)$/)?.[1].replace(/^V\.?/, ""), cl: b?.viaje },
    { campo: "atd", etiqueta: "ATD (fecha de zarpe)", correo: d.atd_iso, cl: atdCl, fecha: true },
    { campo: "eta", etiqueta: b?.ata ? "ETA vs ATA de Cargolink" : "ETA (fecha estimada de llegada)", correo: d.eta_iso, cl: etaCl, fecha: true },
    { campo: "pol", etiqueta: "Origen (POL)", correo: d.pol, cl: b?.sitio_origen || b?.origen },
    { campo: "pod", etiqueta: "Puerto de descarga (POD)", correo: d.pod, cl: b?.sitio_destino || b?.destino },
    { campo: "destino", etiqueta: "Destino final", correo: d.destino, cl: b?.sitio_destino || b?.destino },
    { campo: "mbl", etiqueta: "MB/L", correo: d.mbl, cl: b?.mbl, nota: d.mbl_estatus },
    { campo: "hbl", etiqueta: "HB/L", correo: d.hbl, cl: null, nota: d.hbl_estatus, sinCampo: true },
    { campo: "contenedores", etiqueta: "Contenedores", correo: d.contenedores, cl: b?.contenedores },
    { campo: "remitente", etiqueta: "Remitente (shipper)", correo: d.remitente, cl: b?.shipper },
    { campo: "consignatario", etiqueta: "Consignatario", correo: d.consignatario, cl: b?.consignatario },
    { campo: "direccion", etiqueta: "Dirección", correo: d.direccion, cl: null, sinCampo: true },
    { campo: "notificar", etiqueta: "Notificar", correo: d.notificar, cl: null, sinCampo: true },
  ];
}

export default async function InfoCorreosPage() {
  const supabase = await createClient();
  const permisos = await getMyPermissions();
  const { data, error } = await supabase.from("info_correos").select("*").order("fecha_correo", { ascending: false }).limit(200);
  const correos = (data ?? []) as Correo[];
  const ids = [...new Set(correos.map((c) => c.id_booking))];
  const { data: ops } = ids.length
    ? await supabase
        .from("operaciones_maritima")
        .select("id_booking, no_booking, cliente, ejecutivo, mbl, contenedores, etd_atd, eta, ata, origen, destino, shipper, consignatario, buque:datos->>buque, viaje:datos->>no_viaje, id_carrier:datos->>buque_carrier, agente_ext:datos->>nameAgenExt, sitio_origen:datos->>sitioOrigenNombre, sitio_destino:datos->>sitioDestinoNombre")
        .in("id_booking", ids)
    : { data: [] };
  const carriers = [...new Set((ops ?? []).map((o) => o.id_carrier as string).filter(Boolean))];
  const { data: provs } = carriers.length
    ? await supabase.from("proveedores_cargolink").select("id_proveedor, razonsocial").in("id_proveedor", carriers)
    : { data: [] };
  const razon = new Map((provs ?? []).map((p) => [String(p.id_proveedor), p.razonsocial as string]));
  const bookings = new Map(
    (ops ?? []).map((o) => [o.id_booking as number, { ...(o as unknown as Booking), carrier: razon.get(String(o.id_carrier)) ?? null }]),
  );
  const conDiferencias = correos.filter((c) => filas(c, bookings.get(c.id_booking)).some((f) => !f.sinCampo && ["distinto", "falta_cl"].includes(comparar(f.campo, f.correo, f.fecha ? f.cl?.slice(0, 10) : f.cl))));

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Datos del embarque que manda el agente de origen por correo (booking en el asunto), comparados con Cargolink.
          {correos.length > 0 && (
            <>
              {" "}
              <strong>{correos.length}</strong> correos · <strong className="text-red-700 dark:text-red-400">{conDiferencias.length}</strong> con diferencias.
            </>
          )}
        </p>
        <RevisarCorreos esAdmin={Boolean(permisos.es_admin)} />
      </div>
      {error ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-6 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Falta crear la tabla de Info correos en Supabase (info_correos.sql). Mientras no exista, aquí no aparece nada.
        </p>
      ) : correos.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Todavía no hay correos leídos. Aparecen aquí cuando se cargan los datos del embarque de cada correo.
        </p>
      ) : (
        correos.map((c) => {
          const b = bookings.get(c.id_booking);
          return (
            <section key={c.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                  <Link href={`/track/interactivo/${c.id_booking}`} className="font-mono text-blue-700 underline dark:text-blue-400">
                    {c.no_booking}
                  </Link>{" "}
                  <span className="text-sm font-normal text-slate-600 dark:text-slate-300">
                    {b?.cliente ?? "—"} · {b?.ejecutivo ?? "Sin ejecutivo"}
                  </span>
                  {c.formato === "parcial" && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      Datos parciales
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {c.agente_origen ?? "Agente de origen"} · {c.fecha_correo ? fechaCorta(c.fecha_correo) : ""}
                  {c.liga && (
                    <>
                      {" · "}
                      <a href={c.liga} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline dark:text-blue-400">
                        Abrir correo
                      </a>
                    </>
                  )}
                </p>
              </div>
              {c.asunto && <p className="truncate px-4 pt-2 text-xs text-slate-500 dark:text-slate-400" title={c.asunto}>{c.asunto}</p>}
              {c.datos.nota && <p className="px-4 pt-1 text-xs font-semibold text-amber-800 dark:text-amber-300">{c.datos.nota}</p>}
              {c.datos.historial && (
                <p className="px-4 pt-1 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-semibold">En la cadena de correos:</span> {c.datos.historial}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th scope="col" className={TH}>Dato</th>
                      <th scope="col" className={TH}>Correo</th>
                      <th scope="col" className={TH}>Cargolink</th>
                      <th scope="col" className={TH}>Comparación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filas(c, b).map((f) => {
                      const cl = f.fecha ? f.cl?.slice(0, 10) : f.cl;
                      const est = f.sinCampo ? null : ESTADO[comparar(f.campo, f.correo, cl)];
                      return (
                        <tr key={f.campo} className="align-top">
                          <td className="px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-200">{f.etiqueta}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">
                            {f.correo ? (f.fecha ? fechaCorta(f.correo) : f.correo) : "—"}
                            {f.nota && <span className="ml-1 font-sans text-[11px] text-slate-500">({f.nota})</span>}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs">{f.sinCampo ? <span className="font-sans text-slate-400">No se carga de Cargolink</span> : cl ? (f.fecha ? fechaCorta(cl) : cl) : "—"}</td>
                          <td className={`px-3 py-1.5 text-xs ${est?.clase ?? "text-slate-400"}`}>{est?.texto ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}
