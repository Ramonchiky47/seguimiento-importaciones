import { BocetoBooking } from "./BocetoBooking";

export const dynamic = "force-dynamic";

// Boceto (datos de ejemplo) de la ventana del booking guiada por fases. No
// lee ni escribe en Cargolink; solo para probar el diseño con los operadores.
export default function BocetoPage() {
  return <BocetoBooking />;
}
