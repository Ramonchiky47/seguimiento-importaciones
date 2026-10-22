import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Operaciones Marítima vive ahora dentro de Track (/track/operaciones);
// la dirección anterior redirige conservando los filtros.
export default async function OperacionesMaritimaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) params.append(k, x);
  }
  const q = params.toString();
  redirect(q ? `/track/operaciones?${q}` : "/track/operaciones");
}
