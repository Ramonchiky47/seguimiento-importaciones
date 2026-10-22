// Vista interactiva de Track: el booking como recorrido por fases del forwarder de
// importación. Cada tarea sale de un hito de Track (track_hitos, con fecha
// compromiso) o del estatus de su etapa en Cargolink (datos.his_mov_*), y se
// edita con la misma etapa de ETAPAS_CARGOLINK que usa Track.

import type { EstadoHito } from "@/lib/track";

export type EstadoTarea = "hecho" | "falta" | "alerta" | "pend" | "na";

export type FaseClave = "origen" | "zarpe" | "transito" | "prearribo" | "arribo" | "entrega" | "cierre";

export const FASES: { clave: FaseClave; n: number; nombre: string; cuando: string; icono: string }[] = [
  { clave: "origen", n: 1, nombre: "Origen / Booking", cuando: "Al confirmar el booking", icono: "M4 7h16M4 12h16M4 17h10" },
  { clave: "zarpe", n: 2, nombre: "Zarpe", cuando: "Día del zarpe", icono: "M3 17h18l-3 4H6zM12 3v10M8 9h8" },
  { clave: "transito", n: 3, nombre: "Tránsito", cuando: "Durante el viaje", icono: "M2 12c3-3 5-3 8 0s5 3 8 0 4-2 4-2" },
  { clave: "prearribo", n: 4, nombre: "Pre-arribo", cuando: "7 a 2 días antes de la ETA", icono: "M12 8v4l3 2M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" },
  { clave: "arribo", n: 5, nombre: "Arribo", cuando: "Día del arribo (ATA)", icono: "M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 10h.01" },
  { clave: "entrega", n: 6, nombre: "Liberación y entrega", cuando: "Hasta devolver el vacío", icono: "M3 7h11v10H3zM14 10h4l3 3v4h-7" },
  { clave: "cierre", n: 7, nombre: "Cierre", cuando: "Al terminar la operación", icono: "M20 6 9 17l-5-5" },
];

export type HitoTrack = {
  orden: number;
  hito: string;
  regla: string;
  fecha_plan: string | null;
  fecha_hecho: string | null;
  hecho: boolean;
  estado: EstadoHito;
  dias_atraso: number | null;
  valor_real: string | null;
};

export type Tarea = {
  id: string;
  fase: FaseClave;
  label: string;
  detalle: string;
  valor: string;
  estado: EstadoTarea;
  // Etapa de ETAPAS_CARGOLINK con la que se captura (si aplica).
  editar?: string;
  // Días de atraso (para ordenar el "siguiente paso").
  atraso: number;
};

