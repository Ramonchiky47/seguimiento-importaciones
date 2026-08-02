"use client";

import { useState } from "react";

export function PasswordEditor({
  id,
  onSave,
}: {
  id: string;
  onSave: (id: string, newPassword: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
      >
        Editar contraseña
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Nueva contraseña"
          minLength={6}
          className="w-36 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          type="button"
          disabled={pending || value.length < 6}
          onClick={async () => {
            setPending(true);
            setErrorMsg(null);
            try {
              await onSave(id, value);
              setOpen(false);
              setValue("");
            } catch (err) {
              setErrorMsg(err instanceof Error ? err.message : "Error al cambiar la contraseña.");
            } finally {
              setPending(false);
            }
          }}
          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {pending ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setValue("");
            setErrorMsg(null);
          }}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
      </div>
      {errorMsg && <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>}
    </div>
  );
}
