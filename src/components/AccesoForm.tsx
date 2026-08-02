"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";

export function AccesoForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [esAdmin, setEsAdmin] = useState(false);

  return (
    <form
      action={async (formData) => {
        setPending(true);
        setErrorMsg(null);
        try {
          await action(formData);
        } catch (err) {
          unstable_rethrow(err);
          setErrorMsg(err instanceof Error ? err.message : "Error al crear el acceso.");
        } finally {
          setPending(false);
        }
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Mínimo 6 caracteres.</p>
      </div>

      <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <input
            id="es_admin"
            name="es_admin"
            type="checkbox"
            checked={esAdmin}
            onChange={(e) => setEsAdmin(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
          />
          <label htmlFor="es_admin" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Administrador
          </label>
        </div>
        <p className="mb-3 mt-1 text-xs text-slate-400 dark:text-slate-500">
          Un administrador tiene acceso a todo: todos los catálogos (Vendedores, Operativos, Accesos), exportar y
          borrar. Las casillas de abajo se ignoran si esta está marcada.
        </p>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              id="puede_exportar"
              name="puede_exportar"
              type="checkbox"
              disabled={esAdmin}
              defaultChecked={false}
              className="h-4 w-4 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
            />
            <label htmlFor="puede_exportar" className="text-sm text-slate-700 dark:text-slate-300">
              Puede exportar (CSV / PDF)
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="puede_borrar"
              name="puede_borrar"
              type="checkbox"
              disabled={esAdmin}
              defaultChecked={false}
              className="h-4 w-4 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
            />
            <label htmlFor="puede_borrar" className="text-sm text-slate-700 dark:text-slate-300">
              Puede borrar registros
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="puede_operativos"
              name="puede_operativos"
              type="checkbox"
              disabled={esAdmin}
              defaultChecked={false}
              className="h-4 w-4 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
            />
            <label htmlFor="puede_operativos" className="text-sm text-slate-700 dark:text-slate-300">
              Puede entrar al catálogo de Operativos
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="es_master"
              name="es_master"
              type="checkbox"
              disabled={esAdmin}
              defaultChecked={false}
              className="h-4 w-4 rounded border-slate-300 disabled:opacity-50 dark:border-slate-600"
            />
            <label htmlFor="es_master" className="text-sm text-slate-700 dark:text-slate-300">
              Master (ve todos los registros, aunque sea un operativo)
            </label>
          </div>
        </div>
      </div>

      {errorMsg && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {errorMsg}
        </p>
      )}

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <a
          href="/catalogos/accesos"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancelar
        </a>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {pending ? "Creando..." : "Crear acceso"}
        </button>
      </div>
    </form>
  );
}
