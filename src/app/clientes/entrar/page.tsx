import Image from "next/image";
import { redirect } from "next/navigation";
import { sesionPortal } from "@/lib/portalSesion";
import { FormaAccesoPortal } from "@/components/FormaAccesoPortal";
import portada from "../../../../public/clientes/portada.jpg";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal de clientes · AV2 Logistics", robots: { index: false, follow: false } };

export default async function EntrarPortal() {
  const sesion = await sesionPortal();
  if (sesion) redirect(sesion.tipo === "cliente" ? `/clientes/${sesion.clave}` : "/clientes");

  return (
    <main className="grid min-h-screen flex-1 bg-white lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] dark:bg-[#0d171c]">
      <section className="relative isolate hidden overflow-hidden lg:block">
        <Image src={portada} alt="Buque portacontenedores entrando a puerto" priority placeholder="blur" className="absolute inset-0 -z-10 h-full w-full object-cover" sizes="60vw" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0b1a22]/90 via-[#0b1a22]/40 to-transparent" />
        <div className="flex h-full flex-col justify-end p-12">
          <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-[#9fd6dd] uppercase">AV2 Logistics</p>
          <h2 className="max-w-md text-4xl leading-tight font-bold text-white text-balance">Logística Internacional Marítima</h2>
          <p className="mt-3 max-w-md text-slate-200">Tus embarques del puerto de origen a la devolución del contenedor.</p>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="grid w-full max-w-sm gap-6">
          <div className="rounded-lg bg-white p-2">
            <img src="/clientes/logo-av2.png" alt="AV2 Logistics" width={290} height={77} className="h-16 w-auto" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#13232d] dark:text-slate-50">Portal de clientes</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Entra con tu usuario y contraseña para ver el estatus de tus embarques.</p>
          </div>
          <FormaAccesoPortal />
        </div>
      </section>
    </main>
  );
}
