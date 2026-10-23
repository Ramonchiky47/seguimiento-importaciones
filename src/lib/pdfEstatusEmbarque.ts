// PDF "Estatus de embarque" de AV2 Logistics para el cliente: mismo
// encabezado que la notificación de arribo, datos del embarque, diagrama de la
// ruta con la posición del buque y los últimos movimientos según la naviera.
// Solo información del embarque: nada de costos ni datos internos.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { LOGO_AV2_PNG_BASE64 } from "@/lib/logoAv2";
import type { EventoNaviera } from "@/lib/detalleNaviera";

export type DatosEstatus = {
  noBooking: string;
  cliente: string | null;
  consignatario: string | null;
  proveedor: string | null;
  mercancia: string | null;
  incoterm: string | null;
  servicio: string | null;
  equipo: string | null;
  contenedores: string | null;
  mbl: string | null;
  hbl: string | null;
  naviera: string | null;
  buque: string | null;
  origen: string | null;
  destino: string | null;
  puertoDescarga: string | null;
  atd: string | null;
  etd: string | null;
  eta: string | null;
  etaNaviera: string | null;
  ata: string | null;
  transbordos: { lugar: string; fecha: string | null }[];
  revalidacion: string | null;
  diasLibres: number | null;
  ultimoDiaLibre: string | null;
  regresoVacio: string | null;
  ultimoEvento: string | null;
  ultimoEventoFecha: string | null;
  consultadoNaviera: string | null;
  eventos: EventoNaviera[];
};

const ROJO = rgb(0.5, 0.09, 0.09);
const AZUL = rgb(0.11, 0.31, 0.85);
const AZUL_CLARO = rgb(0.86, 0.91, 0.99);
const AZUL_PUNTEADO = rgb(0.58, 0.77, 0.99);
const GRIS = rgb(0.4, 0.45, 0.52);
const GRIS_NODO = rgb(0.6, 0.65, 0.72);
const NEGRO = rgb(0.06, 0.09, 0.13);
const NARANJA = rgb(0.78, 0.35, 0.15);

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fecha(iso: string | null | undefined): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}` : "—";
}
const corta = (iso: string | null | undefined) => {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]}` : "—";
};
const dias = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);

// Helvetica estándar solo admite WinAnsi (español incluido): el resto se quita.
const limpio = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/[→➔]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim();

// Eventos de la naviera (vienen en inglés) en español para el cliente.
const TRADUCCION: [RegExp, string][] = [
  [/intended transship|transshipment planned|planned transship/i, "Transbordo programado"],
  [/gate[- ]?in of empty|empty (container )?return|empty returned/i, "Contenedor vacío devuelto"],
  [/empty.*(release|to shipper|dispatched|pick)/i, "Contenedor vacío entregado al proveedor"],
  [/gate[- ]?in.*(outbound|export|terminal|port)|export (received|gate-in)|received.*at/i, "Ingreso a terminal de origen"],
  [/^gate[- ]?in$/i, "Ingreso a terminal"],
  [/^gate[- ]?out$/i, "Salida de terminal"],
  [/load(ed)?( on)?.*vessel|^load$|loaded/i, "Cargado a buque"],
  [/(vessel )?depart(ure)?.*(t\/s|transship)/i, "Zarpe desde puerto de transbordo"],
  [/(vessel )?depart|zarpe|sail/i, "Zarpe del buque"],
  [/(discharg|unload).*(t\/s|transship)/i, "Descargado en puerto de transbordo"],
  [/(vessel )?arriv.*(t\/s|transship)/i, "Arribo a puerto de transbordo"],
  [/estimated time of arrival|planned.*arrival|llegada estimada|expected arrival/i, "Arribo estimado"],
  [/(vessel |container )?arriv|llegada/i, "Arribo del buque"],
  [/discharg|unload/i, "Descargado del buque"],
  [/(import|full).*(gate[- ]?out|out for delivery|delivered|released)|import to consignee|delivered/i, "Salida a entrega"],
  [/empty.*(return|gate[- ]?in)|empty returned|gate[- ]?in of empty/i, "Contenedor vacío devuelto"],
];
function enEspanol(evento: string): string {
  const e = evento.trim();
  for (const [re, es] of TRADUCCION) if (re.test(e)) return es;
  return e.charAt(0).toUpperCase() + e.slice(1).toLowerCase();
}

