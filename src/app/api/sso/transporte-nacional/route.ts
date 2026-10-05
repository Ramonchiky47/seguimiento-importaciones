import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildWebappSsoUrl, REPORTE_VENDEDORES_URL } from "@/lib/webappSso";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get("next") || "/transporte-nacional";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(new URL("/login", requestUrl));
  }

  const { data: puedeTransporteNacional } = await supabase.rpc("puedo_transporte_nacional");
  if (puedeTransporteNacional !== true) {
    return NextResponse.redirect(new URL("/inicio", requestUrl));
  }

  const target = buildWebappSsoUrl(user.email, next);
  if (!target) {
    return NextResponse.redirect(`${REPORTE_VENDEDORES_URL}/login`);
  }

  return NextResponse.redirect(target);
}
