// PDF "Pulso de la operación": resumen ejecutivo interno para Dirección.
// Junta en una lectura lo que dice la naviera, lo que capturó Comercial
// (conceptos, costos, pagos a proveedores) y el avance de Operaciones, con
// los puntos de atención arriba para no tener que preguntar.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { LOGO_AV2_PNG_BASE64 } from "@/lib/logoAv2";
import { diagrama, dias, enEspanol, fecha, corta, limpio, tablaTramos, texto, tramosDelViaje, type DatosEstatus } from "@/lib/pdfEstatusEmbarque";
import { FASES, type Tarea } from "@/lib/trackNew";

export type PagoConcepto = "pagado" | "pendiente" | "sin";
export type ConceptoPulso = {
  tipo: string;
  concepto: string;
  proveedor: string | null;
  costo: number;
  costoMoneda: string;
  venta: number;
  ventaMoneda: string;
  pago: PagoConcepto;
  // Folio de la solicitud de pago (FS) en Cargolink.
  solicitud: string | null;
};

export type ConceptoOriginal = Pick<ConceptoPulso, "tipo" | "concepto" | "proveedor" | "costo" | "costoMoneda" | "venta" | "ventaMoneda"> & {
  cantidad: number;
};

export type DatosPulso = {
  // Datos del embarque y de la ruta (los mismos del PDF para el cliente).
  ruta: DatosEstatus;
  ejecutivo: string | null;
  estatusBooking: string;
  etapa: string;
  referencia: string | null;
  agenteExtranjero: string | null;
  ventaPor: string | null;
  credito: string | null;
  peligroso: string | null;
  equipos: { numero: string | null; tipo: string | null }[];
  embalaje: { cantidad: number | null; tipo: string | null };
  // ATD que reporta la naviera, para compararlo con el de Cargolink.
  atdNaviera: string | null;
  // ATA capturada en Cargolink con fecha futura (no cuenta como arribo).
  ataFutura: string | null;
  seguro: {
    contratado: boolean;
    etapa: string | null;
    poliza: string | null;
    monto: number | null;
    aseguraPor: string | null;
    fecha: string | null;
    alcance: string | null;
    monto2: number | null;
    aseguraPor2: string | null;
    moneda: string | null;
  };
  comercial: {
    ok: boolean;
    mensaje: string;
    conceptos: ConceptoPulso[];
    // Como en el llenado del booking: sin impuestos; costo = venta − profit.
    venta: number | null;
    costo: number | null;
    profit: number | null;
    moneda: string | null;
    cambios: string[];
    avisoCargolink: boolean;
    // Lo que Comercial capturó de origen (la revisión de Operaciones), si
    // después cambió. Cargolink guarda ahí precios unitarios.
    original: { conceptos: ConceptoOriginal[]; tomadaAt: string | null; revisadoPor: string | null } | null;
  };
  facturacion: {
    etapa: string | null;
    solicitud: string | null;
    folio: string | null;
    fechaFactura: string | null;
    fechaPago: string | null;
    enviado: boolean;
    facturado: boolean;
    diasRestantes: number | null;
  };
  garantia: {
    etapa: string | null;
    tipo: string | null;
    monto: number | null;
    moneda: string | null;
    solicitud: string | null;
    solicitudDevolucion: string | null;
    regreso: string | null;
  };
  diasDemora: number | null;
  tareas: Tarea[];
};

const ROJO = rgb(0.5, 0.09, 0.09);
const AZUL = rgb(0.11, 0.31, 0.85);
const GRIS = rgb(0.4, 0.45, 0.52);
const LINEA = rgb(0.85, 0.87, 0.9);
const FONDO = rgb(0.96, 0.97, 0.98);
const NEGRO = rgb(0.06, 0.09, 0.13);
const BLANCO = rgb(1, 1, 1);
const VERDE = rgb(0.08, 0.5, 0.24);
const AMBAR = rgb(0.7, 0.42, 0.04);
const ROJO_ALERTA = rgb(0.73, 0.11, 0.11);
const PIZARRA = rgb(0.09, 0.14, 0.18);

const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ANCHO = 612;
const ALTO = 792;
const M = 40;
const W = ANCHO - M * 2;

