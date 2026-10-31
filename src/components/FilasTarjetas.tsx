import Link from "next/link";
import { TONO_TARJETA } from "@/lib/track";

export type TarjetaFila = {
  key: string;
  label: string;
  valor: number;
  nota: string;
  tono: string;
  href: string;
  activa?: boolean;
};
export type FilaTarjetas = { titulo: string; tarjetas: TarjetaFila[] };

// Color del número y del punto según el tono de la tarjeta.
const COLOR: [string, string, string][] = [
  [TONO_TARJETA.rojo, "text-red-700 dark:text-red-400", "bg-red-600"],
  [TONO_TARJETA.ambar, "text-amber-700 dark:text-amber-400", "bg-amber-500"],
  [TONO_TARJETA.azul, "text-blue-700 dark:text-blue-400", "bg-blue-600"],
  [TONO_TARJETA.violeta, "text-violet-700 dark:text-violet-400", "bg-violet-600"],
  [TONO_TARJETA.gris, "text-slate-800 dark:text-slate-200", "bg-slate-400"],
];

// Una fila compacta por pregunta (¿perdemos dinero?, ¿cumplimos hoy?, ¿dónde van?,
// ¿la captura está bien?): cada indicador es un renglón con punto de color, nombre y
// número; la explicación sale al pasar el mouse. Los que están en 0 se ven apagados.
export function FilasTarjetas({ resumen, filas }: { resumen?: React.ReactNode; filas: FilaTarjetas[] }) {
  return (
    <section aria-label="Estatus" className="space-y-2">
      {resumen && <p className="text-sm text-slate-700 dark:text-slate-300">{resumen}</p>}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {filas.map((fila) => (
          <div
            key={fila.titulo}
            className="grid grid-cols-1 items-center gap-x-3 gap-y-1 border-b border-slate-100 px-3 py-1.5 last:border-b-0 lg:grid-cols-[170px_minmax(0,1fr)] dark:border-slate-800"
          >
            <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">{fila.titulo}</h3>
            <div role="group" aria-label={fila.titulo} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {fila.tarjetas.map((t) => {
                const apagada = t.valor === 0 && !t.activa;
                const [, numero, punto] = COLOR.find(([tono]) => tono === t.tono) ?? COLOR[4];
                return (
                  <Link
                    key={t.key}
                    href={t.href}
                    title={t.nota}
                    aria-current={t.activa ? "true" : undefined}
                    className={`flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      t.activa ? "border-slate-900 ring-1 ring-slate-900 dark:border-slate-100 dark:ring-slate-100" : "border-slate-200 dark:border-slate-700"
                    } ${apagada ? "opacity-50" : ""}`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${apagada ? "bg-slate-300" : punto}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700 dark:text-slate-300">{t.label}</span>
                    <span className={`text-base font-extrabold tabular-nums ${apagada ? "text-slate-400" : numero}`}>{t.valor.toLocaleString("es-MX")}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