function texto(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size: number, color = NEGRO, centro = false, maxW?: number) {
  let t = limpio(s);
  if (maxW) while (t.length > 3 && font.widthOfTextAtSize(t, size) > maxW) t = `${t.replace(/\.\.\.$/, "").slice(0, -1)}...`;
  const w = font.widthOfTextAtSize(t, size);
  page.drawText(t, { x: centro ? x - w / 2 : x, y, size, font, color });
}

// Diagrama: banda azul clara, línea de la ruta (recorrido continuo, pendiente
// punteado), puntos de origen / transbordos / destino y el buque donde va.
function diagrama(page: PDFPage, d: DatosEstatus, y: number, f: PDFFont, fb: PDFFont, ancho: number, margen: number) {
  const x0 = margen + 40;
  const x1 = margen + ancho - 40;
  const banda = { x: margen, y: y - 30, w: ancho, h: 46 };
  page.drawRectangle({ x: banda.x + 23, y: banda.y, width: banda.w - 46, height: banda.h, color: AZUL_CLARO });
  page.drawCircle({ x: banda.x + 23, y: banda.y + 23, size: 23, color: AZUL_CLARO });
  page.drawCircle({ x: banda.x + banda.w - 23, y: banda.y + 23, size: 23, color: AZUL_CLARO });
  const yl = banda.y + 23;

  const hoy = new Date().toISOString().slice(0, 10);
  const salida = d.atd ?? d.etd;
  const llegada = d.ata ?? d.eta ?? d.etaNaviera;
  let avance = 0;
  if (d.ata) avance = 1;
  else if (d.atd && llegada) avance = Math.min(0.92, Math.max(0.06, dias(d.atd, hoy) / Math.max(1, dias(d.atd, llegada))));
  const xb = x0 + (x1 - x0) * avance;

  // Recorrido: curva suave hasta el buque; pendiente punteado.
  if (avance > 0) {
    page.drawSvgPath(`M ${x0} 0 C ${x0 + (xb - x0) * 0.3} -9, ${x0 + (xb - x0) * 0.6} 9, ${xb} 0`, {
      x: 0,
      y: yl,
      borderColor: AZUL,
      borderWidth: 3,
    });
  }
  if (avance < 1) {
    page.drawLine({ start: { x: xb + 6, y: yl }, end: { x: x1, y: yl }, thickness: 2.5, color: AZUL_PUNTEADO, dashArray: [5, 5] });
  }

  // Transbordos repartidos sobre la ruta.
  const ts = d.transbordos;
  ts.forEach((t, i) => {
    const xt = x0 + ((x1 - x0) * (i + 1)) / (ts.length + 1);
    const pasado = xt <= xb;
    page.drawCircle({ x: xt, y: yl, size: 6, color: pasado ? AZUL : rgb(1, 1, 1), borderColor: pasado ? AZUL : GRIS_NODO, borderWidth: 2 });
    texto(page, t.lugar.toUpperCase(), xt, yl - 24, fb, 8.5, NEGRO, true, 110);
    texto(page, `Transbordo${t.fecha ? ` ${corta(t.fecha)}` : ""}`, xt, yl - 35, f, 8, GRIS, true);
  });

  // Origen y destino.
  page.drawCircle({ x: x0, y: yl, size: 9, color: NEGRO });
  page.drawCircle({ x: x0, y: yl, size: 3.5, color: rgb(1, 1, 1) });
  page.drawCircle({ x: x1, y: yl, size: 9, color: d.ata ? AZUL : GRIS_NODO });
  texto(page, (d.origen ?? "Origen").toUpperCase(), x0, banda.y - 18, fb, 11, NEGRO, true, 160);
  texto(page, salida ? `${d.atd ? "Zarpe" : "Zarpe estimado"} ${corta(salida)}` : "Por zarpar", x0, banda.y - 31, f, 9, GRIS, true);
  texto(page, (d.puertoDescarga ?? d.destino ?? "Destino").toUpperCase(), x1, banda.y - 18, fb, 11, NEGRO, true, 160);
  texto(page, d.ata ? `Arribo ${corta(d.ata)}` : llegada ? `Arribo estimado ${corta(llegada)}` : "Arribo por confirmar", x1, banda.y - 31, f, 9, GRIS, true);

  // Buque: casco naranja y contenedores.
  const by = yl + 4;
  // En drawSvgPath la "y" positiva va hacia abajo: el casco cuelga 9 pt bajo la cubierta.
  page.drawSvgPath("M -17 0 L 17 0 L 11 9 L -11 9 Z", { x: xb, y: by + 9, color: NARANJA });
  page.drawRectangle({ x: xb - 8, y: by + 9, width: 7, height: 9, color: NEGRO });
  page.drawRectangle({ x: xb + 1, y: by + 9, width: 8, height: 13, color: rgb(0.2, 0.25, 0.33) });

  // Días de tránsito.
  const transito = d.atd && (d.ata ?? null) ? dias(d.atd, d.ata as string) : d.atd && llegada ? dias(d.atd, llegada) : null;
  if (transito !== null) texto(page, `${transito} días de tránsito${d.ata ? "" : " (estimado)"}`, (x0 + x1) / 2, banda.y + banda.h + 10, fb, 10, AZUL, true);
}

