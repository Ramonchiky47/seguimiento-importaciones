"use client";

import { useTransition } from "react";

export function CatalogoDeleteButton({
  id,
  onDelete,
  confirmMessage = "¿Eliminar este registro del catálogo?",
}: {
  id: number;
  onDelete: (id: number) => Promise<void>;
  confirmMessage?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(confirmMessage)) {
          startTransition(() => onDelete(id));
        }
      }}
      className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
    >
      {pending ? "Eliminando..." : "Eliminar"}
    </button>
  );
}
