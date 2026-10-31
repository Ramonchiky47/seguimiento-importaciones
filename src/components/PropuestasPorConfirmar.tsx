"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { guardarEtapaCargolink, guardarTransbordosCargolink } from "@/app/(app)/operaciones-maritima/actions";
import { AbrirOperacionBoton } from "@/components/OperacionDetalleModal";
import { fechaCorta } from "@/lib/track";

export type Propuesta = {
  id_booking: number;
  no_booking: string;
  cliente: string | null;
  ejecutivo: string | null;
  tipo: "transbordo" | "eta" | "eta_finalizar" | "dias" | "eta_naviera" | "eta_naviera_info" | "ata_naviera" | "ata_naviera_info";
  valor: string;
  explicacion: string;
  confianza: "alta" | "media" | "baja";
  naviera?: string | null;
  ruta?: string | null;
  // Lo que suele dar la naviera (solo días libres).
  naviera_dias?: string | null;
  // Comparativa con la naviera (último dato bueno de los agentes).
  nav_nombre?: string | null;
  nav_eta?: string | null;
  nav_ata?: string | null;
  nav_consultado?: string | null;
  eta_cargolink?: string | null;
  ata_cargolink?: string | null;
};

const MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);

// ATA por corregir: en riesgo si la naviera reporta el arribo ANTES que la ATA de
// Cargolink (los días libres ya corren y Cargolink los cuenta tarde: posible
// demora sin aviso). Bajo riesgo si aún no arriba o arribó después (Cargolink
// los cuenta antes de tiempo).
type CorreccionAta = { riesgo: boolean; accion: string; motivo: string };

function correccionAta(p: Propuesta): CorreccionAta {
  const cl = p.ata_cargolink;
  if (p.nav_ata && cl && p.nav_ata < cl) {
    const d = diasEntre(p.nav_ata, cl);
    return {
      riesgo: true,
      accion: `Cambia ATA ${fechaCorta(cl)} → ${fechaCorta(p.nav_ata)}`,
      motivo: `Arribó ${d} ${d === 1 ? "día" : "días"} antes: los días libres corren desde el ${fechaCorta(p.nav_ata)}.`,
    };
  }
  if (p.nav_ata) {
    return {
      riesgo: false,
      accion: cl ? `Cambia ATA ${fechaCorta(cl)} → ${fechaCorta(p.nav_ata)}` : `Captura ATA ${fechaCorta(p.nav_ata)}`,
      motivo: "Arribó después de lo capturado: Cargolink cuenta los días libres antes de tiempo.",
    };
  }
  return {
    riesgo: false,
    accion: cl ? `Borra ATA ${fechaCorta(cl)}` : "Revisa la ATA",
    motivo: `Aún no arriba${p.nav_eta ? `: llega ${fechaCorta(p.nav_eta)}` : ""}. Cargolink cuenta los días libres antes de tiempo.`,
  };
}

// Primero en riesgo y luego bajo riesgo; cada grupo por fecha de la naviera.
const ordenAta = (a: Propuesta, b: Propuesta) =>
  Number(correccionAta(b).riesgo) - Number(correccionAta(a).riesgo) || a.valor.localeCompare(b.valor);

