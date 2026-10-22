// Qué naviera rastrea cada booking. Manda la referencia (MBL o contenedor
// propio de la naviera); la capturada en Cargolink solo se usa si la
// referencia no la delata, porque a veces está mal capturada (ej. 2608-4158:
// Cargolink dice Yang Ming y el MBL y contenedor son de Maersk).
// Mismas reglas que ~/Agentes/operaciones_maritima/navieras.py.

// buque_carrier de Cargolink -> naviera con agente de rastreo.
const POR_CARRIER: Record<string, string> = { "157": "MSC", "1497": "Maersk", "1419": "Yang Ming" };
export const NAVIERAS_CON_AGENTE = ["MSC", "Maersk", "Yang Ming"];

// Prefijos de contenedores propios (los rentados, como TEMU o TGBU, no delatan naviera).
const CONTENEDORES: [string, string[]][] = [
  ["MSC", ["MSCU", "MEDU", "MSDU", "MSMU", "MSBU", "MSNU", "MSVU", "MSZU"]],
  ["Maersk", ["MRKU", "MAEU", "MSKU", "MRSU"]],
  ["Yang Ming", ["YMLU", "YMMU"]],
  ["PIL", ["PCIU"]],
  ["ZIM", ["ZIMU", "ZCSU"]],
  ["Hapag-Lloyd", ["HLCU", "HLXU", "HLBU"]],
  ["Evergreen", ["EGHU", "EISU", "EMCU", "EGSU"]],
  ["COSCO", ["CCLU", "CBHU", "CSNU", "OOLU"]],
  ["CMA CGM", ["CMAU", "CGMU", "APZU"]],
  ["ONE", ["ONEU", "NYKU", "KKFU", "MOLU"]],
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
