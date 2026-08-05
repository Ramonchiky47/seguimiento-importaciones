"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Se suscribe a cambios en tiempo real de la tabla y refresca la vista
// (sin recargar la página) para que un cambio de un compañero se vea sin
// tener que recargar manualmente. El debounce evita refrescar de golpe
// cientos de veces cuando alguien corre una sincronización masiva.
export function RealtimeRefresher({ table }: { table: string }) {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Realtime evalúa RLS con el token de sesión del cliente — sin esto,
      // el socket se conecta y "suscribe" pero nunca entrega cambios porque
      // usa el rol anónimo por default.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`realtime-${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
              router.refresh();
            }, 1000);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [table, router]);

  return null;
}
