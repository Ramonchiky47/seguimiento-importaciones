"use client";

// Captura agrupada de Track (pedido de Ramón, 9 nov 2026):
//   TRANSITO = ETA + Aviso de arribo + Telex HBL + Telex MBL + Revalidación
//   ARRIBO   = ATA (y días libres) + Aviso de ATA
// Un solo formulario por grupo y un semáforo por tarea según su fecha límite
// (la regla de Track: ETA − 7, ETA − 3, ETA − 2, día del arribo).
// Todo se guarda en Cargolink sin notificar al cliente; las fechas quedan en
// edición. Los avisos solo cuentan como hechos al finalizarse (sin notificar).

import { useState, useTransition } from "react";
import { fechaCorta, hoyMexico } from "@/lib/track";
import { guardarEtapaCargolink } from "@/app/(app)/operaciones-maritima/actions";

export type HitoGrupo = {
  orden: number;
  hito: string;
  fecha_plan: string | null;
  fecha_hecho: string | null;
  hecho: boolean;
  estado: string;
};

type Op = Record<string, unknown> & { datos?: Record<string, string> };

const DIA = 86400000;
const dias = (iso: string, hoy: string) => Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(hoy)) / DIA);
const fecha = (v: unknown) => {
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !s.startsWith("0000") ? s : "";
};

export type Semaforo = { label: string; clase: string; nivel: number };

const S = {
  hecho: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  tiempo: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  proximo: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  vencido: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  critico: "bg-red-800 text-white dark:bg-red-700",
  gris: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

// Telex y revalidación pendientes con el buque ya arribado: ya corren las demoras.
const CRITICOS = new Set([4, 5, 6]);

export function semaforo(h: HitoGrupo, ata: string | null, hoy = hoyMexico()): Semaforo {
  if (h.orden === 8 && !ata && !h.hecho) return { label: "Al arribar", clase: S.gris, nivel: 0 };
  if (h.estado === "no_aplica") return { label: "No aplica", clase: S.gris, nivel: 0 };
  if (h.hecho) return { label: h.fecha_hecho ? `Hecho · ${fechaCorta(h.fecha_hecho)}` : "Hecho", clase: S.hecho, nivel: 0 };
  if (ata && CRITICOS.has(h.orden)) return { label: "Crítico · ya arribó", clase: S.critico, nivel: 4 };
  if (!h.fecha_plan) return { label: h.orden === 8 ? "Al arribar" : "Sin fecha (falta ETA)", clase: S.gris, nivel: 0 };
  const d = dias(h.fecha_plan, hoy);
  if (d < 0) return { label: `Vencido · ${-d} ${-d === 1 ? "día" : "días"}`, clase: S.vencido, nivel: 3 };
  if (d === 0) return { label: "Vence hoy", clase: S.proximo, nivel: 2 };
  if (d <= 3) return { label: `Vence en ${d} ${d === 1 ? "día" : "días"}`, clase: S.proximo, nivel: 2 };
  return { label: `En tiempo · ${d} días`, clase: S.tiempo, nivel: 1 };
}

// Texto de la cabecera del grupo (cuenta regresiva a la ETA / estado del arribo).
export function resumenGrupo(grupo: string, op: Op): { texto: string; clase: string } {
  const hoy = hoyMexico();
  const eta = fecha(op.eta);
  const ata = fecha(op.ata);
  if (grupo === "Transito") {
    if (ata) return { texto: `ETA ${fechaCorta(eta)} · arribó ${fechaCorta(ata)}`, clase: "text-green-700 dark:text-green-400" };
    if (!eta) return { texto: "Sin ETA: captúrala para calcular las fechas límite", clase: "text-violet-700 dark:text-violet-300" };
    const d = dias(eta, hoy);
    if (d > 0) return { texto: `ETA ${fechaCorta(eta)} · faltan ${d} ${d === 1 ? "día" : "días"}`, clase: "text-slate-700 dark:text-slate-200" };
    if (d === 0) return { texto: `ETA hoy (${fechaCorta(eta)})`, clase: "text-amber-700 dark:text-amber-300" };
    return { texto: `ETA ${fechaCorta(eta)} · hace ${-d} ${-d === 1 ? "día" : "días"} y sin ATA`, clase: "text-red-700 dark:text-red-400" };
  }
  if (ata) {
    const dl = Number(op.dias_libres_demora ?? 0);
    return { texto: `ATA ${fechaCorta(ata)}${dl > 0 ? ` · ${dl} días libres` : " · sin días libres"}`, clase: "text-slate-700 dark:text-slate-200" };
  }
  return { texto: eta ? `Esperando arribo · ETA ${fechaCorta(eta)}` : "Esperando arribo · sin ETA", clase: "text-slate-500 dark:text-slate-400" };
}

type Paso = { etapa: string; status: string; valores: Record<string, string>; texto: string };

const claseInput =
  "min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

function CampoFecha({
  label,
  valor,
  onCambiar,
  sem,
  ayuda,
}: {
  label: string;
  valor: string;
  onCambiar: (v: string) => void;
  sem?: Semaforo;
  ayuda?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
      <span className="flex items-center gap-2">
        <span className="font-semibold">{label}</span>
        {sem && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sem.clase}`}>{sem.label}</span>}
      </span>
      <span className="flex gap-1">
        <input type="date" value={valor} onChange={(e) => onCambiar(e.target.value)} className={claseInput} />
        <button
          type="button"
          onClick={() => onCambiar(hoyMexico())}
          className="rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Hoy
        </button>
      </span>
      {ayuda && <span className="text-[11px] text-slate-500 dark:text-slate-400">{ayuda}</span>}
    </label>
  );
}

function CasillaAviso({
  label,
  hecho,
  marcado,
  onCambiar,
  sem,
  ayuda,
}: {
  label: string;
  hecho: boolean;
  marcado: boolean;
  onCambiar: (v: boolean) => void;
  sem?: Semaforo;
  ayuda: string;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
      <span className="flex items-center gap-2">
        <span className="font-semibold">{label}</span>
        {sem && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sem.clase}`}>{sem.label}</span>}
      </span>
      {hecho ? (
        <span className="min-h-10 content-center text-sm text-green-700 dark:text-green-400">Finalizado en Cargolink</span>
      ) : (
        <label className="flex min-h-10 items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input type="checkbox" checked={marcado} onChange={(e) => onCambiar(e.target.checked)} className="size-4" />
          Ya se envió · finalizar sin notificar
        </label>
      )}
      <span className="text-[11px] text-slate-500 dark:text-slate-400">{ayuda}</span>
    </div>
  );
}

