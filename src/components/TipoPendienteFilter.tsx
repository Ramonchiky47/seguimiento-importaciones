"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TIPOS_PENDIENTE } from "@/lib/tiposPendiente";

export function TipoPendienteFilter({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      value={current}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tipo", e.target.value);
        router.push(`${pathname}?${params.toString()}`);
      }}
      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
    >
      {TIPOS_PENDIENTE.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
