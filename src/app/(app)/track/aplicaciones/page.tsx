import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Aplicaciones por etapa y por día (Ramón, 9 nov 2026): lo que se guarda en Cargolink
// desde la app (Aplicación por sistema vs. operativos) y lo que se hace directo en
// Cargolink (cambios de estatus del historial de movimientos que no vinieron de la app).

const INICIO = "2026-10-19";
// Etapas en el orden de Cargolink: clave en la bitácora de la app, his_mov_*, nombre.
const ETAPAS: [string, string, string][] = [
  ["origen", "origen", "Origen"],
  ["mercancia", "mercancia", "Mercancía"],
  ["seguro", "seguro", "Seguro"],
  ["atd", "atd", "ATD"],
  ["aviso_atd", "aviso_atd", "Aviso ATD"],
  ["eta", "eta", "ETA"],
  ["aviso_eta", "alertFech", "Aviso ETA"],
  ["transbordo", "transbordo", "Transbordo"],
  ["manifiesto", "manifiesto", "Manifiesto"],
  ["kpi", "kpi", "KPI arribo"],
  ["hbl", "hbl_telex", "Telex HBL"],
  ["mbl", "mbl_telex", "Telex MBL"],
  ["rev", "rev", "Revalidación"],
  ["ata", "ata", "ATA"],
  ["aviso_ata", "alertAta", "Aviso ATA"],
  ["demoras", "demoras", "KPI demoras"],
  ["vacio", "entrega_vacio", "Vacío"],
];
const POR_APP = new Map(ETAPAS.map(([a, , n]) => [a, n]));
const POR_MOV = new Map(ETAPAS.map(([, m, n]) => [m, n]));
const MES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
const SEM = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
type Fuente = "S" | "O" | "C";
type Cuenta = Record<Fuente, number>;
const FUENTES: { k: Fuente; label: string; chip: string; barra: string }[] = [
  {
    k: "S",
    label: "Sistema (automático)",
    chip: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    barra: "bg-blue-600",
  },
  {
    k: "O",
    label: "Operativo desde la app",
    chip: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    barra: "bg-green-600",
  },
  {
    k: "C",
    label: "Directo en Cargolink",
    chip: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    barra: "bg-slate-400",
  },
];

const diaMx = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(
    new Date(iso),
  );
