export type Importacion = {
  id: number;
  fecha: string | null;
  booking: string | null;
  type: string | null;
  vendedor: string | null;
  oficina: string | null;
  operativo: string | null;
  client: string | null;
  agente: string | null;
  naviera: string | null;
  terminal_portuaria: string | null;
  pol: string | null;
  pod: string | null;
  mbl: string | null;
  telex_mbl: string | null;
  hbl: string | null;
  telex_hbl: string | null;
  contenedor: string | null;
  cantidad_contenedores_tipo: string | null;
  shipper: string | null;
  direccion_recoleccion: string | null;
  asegurado_por: string | null;
  etd_atd: string | null;
  confirmacion_48_horas: string | null;
  eta_ata: string | null;
  notificacion_arribo_7_dias: string | null;
  validacion_48_horas_antes_eta: string | null;
  revalidacion_48_horas_antes_eta: string | null;
  recepcion_eir: string | null;
  dias_libres_demoras: number | null;
  ultimo_dia_libre_demoras: string | null;
  fecha_solicita_corte_naviera: string | null;
  fecha_recibimos_corte_demoras_naviera: string | null;
  fecha_confirmo_corte_cliente: string | null;
  dias_demoras: number | null;
  seguro: boolean | null;
  estatus: "Vigente" | "Finalizado" | "Cancelado";
  created_at: string;
};

export const ESTATUS_OPTIONS = ["Vigente", "Finalizado", "Cancelado"] as const;

export type Incidencia = {
  id: number;
  importacion_id: number;
  fecha: string;
  texto: string;
  created_at: string;
};

export const DATE_FIELDS = [
  "fecha",
  "etd_atd",
  "confirmacion_48_horas",
  "eta_ata",
  "notificacion_arribo_7_dias",
  "validacion_48_horas_antes_eta",
  "revalidacion_48_horas_antes_eta",
  "recepcion_eir",
  "fecha_solicita_corte_naviera",
  "fecha_recibimos_corte_demoras_naviera",
  "fecha_confirmo_corte_cliente",
] as const;

export const TEXT_FIELDS = [
  "booking",
  "type",
  "vendedor",
  "oficina",
  "operativo",
  "client",
  "agente",
  "naviera",
  "terminal_portuaria",
  "pol",
  "pod",
  "mbl",
  "telex_mbl",
  "hbl",
  "telex_hbl",
  "contenedor",
  "cantidad_contenedores_tipo",
  "shipper",
  "direccion_recoleccion",
  "asegurado_por",
] as const;

export const FIELD_SECTIONS: { title: string; fields: readonly string[] }[] = [
  {
    title: "Información general",
    fields: ["booking", "fecha", "type", "vendedor", "oficina", "operativo", "client", "agente", "naviera"],
  },
  {
    title: "Documentos y puertos",
    fields: [
      "terminal_portuaria",
      "pol",
      "pod",
      "mbl",
      "telex_mbl",
      "hbl",
      "telex_hbl",
      "contenedor",
      "cantidad_contenedores_tipo",
      "shipper",
      "direccion_recoleccion",
    ],
  },
  {
    title: "Fechas de tránsito",
    fields: [
      "etd_atd",
      "confirmacion_48_horas",
      "eta_ata",
      "notificacion_arribo_7_dias",
      "validacion_48_horas_antes_eta",
      "revalidacion_48_horas_antes_eta",
      "recepcion_eir",
    ],
  },
  {
    title: "Corte y demoras",
    fields: [
      "dias_libres_demoras",
      "ultimo_dia_libre_demoras",
      "fecha_solicita_corte_naviera",
      "fecha_recibimos_corte_demoras_naviera",
      "fecha_confirmo_corte_cliente",
      "dias_demoras",
    ],
  },
];

// Columnas visibles en la tabla de listado /importaciones. El resto de la
// información (vendedor, incidencias) solo se ve al abrir el detalle de la fila.
export const LIST_COLUMNS = [
  "booking",
  "estatus",
  "fecha",
  "type",
  "oficina",
  "operativo",
  "client",
  "agente",
  "naviera",
  "terminal_portuaria",
  "pol",
  "pod",
  "mbl",
  "telex_mbl",
  "hbl",
  "telex_hbl",
  "etd_atd",
  "confirmacion_48_horas",
  "eta_ata",
  "notificacion_arribo_7_dias",
  "validacion_48_horas_antes_eta",
  "revalidacion_48_horas_antes_eta",
  "recepcion_eir",
  "dias_libres_demoras",
  "ultimo_dia_libre_demoras",
  "fecha_solicita_corte_naviera",
  "fecha_recibimos_corte_demoras_naviera",
  "fecha_confirmo_corte_cliente",
  "dias_demoras",
] as const;

// Orden de columnas para la carga masiva en texto (pegado tipo Excel, separado por tabs).
export const BULK_IMPORT_FIELDS = [
  "booking",
  "estatus",
  "fecha",
  "type",
  "vendedor",
  "oficina",
  "operativo",
  "client",
  "agente",
  "naviera",
  "seguro",
  "asegurado_por",
  "pol",
  "pod",
  "mbl",
  "telex_mbl",
  "hbl",
  "telex_hbl",
  "contenedor",
  "cantidad_contenedores_tipo",
  "shipper",
  "direccion_recoleccion",
  "etd_atd",
  "confirmacion_48_horas",
  "eta_ata",
  "notificacion_arribo_7_dias",
  "validacion_48_horas_antes_eta",
  "revalidacion_48_horas_antes_eta",
  "recepcion_eir",
  "fecha_solicita_corte_naviera",
  "fecha_recibimos_corte_demoras_naviera",
  "fecha_confirmo_corte_cliente",
  "dias_demoras",
] as const;

export const FIELD_LABELS: Record<string, string> = {
  fecha: "Fecha",
  booking: "Booking",
  type: "Type",
  vendedor: "Vendedor",
  oficina: "Oficina",
  operativo: "Operativo",
  client: "Cliente",
  agente: "Agente",
  naviera: "Naviera",
  terminal_portuaria: "Terminal Portuaria",
  pol: "POL",
  pod: "POD",
  mbl: "MBL",
  telex_mbl: "Telex MBL",
  hbl: "HBL",
  telex_hbl: "Telex HBL",
  contenedor: "Contenedor",
  cantidad_contenedores_tipo: "Cant contenedores por tipo / CBM",
  shipper: "Shipper (Proveedor en Origen)",
  direccion_recoleccion: "Dirección Recolección",
  asegurado_por: "Asegurado por",
  etd_atd: "ETD / ATD",
  confirmacion_48_horas: "Confirmación ATD",
  eta_ata: "ETA / ATA",
  notificacion_arribo_7_dias: "Notificación de arribo (7 días antes de la ETA)",
  validacion_48_horas_antes_eta:
    "Validación 48 hr antes de la ETA / Fecha que aplican inst. con consolidadora",
  revalidacion_48_horas_antes_eta: "Revalidación 48 hr antes de ETA / Fecha de desconsolidación",
  recepcion_eir: "Recepción EIR",
  dias_libres_demoras: "Días libres de demoras",
  ultimo_dia_libre_demoras: "Último día libre de demoras",
  fecha_solicita_corte_naviera: "Fecha en que se solicita corte a naviera",
  fecha_recibimos_corte_demoras_naviera:
    "Fecha recepción corte de demoras naviera",
  fecha_confirmo_corte_cliente: "Fecha en que se confirmó corte cliente",
  dias_demoras: "Días de demoras",
  seguro: "Cuenta con seguro",
  estatus: "Estatus",
};