function useGuardar(idBooking: number, noBooking: string, onGuardado: (m: string) => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const guardar = (pasos: Paso[], advertencias: string[]) => {
    if (pasos.length === 0) {
      setError("No hay cambios que guardar.");
      return;
    }
    const texto =
      `Se guardará en Cargolink, booking ${noBooking}:\n\n` +
      pasos.map((p) => `• ${p.texto}`).join("\n") +
      (advertencias.length ? `\n\nAtención:\n${advertencias.map((a) => `• ${a}`).join("\n")}` : "") +
      `\n\nLas fechas quedan en edición. No se notificará al cliente.\n\n¿Continuar?`;
    if (!window.confirm(texto)) return;
    setError(null);
    startTransition(async () => {
      const hechos: string[] = [];
      for (const p of pasos) {
        const r = await guardarEtapaCargolink(idBooking, p.etapa, p.status, p.valores);
        if (!r.ok) {
          setError(`${hechos.length ? `Guardado: ${hechos.join(", ")}. ` : ""}No se pudo: ${p.texto}. ${r.mensaje}`);
          if (hechos.length) onGuardado(`Guardado en Cargolink: ${hechos.join(", ")}. Revisa el error en: ${p.texto}.`);
          return;
        }
        hechos.push(p.texto);
      }
      onGuardado(`Guardado en Cargolink: ${hechos.join(", ")}.`);
    });
  };
  return { guardar, error, pending };
}

function Botones({ pending, onGuardar, onCancelar }: { pending: boolean; onGuardar: () => void; onCancelar: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={onGuardar}
        className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        Guardar cambios
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onCancelar}
        className="min-h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Cancelar
      </button>
      {pending && <span className="text-sm text-slate-500">Guardando en Cargolink…</span>}
    </div>
  );
}

