import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { buildWebappSsoUrl, REPORTE_VENDEDORES_URL } from "@/lib/webappSso";

/** Handoff genérico de acceso único hacia la app de reporte de vendedores,
 * para cualquier destino que requiera es_admin ahí (mismos catálogos que ya
 * están protegidos con @admin_required del lado de esa app). */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get("next") || "/";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(new URL("/login", requestUrl));
  }

  const myPermissions = await getMyPermissions();
  if (!myPermissions.es_admin) {
    return NextResponse.redirect(new URL("/catalogos", requestUrl));
  }

  const target = buildWebappSsoUrl(user.email, next);
  if (!target) {
    return NextResponse.redirect(`${REPORTE_VENDEDORES_URL}/login`);
  }

  return NextResponse.redirect(target);
}
