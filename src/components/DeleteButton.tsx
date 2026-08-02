"use client";

import { useTransition } from "react";

export function DeleteButton({
  id,
  onDelete,
}: {
  id: number;
  onDelete: (id: number) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("¿Eliminar este registro? Esta acción no se puede deshacer.")) {
          startTransition(() => onDelete(id));
        }
      }}
      className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
    >
      {pending ? "Eliminando..." : "Eliminar"}
    </button>
  );
}
