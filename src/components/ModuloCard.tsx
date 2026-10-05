// Tarjetas de módulo de /inicio y /pricing.

export function IconPricing() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c65a1f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.6 3.5H5a1.5 1.5 0 0 0-1.5 1.5v7.6c0 .4.16.78.44 1.06l8.9 8.9c.58.58 1.53.58 2.12 0l7.6-7.6c.58-.58.58-1.53 0-2.12l-8.9-8.9a1.5 1.5 0 0 0-1.06-.44Z" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="#c65a1f" stroke="none" />
    </svg>
  );
}

export function IconTransporteTerrestre() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c65a1f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 16V7a1 1 0 0 1 1-1h9v10" />
      <path d="M13 10h4l4 3v3h-2" />
      <path d="M3 16h1" />
      <circle cx="7.5" cy="16.5" r="1.8" />
      <circle cx="17.5" cy="16.5" r="1.8" />
    </svg>
  );
}

export function IconPricingMaritimo() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c65a1f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17h18l-2.5 3.5h-13Z" />
      <path d="M6 17V11h12v6" />
      <path d="M9 11V7h6v4" />
      <path d="M17.5 4.5 21 3l-1.5 3.5" />
    </svg>
  );
}

export function IconTransporteNacional() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#c65a1f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
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

export function CardShell({
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
