"use client";

// Lista de embarques del portal de clientes: filtros por etapa, búsqueda y tarjetas
// con la escala de seis pasos, el texto explicado y el detalle desplegable.

import { useMemo, useRef, useState } from "react";
import { ETIQUETA, PASOS, fc, type Embarque, type EstadoCliente } from "@/lib/portalClientes";

const ORDEN: Record<EstadoCliente, number> = { puerto: 0, transito: 1, zarpar: 2, cierre: 3, cerrado: 4 };
const PILL: Record<EstadoCliente, string> = {
  zarpar: "border border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
  transito: "bg-[#dcedef] text-[#0e6874] dark:bg-[#163a40] dark:text-[#4fb3bf]",
  puerto: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  cierre: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  cerrado: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

function Dato({ t, children }: { t: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="grid min-w-0 gap-px">
      <dt className="text-[11px] tracking-wider text-slate-500 uppercase dark:text-slate-400">{t}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function Tarjeta({ e }: { e: Embarque }) {
  const q = e.diasRestantes ?? 0;
  return (
    <article className="grid gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition-colors hover:border-[#0e6874]/50 dark:border-slate-700 dark:bg-[#14222a]">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <span className="font-mono text-sm">{e.booking}</span>
        <span className="text-lg font-semibold">
          {e.origen} <span className="font-normal text-slate-400">→</span> {e.destino}
        </span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${e.urgente ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : PILL[e.estado]}`}>
          {e.urgente ? "Días libres por vencer" : ETIQUETA[e.estado]}
        </span>
      </div>
      <ol className="grid grid-cols-6 gap-1" aria-label={`Avance: ${PASOS[e.pasos - 1]}`}>
        {PASOS.map((p, i) => (
          <li key={p} className={`grid min-w-0 gap-1 text-[11.5px] ${i === e.pasos - 1 ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>
            <span className={`h-1.5 rounded-full ${i < e.pasos ? "bg-[#0e6874] dark:bg-[#4fb3bf]" : "bg-slate-200 dark:bg-slate-700"}`} />
            <span className={`truncate ${i === e.pasos - 1 ? "" : "max-sm:hidden"}`}>{p}</span>
          </li>
        ))}
      </ol>
      <p className="max-w-[78ch]">{e.texto}</p>
      {e.estado === "puerto" && e.ultimoDiaLibre && e.diasLibres ? (
        <div className="grid gap-1 text-[13px]">
          <span>
            Días libres: <b>{Math.max(0, q)} de {e.diasLibres}</b> restantes · último día {fc(e.ultimoDiaLibre)}
          </span>
          <span className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <span
              className={`block h-full ${q <= 2 ? "bg-red-600" : q <= 5 ? "bg-amber-500" : "bg-green-600"}`}
              style={{ width: `${(100 * Math.max(0, Math.min(q, e.diasLibres))) / e.diasLibres}%` }}
            />
          </span>
        </div>
      ) : null}
      <details>
        <summary className="w-max cursor-pointer text-[13px] font-semibold text-[#0e6874] dark:text-[#4fb3bf]">Ver detalle</summary>
        <dl className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-5 gap-y-2.5 text-[13.5px]">
          <Dato t="Mercancía">{e.mercancia && e.mercancia[0].toUpperCase() + e.mercancia.slice(1)}</Dato>
          <Dato t="Proveedor">{e.proveedor}</Dato>
          <Dato t="Incoterm">{e.incoterm}</Dato>
          <Dato t="Buque">{e.buque}</Dato>
          <Dato t="Naviera">{e.naviera}</Dato>
          <Dato t="BL master">{e.mbl && <span className="font-mono text-[13px]">{e.mbl}</span>}</Dato>
          <Dato t="Salida estimada (ETD)">{e.etd && fc(e.etd)}</Dato>
          <Dato t="Zarpe real">{e.atd && fc(e.atd)}</Dato>
          <Dato t="Llegada estimada (ETA)">{e.eta && fc(e.eta)}</Dato>
          <Dato t="Arribo">{e.ata && fc(e.ata)}</Dato>
          <Dato t="Transbordo">{e.transbordos.join(", ")}</Dato>
          <Dato t="Documentos">{e.documentos}</Dato>
          <Dato t="Último evento de la naviera">{e.eventoNaviera}</Dato>
          {e.contenedores.length > 0 && (
            <div className="col-span-full grid gap-1">
              <dt className="text-[11px] tracking-wider text-slate-500 uppercase dark:text-slate-400">Contenedores ({e.contenedores.length})</dt>
              <dd className="flex flex-wrap gap-1">
                {e.contenedores.map((c) => (
                  <span key={c} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-px font-mono text-xs dark:border-slate-700 dark:bg-slate-800">
                    {c}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </details>
    </article>
  );
}

type Filtro = EstadoCliente | "todos" | "zarparon";
const zarpo = (e: Embarque) => e.estado !== "zarpar";
const coincide = (e: Embarque, f: Filtro) => f === "todos" || (f === "zarparon" ? zarpo(e) : e.estado === f);
const NOMBRE_FILTRO: Record<Filtro, string> = { todos: "Todos", zarparon: "Zarparon", ...ETIQUETA };

/**
 * Vista del cliente: tarjetas de resumen arriba (filtran la lista al seleccionarlas),
 * el contenido del servidor en medio (resumen escrito, avisos, llegadas) y la lista abajo.
 */
export function PortalClienteVista({ embarques, children }: { embarques: Embarque[]; children: React.ReactNode }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const [max, setMax] = useState(20);
  const listaRef = useRef<HTMLElement>(null);

  const tarjetas = (
    [
      ["todos", "Activos", "Todos tus embarques"],
      ["zarpar", "Por zarpar", "Reservados en origen"],
      ["zarparon", "Zarparon", "Ya salieron de origen"],
      ["transito", "En tránsito", "Navegando"],
      ["puerto", "En puerto", "Arribaron a México"],
      ["cierre", "Por cerrar", "Devolución de vacío"],
    ] as [Filtro, string, string][]
  )
    .map(([f, t, ayuda]) => {
      const l = embarques.filter((e) => coincide(e, f));
      return { f, t, ayuda, n: l.length, cont: l.reduce((a, e) => a + e.contenedores.length, 0) };
    })
    .filter((x) => x.f !== "cierre" || x.n > 0);

  const elegir = (f: Filtro) => {
    setFiltro(f);
    setMax(20);
    if (f !== "todos") listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const lista = useMemo(() => {
    const t = q.trim().toUpperCase();
    return embarques
      .filter((e) => coincide(e, filtro))
      .filter((e) => !t || [e.booking, e.buque, e.mbl, ...e.contenedores].join(" ").toUpperCase().includes(t))
      .sort(
        (a, b) =>
          Number(b.urgente) - Number(a.urgente) ||
          ORDEN[a.estado] - ORDEN[b.estado] ||
          (a.ultimoDiaLibre ?? a.eta ?? "9").localeCompare(b.ultimoDiaLibre ?? b.eta ?? "9"),
      );
  }, [embarques, filtro, q]);

  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Resumen y filtro de embarques">
        {tarjetas.map((x) => {
          const activa = filtro === x.f;
          return (
            <button
              key={x.f}
              type="button"
              aria-pressed={activa}
              onClick={() => elegir(activa && x.f !== "todos" ? "todos" : x.f)}
              className={`grid gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors ${
                activa
                  ? "border-[#0e6874] bg-[#0e6874] text-white dark:border-[#4fb3bf] dark:bg-[#4fb3bf] dark:text-[#06191c]"
                  : "border-slate-200 bg-white hover:border-[#0e6874] dark:border-slate-700 dark:bg-[#14222a] dark:hover:border-[#4fb3bf]"
              }`}
            >
              <span className={`text-[13px] font-semibold ${activa ? "" : "text-slate-600 dark:text-slate-300"}`}>{x.t}</span>
              <b className="text-3xl leading-tight font-semibold tabular-nums">{x.n}</b>
              <span className={`text-xs ${activa ? "opacity-90" : "text-slate-500 dark:text-slate-400"}`}>
                {x.cont} contenedor{x.cont === 1 ? "" : "es"} · {x.ayuda}
              </span>
            </button>
          );
        })}
      </div>

      {children}

      <section ref={listaRef} className="mt-8 grid scroll-mt-4 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">Tus embarques</h2>
          {filtro !== "todos" && (
            <button
              type="button"
              onClick={() => elegir("todos")}
              className="rounded-full bg-[#dcedef] px-3 py-0.5 text-[13px] font-semibold text-[#0e6874] dark:bg-[#163a40] dark:text-[#4fb3bf]"
            >
              {NOMBRE_FILTRO[filtro]} · {lista.length} <span aria-hidden="true">✕</span>
              <span className="sr-only">Quitar filtro</span>
            </button>
          )}
          <input
            type="search"
            value={q}
            onChange={(ev) => (setQ(ev.target.value), setMax(20))}
            placeholder="Buscar booking, contenedor, buque o BL"
            aria-label="Buscar"
            className="ml-auto min-w-0 flex-[1_1_220px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm sm:max-w-80 dark:border-slate-600 dark:bg-[#14222a]"
          />
        </div>
        {lista.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-[#14222a]">
            No hay embarques con ese filtro.
          </p>
        ) : (
          lista.slice(0, max).map((e) => <Tarjeta key={e.booking} e={e} />)
        )}
        {lista.length > max && (
          <button type="button" onClick={() => setMax(max + 20)} className="justify-self-center rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm hover:border-[#0e6874] dark:border-slate-600 dark:bg-[#14222a]">
            Ver {Math.min(20, lista.length - max)} más de {lista.length - max}
          </button>
        )}
      </section>
    </>
  );
}
