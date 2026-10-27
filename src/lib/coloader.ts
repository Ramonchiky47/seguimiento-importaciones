// LCL con coloader: su BL es del coloader y ninguna naviera lo reconoce, así
// que el estatus lo captura el operativo con lo que informa el coloader
// (tabla coloader_estatus, RPC registrar_estatus_coloader).

export const ESTATUS_COLOADER = [
  { valor: "en_origen", label: "En origen" },
  { valor: "zarpo", label: "Zarpó" },
  { valor: "en_transito", label: "En tránsito" },
  { valor: "arribo_puerto", label: "Arribó a puerto" },
  { valor: "desconsolidacion", label: "En desconsolidación" },
  { valor: "disponible", label: "Disponible en almacén" },
  { valor: "entregado", label: "Entregado" },
] as const;

export type EstatusColoader = {
  id: number;
  estatus: string;
  fecha: string | null;
  eta: string | null;
  nota: string | null;
  usuario_nombre: string | null;
  created_at: string;
};

export const etiquetaColoader = (v: string) => ESTATUS_COLOADER.find((e) => e.valor === v)?.label ?? v;

// Sin dato bueno de la naviera y consolidado: se trabaja con el coloader.
export function esColoader(noBooking: string, conNaviera: boolean): boolean {
  return !conNaviera && noBooking.toUpperCase().endsWith("LCLI");
}
