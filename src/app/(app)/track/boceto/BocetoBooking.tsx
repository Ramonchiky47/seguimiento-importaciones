"use client";

import { useState } from "react";

// Boceto con datos de ejemplo basados en 2609-4448-FCLI: nada se guarda.

type Estado = "hecho" | "falta" | "alerta" | "pend" | "na";
type FaseClave = "origen" | "zarpe" | "transito" | "prearribo" | "arribo" | "entrega" | "cierre";
type Item = {
  id: string;
  fase: FaseClave;
  label: string;
  detalle: string;
  valor: string;
  estado: Estado;
  accion?: string;
  campo?: string;
  propuesta?: string;
  ayuda?: string;
};

const FASES: { clave: FaseClave; n: number; nombre: string; cuando: string; icono: string }[] = [
  { clave: "origen", n: 1, nombre: "Origen / Booking", cuando: "Al confirmar el booking", icono: "M4 7h16M4 12h16M4 17h10" },
  { clave: "zarpe", n: 2, nombre: "Zarpe", cuando: "Día del zarpe", icono: "M3 17h18l-3 4H6zM12 3v10M8 9h8" },
  { clave: "transito", n: 3, nombre: "Tránsito", cuando: "Durante el viaje", icono: "M2 12c3-3 5-3 8 0s5 3 8 0 4-2 4-2" },
  { clave: "prearribo", n: 4, nombre: "Pre-arribo", cuando: "7 a 2 días antes de la ETA", icono: "M12 8v4l3 2M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" },
  { clave: "arribo", n: 5, nombre: "Arribo", cuando: "Día del arribo (ATA)", icono: "M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 10h.01" },
  { clave: "entrega", n: 6, nombre: "Liberación y entrega", cuando: "Hasta devolver el vacío", icono: "M3 7h11v10H3zM14 10h4l3 3v4h-7" },
  { clave: "cierre", n: 7, nombre: "Cierre", cuando: "Al terminar la operación", icono: "M20 6 9 17l-5-5" },
];

