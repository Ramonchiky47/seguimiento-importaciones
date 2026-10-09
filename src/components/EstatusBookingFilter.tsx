"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ESTATUS_BOOKING, ESTATUS_DEFAULT } from "@/lib/track";

// Estatus del booking en Cargolink (Vigente por default, Finalizado,
// Cancelado o Todos). Reinicia la paginación al cambiar.
export function EstatusBookingFilter({ current }: { current: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      <span className="sr-only sm:not-sr-only">Estatus</span>
      <select
        value={current}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("page");
          if (e.target.value === ESTATUS_DEFAULT) params.delete("estatus");
          else params.set("estatus", e.target.value);
          const q = params.toString();
          // Navegación completa, igual que MultiSelectFilter (el router de
          // Next a veces conserva la query anterior).
          window.location.href = q ? `${pathname}?${q}` : pathname;
        }}
        className={`min-h-10 rounded-md border px-3 py-2 text-sm focus:border-slate-500 focus:outline-none dark:bg-slate-900 ${
          current === ESTATUS_DEFAULT
            ? "border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:text-slate-300"
            : "border-blue-400 bg-blue-50 text-blue-800 dark:border-blue-700 dark:text-blue-300"
        }`}
      >
        {ESTATUS_BOOKING.map((e) => (
          <option key={e.key} value={e.key}>
            {e.label}
          </option>
        ))}
      </select>
    </label>
  );
}
