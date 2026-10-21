"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Búsqueda por booking, cliente o ejecutivo. Mientras se escribe filtra al
// instante los renglones de la página (atributo data-buscar; los encabezados
// data-encabezado se ocultan si su sección queda vacía). Con Enter busca en
// el servidor (?q=) con navegación dura, igual que MultiSelectFilter, porque
// router.replace() no siempre aplica el cambio de query en Next 16.
export function BuscadorTrack({ placeholder = "Buscar booking, cliente o ejecutivo…" }: { placeholder?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [valor, setValor] = useState(searchParams.get("q") ?? "");

  const filtrarPantalla = (texto: string) => {
    const q = normalizar(texto);
    const visibles = new Map<string, number>();
    document.querySelectorAll<HTMLElement>("[data-buscar]").forEach((el) => {
      const ok = !q || normalizar(el.dataset.buscar ?? "").includes(q);
      el.hidden = !ok;
      const sec = el.dataset.seccion;
      if (sec) visibles.set(sec, (visibles.get(sec) ?? 0) + (ok ? 1 : 0));
    });
    document.querySelectorAll<HTMLElement>("[data-encabezado]").forEach((el) => {
      el.hidden = Boolean(q) && (visibles.get(el.dataset.encabezado ?? "") ?? 0) === 0;
    });
  };

  const buscarEnServidor = (texto: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (texto.trim()) params.set("q", texto.trim());
    else params.delete("q");
    params.delete("page");
    const s = params.toString();
    window.location.href = s ? `${pathname}?${s}` : pathname;
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        buscarEnServidor(valor);
      }}
      className="relative"
    >
      <label htmlFor="buscar-track" className="sr-only">
        Buscar booking, cliente o ejecutivo
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
        title="Filtra lo que está en pantalla; Enter busca en todo"
        autoComplete="off"
        onChange={(e) => {
          setValor(e.target.value);
          filtrarPantalla(e.target.value);
          // La ✕ del campo deja el texto vacío: si había búsqueda en el
          // servidor, se quita.
          if (!e.target.value && searchParams.get("q")) buscarEnServidor("");
        }}
        className="min-h-10 w-72 rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
      />
    </form>
  );
}
