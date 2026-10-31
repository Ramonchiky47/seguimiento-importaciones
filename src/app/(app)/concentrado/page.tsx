import { OperacionesMaritimaVista } from "@/app/(app)/operaciones-maritima/OperacionesMaritimaVista";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Concentrado de bookings como en Cargolink (Booking › Concentrado), con días de crédito.
export default function ConcentradoPage(props: Parameters<typeof OperacionesMaritimaVista>[0]) {
  return <OperacionesMaritimaVista searchParams={props.searchParams} concentrado />;
}
