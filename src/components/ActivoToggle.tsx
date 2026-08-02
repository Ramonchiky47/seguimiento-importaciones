"use client";

import { useTransition } from "react";

export function ActivoToggle({
  id,
  activo,
  onToggle,
}: {
  id: string | number;
  activo: boolean;
  onToggle: (id: string | number, activo: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      defaultChecked={activo}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.checked;
        startTransition(() => onToggle(id, next));
      }}
      className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
    />
  );
}
