"use client";

import { useState } from "react";
import type { CatalogoTipoContenedor } from "@/types/catalogos";

export function TipoContenedorForm({
  action,
  initialValue,
}: {
  action: (formData: FormData) => Promise<void>;
  initialValue?: CatalogoTipoContenedor;
}) {
  const [pending, setPending] = useState(false);
  const esEdicion = Boolean(initialValue);

  return (
    <form
      action={async (formData) => {
        setPending(true);
        try {
          await action(formData);
        } finally {
          setPending(false);
        }
      }}
      className="space-y-4"
    >
      <div>
        <label
          htmlFor="tipo_contenedor"
          className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Tipo Contenedor
        </label>
        <input
          id="tipo_contenedor"
          name="tipo_contenedor"
          required
          readOnly={esEdicion}
          tabIndex={esEdicion ? -1 : undefined}
          defaultValue={initialValue?.tipo_contenedor ?? ""}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
            esEdicion
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              : "border-slate-300 bg-white focus:border-slate-500 dark:border-slate-700 dark:bg-slate-800"
          }`}
        />
      </div>

      <div>
        <label
          htmlFor="teu"
          className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          TEU
        </label>
        <input
          id="teu"
          name="teu"
          type="number"
          step="0.01"
          required
          defaultValue={initialValue?.teu ?? ""}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
        />
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <a
          href="/catalogos/tipos-contenedor"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancelar
        </a>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {pending ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}
