import { OperacionesMaritimaVista } from "@/app/(app)/operaciones-maritima/OperacionesMaritimaVista";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Operaciones Marítima como pestaña de Track (misma tabla y tarjetas).
export default function TrackOperacionesPage(props: Parameters<typeof OperacionesMaritimaVista>[0]) {
  return <OperacionesMaritimaVista searchParams={props.searchParams} enTrack />;
}
