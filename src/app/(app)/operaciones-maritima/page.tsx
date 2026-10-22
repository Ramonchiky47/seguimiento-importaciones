import { OperacionesMaritimaVista } from "./OperacionesMaritimaVista";

export const dynamic = "force-dynamic";
// El botón Actualizar descarga de Cargolink dentro de esta página.
export const maxDuration = 300;

export default function OperacionesMaritimaPage(props: Parameters<typeof OperacionesMaritimaVista>[0]) {
  return <OperacionesMaritimaVista searchParams={props.searchParams} />;
}