export function CapturaTransito({
  op,
  idBooking,
  hitos,
  onGuardado,
  onCancelar,
}: {
  op: Op;
  idBooking: number;
  hitos: HitoGrupo[];
  onGuardado: (mensaje: string) => void;
  onCancelar: () => void;
}) {
  const h = (orden: number) => hitos.find((x) => x.orden === orden);
  const ata = fecha(op.ata) || null;
  const sem = (orden: number) => {
    const x = h(orden);
    return x ? semaforo(x, ata) : undefined;
  };
  const inicial = {
    eta: fecha(op.eta),
    hbl: fecha(op.telex_house_bl),
    mbl: fecha(op.telex_master_bl),
    rev: fecha(op.revalidacion),
  };
  const [v, setV] = useState(inicial);
  const [aviso, setAviso] = useState(false);
  const [mismoDia, setMismoDia] = useState(false);
  const conMbl = h(5)?.estado !== "no_aplica";
  const avisoHecho = Boolean(h(3)?.hecho);
  const { guardar, error, pending } = useGuardar(idBooking, String(op.no_booking ?? ""), onGuardado);
  const cambiar = (k: keyof typeof v) => (valor: string) =>
    setV((x) => ({ ...x, [k]: valor, ...(mismoDia && conMbl && (k === "hbl" || k === "mbl") ? { hbl: valor, mbl: valor } : {}) }));

  const enviar = () => {
    const pasos: Paso[] = [];
    if (v.eta && v.eta !== inicial.eta) pasos.push({ etapa: "eta", status: "EDICION", valores: { buque_eta: v.eta }, texto: `ETA ${fechaCorta(v.eta)}` });
    if (aviso && !avisoHecho) pasos.push({ etapa: "aviso_eta", status: "NO", valores: {}, texto: "Aviso de arribo finalizado (sin notificar)" });
    if (v.hbl && v.hbl !== inicial.hbl)
      pasos.push({ etapa: "hbl", status: "EDICION", valores: { fecha_telex_house_bl: v.hbl }, texto: `Telex HBL ${fechaCorta(v.hbl)}` });
    if (conMbl && v.mbl && v.mbl !== inicial.mbl)
      pasos.push({ etapa: "mbl", status: "EDICION", valores: { fecha_telex_master_bl: v.mbl }, texto: `Telex MBL ${fechaCorta(v.mbl)}` });
    if (v.rev && v.rev !== inicial.rev)
      pasos.push({ etapa: "rev", status: "EDICION", valores: { fecha_revalidacion: v.rev }, texto: `Revalidación ${fechaCorta(v.rev)}` });
    const adv: string[] = [];
    if (v.rev && (!v.hbl || (conMbl && !v.mbl))) adv.push("Se captura revalidación y falta algún telex.");
    if (v.eta && inicial.eta && v.eta !== inicial.eta) adv.push(`La ETA cambia de ${fechaCorta(inicial.eta)} a ${fechaCorta(v.eta)}: las fechas límite se recalculan.`);
    const hoy = hoyMexico();
    for (const [k, nombre] of [["hbl", "Telex HBL"], ["mbl", "Telex MBL"], ["rev", "Revalidación"]] as const) {
      if (v[k] && v[k] !== inicial[k] && v[k] > hoy) adv.push(`${nombre} con fecha futura (${fechaCorta(v[k])}).`);
    }
    guardar(pasos, adv);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Captura de tránsito <span className="font-normal text-slate-500 dark:text-slate-400">· solo se guarda lo que cambies, sin notificar al cliente</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CampoFecha label="ETA" valor={v.eta} onCambiar={cambiar("eta")} ayuda="Fecha base: de aquí salen las fechas límite." />
        <CasillaAviso
          label="① Aviso de arribo"
          hecho={avisoHecho}
          marcado={aviso}
          onCambiar={setAviso}
          sem={sem(3)}
          ayuda={`Límite: ETA − 7 días${h(3)?.fecha_plan ? ` (${fechaCorta(h(3)?.fecha_plan)})` : ""}`}
        />
        <div className="hidden lg:block" />
        <CampoFecha
          label="② Telex HBL"
          valor={v.hbl}
          onCambiar={cambiar("hbl")}
          sem={sem(4)}
          ayuda={`Límite: ETA − 3 días${h(4)?.fecha_plan ? ` (${fechaCorta(h(4)?.fecha_plan)})` : ""}`}
        />
        {conMbl && (
          <CampoFecha
            label="③ Telex MBL"
            valor={v.mbl}
            onCambiar={cambiar("mbl")}
            sem={sem(5)}
            ayuda={`Límite: ETA − 3 días${h(5)?.fecha_plan ? ` (${fechaCorta(h(5)?.fecha_plan)})` : ""}`}
          />
        )}
        {conMbl && (
          <label className="flex items-center gap-2 self-center text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={mismoDia}
              onChange={(e) => {
                setMismoDia(e.target.checked);
                if (e.target.checked) setV((x) => ({ ...x, mbl: x.hbl || x.mbl, hbl: x.hbl || x.mbl }));
              }}
              className="size-4"
            />
            HBL y MBL el mismo día
          </label>
        )}
        <CampoFecha
          label="④ Revalidación"
          valor={v.rev}
          onCambiar={cambiar("rev")}
          sem={sem(6)}
          ayuda={`Límite: ETA − 2 días${h(6)?.fecha_plan ? ` (${fechaCorta(h(6)?.fecha_plan)})` : ""}`}
        />
      </div>
      <Botones pending={pending} onGuardar={enviar} onCancelar={onCancelar} />
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

export function CapturaArribo({
  op,
  idBooking,
  hitos,
  onGuardado,
  onCancelar,
}: {
  op: Op;
  idBooking: number;
  hitos: HitoGrupo[];
  onGuardado: (mensaje: string) => void;
  onCancelar: () => void;
}) {
  const h = (orden: number) => hitos.find((x) => x.orden === orden);
  const ataIni = fecha(op.ata);
  const diasIni = Number(op.dias_libres_demora ?? 0) > 0 ? String(op.dias_libres_demora) : "";
  const [ata, setAta] = useState(ataIni);
  const [diasLibres, setDiasLibres] = useState(diasIni);
  const [aviso, setAviso] = useState(false);
  const avisoHecho = Boolean(h(8)?.hecho);
  const { guardar, error, pending } = useGuardar(idBooking, String(op.no_booking ?? ""), onGuardado);
  const semAta = h(7) ? semaforo(h(7)!, ataIni || null) : undefined;
  const semAviso = h(8) ? semaforo(h(8)!, ataIni || null) : undefined;

  const enviar = () => {
    const pasos: Paso[] = [];
    const valores: Record<string, string> = {};
    if (ata && ata !== ataIni) valores.fecha_ata = ata;
    if (diasLibres && diasLibres !== diasIni) valores.dias_demora = diasLibres;
    if (Object.keys(valores).length) {
      if (!valores.fecha_ata && !ataIni) {
        guardar([], []);
        return;
      }
      pasos.push({
        etapa: "ata",
        status: "EDICION",
        valores: { fecha_ata: ata, ...valores },
        texto: [valores.fecha_ata && `ATA ${fechaCorta(ata)}`, valores.dias_demora && `${diasLibres} días libres`].filter(Boolean).join(" y "),
      });
    }
    if (aviso && !avisoHecho) pasos.push({ etapa: "aviso_ata", status: "NO", valores: {}, texto: "Aviso de ATA finalizado (sin notificar)" });
    const adv: string[] = [];
    if (ata && ata > hoyMexico()) adv.push(`ATA con fecha futura (${fechaCorta(ata)}): el ATA es la fecha real de arribo.`);
    if (aviso && !ata) adv.push("Se finaliza el Aviso de ATA sin fecha de ATA.");
    if (ata && !diasLibres) adv.push("Sin días libres de demora: captúralos para calcular el último día libre.");
    guardar(pasos, adv);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Captura de arribo <span className="font-normal text-slate-500 dark:text-slate-400">· solo se guarda lo que cambies, sin notificar al cliente</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CampoFecha label="① ATA (arribo real)" valor={ata} onCambiar={setAta} sem={semAta} ayuda={`Se espera en la ETA${op.eta ? ` (${fechaCorta(String(op.eta))})` : ""}`} />
        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
          <span className="font-semibold">Días libres de demora</span>
          <input
            type="number"
            min={0}
            max={365}
            value={diasLibres}
            onChange={(e) => setDiasLibres(e.target.value)}
            className={`${claseInput} w-28`}
          />
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Se guardan junto con el ATA.</span>
        </label>
        <CasillaAviso
          label="② Aviso de ATA"
          hecho={avisoHecho}
          marcado={aviso}
          onCambiar={setAviso}
          sem={semAviso}
          ayuda="Límite: el día del arribo. Banco e instrucciones se editan en su renglón."
        />
      </div>
      <Botones pending={pending} onGuardar={enviar} onCancelar={onCancelar} />
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
