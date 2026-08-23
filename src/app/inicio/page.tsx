import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { logout } from "@/app/login/actions";

export const dynamic = "force-dynamic";

function IconVentas() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c65a1f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20V13" />
      <path d="M4 20h16" />
    </svg>
  );
}

function IconOperaciones() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c65a1f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 20 7.5v9L12 21 4 16.5v-9Z" />
      <path d="M4 7.5 12 12l8-4.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

function IconComercial() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c65a1f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 13.2c2.3.3 4 2 4 4.3" />
    </svg>
  );
}

function IconCatalogos() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c65a1f" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 3 21 8l-9 5-9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </svg>
  );
}

function IconAdministracion() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c65a1f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.2 12H1.8M22.2 12h-2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" />
    </svg>
  );
}

function CardIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#c65a1f1a]">
      {children}
    </div>
  );
}

function CardShell({
  icon,
  title,
  description,
  disabled,
  fullWidth,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={`group flex w-full flex-none flex-col gap-3.5 rounded-2xl border p-6 ${fullWidth ? "sm:col-span-2" : ""} ${
        disabled
          ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40"
          : "border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:border-[#c65a1f] hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
      }`}
    >
      <CardIcon>{icon}</CardIcon>
      <div className="flex-1">
        <h2 className={`mb-1.5 text-[17px] font-bold ${disabled ? "text-slate-400 dark:text-slate-600" : "text-slate-900 dark:text-slate-50"}`}>
          {title}
        </h2>
        <p className={`text-[13.5px] leading-relaxed ${disabled ? "text-slate-400 dark:text-slate-600" : "text-slate-500 dark:text-slate-400"}`}>
          {description}
        </p>
      </div>
      {disabled ? (
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-600">Próximamente</span>
      ) : (
        <span className="text-[13px] font-semibold text-[#c65a1f] opacity-0 transition-opacity group-hover:opacity-100">
          Entrar →
        </span>
      )}
    </div>
  );
}

export default async function InicioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myPermissions = await getMyPermissions();

  const tienePermisos =
    myPermissions.es_admin ||
    myPermissions.es_master ||
    myPermissions.puede_vendedores ||
    myPermissions.puede_operativos ||
    myPermissions.puede_exportar ||
    myPermissions.puede_borrar ||
    myPermissions.puede_accesos;

  if (!tienePermisos) {
    redirect("/sin-acceso");
  }

  const showVentas = myPermissions.es_admin || myPermissions.puede_vendedores;
  const showCatalogos = myPermissions.es_admin || myPermissions.puede_operativos;
  const showAdministracion = myPermissions.es_admin;
  const showComercial = myPermissions.es_admin;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="bg-[#16232f] text-slate-300 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-8 py-3.5">
          <div className="flex shrink-0 items-center gap-2.5">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c65a1f" strokeWidth="1.6">
              <circle cx="12" cy="12" r="9" />
              <path d="M15.5 8.5 11 11 8.5 15.5 13 13Z" fill="#c65a1f" stroke="none" />
            </svg>
            <span className="text-[15px] font-bold text-white">TrackAv2</span>
          </div>
          <div className="ml-auto flex items-center gap-5">
            {user?.email && <span className="hidden text-xs text-slate-400 md:inline">{user.email}</span>}
            <form action={logout}>
              <button type="submit" className="text-[13px] font-medium text-slate-300 hover:text-white">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-20">
        <div className="mb-10">
          <h1 className="mb-2 text-[28px] font-bold text-slate-900 dark:text-slate-50">¿Qué quieres hacer hoy?</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Elige un módulo para continuar.</p>
        </div>

        <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          {showVentas ? (
            <a
              href={`/api/sso/reporte-ventas?next=${encodeURIComponent("/dashboard?panel=ventas")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="contents"
            >
              <CardShell
                icon={<IconVentas />}
                title="Reporte de Ventas"
                description="Información de ventas y reportes por plaza y vendedor."
              />
            </a>
          ) : (
            <CardShell
              icon={<IconVentas />}
              title="Reporte de Ventas"
              description="Métricas y resultados comerciales del equipo."
              disabled
            />
          )}

          <Link href="/dashboard" className="contents">
            <CardShell
              icon={<IconOperaciones />}
              title="Operaciones"
              description="Seguimiento operativo de embarques e importaciones."
            />
          </Link>

          {showComercial ? (
            <a
              href={`/api/sso/comercial?next=${encodeURIComponent("/crm/inicio?panel=comercial")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="contents"
            >
              <CardShell
                icon={<IconComercial />}
                title="Comercial"
                description="Clientes, contactos y cotizaciones."
              />
            </a>
          ) : (
            <CardShell
              icon={<IconComercial />}
              title="Comercial"
              description="Clientes, contactos y cotizaciones."
              disabled
            />
          )}

          {showAdministracion ? (
            <a
              href={`/api/sso/administracion?next=${encodeURIComponent("/comisiones?panel=admin")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="contents"
            >
              <CardShell
                icon={<IconAdministracion />}
                title="Administración"
                description="Comisiones y comisiones acotadas."
              />
            </a>
          ) : (
            <CardShell
              icon={<IconAdministracion />}
              title="Administración"
              description="Accesos, permisos y ajustes del sistema."
              disabled
            />
          )}

          {showCatalogos ? (
            <Link href="/catalogos" className="contents">
              <CardShell
                icon={<IconCatalogos />}
                title="Catálogos"
                description="Datos maestros que alimentan al sistema."
                fullWidth
              />
            </Link>
          ) : (
            <CardShell
              icon={<IconCatalogos />}
              title="Catálogos"
              description="Datos maestros que alimentan al sistema."
              disabled
              fullWidth
            />
          )}
        </div>
      </main>

      <div className="w-full py-0.5 text-center text-[11px] text-slate-400 dark:text-slate-600">
        Creado por Ing Ramon Villanueva
      </div>
    </div>
  );
}