const dinero = (n: number | null | undefined, m = "") =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${m ? ` ${m}` : ""}`;
const hoyMx = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());

type Nivel = "rojo" | "ambar" | "verde" | "info";
const COLOR_NIVEL: Record<Nivel, RGB> = { rojo: ROJO_ALERTA, ambar: AMBAR, verde: VERDE, info: AZUL };

// Lo que Dirección debe saber primero: retrasos, riesgos y dinero pendiente.
export function puntosDeAtencion(d: DatosPulso): { nivel: Nivel; texto: string }[] {
  const p: { nivel: Nivel; texto: string }[] = [];
  const r = d.ruta;
  for (const t of d.tareas.filter((x) => x.estado === "falta")) p.push({ nivel: "rojo", texto: `${t.label}: ${t.valor || "pendiente"} (${t.detalle}).` });
  for (const t of d.tareas.filter((x) => x.estado === "alerta")) p.push({ nivel: "ambar", texto: `${t.label}: ${t.detalle}.` });
  if (d.diasDemora !== null && d.diasDemora > 0 && !r.regresoVacio && r.ata) {
    p.push({ nivel: "rojo", texto: `En demora: ${d.diasDemora} días después del último día libre (${fecha(r.ultimoDiaLibre)}); el vacío no ha regresado.` });
  } else if (r.ata && !r.regresoVacio && d.diasDemora !== null && d.diasDemora >= -4) {
    p.push({ nivel: "ambar", texto: `Quedan ${-d.diasDemora} días libres (último día ${fecha(r.ultimoDiaLibre)}).` });
  }
  if (d.ataFutura) {
    p.push({
      nivel: "ambar",
      texto: !r.ata && r.etaNaviera && d.ataFutura < r.etaNaviera
        ? `Cargolink tiene ATA ${fecha(d.ataFutura)}, pero la naviera aún no reporta el arribo (ETA ${fecha(r.etaNaviera)}): corregir la ATA.`
        : `Cargolink tiene la ATA capturada con fecha futura (${fecha(d.ataFutura)}): confirmar con la naviera.`,
    });
  }
  if (r.atd && d.atdNaviera && Math.abs(dias(r.atd, d.atdNaviera)) >= 2) {
    p.push({ nivel: "ambar", texto: `El zarpe en Cargolink (${fecha(r.atd)}) no coincide con el de la naviera (${fecha(d.atdNaviera)}).` });
  }
  if (!r.ata && r.eta && r.etaNaviera && Math.abs(dias(r.eta, r.etaNaviera)) >= 2) {
    p.push({ nivel: "ambar", texto: `La naviera reporta ETA ${fecha(r.etaNaviera)}, distinta a la de Cargolink (${fecha(r.eta)}).` });
  }
  if (r.transbordos.length) p.push({ nivel: "info", texto: `Ruta con transbordo en ${r.transbordos.map((t) => t.lugar).join(", ")}.` });
  if (!d.seguro.contratado) p.push({ nivel: "ambar", texto: "La mercancía no tiene seguro contratado con AV2." });
  else if (!d.seguro.poliza) p.push({ nivel: "ambar", texto: "Seguro contratado, pero sin número de póliza capturado." });
  const c = d.comercial;
  if (!c.ok) p.push({ nivel: "ambar", texto: `No se pudo leer el resumen comercial de Cargolink: ${c.mensaje}` });
  else {
    const nOrig = c.original?.conceptos.length ?? 0;
    if (c.conceptos.length === 0 && nOrig) {
      p.push({ nivel: "rojo", texto: `Comercial quitó los conceptos del booking (en la captura de origen${c.original?.tomadaAt ? ` del ${fecha(c.original.tomadaAt)}` : ""} había ${nOrig}).` });
    } else if (c.conceptos.length === 0) p.push({ nivel: "rojo", texto: "Comercial no ha capturado conceptos de costo y venta." });
    const pend = c.conceptos.filter((x) => x.pago === "pendiente");
    if (pend.length) p.push({ nivel: "ambar", texto: `${pend.length} pago(s) a proveedores solicitado(s) y pendiente(s): ${pend.map((x) => x.concepto).join(", ")}.` });
    const sin = c.conceptos.filter((x) => x.pago === "sin" && x.costo > 0);
    if (sin.length) p.push({ nivel: "info", texto: `${sin.length} costo(s) sin solicitud de pago aún: ${sin.map((x) => x.concepto).join(", ")}.` });
    if ((c.profit ?? 0) < 0) p.push({ nivel: "rojo", texto: `Profit negativo: ${dinero(c.profit, c.moneda ?? "")}.` });
    if (c.cambios.length) p.push({ nivel: "rojo", texto: `Comercial cambió el booking después de la revisión de Operaciones (${c.cambios.length} cambio(s)).` });
    if (c.avisoCargolink) p.push({ nivel: "ambar", texto: "Cargolink avisa un cambio de servicio sin revisar." });
  }
  if (!d.facturacion.facturado && r.ata) p.push({ nivel: "ambar", texto: "El embarque ya arribó y aún no está facturado al cliente." });
  return p;
}

// Divide un texto en renglones que caben en maxW.
function renglones(s: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  let linea = "";
  for (const palabra of limpio(s).split(/\s+/)) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (font.widthOfTextAtSize(prueba, size) > maxW && linea) {
      out.push(linea);
      linea = palabra;
    } else linea = prueba;
  }
  if (linea) out.push(linea);
  return out;
}

// Hoja con cursor: abre página nueva (con encabezado corto) cuando no cabe.
class Lienzo {
  page!: PDFPage;
  y = 0;
  paginas: PDFPage[] = [];
  constructor(
    private pdf: PDFDocument,
    public f: PDFFont,
    public fb: PDFFont,
    private noBooking: string,
  ) {}
  nueva() {
    this.page = this.pdf.addPage([ANCHO, ALTO]);
    this.paginas.push(this.page);
    if (this.paginas.length > 1) {
      texto(this.page, `PULSO DE LA OPERACIÓN · ${this.noBooking}`, M, ALTO - 40, this.fb, 10, ROJO);
      this.page.drawRectangle({ x: M - 10, y: ALTO - 50, width: W + 20, height: 3, color: ROJO });
      this.y = ALTO - 72;
    }
  }
  espacio(h: number) {
    if (this.y - h < 70) this.nueva();
  }
  seccion(titulo: string, minimo = 60) {
    this.y -= 8;
    this.espacio(minimo);
    texto(this.page, titulo, M, this.y, this.fb, 12, ROJO);
    this.page.drawLine({ start: { x: M, y: this.y - 5 }, end: { x: M + W, y: this.y - 5 }, thickness: 0.6, color: LINEA });
    this.y -= 20;
  }
}

// Filas etiqueta/valor en dos columnas; solo las que tienen valor.
function columnas(l: Lienzo, filas: [string, string | null][], ancho = 112) {
  const con = filas.filter(([, v]) => v) as [string, string][];
  const mitad = Math.ceil(con.length / 2);
  const col = W / 2;
  l.espacio(mitad * 13 + 4);
  con.forEach(([etiqueta, valor], i) => {
    const x = i < mitad ? M : M + col + 6;
    const yy = l.y - (i % mitad) * 13;
    texto(l.page, etiqueta, x, yy, l.fb, 8.5);
    texto(l.page, valor, x + ancho, yy, l.f, 8.5, NEGRO, false, col - ancho - 10);
  });
  l.y -= mitad * 13 + 8;
}

function chip(page: PDFPage, s: string, x: number, y: number, font: PDFFont, color: RGB, fondo?: RGB) {
  const t = limpio(s);
  const w = font.widthOfTextAtSize(t, 7.5) + 10;
  page.drawRectangle({ x, y: y - 3, width: w, height: 12, color: fondo ?? color, opacity: fondo ? 1 : 0.12, borderColor: color, borderWidth: 0.6 });
  page.drawText(t, { x: x + 5, y, size: 7.5, font, color });
  return w;
}

function tablaComercial(l: Lienzo, c: Pick<DatosPulso["comercial"], "conceptos">, conPago = true) {
  const cols = [
    { t: "TIPO", x: 0, w: 52 },
    { t: "CONCEPTO", x: 54, w: 140 },
    { t: "PROVEEDOR", x: 196, w: 110 },
    { t: "COSTO", x: 308, w: 74, der: true },
    { t: "VENTA", x: 384, w: 74, der: true },
    { t: "PAGO", x: 462, w: 70 },
  ].filter((k) => conPago || k.t !== "PAGO");
  const encabezado = () => {
    l.page.drawRectangle({ x: M, y: l.y - 3, width: W, height: 14, color: rgb(0.45, 0.47, 0.5) });
    for (const k of cols) {
      const xx = k.der ? M + k.x + k.w - l.fb.widthOfTextAtSize(k.t, 7.5) : M + k.x + 4;
      texto(l.page, k.t, xx, l.y + 1, l.fb, 7.5, BLANCO);
    }
    l.y -= 15;
  };
  l.espacio(40);
  encabezado();
  for (const x of c.conceptos) {
    if (l.y < 84) {
      l.nueva();
      encabezado();
    }
    texto(l.page, x.tipo, M + 4, l.y, l.f, 8, GRIS, false, 48);
    texto(l.page, x.concepto, M + 58, l.y, l.f, 8, NEGRO, false, 136);
    texto(l.page, x.proveedor ?? "—", M + 200, l.y, l.f, 8, NEGRO, false, 106);
    for (const [v, k] of [
      [dinero(x.costo, x.costoMoneda), cols[3]],
      [dinero(x.venta, x.ventaMoneda), cols[4]],
    ] as const) {
      const t = limpio(v);
      texto(l.page, t, M + k.x + k.w - l.f.widthOfTextAtSize(t, 8), l.y, l.f, 8);
    }
    const [label, color] =
      x.pago === "pagado" ? ["Pagado", VERDE] : x.pago === "pendiente" ? [`Pendiente${x.solicitud ? ` FS ${x.solicitud}` : ""}`, AMBAR] : ["Sin solicitud", GRIS];
    if (conPago) texto(l.page, label, M + 466, l.y, l.fb, 7.5, color, false, 70);
    l.page.drawLine({ start: { x: M, y: l.y - 4 }, end: { x: M + W, y: l.y - 4 }, thickness: 0.4, color: LINEA });
    l.y -= 13;
  }
  l.y -= 4;
}

export async function pdfPulsoOperacion(d: DatosPulso): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const r = d.ruta;
  pdf.setTitle(`Pulso de la operación ${r.noBooking}`);
  pdf.setAuthor("AV2 Logistics");
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(Uint8Array.from(Buffer.from(LOGO_AV2_PNG_BASE64, "base64")));
  const l = new Lienzo(pdf, f, fb, r.noBooking);
  l.nueva();
  const page = l.page;
  const hoy = hoyMx();

  // Encabezado.
  page.drawImage(logo, { x: M, y: 722, width: 135, height: 36 });
  texto(page, "PULSO DE LA OPERACIÓN", ANCHO - M - fb.widthOfTextAtSize("PULSO DE LA OPERACIÓN", 16), 744, fb, 16, ROJO);
  const sub = "Resumen ejecutivo para Dirección · uso interno";
  texto(page, sub, ANCHO - M - f.widthOfTextAtSize(sub, 9), 730, f, 9, GRIS);
  const [a, mm, dd] = hoy.split("-").map(Number);
  const fechaTxt = `Corte al ${dd} de ${MESES_LARGO[mm - 1]} de ${a}`;
  texto(page, fechaTxt, ANCHO - M - f.widthOfTextAtSize(fechaTxt, 9), 718, f, 9, GRIS);
  page.drawRectangle({ x: M - 10, y: 704, width: W + 20, height: 5, color: ROJO });

  // Franja de identificación.
  page.drawRectangle({ x: M, y: 640, width: W, height: 54, color: PIZARRA });
  texto(page, r.noBooking, M + 12, 674, fb, 15, BLANCO);
  let xc = M + 22 + fb.widthOfTextAtSize(r.noBooking, 15);
  xc += chip(page, d.estatusBooking, xc, 676, fb, rgb(0.53, 0.94, 0.67), rgb(0.12, 0.23, 0.18)) + 5;
  chip(page, d.etapa, xc, 676, fb, rgb(0.99, 0.83, 0.3), rgb(0.23, 0.16, 0.07));
  texto(page, `${r.cliente ?? "—"} · ${r.origen ?? "—"} - ${r.destino ?? "—"}`, M + 12, 659, f, 9.5, rgb(0.8, 0.84, 0.88), false, W - 24);
  texto(page, `Ejecutivo: ${d.ejecutivo ?? "Sin ejecutivo"}${r.naviera ? ` · ${r.naviera}` : ""}${r.buque ? ` · ${r.buque}` : ""}`, M + 12, 647, f, 8.5, rgb(0.6, 0.66, 0.73), false, W - 24);

  // Indicadores.
  const llegada = r.ata ?? r.eta ?? r.etaNaviera;
  const salida = r.atd ?? r.etd;
  const pendientes = d.tareas.filter((t) => t.estado === "falta" || t.estado === "alerta").length;
  const c = d.comercial;
  const margen = c.ok && c.venta ? Math.round((1000 * (c.profit ?? 0)) / c.venta) / 10 : null;
  const tiposEquipo = [...new Set(d.equipos.map((e) => e.tipo).filter(Boolean))].join(", ");
  const kpis: { t: string; v: string; s: string; color?: RGB }[] = [
    {
      t: "ARRIBO",
      v: llegada ? corta(llegada) : "Por confirmar",
      s: r.ata ? "Arribó (ATA)" : llegada ? `en ${Math.max(0, dias(hoy, llegada))} días (ETA)` : "Sin ETA",
    },
    {
      t: "TRÁNSITO",
      v: salida && llegada ? `${dias(salida, llegada)} días` : "—",
      s: r.atd ? `Zarpó ${corta(r.atd)}` : salida ? `Zarpe est. ${corta(salida)}` : "Sin zarpe",
    },
    { t: "CONTENEDORES", v: String(d.equipos.length || "—"), s: tiposEquipo || "—" },
    {
      t: "PROFIT",
      v: c.profit !== null ? dinero(c.profit, c.moneda ?? "") : "—",
      s: margen !== null ? `${margen} % de margen` : c.ok ? "Sin venta" : "Del booking (sin Cargolink)",
      color: (c.profit ?? 0) < 0 ? ROJO_ALERTA : VERDE,
    },
    {
      t: "PENDIENTES OPERATIVOS",
      v: String(pendientes),
      s: pendientes ? "atrasados o por revisar" : "Todo en tiempo",
      color: pendientes ? ROJO_ALERTA : VERDE,
    },
  ];
  const kw = (W - 4 * 8) / 5;
  kpis.forEach((k, i) => {
    const x = M + i * (kw + 8);
    page.drawRectangle({ x, y: 578, width: kw, height: 52, color: FONDO, borderColor: LINEA, borderWidth: 0.8 });
    texto(page, k.t, x + 8, 618, fb, 6.5, GRIS, false, kw - 12);
    texto(page, k.v, x + 8, 600, fb, 13, k.color ?? NEGRO, false, kw - 12);
    texto(page, k.s, x + 8, 586, f, 7.5, GRIS, false, kw - 12);
  });

  // Puntos de atención.
  l.y = 560;
  l.seccion("Puntos de atención", 40);
  const puntos = puntosDeAtencion(d);
  if (!puntos.length) {
    texto(l.page, "Sin pendientes críticos: la operación va en tiempo.", M + 12, l.y, f, 9, VERDE);
    l.y -= 16;
  }
  for (const p of puntos) {
    const lineas = renglones(p.texto, f, 9, W - 20);
    l.espacio(lineas.length * 11 + 4);
    l.page.drawCircle({ x: M + 4, y: l.y + 3, size: 3, color: COLOR_NIVEL[p.nivel] });
    lineas.forEach((ln, i) => texto(l.page, ln, M + 14, l.y - i * 11, f, 9));
    l.y -= lineas.length * 11 + 3;
  }

  // Ruta (mismo diagrama del PDF para el cliente).
  l.espacio(120);
  l.y -= 40;
  diagrama(l.page, r, l.y, f, fb, W, M);
  l.y -= 82;

  // Con transbordo: cada tramo con su buque.
  const tramos = tramosDelViaje(r.eventos, r.puertoDescarga ?? r.destino);
  if (r.transbordos.length || tramos.length > 1) {
    l.seccion(`Tramos del viaje (${r.transbordos.length ? `transbordo en ${r.transbordos.map((t) => t.lugar).join(", ")}` : "según la naviera"})`, 60);
    l.espacio(15 + Math.max(1, tramos.length) * 13);
    l.y = tablaTramos(l.page, tramos, l.y, f, fb, M, W);
    l.y -= 2;
  }

  // Embarque.
  l.seccion("Embarque");
  columnas(l, [
    ["Cliente:", r.cliente],
    ["Proveedor (shipper):", r.proveedor],
    ["Consignatario:", r.consignatario],
    ["Agente extranjero:", d.agenteExtranjero],
    ["Referencia / PO:", d.referencia],
    ["Venta por:", d.ventaPor],
    ["Incoterm:", r.incoterm],
    ["Servicio:", r.servicio],
    ["Origen:", r.origen],
    ["Puerto de descarga:", r.puertoDescarga],
    ["Destino final:", r.destino],
    ["Ruta:", r.transbordos.length ? `Con transbordo: ${r.transbordos.map((t) => `${t.lugar}${t.fecha ? ` (${corta(t.fecha)})` : ""}`).join(", ")}` : "Directo, sin transbordo"],
    ["Línea marítima:", r.naviera],
    ["Buque / viaje:", r.buque],
    ["Master B/L:", r.mbl],
    ["House B/L:", r.hbl],
    ["Zarpe (ATD):", r.atd ? fecha(r.atd) : r.etd ? `${fecha(r.etd)} (estimado)` : null],
    ["Zarpe según naviera:", d.atdNaviera && d.atdNaviera !== r.atd ? fecha(d.atdNaviera) : null],
    ["ETA:", r.eta ? fecha(r.eta) : null],
    ["ETA según naviera:", r.etaNaviera ? fecha(r.etaNaviera) : null],
    ["Arribo (ATA):", r.ata ? fecha(r.ata) : null],
    ["Revalidación:", r.revalidacion ? fecha(r.revalidacion) : null],
    ["Días libres:", r.diasLibres ? `${r.diasLibres} días${r.ultimoDiaLibre ? ` · hasta ${fecha(r.ultimoDiaLibre)}` : ""}` : null],
    ["Regreso de vacío:", r.regresoVacio ? fecha(r.regresoVacio) : null],
  ]);

  // Carga.
  l.seccion("Carga");
  if (r.mercancia) {
    const lineas = renglones(r.mercancia, f, 8.5, W - 112);
    l.espacio(lineas.length * 12);
    texto(l.page, "Mercancía:", M, l.y, fb, 8.5);
    lineas.forEach((ln, i) => texto(l.page, ln, M + 112, l.y - i * 12, f, 8.5));
    l.y -= lineas.length * 12 + 2;
  }
  columnas(l, [
    ["Peligrosa:", d.peligroso],
    ["Equipos:", d.equipos.length ? `${d.equipos.length} × ${tiposEquipo || "contenedor"}` : null],
    ["Embalaje:", d.embalaje.cantidad ? `${d.embalaje.cantidad} ${d.embalaje.tipo ?? "bultos"}` : null],
  ]);
  if (d.equipos.length) {
    const lineas = renglones(
      d.equipos.map((e, i) => `${i + 1}. ${e.numero ?? "Por asignar"}${e.tipo ? ` (${e.tipo})` : ""}`).join("    "),
      f,
      8.5,
      W - 112,
    );
    l.espacio(lineas.length * 12);
    texto(l.page, "Contenedores:", M, l.y, fb, 8.5);
    lineas.forEach((ln, i) => texto(l.page, ln, M + 112, l.y - i * 12, f, 8.5));
    l.y -= lineas.length * 12 + 6;
  }

  // Seguro.
  const s = d.seguro;
  l.seccion("Seguro de mercancía");
  l.espacio(16);
  chip(l.page, s.contratado ? "ASEGURADO" : "SIN SEGURO", M, l.y, fb, s.contratado ? VERDE : AMBAR);
  if (s.etapa) texto(l.page, `Etapa en Cargolink: ${s.etapa}`, M + 90, l.y, f, 8.5, GRIS);
  l.y -= 18;
  if (s.contratado) {
    columnas(l, [
      ["Póliza:", s.poliza ?? "Sin capturar"],
      ["Monto asegurado:", s.monto ? dinero(s.monto, s.moneda ?? "") : "Sin capturar"],
      ["Asegura:", s.aseguraPor],
      ["Fecha:", s.fecha ? fecha(s.fecha) : null],
      ["Alcance:", s.alcance],
      ["Segundo seguro:", s.monto2 ? `${dinero(s.monto2, s.moneda ?? "")}${s.aseguraPor2 ? ` · ${s.aseguraPor2}` : ""}` : null],
    ]);
  }

  // Comercial.
  l.seccion("Comercial: costos, venta y pagos a proveedores", 90);
  if (!c.ok) {
    texto(l.page, `No se pudo leer de Cargolink: ${c.mensaje}`, M, l.y, f, 9, ROJO_ALERTA, false, W);
    l.y -= 16;
  } else {
    const pagados = c.conceptos.filter((x) => x.pago === "pagado").length;
    const pend = c.conceptos.filter((x) => x.pago === "pendiente").length;
    const sin = c.conceptos.filter((x) => x.pago === "sin").length;
    l.espacio(40);
    const tot: [string, string, RGB][] = [
      ["VENTA SIN IVA", dinero(c.venta, c.moneda ?? ""), NEGRO],
      ["COSTO SIN IVA", dinero(c.costo, c.moneda ?? ""), NEGRO],
      ["PROFIT", `${dinero(c.profit, c.moneda ?? "")}${margen !== null ? ` (${margen} %)` : ""}`, (c.profit ?? 0) < 0 ? ROJO_ALERTA : VERDE],
      ["PAGOS A PROVEEDORES", `${pagados} pagados · ${pend} pend. · ${sin} sin sol.`, pend ? AMBAR : NEGRO],
    ];
    const tw = (W - 3 * 8) / 4;
    tot.forEach(([t, v, color], i) => {
      const x = M + i * (tw + 8);
      l.page.drawRectangle({ x, y: l.y - 22, width: tw, height: 34, color: FONDO, borderColor: LINEA, borderWidth: 0.8 });
      texto(l.page, t, x + 8, l.y, fb, 6.5, GRIS);
      texto(l.page, v, x + 8, l.y - 14, fb, i === 3 ? 8 : 10.5, color, false, tw - 12);
    });
    l.y -= 40;
    if (c.conceptos.length) tablaComercial(l, c);
    // Sin conceptos actuales: cómo los capturó Comercial de origen.
    if (!c.conceptos.length && c.original?.conceptos.length) {
      l.espacio(50);
      const quien = [c.original.tomadaAt ? fecha(c.original.tomadaAt) : null, c.original.revisadoPor].filter(Boolean).join(" · ");
      texto(l.page, `Captura de origen de Comercial${quien ? ` (${quien})` : ""} · precios unitarios`, M, l.y, l.fb, 9.5, NEGRO);
      l.y -= 14;
      tablaComercial(l, { conceptos: c.original.conceptos.map((x) => ({ ...x, pago: "sin" as const, solicitud: null })) }, false);
    }
    for (const cambio of c.cambios) {
      const lineas = renglones(`Cambio de Comercial sin revisar: ${cambio}`, f, 8.5, W - 14);
      l.espacio(lineas.length * 11 + 2);
      lineas.forEach((ln, i) => texto(l.page, ln, M + 6, l.y - i * 11, f, 8.5, ROJO_ALERTA));
      l.y -= lineas.length * 11 + 2;
    }
    texto(l.page, "Totales como en el llenado del booking en Cargolink (sin impuestos). Conceptos a precio unitario.", M, l.y, f, 7.5, GRIS);
    l.y -= 14;
  }

  // Facturación y cobranza.
  const fa = d.facturacion;
  l.seccion("Facturación al cliente y garantía");
  columnas(l, [
    ["Estatus:", fa.facturado ? "Facturado" : fa.enviado ? "Enviado a facturación" : fa.solicitud ? "Solicitud de facturación enviada" : "Sin solicitud de facturación"],
    ["Etapa en Cargolink:", fa.etapa],
    ["Solicitud:", fa.solicitud ? fecha(fa.solicitud) : null],
    ["Folio de factura:", fa.folio],
    ["Fecha de factura:", fa.fechaFactura ? fecha(fa.fechaFactura) : null],
    ["Fecha de pago:", fa.fechaPago ? fecha(fa.fechaPago) : null],
    ["Días restantes:", !fa.facturado && fa.diasRestantes !== null ? String(fa.diasRestantes) : null],
    ["Crédito del cliente:", d.credito],
    ["Garantía:", d.garantia.etapa ?? (d.garantia.monto ? "Solicitada" : null)],
    ["Garantía (monto):", d.garantia.monto ? `${dinero(d.garantia.monto, d.garantia.moneda ?? "")}${d.garantia.tipo ? ` · ${d.garantia.tipo}` : ""}` : null],
    ["Garantía solicitada:", d.garantia.solicitud ? fecha(d.garantia.solicitud) : null],
    ["Devolución solicitada:", d.garantia.solicitudDevolucion ? fecha(d.garantia.solicitudDevolucion) : null],
    ["Garantía devuelta:", d.garantia.regreso ? fecha(d.garantia.regreso) : null],
  ]);

  // Avance operativo por fase.
  l.seccion("Avance operativo", 80);
  const ESTADO: Record<Tarea["estado"], [string, RGB]> = {
    hecho: ["Hecho", VERDE],
    na: ["No aplica", GRIS],
    falta: ["Atrasado", ROJO_ALERTA],
    alerta: ["Revisar", AMBAR],
    pend: ["Pendiente", AZUL],
  };
  for (const fase of FASES) {
    const lista = d.tareas.filter((t) => t.fase === fase.clave);
    if (!lista.length) continue;
    l.espacio(14 + lista.length * 12);
    texto(l.page, `${fase.n}. ${fase.nombre}`, M, l.y, fb, 8.5, NEGRO);
    l.y -= 12;
    for (const t of lista) {
      const [label, color] = ESTADO[t.estado];
      l.page.drawCircle({ x: M + 14, y: l.y + 3, size: 2.5, color });
      texto(l.page, t.label, M + 22, l.y, f, 8.5, NEGRO, false, 180);
      texto(l.page, label, M + 210, l.y, fb, 8, color);
      // Sin repetir lo que ya dice el valor ("En edición" / "En edición en Cargolink").
      const valor = t.valor !== "—" && t.valor !== label ? t.valor : "";
      const detalle = t.estado !== "hecho" && t.estado !== "na" && !(valor && t.detalle.toLowerCase().startsWith(valor.toLowerCase())) ? t.detalle : "";
      texto(l.page, [valor, detalle].filter(Boolean).join(" · "), M + 262, l.y, f, 8, GRIS, false, W - 262);
      l.y -= 12;
    }
    l.y -= 3;
  }

  // Últimos movimientos de la naviera.
  const eventos = r.eventos.filter((e) => e.fecha && e.real).slice(-5);
  if (eventos.length || r.ultimoEvento) {
    l.seccion("Últimos movimientos según la naviera", 50);
    for (const e of eventos.length ? eventos : [{ fecha: r.ultimoEventoFecha, evento: r.ultimoEvento as string, lugar: null }]) {
      l.espacio(13);
      texto(l.page, fecha(e.fecha), M, l.y, f, 8.5);
      texto(l.page, enEspanol(e.evento), M + 80, l.y, f, 8.5, NEGRO, false, 240);
      texto(l.page, e.lugar ?? "", M + 330, l.y, f, 8.5, GRIS, false, W - 330);
      l.y -= 13;
    }
    if (r.consultadoNaviera) {
      texto(l.page, `Consultado a la naviera el ${fecha(r.consultadoNaviera)}.`, M, l.y - 2, f, 7.5, GRIS);
      l.y -= 14;
    }
  }

  // Pie en todas las páginas.
  l.paginas.forEach((p, i) => {
    p.drawRectangle({ x: M - 10, y: 40, width: W + 20, height: 2, color: ROJO });
    texto(p, "AV2 Logistics · Documento interno, no compartir con el cliente. Fuentes: Cargolink, naviera y Track.", M, 28, f, 7, GRIS);
    const n = `${i + 1} / ${l.paginas.length}`;
    texto(p, n, ANCHO - M - f.widthOfTextAtSize(n, 7), 28, f, 7, GRIS);
  });
  return pdf.save();
}