export async function pdfEstatusEmbarque(d: DatosEstatus): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Estatus de embarque ${d.noBooking}`);
  pdf.setAuthor("AV2 Logistics");
  const page = pdf.addPage([612, 792]);
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(Uint8Array.from(Buffer.from(LOGO_AV2_PNG_BASE64, "base64")));
  const M = 40;
  const W = 612 - M * 2;

  // Encabezado como la notificación de arribo.
  page.drawImage(logo, { x: M, y: 720, width: 150, height: 40 });
  texto(page, "AV2 LOGISTICS", 612 / 2 + 50, 748, fb, 15, NEGRO, true);
  texto(page, "AV UNIVERSIDAD NO. 1011 COL. PUERTA DE HIERRO CP. 45116", 612 / 2 + 50, 734, fb, 7, NEGRO, true);
  texto(page, "ZAPOPAN, JALISCO", 612 / 2 + 50, 724, fb, 7, NEGRO, true);
  texto(page, "R.F.C ALO171009TZ1", 612 / 2 + 50, 714, fb, 7, NEGRO, true);
  page.drawRectangle({ x: M - 10, y: 690, width: W + 20, height: 7, color: ROJO });

  texto(page, "ESTATUS DE EMBARQUE", 612 / 2, 660, fb, 16, ROJO, true);
  const hoy = new Date();
  const fechaTxt = `ZAPOPAN, JALISCO ${hoy.getDate()} DE ${MESES_LARGO[hoy.getMonth()].toUpperCase()} DE ${hoy.getFullYear()}`;
  texto(page, fechaTxt, 612 - M - f.widthOfTextAtSize(fechaTxt, 9), 640, f, 9);
  texto(page, `Estimado cliente${d.cliente ? ` ${d.cliente}` : ""}: le compartimos el estatus de su embarque.`, M, 624, f, 10, NEGRO, false, W);

  // Estatus actual destacado.
  const vacioDevuelto = Boolean(d.regresoVacio) || enEspanol(d.ultimoEvento ?? "") === "Contenedor vacío devuelto";
  const estatus = vacioDevuelto
    ? "Contenedor vacío devuelto"
    : d.ata
      ? "Arribó a puerto de destino"
      : d.atd
        ? "En tránsito marítimo"
        : "Por zarpar";
  page.drawRectangle({ x: M, y: 586, width: W, height: 28, color: rgb(0.96, 0.97, 0.98), borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.8 });
  texto(page, "Estatus actual:", M + 10, 596, fb, 11, NEGRO);
  texto(page, estatus, M + 100, 596, fb, 11, AZUL);
  if (d.ultimoEvento) {
    texto(page, `Último movimiento: ${enEspanol(d.ultimoEvento)}${d.ultimoEventoFecha ? ` · ${fecha(d.ultimoEventoFecha)}` : ""}`, M + 260, 596, f, 8.5, GRIS, false, W - 270);
  }

  // Diagrama de la ruta.
  diagrama(page, d, 540, f, fb, W, M);

  // Datos del embarque en dos columnas (como la notificación de arribo).
  const filas: [string, string | null][] = [
    ["Booking:", d.noBooking],
    ["Línea marítima:", d.naviera],
    ["Buque y viaje:", d.buque],
    ["Puerto de carga:", d.origen],
    ["Puerto de descarga:", d.puertoDescarga],
    ["Destino final:", d.destino],
    ["Consignatario:", d.consignatario],
    ["Proveedor:", d.proveedor],
    ["Mercancía:", d.mercancia],
    ["Incoterm:", d.incoterm],
    ["Servicio / equipo:", [d.servicio, d.equipo].filter(Boolean).join(" · ") || null],
    ["Contenedor(es):", d.contenedores],
    ["Master B/L:", d.mbl],
    ["House B/L:", d.hbl],
    ["Zarpe (ATD):", d.atd ? fecha(d.atd) : d.etd ? `${fecha(d.etd)} (estimado)` : null],
    ["Arribo estimado (ETA):", d.eta ? fecha(d.eta) : null],
    ["ETA según la naviera:", !d.ata && d.etaNaviera && d.etaNaviera !== d.eta?.slice(0, 10) ? fecha(d.etaNaviera) : null],
    ["Arribo (ATA):", d.ata ? fecha(d.ata) : null],
    ["Transbordos:", d.transbordos.length ? d.transbordos.map((t) => t.lugar).join(", ") : "Directo"],
    ["Revalidación:", d.revalidacion ? fecha(d.revalidacion) : null],
    ["Días libres de demora:", d.diasLibres ? `${d.diasLibres} días${d.ultimoDiaLibre ? ` · último día libre ${fecha(d.ultimoDiaLibre)}` : ""}` : null],
    ["Regreso de vacío:", d.regresoVacio ? fecha(d.regresoVacio) : null],
  ];
  let y = 452;
  texto(page, "Datos del embarque", M, y, fb, 12, ROJO);
  y -= 16;
  // Dos columnas, para que siempre quepan los movimientos del contenedor.
  const conValor = filas.filter(([, v]) => v);
  const mitad = Math.ceil(conValor.length / 2);
  const col = W / 2;
  conValor.forEach(([etiqueta, valor], i) => {
    const x = i < mitad ? M : M + col + 6;
    const yy = y - (i % mitad) * 14;
    texto(page, etiqueta, x, yy, fb, 8.5);
    texto(page, valor as string, x + 108, yy, f, 8.5, NEGRO, false, col - 116);
  });
  y -= mitad * 14;

  // Últimos movimientos según la naviera.
  const eventos = d.eventos.filter((e) => e.fecha).slice(-9);
  if (eventos.length && y > 150) {
    y -= 10;
    texto(page, "Movimientos del contenedor", M, y, fb, 12, ROJO);
    y -= 15;
    page.drawRectangle({ x: M, y: y - 3, width: W, height: 15, color: rgb(0.45, 0.47, 0.5) });
    texto(page, "FECHA", M + 6, y + 1, fb, 8, rgb(1, 1, 1));
    texto(page, "MOVIMIENTO", M + 80, y + 1, fb, 8, rgb(1, 1, 1));
    texto(page, "LUGAR", M + 330, y + 1, fb, 8, rgb(1, 1, 1));
    texto(page, "", M + 470, y + 1, fb, 8, rgb(1, 1, 1));
    y -= 15;
    for (const e of eventos) {
      if (y < 70) break;
      texto(page, fecha(e.fecha), M + 6, y, f, 8.5);
      texto(page, enEspanol(e.evento), M + 80, y, f, 8.5, NEGRO, false, 240);
      texto(page, e.lugar ?? "—", M + 330, y, f, 8.5, NEGRO, false, 130);
      texto(page, e.real ? "Realizado" : "Estimado", M + 470, y, fb, 8, e.real ? rgb(0.08, 0.5, 0.24) : rgb(0.7, 0.42, 0.04));
      page.drawLine({ start: { x: M, y: y - 4 }, end: { x: M + W, y: y - 4 }, thickness: 0.4, color: rgb(0.85, 0.87, 0.9) });
      y -= 14;
    }
  }

  // Pie.
  texto(
    page,
    `Información de referencia, sujeta a cambios de la línea marítima${d.consultadoNaviera ? ` (actualizada el ${fecha(d.consultadoNaviera)})` : ""}.`,
    612 / 2,
    52,
    f,
    7.5,
    GRIS,
    true,
  );
  texto(page, "Para cualquier duda sobre su embarque, contacte a su ejecutivo de AV2 Logistics.", 612 / 2, 41, f, 7.5, GRIS, true);
  page.drawRectangle({ x: M - 10, y: 28, width: W + 20, height: 3, color: ROJO });
  return pdf.save();
}