const sumar = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
const etiquetaDia = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`);
  return `${SEM[d.getUTCDay()]} ${d.getUTCDate()} ${MES[d.getUTCMonth()]}`;
};
const esFin = (dia: string) =>
  [0, 6].includes(new Date(`${dia}T12:00:00Z`).getUTCDay());
// Cuenta de Ramón y "Aplicación por sistema" = sistema (memoria: cuenta de Ramón = sistema).
const esSistema = (nombre: string | null, email: string | null) => {
  const n = (nombre ?? "").trim().toUpperCase();
  return (
    n === "APLICACIÓN POR SISTEMA" ||
    n === "SISTEMA" ||
    (email ?? "").toLowerCase() === "ramonf.villanueva@gmail.com"
  );
};

function Celda({ c, total: esTotal = false }: { c: Cuenta; total?: boolean }) {
  return c.S + c.O + c.C === 0 ? (
    <td className="px-1 py-0.5 text-center text-slate-300 dark:text-slate-600">
      ·
    </td>
  ) : (
    <td
      className={`px-1 py-0.5 text-center whitespace-nowrap ${esTotal ? "bg-slate-50 dark:bg-slate-800/60" : ""}`}
    >
      {FUENTES.map((f) =>
        c[f.k] ? (
          <span
            key={f.k}
            className={`mx-px inline-block min-w-5 rounded px-1 text-[11px] font-bold tabular-nums ${f.chip}`}
          >
            {c[f.k]}
          </span>
        ) : (
          <span
            key={f.k}
            className="mx-px inline-block min-w-5 text-[11px] text-slate-300 dark:text-slate-600"
          >
            ·
          </span>
        ),
      )}
    </td>
  );
}

async function todo<T>(
  consulta: (
    desde: number,
    hasta: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const filas: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await consulta(i, i + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return filas;
  }
}

export default async function AplicacionesPage() {
  const supabase = await createClient();
  const hoy = diaMx(new Date().toISOString());
  const desdeUtc = new Date(`${INICIO}T06:00:00Z`).toISOString();
  const [app, cl] = await Promise.all([
    todo<{
      id_booking: number;
      etapa: string;
      usuario_nombre: string | null;
      usuario_email: string | null;
      created_at: string;
    }>((a, b) =>
      supabase
        .from("bitacora_cargolink")
        .select("id_booking, etapa, usuario_nombre, usuario_email, created_at")
        .eq("ok", true)
        .gte("created_at", desdeUtc)
        .order("id")
        .range(a, b),
    ),
    todo<{ id_booking: number; campo: string; fecha_cargolink: string | null }>(
      (a, b) =>
        supabase
          .from("bitacora_cambios_cargolink")
          .select("id_booking, campo, fecha_cargolink")
          .like("campo", "his_mov%")
          .gte("fecha_cargolink", INICIO)
          .order("id")
          .range(a, b),
    ),
  ]);

  const celdas = new Map<string, Cuenta>();
  const cuenta = (dia: string, etapa: string) => {
    const k = `${dia}|${etapa}`;
    if (!celdas.has(k)) celdas.set(k, { S: 0, O: 0, C: 0 });
    return celdas.get(k)!;
  };
  const deLaApp = new Set<string>();
  for (const f of app) {
    const etapa = POR_APP.get(f.etapa);
    if (!etapa) continue;
    const dia = diaMx(f.created_at);
    if (dia > hoy) continue;
    cuenta(dia, etapa)[
      esSistema(f.usuario_nombre, f.usuario_email) ? "S" : "O"
    ] += 1;
    deLaApp.add(`${f.id_booking}|${etapa}|${dia}`);
  }
  let descartados = 0;
  for (const f of cl) {
    const etapa = POR_MOV.get(f.campo.slice(8));
    const dia = String(f.fecha_cargolink ?? "").slice(0, 10);
    if (!etapa || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia > hoy) continue;
    // Cambio de estatus que hizo la app (mismo booking y etapa, ese día o el de junto): no es directo.
    if (
      [0, -1, 1].some((n) =>
        deLaApp.has(`${f.id_booking}|${etapa}|${sumar(dia, n)}`),
      )
    ) {
      descartados += 1;
      continue;
    }
    cuenta(dia, etapa).C += 1;
  }

  const dias: string[] = [];
  for (let d = INICIO; d <= hoy; d = sumar(d, 1)) dias.push(d);
  const vacio: Cuenta = { S: 0, O: 0, C: 0 };
  const v = (dia: string, etapa: string) =>
    celdas.get(`${dia}|${etapa}`) ?? vacio;
  const suma = (lista: Cuenta[]): Cuenta =>
    lista.reduce((a, c) => ({ S: a.S + c.S, O: a.O + c.O, C: a.C + c.C }), {
      S: 0,
      O: 0,
      C: 0,
    });
  const porEtapa = new Map(
    ETAPAS.map(([, , n]) => [n, suma(dias.map((d) => v(d, n)))]),
  );
  const columnas = ETAPAS.map(([, , n]) => n).filter((n) => {
    const t = porEtapa.get(n)!;
    return t.S + t.O + t.C > 0;
  });
  const porDia = new Map(
    dias.map((d) => [d, suma(columnas.map((n) => v(d, n)))]),
  );
  const T = suma([...porDia.values()]);
  const total = T.S + T.O + T.C;
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
  const maxDia = Math.max(
    1,
    ...[...porDia.values()].map((c) => c.S + c.O + c.C),
  );
  const hoyC = porDia.get(hoy) ?? vacio;

  return (
    <main className="mx-auto max-w-[96rem] space-y-5 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
          Aplicaciones por etapa
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Del {etiquetaDia(INICIO)} a hoy ({etiquetaDia(hoy)}), al momento. Qué
          etapas se guardan en Cargolink desde la app (solas o por los
          operativos) y cuáles se hacen directo en Cargolink.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            n: T.S,
            t: "Aplicación por sistema",
            d: `hoy ${hoyC.S}`,
            c: "text-blue-700 dark:text-blue-400",
          },
          {
            n: T.O,
            t: "Operativos desde la app",
            d: `hoy ${hoyC.O}`,
            c: "text-green-700 dark:text-green-400",
          },
          {
            n: T.C,
            t: "Directo en Cargolink",
            d: `hoy ${hoyC.C}`,
            c: "text-slate-700 dark:text-slate-200",
          },
          {
            n: `${pct(T.S + T.O, total)} %`,
            t: "Hecho desde la app",
            d: `${(T.S + T.O).toLocaleString("es-MX")} de ${total.toLocaleString("es-MX")}`,
            c: "text-slate-900 dark:text-slate-50",
          },
        ].map((x) => (
          <div
            key={x.t}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 dark:border-slate-600 dark:bg-slate-900"
          >
            <p className={`text-2xl font-bold tabular-nums ${x.c}`}>
              {typeof x.n === "number" ? x.n.toLocaleString("es-MX") : x.n}
            </p>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {x.t}
            </p>
            <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
              {x.d}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            Avance diario
          </h2>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
            {FUENTES.map((f) => (
              <span key={f.k} className="inline-flex items-center gap-1.5">
                <span
                  className={`size-2.5 rounded-sm ${f.barra}`}
                  aria-hidden="true"
                />
                {f.label}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="flex h-48 min-w-[44rem] items-end gap-1 border-b border-slate-200 dark:border-slate-700">
            {dias.map((d) => {
              const c = porDia.get(d)!;
              const t = c.S + c.O + c.C;
              return (
                <div
                  key={d}
                  className="group relative flex h-full flex-1 flex-col justify-end"
                  title={`${etiquetaDia(d)}: sistema ${c.S}, operativos ${c.O}, Cargolink ${c.C} · ${pct(c.S + c.O, t)} % desde la app`}
                >
                  <span className="mb-0.5 text-center text-[10px] text-slate-500 tabular-nums dark:text-slate-400">
                    {t || ""}
                  </span>
                  <div
                    className="flex flex-col-reverse overflow-hidden rounded-t"
                    style={{ height: `${(100 * t) / maxDia}%` }}
                  >
                    {FUENTES.map((f) =>
                      c[f.k] ? (
                        <div
                          key={f.k}
                          className={f.barra}
                          style={{ height: `${(100 * c[f.k]) / t}%` }}
                        />
                      ) : null,
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex min-w-[44rem] gap-1 pt-1">
            {dias.map((d) => (
              <span
                key={d}
                className={`flex-1 text-center text-[10px] leading-tight ${esFin(d) ? "text-slate-400" : "text-slate-600 dark:text-slate-300"}`}
              >
                {etiquetaDia(d).split(" ")[1]}
                <br />
                {etiquetaDia(d).split(" ")[0]}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            Por día y por etapa
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cada celda:{" "}
            <span className={`rounded px-1 font-bold ${FUENTES[0].chip}`}>
              sistema
            </span>{" "}
            <span className={`rounded px-1 font-bold ${FUENTES[1].chip}`}>
              operativo
            </span>{" "}
            <span className={`rounded px-1 font-bold ${FUENTES[2].chip}`}>
              Cargolink
            </span>{" "}
            · el día más reciente arriba
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left dark:bg-slate-800">
                  Día
                </th>
                {columnas.map((n) => (
                  <th
                    key={n}
                    className="px-1 py-2 text-center font-semibold whitespace-nowrap"
                  >
                    {n}
                  </th>
                ))}
                <th className="px-2 py-2 text-center">Total</th>
                <th className="px-2 py-2 text-center">% app</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {[...dias].reverse().map((d) => {
                const c = porDia.get(d)!;
                return (
                  <tr
                    key={d}
                    className={
                      esFin(d) ? "bg-slate-50/70 dark:bg-slate-800/40" : ""
                    }
                  >
                    <th className="sticky left-0 bg-inherit px-3 py-0.5 text-left text-xs font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200">
                      {etiquetaDia(d)}
                    </th>
                    {columnas.map((n) => (
                      <Celda key={n} c={v(d, n)} />
                    ))}
                    <Celda c={c} total />
                    <td className="px-2 text-center text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                      {c.S + c.O + c.C
                        ? `${pct(c.S + c.O, c.S + c.O + c.C)} %`
                        : "·"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 dark:border-slate-600">
              <tr>
                <th className="sticky left-0 bg-white px-3 py-1 text-left text-xs font-bold dark:bg-slate-900">
                  Total
                </th>
                {columnas.map((n) => (
                  <Celda key={n} c={porEtapa.get(n)!} total />
                ))}
                <Celda c={T} total />
                <td className="px-2 text-center text-xs font-bold tabular-nums">
                  {pct(T.S + T.O, total)} %
                </td>
              </tr>
              <tr>
                <th className="sticky left-0 bg-white px-3 py-1 text-left text-xs font-semibold text-slate-500 dark:bg-slate-900">
                  % desde la app
                </th>
                {columnas.map((n) => {
                  const t = porEtapa.get(n)!;
                  return (
                    <td
                      key={n}
                      className="px-1 py-1 text-center text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300"
                    >
                      {pct(t.S + t.O, t.S + t.O + t.C)} %
                    </td>
                  );
                })}
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <p className="max-w-4xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        <b>Cómo se cuenta.</b> <b>Sistema</b> y <b>Operativo</b>: cada guardado
        correcto en Cargolink hecho desde Track (Bitácora), según quién lo hizo;
        &quot;Aplicación por sistema&quot; es lo que Track aplica solo.{" "}
        <b>Cargolink</b>: cada cambio de estatus de una etapa en el historial de
        movimientos de Cargolink (Sin comenzar → En edición → Finalizado) que no
        vino de la app; se descartaron {descartados} cambios que coinciden con
        un guardado de la app. Una corrección de fecha desde la app que no
        cambia el estatus no aparece en el historial de Cargolink. No incluye la
        asignación de ejecutivo.
      </p>
    </main>
  );
}
