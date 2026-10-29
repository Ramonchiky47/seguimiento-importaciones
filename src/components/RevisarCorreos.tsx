"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// "Revisar correos" (Track › Info correos): pide a la Mac que lea los correos
// con booking en el asunto (correos_agente.py vía procesos_solicitudes) y
// muestra cómo va la última revisión (rastreo_procesos, proceso "correos").
type Corrida = { estado: "corriendo" | "terminado" | "error"; total: number | null; hechos: number; etapa: string | null; mensaje: string | null; inicio: string; fin: string | null };

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function RevisarCorreos({ esAdmin }: { esAdmin: boolean }) {
  const router = useRouter();
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [pedido, setPedido] = useState<{ cargando: boolean; texto: string | null }>({ cargando: false, texto: null });
  const [esperando, setEsperando] = useState(false);
  const corriendo = corrida?.estado === "corriendo";

  useEffect(() => {
    let vigente = true;
    let antes: string | null = null;
    const leer = () =>
      createClient()
        .from("rastreo_procesos")
        .select("estado, total, hechos, etapa, mensaje, inicio, fin")
        .eq("proceso", "correos")
        .order("inicio", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (!vigente) return;
          const c = (data as Corrida | null) ?? null;
          setCorrida(c);
          // Al terminar una revisión, se recarga la lista de correos.
          const clave = c ? `${c.inicio}:${c.estado}` : null;
          if (antes && clave !== antes && c?.estado !== "corriendo") router.refresh();
          antes = clave;
          if (c?.estado === "corriendo") setEsperando(false);
        });
    leer();
    const t = setInterval(leer, corriendo || esperando ? 5000 : 60000);
    return () => {
      vigente = false;
      clearInterval(t);
    };
  }, [corriendo, esperando, router]);

  const texto = !corrida
    ? "Todavía no se han revisado correos desde aquí."
    : corrida.estado === "corriendo"
      ? `Revisando… ${corrida.total ? `${corrida.hechos} de ${corrida.total} correos` : (corrida.etapa ?? "")}`
      : corrida.estado === "error"
        ? `Falló ${hora(corrida.fin ?? corrida.inicio)}: ${corrida.mensaje ?? ""}`
        : `Última revisión ${hora(corrida.fin ?? corrida.inicio)}${corrida.mensaje ? ` · ${corrida.mensaje}` : ""}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`text-xs ${corrida?.estado === "error" ? "font-semibold text-red-700 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>{texto}</span>
      {esAdmin && (
        <button
          type="button"
          disabled={pedido.cargando || corriendo}
          onClick={async () => {
            setPedido({ cargando: true, texto: null });
            const { data, error } = await createClient().rpc("solicitar_proceso", { p_proceso: "correos" });
            const r = String(data ?? "");
            setPedido({
              cargando: false,
              texto: error
                ? `No se pudo pedir: ${error.message}`
                : r === "corriendo"
                  ? "Ya se están revisando."
                  : r === "pendiente"
                    ? "Ya estaba pedido: arranca en menos de 1 minuto."
                    : "Pedido: la Mac revisa los correos en menos de 1 minuto.",
            });
            if (!error) setEsperando(true);
          }}
          className="min-h-10 rounded-md bg-[#16232f] px-3 text-sm font-semibold text-white hover:bg-[#22364a] disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {pedido.cargando ? "Pidiendo…" : corriendo ? "Revisando…" : "Revisar correos"}
        </button>
      )}
      {pedido.texto && (
        <span role="status" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {pedido.texto}
        </span>
      )}
    </div>
  );
}
