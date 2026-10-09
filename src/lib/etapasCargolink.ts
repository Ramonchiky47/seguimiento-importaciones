// Etapas de Servicios marítimos que la app puede escribir en Cargolink, tal
// como las guarda la pantalla de Cargolink (templates/b_importacion):
// misma función del web service, mismo desdeEtapa y mismos campos. Ninguna
// acción notifica al cliente: los avisos se finalizan con "Finalizar"
// (status NO) y no con "Notificar y finalizar".

// PILOTO: solo administradores ven "Editar" (guardarEtapaCargolink lo valida
// también en el servidor). Para abrirlo al equipo, false aquí y en la acción.
export const EDICION_SOLO_ADMIN = true;

export type CampoEtapa = {
  key: string; // campo del booking de Cargolink
  label: string;
  tipo: "date" | "number";
  requerido: boolean;
  // Columna de operaciones_maritima_vista (o datos.<key>) con el valor actual.
  actual: string;
};

export type AccionEtapa = {
  status: string; // ?status= del web service
  label: string;
  // his_mov_* esperado en Cargolink después de guardar.
  resultado: "EDICION" | "FINALIZADO" | "NO_APLICA";
};

export type EtapaCargolink = {
  key: string;
  label: string;
  fn: string;
  desdeEtapa?: string;
  mov: string; // his_mov_* de la etapa
  campos: CampoEtapa[];
  acciones: AccionEtapa[];
};

const GUARDAR: AccionEtapa = { status: "EDICION", label: "Guardar", resultado: "EDICION" };
const FINALIZAR: AccionEtapa = { status: "FINALIZADO", label: "Guardar y finalizar", resultado: "FINALIZADO" };
const NO_APLICA: AccionEtapa = { status: "NO_APLICA", label: "No aplica", resultado: "NO_APLICA" };
const FINALIZAR_AVISO: AccionEtapa = { status: "NO", label: "Finalizar (sin notificar)", resultado: "FINALIZADO" };

export const ETAPAS_CARGOLINK: Record<string, EtapaCargolink> = {
  atd: {
    key: "atd",
    label: "ATD",
    fn: "registraTransitoAtd",
    mov: "his_mov_atd",
    campos: [{ key: "fecha_atd", label: "Fecha de zarpe", tipo: "date", requerido: true, actual: "etd_atd" }],
    acciones: [GUARDAR, FINALIZAR, NO_APLICA],
  },
  eta: {
    key: "eta",
    label: "ETA",
    fn: "registraTransitoEta",
    mov: "his_mov_eta",
    campos: [{ key: "buque_eta", label: "Fecha estimada de arribo", tipo: "date", requerido: true, actual: "eta" }],
    acciones: [GUARDAR, FINALIZAR, NO_APLICA],
  },
  aviso_eta: {
    key: "aviso_eta",
    label: "Aviso de arribo (Aviso ETA)",
    fn: "notificacionBookingCliente",
    desdeEtapa: "TRANSITO_AVISO",
    mov: "his_mov_alertFech",
    campos: [],
    acciones: [GUARDAR, FINALIZAR_AVISO, NO_APLICA],
  },
  hbl: {
    key: "hbl",
    label: "House BL telex",
    fn: "registraTransitoCheck",
    desdeEtapa: "HOUSE BL TELEX",
    mov: "his_mov_hbl_telex",
    campos: [{ key: "fecha_telex_house_bl", label: "Fecha HBL", tipo: "date", requerido: true, actual: "telex_house_bl" }],
    acciones: [GUARDAR, FINALIZAR, NO_APLICA],
  },
  mbl: {
    key: "mbl",
    label: "Master BL telex",
    fn: "registraTransitoCheck",
    desdeEtapa: "MASTER BL TELEX",
    mov: "his_mov_mbl_telex",
    campos: [{ key: "fecha_telex_master_bl", label: "Fecha MBL", tipo: "date", requerido: true, actual: "telex_master_bl" }],
    acciones: [GUARDAR, FINALIZAR, NO_APLICA],
  },
  rev: {
    key: "rev",
    label: "Revalidación",
    fn: "registraHistorialDocs",
    desdeEtapa: "REVALIDACION",
    mov: "his_mov_rev",
    campos: [
      { key: "fecha_revalidacion", label: "Fecha de revalidación", tipo: "date", requerido: true, actual: "revalidacion" },
      { key: "fecha_pre_pro", label: "Pre-proforma", tipo: "date", requerido: true, actual: "datos.fecha_pre_pro" },
    ],
    acciones: [GUARDAR, FINALIZAR, NO_APLICA],
  },
  ata: {
    key: "ata",
    label: "ATA y días libres",
    fn: "registraTransitoAta",
    mov: "his_mov_ata",
    campos: [
      { key: "fecha_ata", label: "Fecha de arribo efectivo", tipo: "date", requerido: true, actual: "ata" },
      { key: "dias_demora", label: "Días libres de demora", tipo: "number", requerido: false, actual: "dias_libres_demora" },
    ],
    acciones: [GUARDAR, FINALIZAR],
  },
  aviso_ata: {
    key: "aviso_ata",
    label: "Aviso de ATA",
    fn: "notificacionBookingCliente",
    desdeEtapa: "AVISO_ATA",
    mov: "his_mov_alertAta",
    campos: [],
    acciones: [GUARDAR, FINALIZAR_AVISO, NO_APLICA],
  },
  vacio: {
    key: "vacio",
    label: "Regreso de vacío",
    fn: "registraHistorialDocs",
    desdeEtapa: "ENTREGA_VACIO",
    mov: "his_mov_entrega_vacio",
    campos: [
      { key: "fecha_maniobra_entrega", label: "Fecha de regreso de vacío", tipo: "date", requerido: true, actual: "regreso_vacio" },
      // En la pantalla de Cargolink es obligatoria, pero el equipo no siempre
      // la tiene; se manda vacía si no se captura.
      { key: "fecha_solicitud_garantia", label: "Fecha en que se solicitó (garantía)", tipo: "date", requerido: false, actual: "datos.fecha_solicitud_garantia" },
    ],
    acciones: [GUARDAR, FINALIZAR, NO_APLICA],
  },
};

// Hito de Track (orden en track_hitos) → etapa de Cargolink que lo resuelve.
export const ETAPA_POR_HITO: Record<number, string> = {
  1: "atd",
  2: "eta",
  3: "aviso_eta",
  4: "hbl",
  5: "mbl",
  6: "rev",
  7: "ata",
  8: "aviso_ata",
  9: "ata",
  10: "vacio",
};
