import { redirect } from "next/navigation";
import { getMyPermissions } from "@/lib/permissions";

export default async function ImportacionesLayout({ children }: { children: React.ReactNode }) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.puede_operaciones) {
    redirect("/inicio");
  }

  return <>{children}</>;
}
