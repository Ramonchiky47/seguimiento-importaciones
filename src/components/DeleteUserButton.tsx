"use client";

import { useTransition } from "react";

export function DeleteUserButton({
  id,
  email,
  onDelete,
}: {
  id: string;
  email: string;
  onDelete: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    if (!confirm(`¿Eliminar el acceso de ${email}? Esta acción no se puede deshacer.`)) {
      return;
    }
    startTransition(async () => {
      try {
        await onDelete(id);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al eliminar el acceso.");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
    >
      {pending ? "Eliminando..." : "Eliminar"}
    </button>
  );
}
