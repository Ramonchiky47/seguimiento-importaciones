"use client";

import { useEffect, useRef } from "react";
import type { ResumenComercial } from "@/app/(app)/operaciones-maritima/actions";
import { repararAcentos } from "@/lib/etapasCargolink";
import { fechaCorta } from "@/lib/track";

// Campos del booking comercial de Cargolink (operaciones_maritima.datos), en
// el orden en que se lee un booking: quién compra, quién envía, quién recibe,
// por dónde viaja, qué viaja, seguro y facturación.
type Campo = [clave: string, etiqueta: string, tipo?: "fecha" | "sino" | "dinero"];
const SECCIONES: { titulo: string; campos: Campo[] }[] = [
  {
    titulo: "Booking",
    campos: [
      ["no_booking", "Booking"],
      ["fecha", "Fecha", "fecha"],
      ["folio_int", "Folio"],
      ["transporte", "Transporte"],
      ["servicio", "Servicio"],
      ["modo_transportacion", "Equipo"],
      ["totalEmbalaje", "Cantidad de equipos"],
      ["intercom", "Incoterm"],
      ["venta_por", "Venta por"],
      ["ejecutivo", "Ejecutivo"],
      ["moneda", "Moneda"],
    ],
  },
  {
    titulo: "Cliente",
    campos: [
      ["razonsocial", "Cliente"],
      ["agente_cliente", "Agente del cliente"],
      ["contacto_agente_cliente", "Contacto"],
      ["telefono_agente_cliente", "Teléfono"],
      ["emailCliente", "Correos de notificación"],
    ],
  },
  {
    titulo: "Shipper (exportador)",
    campos: [
      ["shipper", "Shipper"],
      ["datos_shipper", "Contacto"],
      ["email_shipper", "Correo"],
      ["tel_shipper", "Teléfono"],
      ["dir_recoleccion", "Dirección de recolección"],
    ],
  },
  {
    titulo: "Consignatario",
    campos: [
      ["consignatario", "Consignatario"],
      ["rfc_consignatario", "RFC"],
      ["cnne", "Contacto"],
      ["email_consignatario", "Correo"],
      ["tel_consignatario", "Teléfono"],
      ["dir_consignatario", "Dirección"],
    ],
  },
  { titulo: "Agente extranjero", campos: [["nameAgenExt", "Agente"]] },
  {
    titulo: "Ruta y embarque",
    campos: [
      ["sitioOrigenNombre", "Origen"],
      ["sitioDestinoNombre", "Destino"],
      ["sitios", "POD"],
      ["buque", "Buque"],
      ["no_viaje", "Viaje"],
      ["no_control", "MBL / reserva"],
      ["no_agentes", "HBL"],
      ["noContenedores", "Contenedores"],
      ["fecha_estimada", "ETD", "fecha"],
      ["fecha_atd", "ATD", "fecha"],
      ["buque_eta", "ETA", "fecha"],
      ["fecha_ata", "ATA", "fecha"],
    ],
  },
  {
    titulo: "Mercancía",
    campos: [
      ["mercancia", "Mercancía"],
      ["valor_mercancia", "Valor de la mercancía", "dinero"],
      ["peligroso", "Peligrosa"],
      ["tipo_embalaje", "Embalaje"],
    ],
  },
  {
    titulo: "Seguro",
    campos: [
      ["seguro", "Seguro", "sino"],
      ["numero_poliza_seguro", "Póliza"],
      ["segurar_por", "Asegura (1)"],
      ["seguro_fecha", "Fecha (1)", "fecha"],
      ["segurar_por2", "Asegura (2)"],
      ["valor_mercancia2", "Valor (2)", "dinero"],
      ["seguro_fecha2", "Fecha (2)", "fecha"],
    ],
  },
  {
    titulo: "Facturación",
    campos: [
      ["fecha_Solfacturacion", "Solicitud de facturación", "fecha"],
      ["folioFactura", "Folio de factura"],
      ["fechaFactura", "Fecha de factura", "fecha"],
      ["fecha_pago", "Fecha de pago", "fecha"],
      ["enviado_facturacion", "Enviado a facturación", "sino"],
      ["facturado_booking", "Facturado", "sino"],
    ],
  },
];

