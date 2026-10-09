// Etapas de Servicios marítimos que la app puede escribir en Cargolink, tal
// como las guarda la pantalla de Cargolink (templates/b_importacion):
// misma función del web service, mismo desdeEtapa y mismos campos. Ninguna
// acción notifica al cliente: los avisos se finalizan con "Finalizar"
// (status NO) y no con "Notificar y finalizar".

export type CampoEtapa = {
  key: string; // campo del booking de Cargolink
  label: string;
  // number = entero (días); decimal = importe; select = lista (opciones fijas
  // o un catálogo de Cargolink).
  tipo: "date" | "number" | "decimal" | "text" | "select";
  requerido: boolean;
  // Columna de operaciones_maritima_vista (o datos.<key>) con el valor actual.
  actual: string;
  opciones?: { valor: string; label: string }[];
  catalogo?: "aseguradoras" | "incoterms";
  // Encabezado para agrupar campos en el formulario.
  grupo?: string;
  // "origen" = el valor vive en el registro de origen (consultaOrigen), no en
  // el booking.
  fuente?: "origen";
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
  // Segunda llamada con el mismo booking y status (Seguro: registraHistorialDocs
  // y luego registraSeguro, como la pantalla de Cargolink).
  fn2?: string;
  // Origen: se guarda con registraOrigen mandando {alta: origen, booking}.
  guardado?: "origen";
  campos: CampoEtapa[];
  acciones: AccionEtapa[];
  // Etapa de filas (Transbordo): columnas de cada fila; se guarda con su
  // propio web service, no con los campos del booking.
  filas?: { key: string; label: string; tipo: "date" | "text"; requerido: boolean }[];
};

const GUARDAR: AccionEtapa = { status: "EDICION", label: "Guardar", resultado: "EDICION" };
const FINALIZAR: AccionEtapa = { status: "FINALIZADO", label: "Guardar y finalizar", resultado: "FINALIZADO" };
const NO_APLICA: AccionEtapa = { status: "NO_APLICA", label: "No aplica", resultado: "NO_APLICA" };
const FINALIZAR_AVISO: AccionEtapa = { status: "NO", label: "Finalizar (sin notificar)", resultado: "FINALIZADO" };
// En los avisos Cargolink no guarda NO_APLICA: "No aplica" deja la etapa
// FINALIZADO (confirmado el 2026-10-09 con 2609-4329-FCLI).
const NO_APLICA_AVISO: AccionEtapa = { status: "NO_APLICA", label: "No aplica", resultado: "FINALIZADO" };

