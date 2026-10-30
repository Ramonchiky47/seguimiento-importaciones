"use client";

import { useRef } from "react";

// Extracto del correo del que salieron los datos (Track › Info correos): fecha en que se
// recibió, remitente, destinatarios y solo los renglones con los datos. Así los operativos lo
// revisan sin entrar al buzón de Ramón; el resto de la cadena no se guarda.
export type MensajeCitado = { de: string; para?: string | null; cc?: string | null; fecha?: string | null; campos: string[]; renglones: string[] };
export type Evidencia = { recibido?: string | null; de?: string | null; para?: string[]; cc?: string[]; asunto?: string; mensajes?: MensajeCitado[] };

const CAMPO: Record<string, string> = {
  portador: "Naviera", buque: "Buque", atd: "Zarpe", eta: "ETA", pol: "POL", pod: "POD", destino: "Destino", mbl: "MB/L", hbl: "HB/L",
  contenedores: "Contenedores", remitente: "Shipper", consignatario: "Consignatario", dias_libres: "Días libres",
};
const fechaHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "long", timeStyle: "short" }) : "—";

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2 text-sm">
      <dt className="font-semibold text-slate-500 dark:text-slate-400">{etiqueta}</dt>
      <dd className="break-words text-slate-900 dark:text-slate-100">{valor || "—"}</dd>
    </div>
  );
}

export function VerCorreo({ evidencia, booking }: { evidencia: Evidencia; booking: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const msjs = evidencia.mensajes ?? [];
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="font-semibold text-blue-700 underline dark:text-blue-400">
        Ver correo
      </button>
      <dialog
        ref={ref}
        aria-label={`Correo de ${booking}`}
        className="w-[min(760px,95vw)] rounded-xl p-0 shadow-2xl backdrop:bg-slate-900/50 dark:bg-slate-900"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Correo · {booking}</p>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">{evidencia.asunto}</h3>
          </div>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Cerrar" className="rounded-md px-2 text-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            ×
          </button>
        </div>
        <dl className="space-y-1 bg-slate-50 px-5 py-3 dark:bg-slate-800/40">
          <Fila etiqueta="Recibido" valor={<b>{fechaHora(evidencia.recibido)}</b>} />
          <Fila etiqueta="De" valor={evidencia.de} />
          <Fila etiqueta="Para" valor={(evidencia.para ?? []).join("; ")} />
          {(evidencia.cc ?? []).length > 0 && <Fila etiqueta="CC" valor={(evidencia.cc ?? []).join("; ")} />}
        </dl>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
          {msjs.length === 0 && <p className="text-sm text-slate-500">El correo no trae renglones con datos del embarque.</p>}
          {msjs.map((m, i) => (
            <section key={i} className="rounded-lg border border-slate-200 dark:border-slate-700">
              <dl className="space-y-0.5 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                <Fila etiqueta="Fecha" valor={m.fecha} />
                <Fila etiqueta="De" valor={m.de} />
                {m.para && <Fila etiqueta="Para" valor={m.para} />}
                {m.cc && <Fila etiqueta="CC" valor={m.cc} />}
              </dl>
              <div className="px-3 py-2">
                <p className="mb-1 text-xs text-slate-500">De aquí salió: {m.campos.map((c) => CAMPO[c] ?? c).join(", ")}</p>
                <pre className="whitespace-pre-wrap rounded bg-amber-50 px-2 py-1 font-mono text-xs text-slate-900 dark:bg-amber-950/40 dark:text-amber-100">
                  {m.renglones.join("\n")}
                </pre>
              </div>
            </section>
          ))}
          <p className="text-xs text-slate-500">Extracto: solo los renglones con datos del embarque, no el correo completo.</p>
        </div>
      </dialog>
    </>
  );
}
