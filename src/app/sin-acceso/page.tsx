import { logout } from "@/app/login/actions";

export default function SinAccesoPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="#c65a1f"
          strokeWidth="1.6"
          aria-hidden="true"
          className="mx-auto mb-3"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M15.5 8.5 11 11 8.5 15.5 13 13Z" fill="#c65a1f" stroke="none" />
        </svg>
        <h1 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-50">Sin acceso asignado</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Tu cuenta no tiene ningún permiso activo todavía. Pide a un administrador que te asigne acceso
          desde Catálogos → Accesos.
        </p>
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-md bg-[#16232f] px-3 py-2 text-sm font-medium text-white hover:bg-[#223244]"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
