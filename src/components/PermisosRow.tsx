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
  puede_pricing: boolean;
  puede_operaciones: boolean;
};

const SISTEMA: { field: keyof Perms; label: string }[] = [
  { field: "es_admin", label: "Admin" },
  { field: "puede_exportar", label: "Exportar" },
  { field: "puede_borrar", label: "Borrar" },
  { field: "es_master", label: "Master" },
];

const MODULOS: { field: keyof Perms; label: string }[] = [
  { field: "puede_operaciones", label: "Operaciones" },
  { field: "puede_operativos", label: "Operativos" },
  { field: "puede_ver_ventas", label: "Ventas" },
  { field: "puede_ver_crm", label: "Comercial" },
  { field: "puede_comisiones", label: "Administración" },
  { field: "puede_pricing", label: "Pricing" },
];

function resumen(perms: Perms): string {
  if (perms.es_admin) return "Administrador (acceso total)";
  const activos = [...SISTEMA, ...MODULOS]
    .filter(({ field }) => field !== "es_admin" && perms[field])
    .map(({ label }) => label);
  return activos.length > 0 ? activos.join(" · ") : "Sin permisos";
}

export function PermisosRow({
  email,
  initial,
  onChange,
}: {
  email: string;
  initial: Perms;
  onChange: (current: Perms, field: keyof Perms, value: boolean) => Promise<void>;
}) {
  const [perms, setPerms] = useState<Perms>(initial);
  const [open, setOpen] = useState(false);
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
    <>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 dark:text-slate-300">{resumen(perms)}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Editar
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-50">Permisos</p>
            <p className="mb-4 truncate text-xs text-slate-500 dark:text-slate-400">{email}</p>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Sistema
            </p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {SISTEMA.map(({ field, label }) => (
                <label key={field} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={perms[field]}
                    disabled={pending || (field !== "es_admin" && perms.es_admin)}
                    onChange={toggle(field)}
                    className="h-4 w-4 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
                  />
                  {label}
                </label>
              ))}
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Módulos (tarjetas de inicio)
            </p>
            <div className="mb-5 grid grid-cols-2 gap-2">
              {MODULOS.map(({ field, label }) => (
                <label key={field} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={perms[field]}
                    disabled={pending}
                    onChange={toggle(field)}
                    className="h-4 w-4 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
