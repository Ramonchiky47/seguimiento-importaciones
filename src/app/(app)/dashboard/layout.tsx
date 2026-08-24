import { redirect } from "next/navigation";
import { getMyPermissions } from "@/lib/permissions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_operaciones) {
    redirect("/inicio");
  }

  return <>{children}</>;
}
