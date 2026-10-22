import { redirect } from "next/navigation";

// Track New pasó a ser la vista interactiva de Track.
export default function TrackNewRedirect() {
  redirect("/track/interactivo");
}
