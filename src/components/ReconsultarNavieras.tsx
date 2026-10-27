"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AGENTES_RASTREO, tituloAgente } from "@/lib/navieras";

// Vuelve a consultar a la naviera solo los bookings indicados (cola
// tracking_solicitudes: la Mac la atiende cada minuto) y muestra el avance.
// Con "Todas" usa todas las navieras de respaldo; con una naviera elegida, solo
// el agente de esa naviera. "Solo Hapag y Wan Hai": los pendientes de esas dos
// (piden verificación humana y fallan si su ventana de Chrome no está abierta),
// cada uno con el agente de su naviera.
type Estado = "pendiente" | "en_proceso" | "hecho" | "error";
type Lectura = { listos: number; conDato: number; terminado: boolean };

const CON_VENTANA = ["HAPAG-LLOYD", "WAN HAI"];
const conVentana = (n: string | null | undefined) => {
  const u = (n ?? "").toUpperCase();
  return u.includes("HAPAG") ? "HAPAG-LLOYD" : u.includes("WAN HAI") ? "WAN HAI" : null;
};

// enCurso: ya hay consultas pendientes (p. ej. al recargar la página).
// navieras: la naviera de cada booking (la que falló) para el botón de Hapag y Wan Hai.
export function ReconsultarNavieras({
  ids,
  enCurso = false,
  navieras = {},
}: {
  ids: number[];
  enCurso?: boolean;
  navieras?: Record<number, string | null>;
}) {
  const router = useRouter();
  const [enviado, setEnviado] = useState(enCurso);
  const [enviando, setEnviando] = useState(false);
  const [naviera, setNaviera] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lectura, setLectura] = useState<Lectura>({ listos: 0, conDato: 0, terminado: false });
  // Los que se mandaron en la última consulta (todos o solo Hapag y Wan Hai).
  const [lote, setLote] = useState<number[] | null>(null);
  const [soloVentana, setSoloVentana] = useState(false);
  const enviados = lote ?? ids;
  const idsVentana = ids.filter((i) => conVentana(navieras[i]));
  // Cada refresh del servidor trae un arreglo nuevo: el efecto depende de su contenido.
  const claveIds = enviados.join(",");
  const pct = enviados.length ? Math.round((100 * lectura.listos) / enviados.length) : 0;

  useEffect(() => {
    if (!enviado || lectura.terminado) return;
    const lista = claveIds.split(",").map(Number);
    const leer = async () => {
      const supabase = createClient();
      const [{ data: sol }, { data: nav }] = await Promise.all([
        supabase.from("tracking_solicitudes").select("id_booking, estado, solicitado_at").in("id_booking", lista),
        supabase.from("tracking_naviera").select("id_booking, ok, consultado_at").in("id_booking", lista),
      ]);
      const navPor = new Map(((nav ?? []) as { id_booking: number; ok: boolean; consultado_at: string }[]).map((x) => [x.id_booking, x]));
      const solicitudes = (sol ?? []) as { id_booking: number; estado: Estado; solicitado_at: string }[];
      // La Mac da por atendidas todas al final: cada booking cuenta como listo
      // en cuanto su naviera se consultó después de pedirlo.
      const listo = (s: (typeof solicitudes)[number]) =>
        s.estado === "hecho" || s.estado === "error" || (navPor.get(s.id_booking)?.consultado_at ?? "") > s.solicitado_at;
      setLectura({
        listos: solicitudes.filter(listo).length,
        conDato: solicitudes.filter((s) => listo(s) && navPor.get(s.id_booking)?.ok).length,
        terminado: solicitudes.length > 0 && solicitudes.every((s) => s.estado === "hecho" || s.estado === "error"),
      });
      // La columna "Ahora" de la tabla se lee en el servidor.
      router.refresh();
    };
    leer();
    const t = setInterval(leer, 5000);
    return () => clearInterval(t);
  }, [enviado, lectura.terminado, claveIds, router]);

  const enviar = async (soloHapagWanHai = false) => {
    setEnviando(true);
    setError(null);
    const supabase = createClient();
    const lista = soloHapagWanHai ? idsVentana : ids;
    for (const id of lista) {
      const nav = soloHapagWanHai ? conVentana(navieras[id]) : naviera;
      const { error: e } = nav
        ? await supabase.rpc("solicitar_tracking_naviera", { p_id_booking: id, p_naviera: nav })
        : await supabase.rpc("solicitar_tracking_naviera", { p_id_booking: id });
      if (e) {
        setError(e.message);
        break;
      }
    }
    setLote(lista);
    setSoloVentana(soloHapagWanHai);
    setLectura({ listos: 0, conDato: 0, terminado: false });
    setEnviando(false);
    setEnviado(true);
  };
  const ocupado = enviando || (enviado && !lectura.terminado);

  if (ids.length === 0) {
    return (
      <span className="rounded-md bg-green-50 px-3 py-2 text-sm font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">
        ✓ Todos actualizados
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {enviado && (
        <div className="flex min-w-56 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {lectura.terminado ? "Consulta terminada" : "Consultando a las navieras"}
            </span>
            <span className="tabular-nums text-slate-600 dark:text-slate-300">
              {pct} % · {lectura.listos} de {enviados.length}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Avance de la consulta"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
          >
            <div
              className={`h-full rounded-full transition-all ${lectura.terminado ? "bg-green-600" : "animate-pulse bg-[#c65a1f]"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span role="status" className="text-[11px] text-slate-500 dark:text-slate-400">
            {lectura.terminado
              ? `${lectura.conDato} con información, ${enviados.length - lectura.conDato} siguen sin dato.`
              : `La Mac los atiende en 1 a 2 minutos${
                  soloVentana ? " (solo Hapag y Wan Hai)" : naviera ? ` (solo ${tituloAgente(naviera)})` : ""
                }; puedes seguir trabajando.`}
          </span>
        </div>
      )}
      {error && <span className="text-xs text-red-700 dark:text-red-400">No se pudo pedir: {error}</span>}
      <label className="flex flex-col text-[11px] font-semibold text-slate-600 dark:text-slate-300">
        Consultar en
        <select
          value={naviera}
          onChange={(e) => setNaviera(e.target.value)}
          disabled={ocupado}
          className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">Todas las navieras</option>
          {AGENTES_RASTREO.map((n) => (
            <option key={n} value={n}>
              Solo {tituloAgente(n)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => enviar()}
        disabled={ocupado || ids.length === 0}
        className="min-h-10 rounded-md bg-[#16232f] px-4 text-sm font-semibold text-white hover:bg-[#22364a] disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {enviando
          ? "Enviando…"
          : ids.length === 0
            ? "Todos actualizados"
            : `Volver a consultar ${ids.length === 1 ? "el pendiente" : `los ${ids.length} pendientes`}`}
      </button>
      {idsVentana.length > 0 && (
        <button
          type="button"
          onClick={() => enviar(true)}
          disabled={ocupado}
          title={`Solo los pendientes de ${CON_VENTANA.map(tituloAgente).join(" y ")}. Abre antes su ventana de Chrome en la Mac (verificar_hapag.py y verificar_wanhai.py).`}
          className="min-h-10 rounded-md border border-[#c65a1f] px-4 text-sm font-semibold text-[#9a3f12] hover:bg-orange-50 disabled:opacity-50 dark:text-orange-300 dark:hover:bg-orange-950"
        >
          Solo Hapag y Wan Hai ({idsVentana.length})
        </button>
      )}
    </div>
  );
}
