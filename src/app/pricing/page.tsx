import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { logout } from "@/app/login/actions";
import {
  CardShell,
  IconPricingMaritimo,
  IconTransporteNacional,
  IconTransporteTerrestre,
} from "@/components/ModuloCard";

export const dynamic = "force-dynamic";

// Submenú de Pricing: cada opción abre su bandeja en la app de reporte de
// vendedores vía SSO, con su propio permiso.
export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myPermissions = await getMyPermissions();
  const { data: puedeTransporteNacional } = await supabase.rpc("puedo_transporte_nacional");

  const showMaritimo = myPermissions.es_admin || myPermissions.puede_pricing;
  const showTerrestreInternacional = myPermissions.es_admin || myPermissions.puede_transporte_terrestre;
  const showTerrestreNacional = puedeTransporteNacional === true;

  if (!showMaritimo && !showTerrestreInternacional && !showTerrestreNacional) {
    redirect("/inicio");
  }

  const opciones = [
    {
      key: "maritimo",
      show: showMaritimo,
      href: `/api/sso/pricing?next=${encodeURIComponent("/pricing?panel=pricing")}`,
      icon: <IconPricingMaritimo />,
      title: "Pricing Marítimo / Aéreo",
      description: "Solicitudes y tarifas de flete marítimo y aéreo.",
    },
    {
      key: "terrestre-internacional",
      show: showTerrestreInternacional,
      href: `/api/sso/transporte-terrestre?next=${encodeURIComponent("/transporte-terrestre?panel=transporte-terrestre")}`,
      icon: <IconTransporteTerrestre />,
      title: "Pricing Terrestre Internacional",
      description: "Tarifas y cotizaciones de transporte terrestre internacional.",
    },
    {
      key: "terrestre-nacional",
      show: showTerrestreNacional,
      href: `/api/sso/transporte-nacional?next=${encodeURIComponent("/transporte-nacional")}`,
      icon: <IconTransporteNacional />,
      title: "Pricing Terrestre Nacional",
      description: "Solicitudes y cotizaciones de transporte terrestre nacional.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="bg-[#16232f] text-slate-300 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-8 py-3.5">
          <div className="flex shrink-0 items-center gap-2.5">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c65a1f" strokeWidth="1.6">
              <circle cx="12" cy="12" r="9" />
              <path d="M15.5 8.5 11 11 8.5 15.5 13 13Z" fill="#c65a1f" stroke="none" />
            </svg>
            <span className="text-[15px] font-bold text-white">TrackAv2</span>
          </div>
          <Link
            href="/inicio"
            className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            ← Regresar al menú
          </Link>
          <div className="ml-auto flex items-center gap-5">
            {user?.email && <span className="hidden text-xs text-slate-400 md:inline">{user.email}</span>}
            <form action={logout}>
              <button type="submit" className="text-[13px] font-medium text-slate-300 hover:text-white">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-20">
        <div className="mb-10">
          <h1 className="mb-2 text-[28px] font-bold text-slate-900 dark:text-slate-50">Pricing</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Elige el tipo de pricing.</p>
        </div>

        <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          {opciones.map((o) =>
            o.show ? (
              <a key={o.key} href={o.href} target="_blank" rel="noopener noreferrer" className="contents">
                <CardShell icon={o.icon} title={o.title} description={o.description} />
              </a>
            ) : (
              <CardShell key={o.key} icon={o.icon} title={o.title} description={o.description} disabled />
            ),
          )}
        </div>
      </main>
    </div>
  );
}
