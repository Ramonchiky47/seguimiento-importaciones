import { redirect } from "next/navigation";

// Track New pasó a ser la vista interactiva de Track.
export default async function TrackNewBookingRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/track/interactivo/${encodeURIComponent(id)}`);
}
