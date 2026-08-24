import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { buildWebappSsoUrl, REPORTE_VENDEDORES_URL } from "@/lib/webappSso";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get("next") || "/dashboard?panel=ventas";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(new URL("/login", requestUrl));
  }

  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin && !myPermissions.puede_ver_ventas) {
    return NextResponse.redirect(new URL("/inicio", requestUrl));
  }

  const target = buildWebappSsoUrl(user.email, next);
  if (!target) {
    // Sin secreto compartido configurado no se puede firmar el acceso único;
    // se manda al login normal de esa app en vez de fallar en seco.
    return NextResponse.redirect(`${REPORTE_VENDEDORES_URL}/login`);
  }

  return NextResponse.redirect(target);
}
