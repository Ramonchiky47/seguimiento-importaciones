"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Búsqueda mientras se escribe (booking, cliente o ejecutivo): actualiza ?q=
// en la URL un momento después de dejar de teclear.
export function BuscadorTrack({ placeholder = "Buscar booking, cliente o ejecutivo…" }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [valor, setValor] = useState(searchParams.get("q") ?? "");
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const aplicar = (texto: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (texto.trim()) params.set("q", texto.trim());
    else params.delete("q");
    params.delete("page");
    const s = params.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  return (
    <div className="relative">
      <label htmlFor="buscar-track" className="sr-only">
        Buscar
      </label>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        id="buscar-track"
        type="search"
        value={valor}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          const texto = e.target.value;
          setValor(texto);
          if (temporizador.current) clearTimeout(temporizador.current);
          temporizador.current = setTimeout(() => aplicar(texto), 350);
        }}
        className="min-h-10 w-72 rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
      />
    </div>
  );
}
