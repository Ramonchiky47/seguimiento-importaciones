"use client";

import { useActionState } from "react";
import { entrarPortal } from "@/app/clientes/entrar/actions";

export function FormaAccesoPortal() {
  const [estado, accion, enviando] = useActionState(entrarPortal, undefined);
  const campo =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#0e6874] focus:outline-none dark:border-slate-600 dark:bg-[#14222a] dark:text-slate-100";
  return (
    <form action={accion} className="grid gap-4">
      <div className="grid gap-1">
        <label htmlFor="usuario" className="text-sm font-medium text-slate-700 dark:text-slate-300">Usuario</label>
        <input id="usuario" name="usuario" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={120} className={campo} />
      </div>
      <div className="grid gap-1">
        <label htmlFor="clave" className="text-sm font-medium text-slate-700 dark:text-slate-300">Contraseña</label>
        <input id="clave" name="clave" type="password" required autoComplete="current-password" className={campo} />
      </div>
      {estado?.error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{estado.error}</p>}
      <button type="submit" disabled={enviando} className="rounded-md bg-[#0e6874] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#0b5862] disabled:opacity-50">
        {enviando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
