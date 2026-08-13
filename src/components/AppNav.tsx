"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/importaciones", label: "Importaciones" },
  { href: "/catalogos", label: "Catálogos" },
] as const;

export function AppNav({
  userEmail,
  showCatalogos,
}: {
  userEmail: string | null;
  showCatalogos: boolean;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 bg-[#16232f] text-slate-200 shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="#c65a1f"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M15.5 8.5 11 11 8.5 15.5 13 13Z" fill="#c65a1f" stroke="none" />
          </svg>
          <span className="hidden text-sm font-semibold tracking-tight text-white sm:inline">
            Seguimiento de Importaciones
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.filter((item) => item.href !== "/catalogos" || showCatalogos).map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {userEmail && (
            <span className="hidden text-xs text-slate-400 md:inline">{userEmail}</span>
          )}
          <form action={logout}>
            <button
              type="submit"
              className="text-sm font-medium text-slate-300 hover:text-white"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
