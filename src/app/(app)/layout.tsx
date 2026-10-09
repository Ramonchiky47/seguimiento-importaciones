import { getMyPermissions, obtenerUsuario } from "@/lib/permissions";
import { AppNav } from "@/components/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // En paralelo y en caché: la sección y la página reutilizan estos resultados.
  const [user, myPermissions] = await Promise.all([obtenerUsuario(), getMyPermissions()]);

  return (
    <>
      <AppNav
        userEmail={user?.email ?? null}
        showCatalogos={myPermissions.es_admin || myPermissions.puede_operativos}
        reporteVendedoresUrl={
          myPermissions.es_admin || myPermissions.puede_ver_ventas
            ? `/api/sso/reporte-ventas?next=${encodeURIComponent("/dashboard?panel=ventas")}`
            : null
        }
      />
      {children}
    </>
  );
}
