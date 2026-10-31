"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string };
// Grupos de Track: un grupo con varias pestañas abre su menú al darle clic.
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
const AVANCES = { label: "Avances de descarga", tabs: [{ href: "/track/avances", label: "Avances de descarga" }] };

const enTab = (pathname: string, t: Tab) => pathname === t.href || pathname.startsWith(`${t.href}/`);

export function TrackTabs({ asignaEjecutivos = false }: { asignaEjecutivos?: boolean }) {
  const pathname = usePathname();
  // "Asignar ejecutivos": administradores y asignadores (Adriana, Jair); grupo aparte.
  const grupos = [
    ...GRUPOS,
    ...(asignaEjecutivos ? [{ label: "Asignar ejecutivos", tabs: [{ href: "/track/asignar-ejecutivos", label: "Asignar ejecutivos" }] }] : []),
    AVANCES,
  ];
  const activo = grupos.find((g) => g.tabs.some((t) => enTab(pathname, t)));
  const [abierto, setAbierto] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  // Se cierra al elegir una opción, al dar clic fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAbierto(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(null);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  const clase = (es: boolean) =>
    `flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-4 py-2 text-sm font-bold transition-colors ${
      es ? "bg-slate-900 text-white dark:bg-black" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    }`;

  return (
    <nav ref={ref} aria-label="Secciones de Track" className="flex flex-wrap gap-1">
      {grupos.map((g) => {
        const es = g === activo;
        if (g.tabs.length === 1) {
          return (
            <Link key={g.label} href={g.tabs[0].href} aria-current={es ? "page" : undefined} className={clase(es)}>
              {g.label}
            </Link>
          );
        }
        const actual = es ? g.tabs.find((t) => enTab(pathname, t)) : null;
        return (
          <div key={g.label} className="relative">
            <button
              type="button"
              aria-expanded={abierto === g.label}
              aria-haspopup="menu"
              onClick={() => setAbierto((x) => (x === g.label ? null : g.label))}
              className={clase(es)}
            >
              {g.label}
              {actual && <span className="font-medium text-slate-300">· {actual.label}</span>}
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {abierto === g.label && (
              <div role="menu" className="absolute left-0 top-full z-40 mt-1 min-w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {g.tabs.map((t) => {
                  const activa = enTab(pathname, t);
                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      role="menuitem"
                      onClick={() => setAbierto(null)}
                      aria-current={activa ? "page" : undefined}
                      className={`block px-4 py-2.5 text-sm font-semibold ${
                        activa ? "bg-slate-900 text-white dark:bg-black" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      {t.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