// Definición de las tareas: hito de Track (orden) y/o etapa de Cargolink.
const TAREAS: { id: string; fase: FaseClave; label: string; hito?: number; mov?: string; editar?: string; campo?: string }[] = [
  { id: "origen", fase: "origen", label: "Registro de origen", mov: "origen", editar: "origen" },
  { id: "seguro", fase: "origen", label: "Seguro de mercancía", mov: "seguro", editar: "seguro" },
  { id: "atd", fase: "zarpe", label: "ATD (zarpe real)", hito: 1, mov: "atd", editar: "atd", campo: "etd_atd" },
  { id: "aviso_atd", fase: "zarpe", label: "Aviso de zarpe al cliente", mov: "aviso_atd", editar: "aviso_atd" },
  { id: "eta", fase: "zarpe", label: "ETA", hito: 2, mov: "eta", editar: "eta", campo: "eta" },
  { id: "transbordo", fase: "zarpe", label: "Transbordo", hito: 11, mov: "transbordo", editar: "transbordo" },
  { id: "manifiesto", fase: "transito", label: "Transmisión de manifiesto", mov: "manifiesto", editar: "manifiesto" },
  { id: "hbl", fase: "transito", label: "Telex HBL", hito: 4, mov: "hbl_telex", editar: "hbl", campo: "telex_house_bl" },
  { id: "mbl", fase: "transito", label: "Telex MBL", hito: 5, mov: "mbl_telex", editar: "mbl", campo: "telex_master_bl" },
  { id: "aviso_eta", fase: "prearribo", label: "Aviso de arribo al cliente", hito: 3, mov: "alertFech", editar: "aviso_eta" },
  { id: "rev", fase: "prearribo", label: "Revalidación", hito: 6, mov: "rev", editar: "rev", campo: "revalidacion" },
  { id: "ata", fase: "arribo", label: "ATA (arribo real)", hito: 7, mov: "ata", editar: "ata", campo: "ata" },
  { id: "dias", fase: "arribo", label: "Días libres de demora", hito: 9, editar: "ata" },
  { id: "aviso_ata", fase: "arribo", label: "Aviso de ATA al cliente", hito: 8, mov: "alertAta", editar: "aviso_ata" },
  { id: "demoras", fase: "entrega", label: "Aviso de demoras", mov: "demoras", editar: "demoras" },
  { id: "vacio", fase: "entrega", label: "Regreso de vacío", hito: 10, mov: "entrega_vacio", editar: "vacio", campo: "regreso_vacio" },
  { id: "facturacion", fase: "cierre", label: "Facturación", mov: "facturacion" },
];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fechaCortaTN(iso: unknown): string {
  const s = typeof iso === "string" ? iso.slice(0, 10) : "";
  const [y, m, d] = s.split("-");
  if (!y || !m || !d || s.startsWith("0000")) return "—";
  return `${d} ${MESES[Number(m) - 1]}`;
}

const ESTATUS_MOV: Record<string, string> = {
  FINALIZADO: "Finalizada en Cargolink",
  NO_APLICA: "No aplica",
  EDICION: "En edición en Cargolink",
};

export function calcularTareas(
  op: Record<string, unknown>,
  hitos: HitoTrack[],
  // Días libres propuestos por historial (no guardados).
  propuestaDias?: { dias: number; explicacion: string } | null,
): Tarea[] {
  const datos = (op.datos ?? {}) as Record<string, string>;
  const porOrden = new Map(hitos.map((h) => [h.orden, h]));
  const tareas: Tarea[] = [];
  for (const t of TAREAS) {
    const h = t.hito ? porOrden.get(t.hito) : undefined;
    const mov = t.mov ? datos[`his_mov_${t.mov}`] : undefined;
    const fechaMov = t.mov ? datos[`his_fecha_${t.mov}`] : undefined;
    let estado: EstadoTarea;
    let detalle: string;
    let valor = "";
    if (h) {
      estado =
        h.estado === "hecho" ? "hecho"
        : h.estado === "no_aplica" ? "na"
        : h.estado === "atrasado" || h.estado === "falta_dato" ? "falta"
        : h.estado === "hoy" ? "alerta"
        : "pend";
      detalle = h.fecha_plan ? `${h.regla} · compromiso ${fechaCortaTN(h.fecha_plan)}` : h.regla;
      valor =
        h.estado === "hecho" ? (h.valor_real ?? fechaCortaTN(h.fecha_hecho ?? (t.campo ? op[t.campo] : null)))
        : h.estado === "atrasado" ? `Atrasado ${h.dias_atraso ?? 0} d`
        : h.estado === "falta_dato" ? "Falta dato"
        : h.estado === "hoy" ? "Vence hoy"
        : h.estado === "no_aplica" ? "No aplica"
        : h.fecha_plan ? fechaCortaTN(h.fecha_plan) : "Sin fecha";
      if (estado === "hecho" && valor === "—" && t.campo) valor = fechaCortaTN(op[t.campo]);
    } else {
      estado = mov === "FINALIZADO" ? "hecho" : mov === "NO_APLICA" ? "na" : "pend";
      detalle = mov ? ESTATUS_MOV[mov] ?? mov : "Sin comenzar en Cargolink";
      valor = mov === "FINALIZADO" ? fechaCortaTN(fechaMov) : mov === "NO_APLICA" ? "No aplica" : mov === "EDICION" ? "En edición" : "—";
    }
    // Días libres: el valor real es el número capturado.
    if (t.id === "dias") {
      const dl = Number(op.dias_libres_demora);
      if (dl > 0) {
        estado = "hecho";
        valor = `${dl} días`;
      } else if (propuestaDias) {
        valor = `Propuesta: ${propuestaDias.dias} días`;
        detalle = `${propuestaDias.explicacion} Aún no guardada: revísala y guarda.`;
      }
    }
    // Aviso de ATA: sin banco o instrucciones, aunque no esté atrasado.
    if (t.id === "aviso_ata" && estado !== "hecho" && estado !== "na" && op.ata) {
      const sinBanco = !datos.id_banco || datos.id_banco === "0";
      const sinInst = !datos.inst_revalidacion;
      if (sinBanco || sinInst) {
        detalle = `Falta ${[sinBanco ? "banco" : "", sinInst ? "instrucciones" : ""].filter(Boolean).join(" e ")}`;
        if (estado === "pend") estado = "alerta";
      }
    }
    if (t.id === "facturacion" && String(op.status_booking) === "2") {
      estado = "hecho";
      valor = "Booking finalizado";
    }
    tareas.push({
      id: t.id,
      fase: t.fase,
      label: t.label,
      detalle,
      valor,
      estado,
      editar: t.editar,
      atraso: h?.dias_atraso ?? 0,
    });
  }
  return tareas;
}