// Cargolink contra la naviera, para decidir si se finaliza la ETA.
function Comparativa({ p }: { p: Propuesta }) {
  const eta = p.eta_cargolink ?? p.valor;
  if (!p.nav_nombre) {
    return <span className="text-[11px] text-slate-500 dark:text-slate-400">Sin dato de la naviera para comparar</span>;
  }
  const nav = p.nav_nombre.charAt(0) + p.nav_nombre.slice(1).toLowerCase();
  const consultado = p.nav_consultado ? new Date(p.nav_consultado) : null;
  const cuando = consultado ? ` · consultado ${consultado.getDate()} ${MESES_C[consultado.getMonth()]}` : "";
  if (p.nav_ata) {
    return (
      <span className="text-[11px] font-semibold text-green-700 dark:text-green-400">
        {nav}: arribó {fechaCorta(p.nav_ata)}
        <span className="font-normal text-slate-500">{cuando}</span>
      </span>
    );
  }
  if (!p.nav_eta || !eta) return <span className="text-[11px] text-slate-500">{nav}: sin ETA{cuando}</span>;
  const d = diasEntre(eta, p.nav_eta);
  return (
    <span className={`text-[11px] font-semibold ${d === 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
      {d === 0 ? `✓ ${nav} coincide: ${fechaCorta(p.nav_eta)}` : `${nav} da ${fechaCorta(p.nav_eta)} (${d > 0 ? "+" : ""}${d} d)`}
      <span className="font-normal text-slate-500">{cuando}</span>
    </span>
  );
}

// El buque aún no llega: la fecha de la naviera es una ETA estimada, no un arribo. Una ATA
// a futuro tampoco es arribo. Se muestran aparte para no confundirlas con una ATA real.
const hoyMx = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const esEstimada = (p: Propuesta) =>
  (p.tipo === "ata_naviera_info" && !p.nav_ata) || (p.tipo === "ata_naviera" && p.valor.slice(0, 10) > hoyMx());

const TIPOS: { tipo: Propuesta["tipo"]; titulo: string; accion: string; ayuda: string; soloAviso?: boolean; estimada?: boolean }[] = [
  {
    tipo: "ata_naviera",
    titulo: "ATA según la naviera",
    accion: "Guardar ATA de la naviera",
    ayuda: "La naviera ya reporta el arribo y Cargolink no lo tiene (o tiene otra fecha). Se guarda en la etapa ATA, en edición.",
  },
  {
    tipo: "ata_naviera_info",
    titulo: "ATA por corregir en Cargolink",
    accion: "Liberar etapa y corregir ATA",
    ayuda: "La naviera ya reporta el arribo y contradice la ATA finalizada de Cargolink. Primero los que están en riesgo (arribó antes: los días libres ya corren), luego los de bajo riesgo; cada grupo por fecha. Al confirmar se libera la etapa y se guarda su ATA, finalizada.",
  },
  {
    tipo: "ata_naviera_info",
    estimada: true,
    soloAviso: true,
    titulo: "Aún no arriba · ETA estimada",
    accion: "Corregir ATA en Cargolink",
    ayuda:
      "El buque todavía no llega: la naviera no reporta el arribo. La fecha propuesta es una ETA estimada, no una ATA. Cargolink tiene ATA capturada antes de tiempo (los días libres corren desde una fecha que no ha pasado): bórrala o cámbiala en Cargolink.",
  },
  { tipo: "eta_naviera", titulo: "ETA según la naviera", accion: "Guardar ETA de la naviera", ayuda: "Los agentes consultan a las navieras a las 7 PM (o desde el detalle) y la ETA no coincide con Cargolink." },
  {
    tipo: "eta_naviera_info",
    titulo: "ETA de la naviera distinta · etapa finalizada",
    accion: "Liberar etapa y guardar ETA",
    ayuda:
      "La naviera trae otra ETA y la etapa ETA ya está finalizada en Cargolink. Al confirmar se libera la etapa (como Liberación > Liberar etapas) y se guarda la fecha; queda en edición para finalizarla al arribo.",
  },
  { tipo: "transbordo", titulo: "Transbordo → No aplica", accion: "Marcar No aplica", ayuda: "La naviera casi nunca transborda en esa ruta." },
  { tipo: "eta_finalizar", titulo: "Finalizar ETA", accion: "Finalizar con la ETA capturada", ayuda: "La ETA ya está capturada; falta finalizar la etapa en Cargolink." },
  { tipo: "eta", titulo: "ETA propuesta", accion: "Guardar ETA (queda en edición)", ayuda: "Zarpó sin ETA: ATD + tránsito típico de la naviera." },
  { tipo: "dias", titulo: "Días libres de demora", accion: "Guardar días libres", ayuda: "Ya arribó y no tiene días libres: según el historial." },
];

const CONFIANZA: Record<Propuesta["confianza"], { label: string; clase: string }> = {
  alta: { label: "Confianza alta", clase: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  media: { label: "Revisar", clase: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  baja: { label: "Poca historia", clase: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
};

const clave = (p: Propuesta) => `${p.tipo}:${p.id_booking}`;
const claveGrupo = (t: { tipo: string; estimada?: boolean }) => `${t.tipo}${t.estimada ? "-estimada" : ""}`;

// Última corrida del rastreo de navieras (tarjeta del resumen).
export type ResumenRastreo = { encontrados: number; total: number; cuando: string; corriendo: boolean; fallaron: string[] };

const horaCorta = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Resumen arriba: una tarjeta por grupo con cuántas hay, para qué es y si se aplica sola
// (confianza alta, 8:00 y 14:00) o necesita a una persona; "Revisar" baja a su sección.
function Resumen({ propuestas, rastreo }: { propuestas: Propuesta[]; rastreo: ResumenRastreo | null }) {
  const tarjetas = TIPOS.map((t) => {
    const lista = propuestas.filter((p) => (t.estimada ? esEstimada(p) : p.tipo === t.tipo && !esEstimada(p)));
    const solas = lista.filter((p) => p.confianza === "alta" && !soloAviso(p)).length;
    return { t, n: lista.length, solas };
  }).filter((x) => x.n > 0);
  if (tarjetas.length === 0 && !rastreo) return null;
  const etiqueta = "rounded px-2 py-0.5 text-xs font-bold";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tarjetas.map(({ t, n, solas }) => (
        <div key={claveGrupo(t)} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">{t.titulo}</h3>
            <span className="text-lg font-extrabold tabular-nums text-slate-900 dark:text-slate-50">{n}</span>
          </div>
          <p className="line-clamp-3 text-xs text-slate-600 dark:text-slate-400">{t.ayuda}</p>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
            {t.estimada ? (
              <span className={`${etiqueta} bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200`}>Estimada</span>
            ) : solas === n ? (
              <span className={`${etiqueta} bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300`}>Se aplica solo</span>
            ) : solas > 0 ? (
              <span className={`${etiqueta} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>
                {solas} solas · {n - solas} a revisar
              </span>
            ) : (
              <span className={`${etiqueta} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>Necesita a una persona</span>
            )}
            <a
              href={`#grupo-${claveGrupo(t)}`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Revisar {n}
            </a>
          </div>
        </div>
      ))}
      {rastreo && (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Reporte de navieras</h3>
            <span className="text-lg font-extrabold tabular-nums text-slate-900 dark:text-slate-50">
              {rastreo.encontrados}/{rastreo.total}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {rastreo.corriendo ? "Rastreo corriendo ahora." : `Rastreo del ${horaCorta(rastreo.cuando)}: ${rastreo.encontrados} de ${rastreo.total} encontrados.`}
            {rastreo.fallaron.length > 0 && ` ${rastreo.fallaron.join(", ")} no respondieron (captcha o ventana cerrada).`}
          </p>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
            {rastreo.fallaron.length > 0 ? (
              <span className={`${etiqueta} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>Abrir ventanas en SYSMON</span>
            ) : (
              <span className={`${etiqueta} bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300`}>Todas respondieron</span>
            )}
            <Link
              href="/track/reporte-navieras"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Ver reporte
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
// ATA anticipada (la naviera aún no arriba): no se puede dejar vacía desde la app.
const soloAviso = (p: Propuesta) =>
  Boolean(TIPOS.find((t) => t.tipo === p.tipo)?.soloAviso) || esEstimada(p);

export function PropuestasPorConfirmar({
  propuestas,
  puedeEditar,
  rastreo = null,
}: {
  propuestas: Propuesta[];
  puedeEditar: boolean;
  rastreo?: ResumenRastreo | null;
}) {
  const router = useRouter();
  // Por default solo las de confianza alta quedan marcadas.
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(propuestas.map((p) => [clave(p), p.confianza === "alta" && !soloAviso(p)])),
  );
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(propuestas.map((p) => [clave(p), p.valor])));
  const [resultado, setResultado] = useState<Record<string, { ok: boolean; mensaje: string }>>({});
  const [revisando, setRevisando] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);

  const pendientes = propuestas.filter((p) => !resultado[clave(p)]?.ok);
  const seleccion = useMemo(
    () => pendientes.filter((p) => !soloAviso(p) && marcadas[clave(p)] && valores[clave(p)]),
    [pendientes, marcadas, valores],
  );

  const confirmar = async () => {
    setRevisando(false);
    setProgreso({ hechos: 0, total: seleccion.length });
    const res: Record<string, { ok: boolean; mensaje: string }> = { ...resultado };
    for (const [i, p] of seleccion.entries()) {
      const v = valores[clave(p)];
      const r =
        p.tipo === "ata_naviera_info"
          ? await guardarEtapaCargolink(p.id_booking, "ata", "FINALIZADO", { fecha_ata: v })
          : p.tipo === "eta_naviera_info" || p.tipo === "eta_naviera"
          ? await guardarEtapaCargolink(p.id_booking, "eta", "EDICION", { buque_eta: v })
          : p.tipo === "ata_naviera"
          ? await guardarEtapaCargolink(p.id_booking, "ata", "EDICION", { fecha_ata: v })
          : p.tipo === "transbordo"
          ? await guardarTransbordosCargolink(p.id_booking, "NO_APLICA", [])
          : p.tipo === "eta"
            ? await guardarEtapaCargolink(p.id_booking, "eta", "EDICION", { buque_eta: v })
            : p.tipo === "eta_finalizar"
              ? await guardarEtapaCargolink(p.id_booking, "eta", "FINALIZADO", { buque_eta: v })
              : await guardarEtapaCargolink(p.id_booking, "ata", "EDICION", { dias_demora: v });
      res[clave(p)] = r;
      setResultado({ ...res });
      setProgreso({ hechos: i + 1, total: seleccion.length });
    }
    setProgreso(null);
    router.refresh();
  };

  if (propuestas.length === 0) {
    return (
      <>
      <Resumen propuestas={propuestas} rastreo={rastreo} />
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        No hay propuestas por confirmar con estos filtros.
      </p>
      </>
    );
  }

  const valorTexto = (p: Propuesta, v: string) =>
    p.tipo === "transbordo" ? "No aplica" : p.tipo === "dias" ? `${v} días` : fechaCorta(v);

  return (
    <div className="space-y-4">
      <Resumen propuestas={propuestas} rastreo={rastreo} />
      <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <strong>{pendientes.length}</strong> propuestas · <strong>{seleccion.length}</strong> seleccionadas · nada se guarda hasta confirmar
        </p>
        {puedeEditar ? (
          <button
            type="button"
            disabled={seleccion.length === 0 || Boolean(progreso)}
            onClick={() => setRevisando(true)}
            className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {progreso ? `Guardando ${progreso.hechos} de ${progreso.total}…` : `Revisar y confirmar (${seleccion.length})`}
          </button>
        ) : (
          <span className="text-xs text-slate-500">Solo los editores de la prueba confirman propuestas.</span>
        )}
      </div>

      {revisando && (
        <div role="alertdialog" aria-labelledby="rev-propuestas" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <p id="rev-propuestas" className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            Se escribirán en Cargolink {seleccion.length} propuestas en {new Set(seleccion.map((p) => p.id_booking)).size} bookings. No se notificará al
            cliente; queda registrado en la Bitácora.
          </p>
          <ul className="max-h-60 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-amber-950 dark:text-amber-100">
            {seleccion.map((p) => (
              <li key={clave(p)}>
                {p.no_booking} · {TIPOS.find((t) => t.tipo === p.tipo)?.accion}: <strong>{valorTexto(p, valores[clave(p)])}</strong>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => setRevisando(false)} className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
              Cancelar
            </button>
            <button type="button" onClick={confirmar} className="min-h-10 rounded-md bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800">
              Confirmar y guardar en Cargolink
            </button>
          </div>
        </div>
      )}

      {TIPOS.map((t) => {
        const lista = propuestas.filter((p) => (t.estimada ? esEstimada(p) : p.tipo === t.tipo && !esEstimada(p)));
        if (t.tipo === "ata_naviera_info") lista.sort(ordenAta);
        if (lista.length === 0) return null;
        const abiertas = lista.filter((p) => !resultado[clave(p)]?.ok && !soloAviso(p));
        const todas = abiertas.length > 0 && abiertas.every((p) => marcadas[clave(p)]);
        return (
          <section key={claveGrupo(t)} id={`grupo-${claveGrupo(t)}`} aria-labelledby={`tipo-${t.tipo}${t.estimada ? "-estimada" : ""}`} className="scroll-mt-28 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <h2 id={`tipo-${t.tipo}${t.estimada ? "-estimada" : ""}`} className="text-base font-bold text-slate-900 dark:text-slate-50">
                  {t.titulo} <span className="text-sm font-semibold text-slate-500">· {lista.length}</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.ayuda}</p>
              </div>
              {abiertas.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={todas}
                  disabled={!puedeEditar || Boolean(progreso)}
                  onChange={(e) => setMarcadas((m) => ({ ...m, ...Object.fromEntries(abiertas.map((p) => [clave(p), e.target.checked])) }))}
                />
                Seleccionar todas
              </label>
              )}
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {lista.map((p) => {
                const k = clave(p);
                const r = resultado[k];
                const hecho = r?.ok === true;
                const estimada = esEstimada(p);
                const corr = p.tipo === "ata_naviera_info" && !estimada ? correccionAta(p) : null;
                return (
                  <li key={k} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm ${hecho ? "bg-green-50 dark:bg-green-950/40" : ""}`}>
                    {soloAviso(p) ? (
                      <span aria-hidden="true" className="w-[13px]" />
                    ) : (
                    <input
                      type="checkbox"
                      aria-label={`Confirmar ${p.no_booking}`}
                      disabled={!puedeEditar || hecho || Boolean(progreso)}
                      checked={Boolean(marcadas[k]) && !hecho}
                      onChange={(e) => setMarcadas((m) => ({ ...m, [k]: e.target.checked }))}
                    />
                    )}
                    <span className="flex w-56 min-w-0 flex-col">
                      <AbrirOperacionBoton idBooking={p.id_booking} className="text-left font-mono text-[13px] font-semibold text-blue-700 hover:underline dark:text-blue-400">
                        {p.no_booking}
                      </AbrirOperacionBoton>
                      <span className="truncate text-xs text-slate-500">
                        {p.cliente ?? "—"} · {p.ejecutivo ?? "Sin ejecutivo"}
                      </span>
                    </span>
                    <span className="flex w-60 min-w-0 flex-col">
                      <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200" title={p.naviera ?? undefined}>
                        {p.naviera ?? "Naviera sin capturar"}
                      </span>
                      <span className="truncate text-[11px] text-slate-500" title={p.ruta ?? undefined}>
                        {p.ruta ?? "—"}
                      </span>
                    </span>
                    <span className={corr || estimada ? "w-56" : "w-44"}>
                      {estimada ? (
                        <span className="flex flex-col items-start gap-1">
                          <span className="rounded border border-dashed border-sky-500 bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200">
                            ETA estimada {fechaCorta(p.tipo === "ata_naviera" ? p.valor : (p.nav_eta ?? p.valor))}
                          </span>
                          {p.ata_cargolink && (
                            <span className="text-[11px] text-slate-500">
                              ATA en Cargolink: <span className="line-through">{fechaCorta(p.ata_cargolink)}</span> (anticipada)
                            </span>
                          )}
                          <a
                            href={`/track/interactivo/${p.id_booking}?editar=ata`}
                            className="rounded border border-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-950"
                          >
                            Abrir ATA
                          </a>
                        </span>
                      ) : corr ? (
                        <span className="flex flex-col items-start gap-1">
                          <span className={`font-semibold ${corr.riesgo ? "text-red-700 dark:text-red-400" : "text-slate-800 dark:text-slate-200"}`}>{corr.accion}</span>
                          <a
                            href={`/track/interactivo/${p.id_booking}?editar=ata`}
                            className="rounded border border-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-950"
                          >
                            Abrir ATA
                          </a>
                        </span>
                      ) : p.tipo === "transbordo" ? (
                        <span className="font-semibold">No aplica</span>
                      ) : t.soloAviso ? (
                        <span className="flex flex-col items-start gap-1">
                          <span className="font-semibold text-amber-900 dark:text-amber-200">Naviera: {fechaCorta(p.valor)}</span>
                          {p.tipo === "ata_naviera_info" && (
                            <a
                              href={`/track/interactivo/${p.id_booking}?editar=ata`}
                              className="rounded border border-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-950"
                            >
                              Abrir ATA
                            </a>
                          )}
                        </span>
                      ) : (
                        <input
                          type={p.tipo === "dias" ? "number" : "date"}
                          min={p.tipo === "dias" ? 0 : undefined}
                          max={p.tipo === "dias" ? 365 : undefined}
                          value={valores[k] ?? ""}
                          disabled={!puedeEditar || hecho || Boolean(progreso)}
                          aria-label={`Valor propuesto para ${p.no_booking}`}
                          onChange={(e) => setValores((x) => ({ ...x, [k]: e.target.value }))}
                          className={`min-h-9 rounded-md border px-2 text-sm dark:bg-slate-900 ${
                            valores[k] === p.valor ? "border-2 border-dashed border-blue-500 bg-blue-50 font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200" : "border-slate-300 dark:border-slate-600"
                          } ${p.tipo === "dias" ? "w-24" : ""}`}
                        />
                      )}
                    </span>
                    {(p.tipo === "eta_finalizar" || p.tipo === "eta") && (
                      <span className="flex min-w-40 flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cargolink vs naviera</span>
                        <Comparativa p={p} />
                      </span>
                    )}
                    {estimada ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300">Propuesta estimada · no ha llegado</span>
                    ) : corr ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          corr.riesgo ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {corr.riesgo ? "En riesgo" : "Bajo riesgo"}
                      </span>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CONFIANZA[p.confianza].clase}`}>{CONFIANZA[p.confianza].label}</span>
                    )}
                    <span className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-400">
                      {estimada ? (
                        <>
                          {p.nav_nombre ? p.nav_nombre.charAt(0) + p.nav_nombre.slice(1).toLowerCase() : "La naviera"} aún no reporta el arribo del buque
                          {p.nav_eta ? `; estima llegar el ${fechaCorta(p.nav_eta)}` : ""}.
                          {p.nav_consultado && <span className="block text-slate-500">Consultada el {fechaCorta(p.nav_consultado.slice(0, 10))}.</span>}
                        </>
                      ) : corr ? (
                        <>
                          {corr.motivo}
                          {p.nav_consultado && (
                            <span className="block text-slate-500">
                              {p.nav_nombre ? p.nav_nombre.charAt(0) + p.nav_nombre.slice(1).toLowerCase() : "Naviera"} consultada el{" "}
                              {fechaCorta(p.nav_consultado.slice(0, 10))}.
                            </span>
                          )}
                        </>
                      ) : (
                        p.explicacion
                      )}
                      {p.naviera_dias && (
                        <span className="block text-slate-500">
                          Esta naviera suele dar {p.naviera_dias}.
                        </span>
                      )}
                    </span>
                    {r && <span className={`basis-full pl-8 text-xs ${r.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{r.ok ? "✓ Guardado en Cargolink" : r.mensaje}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