// Mismas listas que la pantalla de Seguro de Cargolink.
const ASEGURADO_POR = ["CONTENEDOR", "MERCANCIA", "AMBOS"].map((v) => ({ valor: v, label: v }));
const MONEDAS = ["USD", "MXN", "EUR"].map((v) => ({ valor: v, label: v }));

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
    acciones: [GUARDAR, FINALIZAR_AVISO, NO_APLICA_AVISO],
  },
  origen: {
    key: "origen",
    label: "Origen",
    fn: "registraOrigen",
    guardado: "origen",
    mov: "his_mov_origen",
    campos: [
      { key: "contacto", label: "Fecha de contacto", tipo: "date", requerido: false, actual: "datos.contacto", fuente: "origen" },
      { key: "fecha_estimada", label: "Fecha estimada de salida", tipo: "date", requerido: false, actual: "datos.fecha_estimada", fuente: "origen" },
      { key: "no_control", label: "Número de control (MBL / reserva)", tipo: "text", requerido: false, actual: "datos.no_control", fuente: "origen" },
      { key: "no_agentes", label: "Control entre agentes (HBL)", tipo: "text", requerido: false, actual: "datos.no_agentes", fuente: "origen" },
      { key: "no_viaje", label: "Número de viaje", tipo: "text", requerido: false, actual: "datos.no_viaje", fuente: "origen" },
      { key: "buque", label: "Buque", tipo: "text", requerido: false, actual: "datos.buque" },
    ],
    // En Cargolink Origen solo tiene Guardar y Guardar y finalizar.
    acciones: [GUARDAR, FINALIZAR],
  },
  aviso_atd: {
    key: "aviso_atd",
    label: "Aviso ATD",
    fn: "notificacionBookingCliente",
    desdeEtapa: "TRANSITO_AVISO_ATD",
    mov: "his_mov_aviso_atd",
    campos: [],
    // Cargolink: "Finalizar" (NO), "Notificar y finalizar" (SI, no se usa) y No aplica.
    acciones: [FINALIZAR_AVISO, NO_APLICA],
  },
  manifiesto: {
    key: "manifiesto",
    label: "Transmisión de manifiesto",
    fn: "registraHistorialDocs",
    desdeEtapa: "MANIFIESTO",
    mov: "his_mov_manifiesto",
    campos: [
      { key: "fecha_acuse", label: "Fecha del acuse", tipo: "date", requerido: true, actual: "datos.fecha_acuse" },
      { key: "no_acuse", label: "Número del acuse", tipo: "text", requerido: true, actual: "datos.no_acuse" },
    ],
    acciones: [GUARDAR, FINALIZAR, NO_APLICA],
  },
  kpi: {
    key: "kpi",
    label: "KPIs aviso arribo",
    fn: "notificacionBookingCliente",
    desdeEtapa: "AVISO_KPI",
    mov: "his_mov_kpi",
    campos: [],
    acciones: [GUARDAR, FINALIZAR_AVISO],
  },
  demoras: {
    key: "demoras",
    label: "KPI aviso demoras",
    fn: "notificacionBookingCliente",
    desdeEtapa: "AVISO_DEMORAS",
    mov: "his_mov_demoras",
    campos: [],
    acciones: [GUARDAR, FINALIZAR_AVISO, NO_APLICA],
  },
  seguro: {
    key: "seguro",
    label: "Seguro de mercancía",
    fn: "registraHistorialDocs",
    fn2: "registraSeguro",
    desdeEtapa: "SEGURO_MERCANCIA",
    mov: "his_mov_seguro",
    campos: [
      { key: "segurar_por", label: "Asegurado por", tipo: "select", requerido: false, actual: "datos.segurar_por", opciones: ASEGURADO_POR, grupo: "Renglón 1" },
      { key: "moneda", label: "Moneda", tipo: "select", requerido: false, actual: "datos.moneda", opciones: MONEDAS, grupo: "Renglón 1" },
      { key: "valor_mercancia", label: "Valor", tipo: "decimal", requerido: false, actual: "datos.valor_mercancia", grupo: "Renglón 1" },
      { key: "intercom", label: "Incoterm", tipo: "select", requerido: false, actual: "datos.intercom", catalogo: "incoterms", grupo: "Renglón 1" },
      { key: "seguro_fecha", label: "Fecha de aseguramiento", tipo: "date", requerido: false, actual: "datos.seguro_fecha", grupo: "Renglón 1" },
      { key: "id_seguradora", label: "Aseguradora", tipo: "select", requerido: false, actual: "datos.id_seguradora", catalogo: "aseguradoras", grupo: "Renglón 1" },
      { key: "segurar_por2", label: "Asegurado por", tipo: "select", requerido: false, actual: "datos.segurar_por2", opciones: ASEGURADO_POR, grupo: "Renglón 2" },
      { key: "moneda2", label: "Moneda", tipo: "select", requerido: false, actual: "datos.moneda2", opciones: MONEDAS, grupo: "Renglón 2" },
      { key: "valor_mercancia2", label: "Valor", tipo: "decimal", requerido: false, actual: "datos.valor_mercancia2", grupo: "Renglón 2" },
      { key: "seguro_fecha2", label: "Fecha de aseguramiento", tipo: "date", requerido: false, actual: "datos.seguro_fecha2", grupo: "Renglón 2" },
      { key: "id_seguradora2", label: "Aseguradora", tipo: "select", requerido: false, actual: "datos.id_seguradora2", catalogo: "aseguradoras", grupo: "Renglón 2" },
      { key: "seguro_alcance", label: "Alcance del seguro", tipo: "text", requerido: false, actual: "datos.seguro_alcance", grupo: "Póliza" },
      { key: "numero_poliza_seguro", label: "Número de póliza", tipo: "text", requerido: false, actual: "datos.numero_poliza_seguro", grupo: "Póliza" },
    ],
    acciones: [GUARDAR, FINALIZAR, NO_APLICA],
  },
  transbordo: {
    key: "transbordo",
    label: "Transbordo",
    fn: "registraTransitoTransbordo",
    mov: "his_mov_transbordo",
    campos: [],
    filas: [
      { key: "fecha_arribo", label: "Arribo estimado a puerto transbordo", tipo: "date", requerido: true },
      { key: "punto", label: "Punto", tipo: "text", requerido: false },
      { key: "fecha_arribo_real", label: "Arribo efectivo a puerto transbordo", tipo: "date", requerido: false },
      { key: "fecha_zarpe", label: "Zarpe estimado de puerto transbordo", tipo: "date", requerido: false },
      { key: "fecha_zarpe_real", label: "Zarpe efectivo de puerto transbordo", tipo: "date", requerido: false },
    ],
    acciones: [GUARDAR, FINALIZAR, NO_APLICA],
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
    acciones: [GUARDAR, FINALIZAR_AVISO, NO_APLICA_AVISO],
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
  11: "transbordo",
};
