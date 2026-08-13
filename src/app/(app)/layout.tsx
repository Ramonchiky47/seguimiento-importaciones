import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { AppNav } from "@/components/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myPermissions = await getMyPermissions();

  return (
    <>
      <AppNav
        userEmail={user?.email ?? null}
        showCatalogos={myPermissions.es_admin || myPermissions.puede_operativos}
      />
      {children}
    </>
  );
}
