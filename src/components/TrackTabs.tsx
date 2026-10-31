"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string };
// Pestañas agrupadas: arriba el grupo, abajo sus pestañas.
const GRUPOS: { label: string; tabs: Tab[] }[] = [
  {
    label: "Operación",
    tabs: [
      { href: "/track/mi-dia", label: "Mi día" },
      { href: "/track/tablero", label: "Tablero" },
      { href: "/track/operaciones", label: "Operaciones Marítima" },
      { href: "/track/embarques", label: "Embarques" },
      { href: "/track/viajes", label: "Por viaje" },
    ],
  },
  {
    label: "Propuestas a revisar",
    tabs: [
      { href: "/track/propuestas", label: "Propuestas" },
      { href: "/track/reporte-navieras", label: "Reporte navieras" },
    ],
  },
  {
    label: "Cambios realizados",
    tabs: [
      { href: "/track/info-correos", label: "Info correos" },
      { href: "/track/bitacora", label: "Bitácora" },
      { href: "/track/cambios-cargolink", label: "Cambios en Cargolink" },
    ],
  },
];

const enTab = (pathname: string, t: Tab) => pathname === t.href || pathname.startsWith(`${t.href}/`);

export function TrackTabs({ asignaEjecutivos = false }: { asignaEjecutivos?: boolean }) {
  const pathname = usePathname();
  // "Asignar ejecutivos": administradores y asignadores (Adriana, Jair); grupo aparte.
  const grupos = asignaEjecutivos
    ? [...GRUPOS, { label: "Asignar ejecutivos", tabs: [{ href: "/track/asignar-ejecutivos", label: "Asignar ejecutivos" }] }]
    : GRUPOS;
  const activo = grupos.find((g) => g.tabs.some((t) => enTab(pathname, t))) ?? grupos[0];
  return (
    <nav aria-label="Secciones de Track">
      <div className="flex gap-1 overflow-x-auto">
        {grupos.map((g) => {
          const es = g === activo;
          return (
            <Link
              key={g.label}
              href={g.tabs[0].href}
              aria-current={es ? "true" : undefined}
              className={`whitespace-nowrap rounded-t-md px-4 py-2 text-sm font-bold transition-colors ${
                es
                  ? "bg-slate-900 text-white dark:bg-black dark:text-white"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-100"
              }`}
            >
              {g.label}
            </Link>
          );
        })}
      </div>
      {activo.tabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto bg-slate-100 px-2 dark:bg-slate-800">
          {activo.tabs.map((t) => {
            const activa = enTab(pathname, t);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={activa ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                  activa
                    ? "rounded-t-md border-[#c65a1f] bg-slate-900 text-white dark:bg-black dark:text-white"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
