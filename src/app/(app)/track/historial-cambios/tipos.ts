export type Prioridad = "alta" | "media" | "baja";
export type EstadoCambio = "pendiente" | "en_proceso" | "listo" | "pospuesto" | "cancelado";

export type SolicitudCambio = {
  id: number;
  nombre: string;
  descripcion: string;
  solicitante: string;
  fecha_solicitud: string;
  fecha_compromiso: string | null;
  alcance: string;
  prioridad: Prioridad;
  orden: number;
  estado: EstadoCambio;
  fecha_cierre: string | null;
  creado_por: string;
  creado_en: string;
  actualizado_en: string;
};

export type EventoCambio = {
  id: number;
  solicitud_id: number;
  tipo: "creacion" | "cambio" | "comentario";
  usuario: string;
  texto: string;
  detalle: Record<string, { antes: unknown; despues: unknown }> | null;
  creado_en: string;
};

export const ESTADO_TXT: Record<EstadoCambio, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  listo: "Listo",
  pospuesto: "Pospuesto",
  cancelado: "Cancelado",
};
export const PRIORIDAD_TXT: Record<Prioridad, string> = { alta: "Alta", media: "Media", baja: "Baja" };
export const CAMPO_TXT: Record<string, string> = {
  nombre: "Nombre",
  descripcion: "Descripción",
  solicitante: "Solicitante",
  fecha_solicitud: "Fecha de solicitud",
  fecha_compromiso: "Fecha compromiso",
  alcance: "Alcance",
  prioridad: "Prioridad",
  estado: "Estatus",
};
