"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DocumentosCargolink,
  EditorEtapa,
  EditorTransbordo,
  NotArriboDialog,
  ResumenComercialSeccion,
  type Operacion,
} from "@/components/OperacionDetalleModal";
import { refrescarOperacionDesdeCargolink } from "@/app/(app)/operaciones-maritima/actions";
import { ETAPAS_CARGOLINK } from "@/lib/etapasCargolink";
import {
  ESTILO_TAREA,
  FASES,
  calcularTareas,
  estadoFase,
  faseActual,
  fechaCortaTN,
  siguientePaso,
  type EstadoTarea,
  type FaseClave,
  type HitoTrack,
  type Tarea,
} from "@/lib/trackNew";

const ESTATUS_BOOKING: Record<string, string> = { "1": "VIGENTE", "2": "FINALIZADO", "0": "CANCELADO" };

function IconoEstado({ estado }: { estado: EstadoTarea }) {
  const d = { hecho: "M20 6 9 17l-5-5", falta: "M12 7v6M12 17h.01", alerta: "M12 8v5M12 16h.01", pend: "M12 7v5l3 2", na: "M6 12h12" }[estado];
  return (
    <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-white ${ESTILO_TAREA[estado].icono}`}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d={d} />
      </svg>
    </span>
  );
}

function hoyMx(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}
function diasEntre(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}

export function BookingGuiado({
  idBooking,
  op,
  hitos,
  puedeEditar,
  mismoBuque,
}: {
  idBooking: number;
  op: Record<string, unknown>;
  hitos: HitoTrack[];
  puedeEditar: boolean;
  // motivo = por qué no sale en Por viaje (null = sí sale).
  mismoBuque: { id_booking: number; no_booking: string; cliente: string | null; ejecutivo: string | null; motivo: string | null }[];
}) {
  const router = useRouter();
  const datos = (op.datos ?? {}) as Record<string, string>;
  const tareas = calcularTareas(op, hitos);
  const sig = siguientePaso(tareas);
  const [fase, setFase] = useState<FaseClave>(sig?.fase ?? faseActual(tareas));
  const [editando, setEditando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pdf, setPdf] = useState(false);
  const [refresco, setRefresco] = useState<{ estado: "cargando" | "ok" | "error"; mensaje: string }>({
    estado: "cargando",
    mensaje: "Actualizando desde Cargolink…",
  });
  const refrescado = useRef(false);

  // Al abrir: relee el booking de Cargolink y, si cambió, vuelve a pintar.
  useEffect(() => {
    if (refrescado.current) return;
    refrescado.current = true;
    refrescarOperacionDesdeCargolink(idBooking).then((r) => {
      setRefresco(r.ok ? { estado: "ok", mensaje: "Datos actualizados desde Cargolink" } : { estado: "error", mensaje: r.mensaje });
      if (r.ok) router.refresh();
    });
  }, [idBooking, router]);

  const fases = FASES.map((f) => {
    const lista = tareas.filter((t) => t.fase === f.clave);
    return { ...f, lista, estado: estadoFase(lista), listos: lista.filter((t) => t.estado === "hecho" || t.estado === "na").length };
  });
  const activa = fases.find((f) => f.clave === fase) ?? fases[0];
  const faltan = tareas.filter((t) => t.estado === "falta" || t.estado === "alerta");
  const faseDe = (k: FaseClave) => FASES.find((f) => f.clave === k)!;

  // Ruta: posición del buque entre origen y destino.
  const hoy = hoyMx();
  const atd = (op.etd_atd as string | null) ?? null;
  const eta = (op.eta as string | null) ?? null;
  const ata = (op.ata as string | null) ?? null;
  const arribo = Boolean(ata && ata <= hoy);
  const zarpo = Boolean(atd && atd <= hoy);
  const avance = arribo ? 1 : zarpo && eta && atd ? Math.min(0.95, Math.max(0.05, diasEntre(atd, hoy) / Math.max(1, diasEntre(atd, eta)))) : 0;
  const xBuque = 60 + avance * 680;
  const transito = atd && (ata ?? eta) ? diasEntre(atd, (ata ?? eta) as string) : null;

  // Días libres.
  const dl = Number(op.dias_libres_demora) || 0;
  const diasDemora = op.dias_demora as number | null;
  const ultimo = op.ultimo_dia_libre_demoras as string | null;
  const regresado = Boolean(op.regreso_vacio);
  const usados = arribo && dl > 0 && ata ? Math.min(dl, Math.max(0, diasEntre(ata, hoy))) : 0;
  const reloj =
    !arribo
      ? { tono: "slate", centro: "—", titulo: "Aún no arriba", texto: "Los días libres empiezan a contar con el ATA." }
      : regresado
        ? { tono: "green", centro: "✓", titulo: "Vacío regresado", texto: `Regresó el ${fechaCortaTN(op.regreso_vacio)}.` }
        : dl <= 0
          ? { tono: "red", centro: "?", titulo: "Sin capturar", texto: `Arribó hace ${Math.max(0, diasEntre(ata as string, hoy))} días: captúralos para saber cuándo empieza a cobrar la naviera.` }
          : diasDemora !== null && diasDemora > 0
            ? { tono: "red", centro: String(diasDemora), titulo: `${diasDemora} días de demora`, texto: `Se vencieron el ${fechaCortaTN(ultimo)}: regresa el vacío lo antes posible.` }
            : { tono: (diasDemora ?? -99) >= -4 ? "amber" : "green", centro: String(-(diasDemora ?? 0)), titulo: `Quedan ${-(diasDemora ?? 0)} de ${dl} días`, texto: `Último día libre: ${fechaCortaTN(ultimo)}.` };
  const colorReloj = { red: "#b91c1c", amber: "#b45309", green: "#15803d", slate: "#64748b" }[reloj.tono]!;
  const cajaReloj = {
    red: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
    green: "border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
    slate: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  }[reloj.tono]!;
  const circ = 2 * Math.PI * 31;
  const fraccion = !arribo || dl <= 0 ? (reloj.tono === "red" ? 0.75 : 0) : regresado ? 1 : usados / dl;

  // ¿Se puede capturar esta tarea aquí? (editor de la etapa y no finalizada)
  const editorDe = (t: Tarea) => {
    if (!puedeEditar || !t.editar) return null;
    const etapa = ETAPAS_CARGOLINK[t.editar];
    if (!etapa) return null;
    const mov = datos[etapa.mov];
    if (mov === "FINALIZADO" || mov === "NO_APLICA") return null;
    return etapa;
  };
  const guardado = (mensaje: string) => {
    setAviso(mensaje);
    setEditando(null);
    router.refresh();
  };
  const renderEditor = (t: Tarea) => {
    const etapa = editorDe(t);
    if (!etapa) return null;
    return etapa.filas ? (
      <EditorTransbordo etapa={etapa} noBooking={String(op.no_booking ?? "")} idBooking={idBooking} onGuardado={guardado} />
    ) : (
      <EditorEtapa key={`${etapa.key}-${String(op.sincronizado_at ?? "")}`} etapa={etapa} op={op as Operacion} idBooking={idBooking} onGuardado={guardado} />
    );
  };

  const estatus = ESTATUS_BOOKING[String(op.status_booking)] ?? "—";
  const etapaTexto = arribo ? (diasDemora !== null && diasDemora > 0 && !regresado ? "EN DEMORA" : "EN PUERTO") : zarpo ? "EN TRÁNSITO" : "POR ZARPAR";

  return (
    <main className="mx-auto flex max-w-[1360px] flex-col gap-4 px-4 pb-12 pt-5 text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/track/interactivo"))}
          className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          ← Regresar
        </button>
        <span
          role="status"
          className={`text-xs ${refresco.estado === "error" ? "text-red-700 dark:text-red-400" : refresco.estado === "ok" ? "text-green-700 dark:text-green-400" : "text-slate-500"}`}
        >
          {refresco.estado === "error" ? `No se pudo actualizar desde Cargolink: ${refresco.mensaje}` : refresco.mensaje}
        </span>
      </div>

      {/* Encabezado */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#16232f] px-6 py-5 text-white">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-mono text-2xl font-bold tracking-wide">{String(op.no_booking ?? "")}</h2>
            <span className="rounded-full bg-[#1f3a2e] px-2.5 py-1 text-xs font-bold text-green-300">{estatus}</span>
            <span className="rounded-full bg-[#3b2a12] px-2.5 py-1 text-xs font-bold text-amber-300">{etapaTexto}</span>
          </div>
          <span className="text-[15px] text-slate-300">
            {String(op.cliente ?? "—")} · {String(op.origen ?? "—")} → {String(op.destino ?? "—")} · {String(op.modo_transportacion ?? "—")}
            {op.mercancia ? ` · ${String(op.mercancia)}` : ""}
          </span>
          <span className="text-sm text-slate-400">
            Ejecutivo:{" "}
            <strong className={op.ejecutivo ? "text-slate-200" : "text-red-300"}>{String(op.ejecutivo ?? "Sin ejecutivo")}</strong>
            {datos.buque ? ` · Buque: ${datos.buque}` : ""}
            {op.mbl ? ` · MBL ${String(op.mbl)}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {faltan.length > 0 && (
            <span className="inline-flex items-center rounded-lg bg-[#4c1d1d] px-3 py-2 text-sm font-semibold text-red-200">
              {faltan.filter((t) => t.estado === "falta").length} faltan · {faltan.filter((t) => t.estado === "alerta").length} por revisar
            </span>
          )}
          <button type="button" onClick={() => setPdf(true)} className="min-h-11 rounded-lg bg-white px-4 text-sm font-bold text-[#16232f]">
            PDF NOT arribo
          </button>
        </div>
      </header>
      {pdf && <NotArriboDialog idBooking={idBooking} noBooking={String(op.no_booking ?? "")} onCerrar={() => setPdf(false)} />}

      {aviso && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          {aviso}
        </p>
      )}

      {/* Ruta + días libres */}
      <section aria-label="Ruta del embarque" className="flex flex-wrap items-center gap-6 rounded-2xl bg-white px-6 py-5 shadow-sm dark:bg-slate-900">
        <div className="min-w-0 flex-[999_1_640px]">
          <svg role="img" aria-label={`Ruta ${String(op.origen ?? "")} a ${String(op.destino ?? "")}`} viewBox="0 0 800 130" className="block h-auto w-full">
            <rect x="0" y="40" width="800" height="50" rx="25" fill="#dbeafe" />
            <path d="M60 65 C 220 20, 420 110, 740 65" fill="none" stroke="#93c5fd" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 8" />
            <path d="M60 65 C 220 20, 420 110, 740 65" fill="none" stroke="#1d4ed8" strokeWidth="4" strokeLinecap="round" pathLength="1" strokeDasharray={`${avance} 1`} />
            <circle cx="60" cy="65" r="11" fill="#16232f" />
            <circle cx="60" cy="65" r="4" fill="#fff" />
            <circle cx="740" cy="65" r="11" fill={arribo ? "#15803d" : "#94a3b8"} />
            {arribo && <path d="M735 65l4 4 7-8" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
            <g transform={`translate(${xBuque - 22} 34)`}>
              <path d="M0 22h44l-8 12H8z" fill="#c65a1f" />
              <rect x="10" y="10" width="10" height="12" fill="#16232f" />
              <rect x="22" y="4" width="12" height="18" fill="#334155" />
            </g>
            <text x="60" y="112" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor">{String(op.origen ?? "Origen").slice(0, 18)}</text>
            <text x="60" y="128" textAnchor="middle" fontSize="12" fill="#64748b">{atd ? `ATD ${fechaCortaTN(atd)}` : "Sin ATD"}</text>
            <text x="740" y="112" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor">{String(op.destino ?? "Destino").slice(0, 18)}</text>
            <text x="740" y="128" textAnchor="middle" fontSize="12" fill="#64748b">
              {ata ? `ATA ${fechaCortaTN(ata)}` : eta ? `ETA ${fechaCortaTN(eta)}` : "Sin ETA"}
            </text>
            <text x="400" y="24" textAnchor="middle" fontSize="12" fontWeight="600" fill="#1d4ed8">
              {transito !== null ? `${transito} días de tránsito` : zarpo ? "En tránsito" : "Por zarpar"}
            </text>
          </svg>
        </div>
        <div className={`flex flex-[1_1_260px] items-center gap-4 rounded-xl border px-4 py-3.5 ${cajaReloj}`}>
          <svg role="img" aria-label={reloj.titulo} width="76" height="76" viewBox="0 0 76 76" className="flex-none">
            <circle cx="38" cy="38" r="31" fill="none" stroke={`${colorReloj}33`} strokeWidth="9" />
            <circle
              cx="38"
              cy="38"
              r="31"
              fill="none"
              stroke={colorReloj}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${fraccion * circ} ${circ}`}
              transform="rotate(-90 38 38)"
            />
            <text x="38" y="46" textAnchor="middle" fontSize="22" fontWeight="800" fill={colorReloj}>
              {reloj.centro}
            </text>
          </svg>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold tracking-wide">DÍAS LIBRES DE DEMORA</span>
            <span className="text-base font-bold">{reloj.titulo}</span>
            <span className="text-sm">{reloj.texto}</span>
          </div>
        </div>
      </section>

      {/* Siguiente paso */}
      <section
        aria-labelledby="siguiente-titulo"
        className={`flex flex-col gap-3 rounded-2xl border-2 bg-white px-6 py-5 shadow-md dark:bg-slate-900 ${
          !sig ? "border-green-600" : sig.estado === "alerta" ? "border-amber-500" : "border-red-600"
        }`}
      >
        {sig ? (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <div className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl ${sig.estado === "alerta" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
                <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span id="siguiente-titulo" className="text-xs font-extrabold tracking-wider text-slate-500">
                  SIGUIENTE PASO · FASE {faseDe(sig.fase).n} · {faseDe(sig.fase).nombre.toUpperCase()}
                </span>
                <span className="text-[22px] font-extrabold">{sig.label}</span>
                <span className={`text-sm font-semibold ${ESTILO_TAREA[sig.estado].texto}`}>
                  {sig.valor} · {sig.detalle}
                </span>
              </div>
            </div>
            {editorDe(sig) ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">{renderEditor(sig)}</div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {puedeEditar ? "Esta etapa ya está finalizada en Cargolink o no se captura desde aquí." : "Solo los editores de la prueba capturan desde la app."}
              </p>
            )}
          </>
        ) : (
          <span className="text-xl font-extrabold text-green-800 dark:text-green-300">✓ Todo al día: no hay pasos atrasados en este booking.</span>
        )}
      </section>

      {/* Fases */}
      <nav aria-label="Fases del embarque" className="grid grid-cols-[repeat(7,minmax(150px,1fr))] gap-2 overflow-x-auto pb-1">
        {fases.map((f) => {
          const e = ESTILO_TAREA[f.estado];
          const sel = f.clave === fase;
          return (
            <button
              key={f.clave}
              type="button"
              aria-pressed={sel}
              onClick={() => {
                setFase(f.clave);
                setEditando(null);
              }}
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
                <span className={`block h-1.5 ${e.barra}`} style={{ width: `${Math.round((100 * f.listos) / Math.max(1, f.lista.length))}%` }} />
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
            <h3 id="fase-titulo" className="text-xl font-extrabold">
              Fase {activa.n} · {activa.nombre}
            </h3>
            <span className="text-sm text-slate-500 dark:text-slate-400">{activa.cuando}</span>
          </div>
          <ul className="flex flex-col gap-2.5">
            {activa.lista.map((t) => {
              const editable = Boolean(editorDe(t));
              const abierto = editando === t.id;
              return (
                <li key={t.id} className={`flex flex-col gap-3 rounded-xl border px-3.5 py-3 ${ESTILO_TAREA[t.estado].caja}`}>
                  <div className="flex flex-wrap items-center gap-3.5">
                    <IconoEstado estado={t.estado} />
                    <span className="flex min-w-0 flex-[999_1_260px] flex-col gap-0.5">
                      <span className="text-[15px] font-bold">{t.label}</span>
                      <span className={`text-sm ${ESTILO_TAREA[t.estado].texto}`}>{t.detalle}</span>
                    </span>
                    <span className="whitespace-nowrap text-sm font-bold">{t.valor}</span>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => setEditando(abierto ? null : t.id)}
                        aria-expanded={abierto}
                        className="min-h-11 rounded-lg border border-[#16232f] bg-white px-4 text-sm font-bold text-[#16232f] dark:border-slate-300 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {abierto ? "Cerrar" : t.estado === "hecho" ? "Editar" : "Capturar"}
                      </button>
                    )}
                  </div>
                  {abierto && <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">{renderEditor(t)}</div>}
                </li>
              );
            })}
          </ul>
          {fase === "origen" && <ResumenComercialSeccion idBooking={idBooking} />}
        </section>

        {/* Columna derecha */}
        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <section aria-labelledby="falta-titulo" className="flex flex-col gap-2.5 rounded-2xl bg-white px-5 py-4 shadow-sm dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 id="falta-titulo" className="text-[17px] font-extrabold">¿Qué falta?</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-sm font-extrabold text-white ${faltan.length ? "bg-red-700" : "bg-green-700"}`}>{faltan.length}</span>
            </div>
            <ul className="flex flex-col gap-2">
              {faltan.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setFase(x.fase);
                      setEditando(editorDe(x) ? x.id : null);
                    }}
                    className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm ${ESTILO_TAREA[x.estado].caja}`}
                  >
                    <span className={`h-2.5 w-2.5 flex-none rounded-full ${ESTILO_TAREA[x.estado].punto}`} />
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

          <section aria-label="Documentos" className="rounded-2xl bg-white px-5 py-4 shadow-sm dark:bg-slate-900">
            <DocumentosCargolink idBooking={idBooking} noBooking={String(op.no_booking ?? "")} puedeSubir={puedeEditar} />
          </section>

          {fase !== "origen" && <ResumenComercialSeccion idBooking={idBooking} />}
        </aside>
      </div>

      {/* Mismo buque y viaje */}
      {mismoBuque.length > 0 && (() => {
        const enViaje = mismoBuque.filter((b) => !b.motivo);
        const fuera = mismoBuque.filter((b) => b.motivo);
        return (
          <section aria-labelledby="buque-titulo" className="flex flex-wrap items-center gap-5 rounded-2xl bg-[#16232f] px-6 py-5 text-white">
            <svg aria-hidden="true" width="56" height="56" viewBox="0 0 56 56" className="flex-none">
              <rect width="56" height="56" rx="14" fill="#c65a1f" />
              <path d="M10 33h36l-6 9H16z" fill="#fff" />
              <rect x="17" y="22" width="9" height="11" fill="#fde68a" />
              <rect x="28" y="16" width="11" height="17" fill="#fff" />
            </svg>
            <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-2">
              <h3 id="buque-titulo" className="text-lg font-extrabold">
                {enViaje.length === 0
                  ? "Ningún otro booking de Track viene"
                  : enViaje.length === 1
                    ? "Otro booking de Track viene"
                    : `Otros ${enViaje.length} bookings de Track vienen`}{" "}
                en el mismo buque y viaje ({datos.buque} · {datos.no_viaje})
              </h3>
              {enViaje.length > 0 && (
                <>
                  <span className="text-sm text-slate-300">
                    Comparten ATD, ETA y ATA:{" "}
                    <Link href="/track/viajes" className="font-semibold text-white underline">
                      captúralos juntos en Por viaje
                    </Link>
                    .
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {enViaje.map((b) => (
                      <Link
                        key={b.id_booking}
                        href={`/track/interactivo/${b.id_booking}`}
                        title={`${b.cliente ?? ""} · ${b.ejecutivo ?? "Sin ejecutivo"}`}
                        className="rounded-md bg-white/10 px-2.5 py-1.5 font-mono text-sm font-semibold text-white hover:bg-white/20"
                      >
                        {b.no_booking}
                      </Link>
                    ))}
                  </div>
                </>
              )}
              {fuera.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-white/15 pt-2">
                  <span className="text-xs font-semibold text-slate-300">
                    También en este viaje, pero no salen en Por viaje ({fuera.length}):
                  </span>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
                    {fuera.map((b) => (
                      <li key={b.id_booking}>
                        <span className="font-mono font-semibold text-slate-200">{b.no_booking}</span> · {b.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        );
      })()}
    </main>
  );
}
