export const TIPOS_PENDIENTE = [
  { value: "notificacion", label: "Notificación de arribo (7 días antes de ETA)" },
  { value: "validacion", label: "Validación 48 hr antes de ETA" },
  { value: "revalidacion", label: "Revalidación 48 hr antes de ETA" },
] as const;

export function labelTipoPendiente(tipo: string): string {
  return TIPOS_PENDIENTE.find((t) => t.value === tipo)?.label ?? tipo;
}
