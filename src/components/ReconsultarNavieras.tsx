"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Vuelve a consultar a la naviera solo los bookings indicados (cola
// tracking_solicitudes: la Mac la atiende cada minuto, con todas las navieras
// de respaldo) y muestra cómo van.
type Estado = "pendiente" | "en_proceso" | "hecho" | "error";

// enCurso: ya hay consultas pendientes (p. ej. al recargar la página).
export function ReconsultarNavieras({ ids, enCurso = false }: { ids: number[]; enCurso?: boolean }) {
  const router = useRouter();
  const [enviado, setEnviado] = useState(enCurso);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estados, setEstados] = useState<Record<number, Estado>>({});

  const conteo = Object.values(estados).reduce<Record<Estado, number>>(
    (a, e) => ({ ...a, [e]: a[e] + 1 }),
    { pendiente: 0, en_proceso: 0, hecho: 0, error: 0 },
  );
  const terminado = enviado && conteo.hecho + conteo.error === ids.length;
  // Cada refresh del servidor trae un arreglo nuevo: el efecto depende de su contenido.
  const claveIds = ids.join(",");

  useEffect(() => {
    if (!enviado || terminado) return;
    const lista = claveIds.split(",").map(Number);
    const leer = async () => {
      const { data } = await createClient().from("tracking_solicitudes").select("id_booking, estado").in("id_booking", lista);
      setEstados(Object.fromEntries(((data ?? []) as { id_booking: number; estado: Estado }[]).map((x) => [x.id_booking, x.estado])));
      // La columna "Ahora" de la tabla se lee en el servidor.
      router.refresh();
    };
    leer();
    const t = setInterval(leer, 5000);
    return () => clearInterval(t);
  }, [enviado, terminado, claveIds, router]);

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    const supabase = createClient();
    for (const id of ids) {
      const { error: e } = await supabase.rpc("solicitar_tracking_naviera", { p_id_booking: id });
      if (e) {
        setError(e.message);
        break;
      }
    }
    setEnviando(false);
    setEnviado(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {enviado && (
        <span role="status" className="text-xs text-slate-600 dark:text-slate-400">
          {terminado
            ? `Listo: ${conteo.hecho} con información, ${conteo.error} siguen sin dato (abre cada booking para ver el detalle).`
            : `Consultando… ${conteo.hecho + conteo.error} de ${ids.length} (la Mac los atiende en 1 a 2 minutos; puedes seguir trabajando).`}
        </span>
      )}
      {error && <span className="text-xs text-red-700 dark:text-red-400">No se pudo pedir: {error}</span>}
      <button
        type="button"
        onClick={enviar}
        disabled={enviando || (enviado && !terminado) || ids.length === 0}
        className="min-h-10 rounded-md bg-[#16232f] px-4 text-sm font-semibold text-white hover:bg-[#22364a] disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {enviando ? "Enviando…" : `Volver a consultar estos ${ids.length}`}
      </button>
    </div>
  );
}
