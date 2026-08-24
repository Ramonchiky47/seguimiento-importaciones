"use client";

import { useState, useTransition } from "react";

type Perms = {
  es_admin: boolean;
  puede_exportar: boolean;
  puede_borrar: boolean;
  puede_operativos: boolean;
  es_master: boolean;
  puede_ver_ventas: boolean;
  puede_ver_crm: boolean;
  puede_comisiones: boolean;
};

export function PermisosRow({
  initial,
  onChange,
}: {
  initial: Perms;
  onChange: (current: Perms, field: keyof Perms, value: boolean) => Promise<void>;
}) {
  const [perms, setPerms] = useState<Perms>(initial);
  const [pending, startTransition] = useTransition();

  const toggle = (field: keyof Perms) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.checked;
    const prev = perms;
    setPerms((p) => ({ ...p, [field]: value }));
    startTransition(async () => {
      try {
        await onChange(prev, field, value);
      } catch (err) {
        setPerms(prev);
        alert(err instanceof Error ? err.message : "Error al actualizar permisos.");
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-3">
      <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={perms.es_admin}
          disabled={pending}
          onChange={toggle("es_admin")}
          className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600"
        />
        Admin
      </label>
      <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={perms.puede_exportar}
          disabled={pending || perms.es_admin}
          onChange={toggle("puede_exportar")}
          className="h-3.5 w-3.5 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
        />
        Exportar
      </label>
      <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={perms.puede_borrar}
          disabled={pending || perms.es_admin}
          onChange={toggle("puede_borrar")}
          className="h-3.5 w-3.5 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
        />
        Borrar
      </label>
      <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={perms.puede_operativos}
          disabled={pending || perms.es_admin}
          onChange={toggle("puede_operativos")}
          className="h-3.5 w-3.5 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
        />
        Operativos
      </label>
      <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={perms.es_master}
          disabled={pending || perms.es_admin}
          onChange={toggle("es_master")}
          className="h-3.5 w-3.5 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
        />
        Master
      </label>
      <span className="mx-1 hidden h-3.5 w-px bg-slate-200 sm:inline-block dark:bg-slate-700" />
      <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={perms.puede_ver_ventas}
          disabled={pending || perms.es_admin}
          onChange={toggle("puede_ver_ventas")}
          className="h-3.5 w-3.5 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
        />
        Ventas
      </label>
      <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={perms.puede_ver_crm}
          disabled={pending || perms.es_admin}
          onChange={toggle("puede_ver_crm")}
          className="h-3.5 w-3.5 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
        />
        Comercial
      </label>
      <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={perms.puede_comisiones}
          disabled={pending || perms.es_admin}
          onChange={toggle("puede_comisiones")}
          className="h-3.5 w-3.5 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
        />
        Administración
      </label>
    </div>
  );
}
