// Qué naviera rastrea cada booking. Manda la referencia (MBL o contenedor
// propio de la naviera); la capturada en Cargolink solo se usa si la
// referencia no la delata, porque a veces está mal capturada (ej. 2608-4158:
// Cargolink dice Yang Ming y el MBL y contenedor son de Maersk).
// Mismas reglas que ~/Agentes/operaciones_maritima/navieras.py.

// buque_carrier de Cargolink -> naviera con agente de rastreo.
const POR_CARRIER: Record<string, string> = { "157": "MSC", "1497": "Maersk", "1419": "Yang Ming", "2129": "ZIM", "1387": "ZIM", "271": "Evergreen", "1894": "Evergreen", "29": "CMA CGM", "5": "ONE", "4": "COSCO", "214": "Wan Hai", "31": "Hapag-Lloyd", "3403": "PIL" };
// Nombres de los agentes de la Mac (tracking_navieras.py), en el orden en que se consultan.
export const AGENTES_RASTREO = ["MSC", "MAERSK", "YANG MING", "EVERGREEN", "TS LINES", "SINOKOR", "CMA CGM", "ONE", "COSCO", "WAN HAI", "PIL", "ZIM", "HAPAG-LLOYD"];
export const tituloAgente = (n: string) => (n.length <= 3 ? n : n.charAt(0) + n.slice(1).toLowerCase());

export const NAVIERAS_CON_AGENTE = ["MSC", "Maersk", "Yang Ming", "ZIM", "Evergreen", "CMA CGM", "ONE", "COSCO", "Wan Hai", "Hapag-Lloyd", "TS Lines", "Sinokor", "PIL"];

// Prefijos de contenedores propios (los rentados, como TEMU o TGBU, no delatan naviera).
const CONTENEDORES: [string, string[]][] = [
  ["MSC", ["MSCU", "MEDU", "MSDU", "MSMU", "MSBU", "MSNU", "MSVU", "MSZU"]],
  ["Maersk", ["MRKU", "MAEU", "MSKU", "MRSU"]],
  ["Yang Ming", ["YMLU", "YMMU"]],
  ["PIL", ["PCIU", "PIDU"]],
  ["ZIM", ["ZIMU", "ZCSU"]],
  ["Hapag-Lloyd", ["HLCU", "HLXU", "HLBU"]],
  ["Evergreen", ["EGHU", "EISU", "EMCU", "EGSU"]],
  ["COSCO", ["CCLU", "CBHU", "CSNU", "OOLU"]],
  ["CMA CGM", ["CMAU", "CGMU", "APZU"]],
  ["ONE", ["ONEU", "NYKU", "KKFU", "MOLU"]],
  ["Wan Hai", ["WHSU", "WHLU"]],
];
const MBL_OTRAS: Record<string, string> = {
  ZIMU: "ZIM",
  HLCU: "Hapag-Lloyd",
  EGLV: "Evergreen",
  EGVL: "Evergreen",
  COSU: "COSCO",
  OOLU: "COSCO",
  CMDU: "CMA CGM",
  ONEY: "ONE",
  PCIU: "PIL",
  SNKO: "Sinokor",
};
// Cómo aparece cada naviera en la razón social del proveedor en Cargolink.
const RAZON_SOCIAL: Record<string, RegExp> = {
  MSC: /MEDITERRANEAN|\bMSC\b/i,
  Maersk: /MAERSK|SEALAND/i,
  "Yang Ming": /YANG ?MING/i,
  PIL: /PACIFIC INTERNATIONAL|\bPIL\b/i,
  ZIM: /\bZIM\b/i,
  "Hapag-Lloyd": /HAPAG/i,
  Evergreen: /EVERGREEN/i,
  COSCO: /COSCO|OOCL/i,
  "CMA CGM": /CMA|\bAPL\b/i,
  ONE: /OCEAN NETWORK|\bONE\b/i,
  "Wan Hai": /WAN HAI/i,
  "TS Lines": /T\.? ?S\.? LINES/i,
};

