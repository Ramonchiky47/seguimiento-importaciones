"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/track/mi-dia", label: "Mi día" },
  { href: "/track/tablero", label: "Tablero" },
  { href: "/track/operaciones", label: "Operaciones Marítima" },
  { href: "/track/embarques", label: "Embarques" },
  { href: "/track/viajes", label: "Por viaje" },
  { href: "/track/propuestas", label: "Propuestas" },
  { href: "/track/bitacora", label: "Bitácora" },
  { href: "/track/cambios-cargolink", label: "Cambios en Cargolink" },
];

export function TrackTabs({ asignaEjecutivos = false }: { asignaEjecutivos?: boolean }) {
  const pathname = usePathname();
  // "Asignar ejecutivos": administradores y asignadores (Adriana, Jair).
  const tabs = asignaEjecutivos ? [...TABS, { href: "/track/asignar-ejecutivos", label: "Asignar ejecutivos" }] : TABS;
  return (
    <nav aria-label="Secciones de Track" className="flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const activa = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={activa ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activa
                ? "border-[#c65a1f] text-slate-900 dark:text-slate-50"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