export function estadoFase(tareas: Tarea[]): EstadoTarea {
  if (tareas.some((t) => t.estado === "falta")) return "falta";
  if (tareas.some((t) => t.estado === "alerta")) return "alerta";
  if (tareas.every((t) => t.estado === "hecho" || t.estado === "na")) return "hecho";
  return "pend";
}

// Siguiente paso: lo primero que falta en el orden del recorrido; si nada
// falta, lo que requiere revisión.
export function siguientePaso(tareas: Tarea[]): Tarea | null {
  return tareas.find((t) => t.estado === "falta") ?? tareas.find((t) => t.estado === "alerta") ?? null;
}

// Fase en la que va el booking: la de su siguiente paso; si no hay nada
// pendiente, la primera que no está completa.
export function faseActual(tareas: Tarea[]): FaseClave {
  const sig = siguientePaso(tareas);
  if (sig) return sig.fase;
  for (const f of FASES) {
    const e = estadoFase(tareas.filter((t) => t.fase === f.clave));
    if (e !== "hecho") return f.clave;
  }
  return "cierre";
}

export const ESTILO_TAREA: Record<EstadoTarea, { caja: string; icono: string; texto: string; pill: string; label: string; barra: string; punto: string }> = {
  hecho: { caja: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40", icono: "bg-green-700", texto: "text-green-800 dark:text-green-300", pill: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", label: "LISTO", barra: "bg-green-600", punto: "bg-green-600" },
  falta: { caja: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40", icono: "bg-red-700", texto: "text-red-800 dark:text-red-300", pill: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", label: "FALTA", barra: "bg-red-600", punto: "bg-red-600" },
  alerta: { caja: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40", icono: "bg-amber-700", texto: "text-amber-900 dark:text-amber-200", pill: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", label: "REVISAR", barra: "bg-amber-600", punto: "bg-amber-500" },
  pend: { caja: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900", icono: "bg-slate-500", texto: "text-slate-600 dark:text-slate-400", pill: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", label: "PENDIENTE", barra: "bg-slate-400", punto: "bg-slate-300 dark:bg-slate-600" },
  na: { caja: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60", icono: "bg-slate-400", texto: "text-slate-600 dark:text-slate-400", pill: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", label: "N/A", barra: "bg-slate-400", punto: "bg-slate-300 dark:bg-slate-600" },
};