const BASE: Item[] = [
  { id: "ejecutivo", fase: "origen", label: "Ejecutivo asignado", detalle: "Asignado desde la app", valor: "Emmanuel Pulido", estado: "hecho" },
  { id: "seguro", fase: "origen", label: "Seguro de mercancía", detalle: "Póliza contratada", valor: "Sí", estado: "hecho" },
  { id: "comercial", fase: "origen", label: "Revisar cambio de Comercial", detalle: "Agregó seguro de contenedor después de la revisión", valor: "78 USD", estado: "alerta", accion: "Revisar", campo: "Comentario (opcional)", propuesta: "", ayuda: "Revisa el concepto nuevo antes de facturar." },
  { id: "docsorigen", fase: "origen", label: "Documentos de origen", detalle: "Factura, packing list y BL draft", valor: "3 de 3", estado: "hecho" },
  { id: "atd", fase: "zarpe", label: "ATD (zarpe real)", detalle: "Marcado en Cargolink", valor: "27 sep", estado: "hecho" },
  { id: "eta", fase: "zarpe", label: "ETA", detalle: "Capturada al zarpar", valor: "05 oct", estado: "hecho" },
  { id: "avisoatd", fase: "zarpe", label: "Aviso de zarpe al cliente", detalle: "Pre-alerta enviada a las 24 h", valor: "28 sep", estado: "hecho" },
  { id: "transbordo", fase: "zarpe", label: "Transbordo", detalle: "Servicio directo", valor: "No aplica", estado: "na" },
  { id: "manifiesto", fase: "transito", label: "Transmisión de manifiesto", detalle: "Confirmada por la naviera", valor: "01 oct", estado: "hecho" },
  { id: "hbl", fase: "transito", label: "Telex HBL", detalle: "Compromiso ETA − 3 días (02 oct)", valor: "Atrasado 19 d", estado: "falta", accion: "Capturar", campo: "Fecha de telex HBL", propuesta: "21/10/2026", ayuda: "Sin telex no se puede revalidar: pídelo al agente en origen." },
  { id: "mbl", fase: "transito", label: "Telex MBL", detalle: "Compromiso ETA − 3 días (02 oct)", valor: "Atrasado 19 d", estado: "falta", accion: "Capturar", campo: "Fecha de telex MBL", propuesta: "21/10/2026", ayuda: "Confírmalo con la naviera." },
  { id: "avisoarribo", fase: "prearribo", label: "Aviso de arribo al cliente", detalle: "ETA − 7 días", valor: "28 sep", estado: "hecho" },
  { id: "rev", fase: "prearribo", label: "Revalidación", detalle: "Compromiso ETA − 2 días (03 oct)", valor: "Atrasado 18 d", estado: "falta", accion: "Capturar", campo: "Fecha de revalidación", propuesta: "21/10/2026", ayuda: "Propuesta: hoy. Al guardar se marca la etapa en Cargolink." },
  { id: "ata", fase: "arribo", label: "ATA (arribo real)", detalle: "Arribó en la ETA", valor: "05 oct", estado: "hecho" },
  { id: "dias", fase: "arribo", label: "Días libres de demora", detalle: "Se capturan con el ATA", valor: "Sin capturar", estado: "falta", accion: "Capturar", campo: "Días libres", propuesta: "21", ayuda: "Propuesta por historial de la naviera con este cliente: 21 días." },
  { id: "banco", fase: "arribo", label: "Aviso de ATA al cliente", detalle: "Falta el banco; instrucciones ya guardadas", valor: "Atrasado 16 d", estado: "falta", accion: "Completar", campo: "Banco", propuesta: "BBVA MXN", ayuda: "Banco propuesto por historial del cliente. Se guarda sin notificar al cliente." },
  { id: "demora", fase: "entrega", label: "Cuenta regresiva de días libres", detalle: "Empieza al capturar los días libres", valor: "—", estado: "pend" },
  { id: "vacio", fase: "entrega", label: "Regreso de vacío", detalle: "Antes del último día libre", valor: "Pendiente", estado: "pend" },
  { id: "garantia", fase: "entrega", label: "Garantía de contenedor", detalle: "Depósito 1,000 USD por contenedor", valor: "Pendiente", estado: "pend" },
  { id: "factprov", fase: "cierre", label: "Facturas de proveedor", detalle: "1 pagada, 1 con pago pendiente", valor: "1 de 2", estado: "pend" },
  { id: "factcli", fase: "cierre", label: "Factura al cliente", detalle: "Cuando se libere la mercancía", valor: "Pendiente", estado: "pend" },
];

const ORDEN = ["rev", "dias", "banco", "hbl", "mbl", "comercial"];

const ESTILO: Record<Estado, { caja: string; icono: string; texto: string; pill: string; label: string; barra: string }> = {
  hecho: { caja: "border-green-200 bg-green-50", icono: "bg-green-700", texto: "text-green-800", pill: "bg-green-100 text-green-800", label: "LISTO", barra: "bg-green-600" },
  falta: { caja: "border-red-200 bg-red-50", icono: "bg-red-700", texto: "text-red-800", pill: "bg-red-100 text-red-800", label: "FALTA", barra: "bg-red-600" },
  alerta: { caja: "border-amber-200 bg-amber-50", icono: "bg-amber-700", texto: "text-amber-900", pill: "bg-amber-100 text-amber-900", label: "REVISAR", barra: "bg-amber-600" },
  pend: { caja: "border-slate-200 bg-white", icono: "bg-slate-500", texto: "text-slate-600", pill: "bg-slate-100 text-slate-700", label: "PENDIENTE", barra: "bg-slate-400" },
  na: { caja: "border-slate-200 bg-slate-50", icono: "bg-slate-400", texto: "text-slate-600", pill: "bg-slate-100 text-slate-700", label: "N/A", barra: "bg-slate-400" },
};

