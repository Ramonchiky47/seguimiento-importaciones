"use client";

import { useRef, useState } from "react";

export function IncidenciaForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        setPending(true);
        try {
          await action(formData);
          formRef.current?.reset();
        } finally {
          setPending(false);
        }
      }}
      className="flex gap-2"
    >
      <textarea
        name="texto"
        required
        rows={2}
        placeholder="Escribe una nueva incidencia..."
        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
      />
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 self-start rounded-md bg-slate-900 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
      >
        {pending ? "Agregando..." : "Agregar"}
      </button>
    </form>
  );
}
