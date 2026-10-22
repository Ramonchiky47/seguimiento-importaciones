import Link from "next/link";
import { ETIQUETA_COMPACTA, TONO_TARJETA, VALOR_COMPACTO, claseTarjetaCompacta } from "@/lib/track";

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

// Tarjetas en filas con una pregunta cada una (¿perdemos dinero?, ¿cumplimos
// hoy?, ¿dónde van?, ¿la captura está bien?). Las que están en 0 se ven
// apagadas para que resalte solo lo que requiere atención.
export function FilasTarjetas({ resumen, filas }: { resumen?: React.ReactNode; filas: FilaTarjetas[] }) {
  return (
    <section aria-label="Estatus" className="space-y-3">
      {resumen && <p className="text-sm text-slate-700 dark:text-slate-300">{resumen}</p>}
      {filas.map((fila) => (
        <div key={fila.titulo} className="grid grid-cols-1 items-start gap-2 lg:grid-cols-[180px_minmax(0,1fr)]">
          <h3 className="pt-2 text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">{fila.titulo}</h3>
          <div role="group" aria-label={fila.titulo} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {fila.tarjetas.map((t) => {
              const apagada = t.valor === 0 && !t.activa;
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  title={t.nota}
                  aria-current={t.activa ? "true" : undefined}
                  className={`${claseTarjetaCompacta(Boolean(t.activa), apagada ? TONO_TARJETA.neutro : t.tono)} ${apagada ? "opacity-55" : ""}`}
                >
                  <span className={ETIQUETA_COMPACTA}>{t.label}</span>
                  <span className={VALOR_COMPACTO}>{t.valor.toLocaleString("es-MX")}</span>
                  <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{t.nota}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