function IconoEstado({ estado }: { estado: Estado }) {
  const d = {
    hecho: "M20 6 9 17l-5-5",
    falta: "M12 7v6M12 17h.01",
    alerta: "M12 8v5M12 16h.01",
    pend: "M12 7v5l3 2",
    na: "M6 12h12",
  }[estado];
  return (
    <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-white ${ESTILO[estado].icono}`}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d={d} />
      </svg>
    </span>
  );
}

export function BocetoBooking() {
  const [fase, setFase] = useState<FaseClave>("arribo");
  const [hechos, setHechos] = useState<Record<string, boolean>>({});

  const items = BASE.map((it) =>
    hechos[it.id] ? { ...it, estado: "hecho" as Estado, valor: it.propuesta || "Listo", detalle: "Guardado en Cargolink" } : it,
  );
  const fases = FASES.map((f) => {
    const lista = items.filter((i) => i.fase === f.clave);
    const listos = lista.filter((i) => i.estado === "hecho" || i.estado === "na").length;
    const estado: Estado = lista.some((i) => i.estado === "falta")
      ? "falta"
      : lista.some((i) => i.estado === "alerta")
        ? "alerta"
        : listos === lista.length
          ? "hecho"
          : "pend";
    return { ...f, lista, listos, estado };
  });
  const activa = fases.find((f) => f.clave === fase)!;
  const faltan = items.filter((i) => i.estado === "falta" || i.estado === "alerta");
  const sig = items.find((i) => i.id === ORDEN.find((id) => !hechos[id]));
  const faseDe = (k: FaseClave) => FASES.find((f) => f.clave === k)!;
  const marcar = (id: string) => setHechos((h) => ({ ...h, [id]: true }));
  const docs = [
    ["Factura comercial", true],
    ["Packing list", true],
    ["BL draft", true],
    ["Telex HBL", Boolean(hechos.hbl)],
    ["Telex MBL", Boolean(hechos.mbl)],
    ["Póliza de seguro", true],
  ] as const;

  return (
    <main className="min-h-screen bg-slate-100 px-4 pb-12 pt-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex max-w-[1360px] flex-col gap-4">
        <p className="rounded-lg bg-blue-50 px-4 py-2 text-center text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-200">
          <strong>Boceto para probar</strong> · datos de ejemplo basados en 2609-4448-FCLI · no guarda nada en Cargolink. Presiona una fase o
          “Guardar y siguiente”.
        </p>

        {/* Encabezado */}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#16232f] px-6 py-5 text-white">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-2xl font-bold tracking-wide">2609-4448-FCLI</span>
              <span className="rounded-full bg-[#1f3a2e] px-2.5 py-1 text-xs font-bold text-green-300">VIGENTE</span>
              <span className="rounded-full bg-[#3b2a12] px-2.5 py-1 text-xs font-bold text-amber-300">EN PUERTO</span>
            </div>
            <span className="text-[15px] text-slate-300">SANIVEX · Xiamen → Manzanillo · 1×20 DC + 4×40 HC · Grifería</span>
            <span className="text-sm text-slate-400">
              Ejecutivo: <strong className="text-slate-200">Emmanuel Pulido</strong> · Naviera y buque: [de Cargolink]
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#4c1d1d] px-3 py-2 text-sm font-semibold text-red-200">
              {faltan.length} pendientes atrasados
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b2a12] px-3 py-2 text-sm font-semibold text-amber-200">
              Cambio de Comercial
            </span>
            <button type="button" className="min-h-11 rounded-lg bg-white px-4 text-sm font-bold text-[#16232f]">
              PDF NOT arribo
            </button>
          </div>
        </header>

        {/* Ruta + días libres */}
        <section aria-label="Ruta del embarque" className="flex flex-wrap items-center gap-6 rounded-2xl bg-white px-6 py-5 shadow-sm dark:bg-slate-900">
          <div className="min-w-0 flex-[999_1_640px]">
            <svg role="img" aria-label="Ruta Xiamen a Manzanillo: zarpó el 27 de septiembre y arribó el 5 de octubre" viewBox="0 0 800 130" className="block h-auto w-full">
              <rect x="0" y="40" width="800" height="50" rx="25" fill="#dbeafe" />
              <path d="M60 65 C 220 20, 420 110, 740 65" fill="none" stroke="#1d4ed8" strokeWidth="4" strokeLinecap="round" />
              <circle cx="60" cy="65" r="11" fill="#16232f" />
              <circle cx="60" cy="65" r="4" fill="#fff" />
              <circle cx="740" cy="65" r="11" fill="#15803d" />
              <path d="M735 65l4 4 7-8" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <g transform="translate(690 34)">
                <path d="M0 22h44l-8 12H8z" fill="#c65a1f" />
                <rect x="10" y="10" width="10" height="12" fill="#16232f" />
                <rect x="22" y="4" width="12" height="18" fill="#334155" />
              </g>
              <text x="60" y="112" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor">Xiamen</text>
              <text x="60" y="128" textAnchor="middle" fontSize="12" fill="#64748b">ATD 27 sep</text>
              <text x="740" y="112" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor">Manzanillo</text>
              <text x="740" y="128" textAnchor="middle" fontSize="12" fill="#64748b">ETA y ATA 05 oct</text>
              <text x="400" y="24" textAnchor="middle" fontSize="12" fontWeight="600" fill="#1d4ed8">8 días de tránsito · sin transbordo</text>
            </svg>
          </div>
          <div className="flex flex-[1_1_260px] items-center gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 dark:border-red-900 dark:bg-red-950">
            <svg role="img" aria-label="Días libres sin capturar" width="76" height="76" viewBox="0 0 76 76" className="flex-none">
              <circle cx="38" cy="38" r="31" fill="none" stroke="#fecaca" strokeWidth="9" />
              <circle cx="38" cy="38" r="31" fill="none" stroke="#b91c1c" strokeWidth="9" strokeDasharray="20 9" strokeLinecap="round" />
              <text x="38" y="46" textAnchor="middle" fontSize="24" fontWeight="800" fill="#b91c1c">?</text>
            </svg>
            <div className="flex flex-col gap-1 text-red-900 dark:text-red-200">
              <span className="text-xs font-bold tracking-wide">DÍAS LIBRES DE DEMORA</span>
              <span className="text-base font-bold">{hechos.dias ? "21 días · vence 26 oct" : "Sin capturar"}</span>
              <span className="text-sm">
                {hechos.dias ? "Quedan 5 días para regresar el vacío." : "Arribó hace 16 días: captúralos para saber cuándo empieza a cobrar la naviera."}
              </span>
            </div>
          </div>
        </section>

        {/* Siguiente paso */}
        <section
          aria-labelledby="siguiente-titulo"
          className={`flex flex-wrap items-center gap-5 rounded-2xl border-2 bg-white px-6 py-5 shadow-md dark:bg-slate-900 ${
            !sig ? "border-green-600" : sig.estado === "alerta" ? "border-amber-500" : "border-red-600"
          }`}
        >
          {sig ? (
            <>
              <div className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl ${sig.estado === "alerta" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
                <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>
              <div className="flex min-w-0 flex-[999_1_360px] flex-col gap-1">
                <span id="siguiente-titulo" className="text-xs font-extrabold tracking-wider text-slate-500">
                  SIGUIENTE PASO · FASE {faseDe(sig.fase).n} · {faseDe(sig.fase).nombre.toUpperCase()}
                </span>
                <span className="text-[22px] font-extrabold">{sig.label}</span>
                <span className={`text-sm font-semibold ${sig.estado === "alerta" ? "text-amber-800" : "text-red-700"}`}>
                  {sig.valor} · {sig.detalle}
                </span>
              </div>
              <div className="flex flex-[1_1_380px] flex-wrap items-end gap-2.5">
                <label className="flex flex-[1_1_180px] flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {sig.campo}
                  <input
                    key={sig.id}
                    type="text"
                    defaultValue={sig.propuesta}
                    className="min-h-11 rounded-lg border border-slate-300 px-3 text-[15px] text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
                <button type="button" onClick={() => marcar(sig.id)} className="min-h-11 rounded-lg bg-[#16232f] px-5 text-[15px] font-bold text-white">
                  Guardar y siguiente →
                </button>
              </div>
              <span className="basis-full text-xs font-semibold text-blue-700 dark:text-blue-400">{sig.ayuda}</span>
            </>
          ) : (
            <span className="flex items-center gap-3 text-xl font-extrabold text-green-800 dark:text-green-300">
              ✓ Todo al día: no hay pasos atrasados en este booking.
            </span>
          )}
        </section>

        {/* Fases */}
        <nav aria-label="Fases del embarque" className="grid grid-cols-[repeat(7,minmax(150px,1fr))] gap-2 overflow-x-auto pb-1">
          {fases.map((f) => {
            const e = ESTILO[f.estado];
            const sel = f.clave === fase;
            return (
              <button
                key={f.clave}
                type="button"
                aria-pressed={sel}
                onClick={() => setFase(f.clave)}
                className={`flex min-h-11 flex-col gap-2 rounded-xl border-2 p-3 text-left ${
                  sel ? "border-[#16232f] bg-white shadow-lg dark:border-slate-100 dark:bg-slate-900" : `bg-slate-50 dark:bg-slate-900/60 ${e.caja.split(" ")[0]}`
                }`}
              >
                <span className="flex items-center justify-between gap-1.5">
                  <span className="text-[11px] font-extrabold text-slate-500">FASE {f.n}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${e.pill}`}>{e.label}</span>
                </span>
                <span className="flex items-center gap-2">
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={f.icono} />
                  </svg>
                  <span className="text-[15px] font-bold">{f.nombre}</span>
                </span>
                <span className="block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <span className={`block h-1.5 ${e.barra}`} style={{ width: `${Math.round((100 * f.listos) / f.lista.length)}%` }} />
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {f.listos} de {f.lista.length} listos
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-start gap-4">
          {/* Detalle de la fase */}
          <section aria-labelledby="fase-titulo" className="flex min-w-0 flex-[999_1_640px] flex-col gap-3.5 rounded-2xl bg-white px-6 py-5 shadow-sm dark:bg-slate-900">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="fase-titulo" className="m-0 text-xl font-extrabold">
                Fase {activa.n} · {activa.nombre}
              </h2>
              <span className="text-sm text-slate-500 dark:text-slate-400">{activa.cuando}</span>
            </div>
            <ul className="flex flex-col gap-2.5">
              {activa.lista.map((it) => (
                <li key={it.id} className={`flex flex-wrap items-center gap-3.5 rounded-xl border px-3.5 py-3 dark:bg-slate-800/40 ${ESTILO[it.estado].caja}`}>
                  <IconoEstado estado={it.estado} />
                  <span className="flex min-w-0 flex-[999_1_260px] flex-col gap-0.5">
                    <span className="text-[15px] font-bold">{it.label}</span>
                    <span className={`text-sm ${ESTILO[it.estado].texto} dark:text-slate-300`}>{it.detalle}</span>
                  </span>
                  <span className="whitespace-nowrap text-sm font-bold">{it.valor}</span>
                  {it.accion && it.estado !== "hecho" && (
                    <button type="button" onClick={() => marcar(it.id)} className="min-h-11 rounded-lg border border-[#16232f] bg-white px-4 text-sm font-bold text-[#16232f]">
                      {it.accion}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {fase === "arribo" && (
              <div className="flex flex-col gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3.5 dark:border-blue-800 dark:bg-blue-950">
                <span className="text-xs font-extrabold tracking-wide text-blue-800 dark:text-blue-300">AVISO DE ATA · LO QUE VERÁ EL CLIENTE</span>
                <div className="grid grid-cols-3 gap-2.5 text-sm">
                  <div className={`rounded-lg border bg-white px-3 py-2.5 dark:bg-slate-900 ${hechos.banco ? "border-blue-200" : "border-red-200"}`}>
                    <span className="block text-xs text-slate-500">Banco</span>
                    <strong className={hechos.banco ? "" : "text-red-700"}>{hechos.banco ? "BBVA MXN" : "Falta elegir"}</strong>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-white px-3 py-2.5 dark:bg-slate-900">
                    <span className="block text-xs text-slate-500">Instrucción BL</span>
                    <strong>Original</strong>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-white px-3 py-2.5 dark:bg-slate-900">
                    <span className="block text-xs text-slate-500">Forma de pago</span>
                    <strong>Contado</strong>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Columna derecha */}
          <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
            <section aria-labelledby="falta-titulo" className="flex flex-col gap-2.5 rounded-2xl bg-white px-5 py-4 shadow-sm dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h2 id="falta-titulo" className="m-0 text-[17px] font-extrabold">¿Qué falta?</h2>
                <span className="rounded-full bg-red-700 px-2.5 py-0.5 text-sm font-extrabold text-white">{faltan.length}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {faltan.map((x) => (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => setFase(x.fase)}
                      className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm dark:bg-slate-800/40 ${ESTILO[x.estado].caja}`}
                    >
                      <span className={`h-2.5 w-2.5 flex-none rounded-full ${ESTILO[x.estado].icono}`} />
                      <span className="min-w-0 flex-1">
                        <strong>{x.label}</strong>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          Fase {faseDe(x.fase).n} · {x.valor}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-slate-400">›</span>
                    </button>
                  </li>
                ))}
                {faltan.length === 0 && <li className="text-sm text-green-800 dark:text-green-300">Nada pendiente.</li>}
              </ul>
            </section>

            <section aria-labelledby="docs-titulo" className="flex flex-col gap-2.5 rounded-2xl bg-white px-5 py-4 shadow-sm dark:bg-slate-900">
              <h2 id="docs-titulo" className="m-0 text-[17px] font-extrabold">Documentos</h2>
              <div className="grid grid-cols-2 gap-2">
                {docs.map(([nombre, ok]) => (
                  <div key={nombre} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 dark:bg-slate-800/40 ${ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                    <span className="flex-1 text-[13px] font-semibold">{nombre}</span>
                    <span className={`text-[11px] font-extrabold ${ok ? "text-green-700" : "text-red-700"}`}>{ok ? "OK" : "FALTA"}</span>
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="comercial-titulo" className="flex flex-col gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <h2 id="comercial-titulo" className="m-0 text-[17px] font-extrabold">Resumen comercial</h2>
                {!hechos.comercial && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-900">CAMBIÓ</span>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 px-1.5 py-2.5 dark:bg-slate-800"><span className="block text-[11px] font-bold text-slate-500">VENTA</span><strong>40,740</strong></div>
                <div className="rounded-lg bg-slate-50 px-1.5 py-2.5 dark:bg-slate-800"><span className="block text-[11px] font-bold text-slate-500">COSTO</span><strong>33,780</strong></div>
                <div className="rounded-lg bg-green-50 px-1.5 py-2.5 dark:bg-green-950"><span className="block text-[11px] font-bold text-green-800">PROFIT</span><strong className="text-green-800 dark:text-green-300">6,720 · 16 %</strong></div>
              </div>
              {!hechos.comercial && (
                <>
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    <strong>Comercial agregó</strong> seguro de contenedor (78 USD) después de que Operaciones revisó el booking.
                  </p>
                  <button type="button" onClick={() => marcar("comercial")} className="min-h-11 rounded-lg border border-amber-800 bg-white text-sm font-bold text-amber-800">
                    Enterado, ya lo revisé
                  </button>
                </>
              )}
            </section>
          </aside>
        </div>

        {/* Mismo buque */}
        <section aria-labelledby="buque-titulo" className="flex flex-wrap items-center gap-5 rounded-2xl bg-[#16232f] px-6 py-5 text-white">
          <svg aria-hidden="true" width="56" height="56" viewBox="0 0 56 56" className="flex-none">
            <rect width="56" height="56" rx="14" fill="#c65a1f" />
            <path d="M10 33h36l-6 9H16z" fill="#fff" />
            <rect x="17" y="22" width="9" height="11" fill="#fde68a" />
            <rect x="28" y="16" width="11" height="17" fill="#fff" />
          </svg>
          <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-1">
            <h2 id="buque-titulo" className="m-0 text-lg font-extrabold">Otros 3 bookings vienen en el mismo buque</h2>
            <span className="text-sm text-slate-300">[Bookings de ejemplo]: les falta la misma revalidación y los días libres.</span>
          </div>
          <button type="button" className="min-h-11 rounded-lg bg-white px-5 text-[15px] font-extrabold text-[#16232f]">
            Capturar para los 4 bookings
          </button>
        </section>
      </div>
    </main>
  );
}