// Cargolink: "Pagado / FFP: <factura del proveedor> / FS: <folio de la solicitud de pago>",
// "Pago pend / …" o "Sin solicitud".
function estadoPago(factura: string) {
  const partes = (factura || "").split("/").map((x) => x.trim());
  const estado = partes[0] ?? "";
  const ffp = partes.find((x) => /^FFP:/i.test(x))?.replace(/^FFP:\s*/i, "") || null;
  const fs = partes.find((x) => /^FS:/i.test(x))?.replace(/^FS:\s*/i, "") || null;
  if (/pagad/i.test(estado)) return { clave: "pagado" as const, label: "Pagado", clase: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", facturaProveedor: ffp, solicitud: fs };
  if (/pend/i.test(estado) || fs) return { clave: "pendiente" as const, label: "Pago pendiente", clase: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", facturaProveedor: ffp, solicitud: fs };
  return { clave: "sin" as const, label: "Sin solicitud de pago", clase: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", facturaProveedor: ffp, solicitud: fs };
}

const ORDEN_TIPOS = ["Marítimo", "Origen", "Destino", "Terrestre", "Aduana", "Seguro", "Aéreo", "Ferrocarril", "General"];

const dinero = (n: number | null | undefined, m = "") =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${m ? ` ${m}` : ""}`;

function valor(datos: Record<string, unknown>, [clave, , tipo]: Campo): string | null {
  const v = datos[clave];
  const s = v === null || v === undefined ? "" : String(v).trim();
  if (!s || s === "0" || s.startsWith("0000") || s === "null") return tipo === "sino" && s === "0" ? "No" : null;
  if (tipo === "fecha") return fechaCorta(s);
  if (tipo === "sino") return /^(1|si|sí)$/i.test(s) ? "Sí" : /^(no)$/i.test(s) ? "No" : s;
  if (tipo === "dinero") return Number(s) ? dinero(Number(s), String(datos.moneda ?? "")) : null;
  return repararAcentos(s);
}

export function ResumenComercialDialog({
  noBooking,
  datos,
  r,
  onCerrar,
}: {
  noBooking: string;
  datos: Record<string, unknown>;
  r: ResumenComercial;
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const conteo = { pagado: 0, pendiente: 0, sin: 0 };
  for (const c of r.conceptos) conteo[estadoPago(c.factura).clave] += 1;
  const porTipo = ORDEN_TIPOS.map((t) => [t, r.conceptos.filter((c) => c.tipo === t)] as const).filter(([, cs]) => cs.length > 0);
  const otros = r.conceptos.filter((c) => !ORDEN_TIPOS.includes(c.tipo));
  if (otros.length) porTipo.push(["Otros", otros]);

  return (
    <dialog
      ref={ref}
      onClose={(e) => {
        if (e.target === ref.current) onCerrar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="resumen-comercial-titulo"
      className="m-auto max-h-[90vh] w-[min(1100px,calc(100vw-32px))] overflow-hidden rounded-xl bg-white p-0 shadow-2xl backdrop:bg-slate-900/40 dark:bg-slate-900"
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">{noBooking} · datos del booking comercial en Cargolink (sin venta)</p>
            <h3 id="resumen-comercial-titulo" className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Resumen comercial
            </h3>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {r.cambios.length > 0 && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <p className="font-semibold">⚠ Comercial cambió el booking después de la última revisión:</p>
              <ul className="list-disc pl-5">
                {r.cambios.map((c, i) => (
                  <li key={i}>{c.texto}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Arriba: costo total y cómo van los pagos a proveedores. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Costo sin IVA", dinero(r.totales.costo, r.totales.moneda ?? ""), "text-slate-900 dark:text-slate-50"],
              ["Pagados", String(conteo.pagado), "text-green-800 dark:text-green-300"],
              ["Pago pendiente", String(conteo.pendiente), "text-amber-800 dark:text-amber-300"],
              ["Sin solicitud de pago", String(conteo.sin), "text-slate-700 dark:text-slate-200"],
            ].map(([label, v, clase]) => (
              <div key={label} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
                <p className={`text-lg font-extrabold tabular-nums ${clase}`}>{v}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {SECCIONES.map((sec) => {
              const filas = sec.campos.map((c) => [c[1], valor(datos, c)] as const).filter(([, v]) => v);
              if (filas.length === 0) return null;
              return (
                <section key={sec.titulo} className="rounded-lg border border-slate-200 dark:border-slate-800">
                  <h4 className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    {sec.titulo}
                  </h4>
                  <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filas.map(([etiqueta, v]) => (
                      <div key={etiqueta} className="grid grid-cols-[150px_1fr] gap-2 px-3 py-1.5 text-sm">
                        <dt className="text-slate-500 dark:text-slate-400">{etiqueta}</dt>
                        <dd className="break-words font-medium text-slate-900 dark:text-slate-100">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>

          <section aria-labelledby="conceptos-titulo" className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <h4 id="conceptos-titulo" className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              Costos y pagos a proveedores
            </h4>
            {!r.ok && <p className="px-3 py-3 text-sm text-red-700 dark:text-red-400">No se pudo leer de Cargolink: {r.mensaje}</p>}
            {r.ok && r.conceptos.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">Comercial no ha capturado conceptos.</p>}
            {porTipo.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="text-left text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr>
                      <th scope="col" className="px-3 py-1.5 font-semibold">Concepto</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">Proveedor</th>
                      <th scope="col" className="px-3 py-1.5 text-right font-semibold">Cant.</th>
                      <th scope="col" className="px-3 py-1.5 text-right font-semibold">Costo</th>
                      <th scope="col" className="px-3 py-1.5 text-right font-semibold">IVA</th>
                      <th scope="col" className="px-3 py-1.5 text-right font-semibold">Total costo</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">Pago</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">Factura del proveedor</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">Solicitud de pago</th>
                    </tr>
                  </thead>
                  {porTipo.map(([tipo, cs]) => (
                    <tbody key={tipo} className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                      <tr className="bg-slate-50/70 dark:bg-slate-950/60">
                        <th scope="rowgroup" colSpan={8} className="px-3 py-1 text-left text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300">
                          {tipo}
                        </th>
                      </tr>
                      {cs.map((c) => (
                        <tr key={c.id} className="align-top">
                          <td className="px-3 py-1.5">
                            <span className="font-medium text-slate-900 dark:text-slate-100">{repararAcentos(c.concepto)}</span>
                            {c.observaciones && <span className="block text-[11px] text-slate-500">{repararAcentos(c.observaciones)}</span>}
                          </td>
                          <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{c.proveedor ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{c.cantidad}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                            {dinero(c.costo, c.costoMoneda)}
                            {c.costoBase && <span className="block text-[10px] lowercase text-slate-500">{c.costoBase}</span>}
                          </td>
                          {/* Cargolink manda el IVA como porcentaje. */}
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{c.costoIva ? `${c.costoIva} %` : "—"}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {c.costoTotal ? dinero(c.costoTotal, c.costoMoneda) : dinero(c.costo * c.cantidad, c.costoMoneda)}
                          </td>
                          {(() => {
                            const p = estadoPago(c.factura);
                            return (
                              <>
                                <td className="px-3 py-1.5">
                                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${p.clase}`}>{p.label}</span>
                                </td>
                                <td className="px-3 py-1.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">{p.facturaProveedor ?? "—"}</td>
                                <td className="px-3 py-1.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">{p.solicitud ?? "—"}</td>
                              </>
                            );
                          })()}
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </section>
          <p className="text-xs text-slate-500 dark:text-slate-400">Datos tal como están en Cargolink; para cambiarlos, Comercial los edita allá.</p>
        </div>
      </div>
    </dialog>
  );
}
