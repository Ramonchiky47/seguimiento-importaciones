import type { Metadata } from "next";
import Link from "next/link";
import { sesionPortal } from "@/lib/portalSesion";
import { redirect } from "next/navigation";
import { salirPortal } from "@/app/clientes/entrar/actions";

export const metadata: Metadata = {
  title: "Portal de clientes · AV2 Logistics",
  description: "Estatus de embarques marítimos activos",
  robots: { index: false, follow: false },
};

// Portal de clientes (piloto 11 nov 2026). Página independiente de Track:
// solo los usuarios de portal_clientes_revisores (Armando y Ramón, 11 nov 2026).
export default async function ClientesLayout({ children }: { children: React.ReactNode }) {
  const sesion = await sesionPortal();
  if (!sesion) redirect("/clientes/entrar");
  const revisor = sesion.tipo === "revisor";

  return (
    <div className="flex min-h-screen flex-col bg-[#eef2f3] text-[#13232d] dark:bg-[#0d171c] dark:text-[#e3ecef]">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href={revisor ? "/clientes" : `/clientes/${sesion.clave}`} className="flex items-center gap-3" aria-label="Portal de clientes AV2 Logistics">
            <img src="/clientes/logo-av2.png" alt="AV2 Logistics" width={193} height={52} className="h-11 w-auto" />
          </Link>
          <span className="hidden border-l border-slate-300 pl-4 text-sm font-semibold tracking-wide text-[#0e6874] uppercase sm:inline">
            Portal de clientes
          </span>
          <div className="ml-auto flex items-center gap-4 text-[13px] text-slate-600">
            <span className="hidden md:inline">{revisor ? sesion.email : sesion.usuario}</span>
            {revisor && (
              <Link href="/inicio" className="font-medium hover:text-slate-900">
                TrackAv2
              </Link>
            )}
            <form action={salirPortal}>
              <button type="submit" className="font-medium hover:text-slate-900">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
      <footer className="mt-auto border-t border-slate-200 bg-white/60 py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-transparent dark:text-slate-400">
        AV2 Logistics · Logística internacional marítima
      </footer>
    </div>
  );
}