export function navieraPorReferencia(mbl: string | null | undefined, contenedores: string | null | undefined): string | null {
  const m = (mbl ?? "").trim().toUpperCase();
  if (m.startsWith("MEDU")) return "MSC";
  if (m.startsWith("MAEU") || /^\d{9}$/.test(m)) return "Maersk";
  if (m.startsWith("YMJA") || m.startsWith("YMLU")) return "Yang Ming";
  for (const [prefijo, nav] of Object.entries(MBL_OTRAS)) if (m.startsWith(prefijo)) return nav;
  const conts = (contenedores ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase().replace(/^\./, ""))
    .filter((c) => /^[A-Z]{4}\d{7}$/.test(c));
  for (const c of conts) for (const [nav, prefijos] of CONTENEDORES) if (prefijos.some((p) => c.startsWith(p))) return nav;
  return null;
}

export function navieraRastreo(mbl: string | null | undefined, contenedores: string | null | undefined, carrier: string | null | undefined) {
  const porReferencia = navieraPorReferencia(mbl, contenedores);
  return { naviera: porReferencia ?? (carrier ? (POR_CARRIER[carrier] ?? null) : null), porReferencia };
}

// ¿La razón social capturada en Cargolink corresponde a la naviera de la referencia?
export function coincideRazonSocial(naviera: string, razonSocial: string | null | undefined): boolean {
  const re = RAZON_SOCIAL[naviera];
  return !re || !razonSocial || re.test(razonSocial);
}

// Como la guardan los agentes ("YANG MING") -> como se muestra ("Yang Ming").
export function nombreNaviera(n: string): string {
  return NAVIERAS_CON_AGENTE.find((x) => x.toUpperCase() === n.toUpperCase()) ?? n;
}

// Página de rastreo de la naviera, con la referencia cargada cuando la página lo permite.
export function ligaRastreo(naviera: string | null, mbl: string | null | undefined, contenedores: string | null | undefined): string | null {
  const cont = (contenedores ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase().replace(/^\./, ""))
    .find((c) => /^[A-Z]{4}\d{7}$/.test(c));
  const ref = encodeURIComponent((mbl ?? "").trim() || cont || "");
  switch (naviera) {
    case "MSC":
      return "https://www.msc.com/en/track-a-shipment";
    case "Maersk":
      return ref ? `https://www.maersk.com/tracking/${ref}` : "https://www.maersk.com/tracking/";
    case "Yang Ming":
      return "https://www.yangming.com/en/esolution/cargo_tracking";
    case "Sinokor":
      return ref ? `https://ebiz.sinokor.co.kr/Tracking?blno=${ref}&cntrno=` : "https://ebiz.sinokor.co.kr/Tracking";
    case "TS Lines":
      return "https://www.tslines.com/en/importservice/do_query";
    case "Hapag-Lloyd":
      return `https://www.hapag-lloyd.com/solutions/tracking/#/${ref}`;
    case "ZIM":
      return `https://www.zim.com/es/tools/track-a-shipment?consnumber=${ref}`;
    case "Evergreen":
      return "https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do";
    case "CMA CGM":
      return "https://www.cma-cgm.com/ebusiness/tracking";
    case "ONE":
      return `https://www.one-line.com/one-ecom/manage-shipment/cargo-tracking${ref ? `?trakNoParam=${ref.replace(/^ONEY/, "")}&trakNoTpCdParam=${/^[A-Z]{4}\d{7}$/.test(ref) ? "C" : "B"}` : ""}`;
    case "COSCO":
      return `https://elines.coscoshipping.com/ebusiness/cargotracking${ref ? `?trackingType=${/^[A-Z]{4}\d{7}$/.test(ref) ? "CONTAINER" : "BILLOFLADING"}&number=${ref.replace(/^COSU/, "")}` : ""}`;
    case "PIL":
      return `https://www.pilship.com/digital-solutions/?tab=customer&id=track-trace&label=containerTandT&module=${/^[A-Z]{4}\d{7}$/.test(ref) || !ref ? "TrackContStatus" : "TrackTraceBL"}&refNo=${ref}`;
    case "Wan Hai":
      return "https://www.wanhai.com/views/cargo_track_v2/tracking_query.xhtml";
    default: {
      const navUpper = (naviera ?? "").toUpperCase();
      if (navUpper.includes("INTERTEAM")) return "https://www.interteam.com.mx/estatus-de-importacion/";
      if (navUpper.includes("CTL") || navUpper.includes("CHARTER LINK")) return "https://ctl-latam.com/papeleta/";
      if (navUpper.includes("IFS")) return "https://www.ifswebtools.com/TrackAndTrace";
      if (navUpper.includes("ECU")) return "https://ecu360.com";
      if (navUpper.includes("FAST FORWARD")) return "https://www.fastforward.mx";
      return null;
    }
  }
}
