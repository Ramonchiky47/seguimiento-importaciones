"use client";

// Historial de cambios: lista priorizada de solicitudes, alta de nuevas y detalle
// con edición, cierre (Listo / Pospuesto / Cancelado), historial y conversación.

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { comentarSolicitud, crearSolicitud, editarSolicitud, eventosSolicitud, moverSolicitud } from "./actions";
import {
  CAMPO_TXT,
  ESTADO_TXT,
  PRIORIDAD_TXT,
  type EstadoCambio,
  type EventoCambio,
  type Prioridad,
  type SolicitudCambio,
} from "./tipos";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fc = (d: string | null) => {
  if (!d) return "—";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${Number(dd)} ${MES[Number(m) - 1]} ${y}`;
};
const fh = (ts: string) =>
  new Date(ts).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const nombreUsuario = (email: string) => email.split("@")[0];
const activo = (e: EstadoCambio) => e === "pendiente" || e === "en_proceso";

const PILL_ESTADO: Record<EstadoCambio, string> = {
  pendiente: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  en_proceso: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  listo: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  pospuesto: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  cancelado: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};
const PUNTO_PRIORIDAD: Record<Prioridad, string> = { alta: "bg-red-600", media: "bg-amber-500", baja: "bg-slate-400" };

type Filtro = "activos" | "listo" | "pospuesto" | "cancelado" | "todos";
const FILTROS: { k: Filtro; t: string }[] = [
  { k: "activos", t: "Activos" },
  { k: "listo", t: "Listos" },
  { k: "pospuesto", t: "Pospuestos" },
  { k: "cancelado", t: "Cancelados" },
  { k: "todos", t: "Todos" },
];

const campo =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const etiqueta = "grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300";
const boton =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const botonOscuro = "rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900";

export function HistorialCambios({ solicitudes, hoy, usuario }: { solicitudes: SolicitudCambio[]; hoy: string; usuario: string }) {
  const [filtro, setFiltro] = useState<Filtro>("activos");
  const [buscar, setBuscar] = useState("");
  const [nueva, setNueva] = useState(false);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [pendiente, start] = useTransition();

  const cuenta = useMemo(() => {
    const c: Record<Filtro, number> = { activos: 0, listo: 0, pospuesto: 0, cancelado: 0, todos: solicitudes.length };
    for (const s of solicitudes) {
      if (activo(s.estado)) c.activos++;
      else c[s.estado as "listo" | "pospuesto" | "cancelado"]++;
    }
    return c;
  }, [solicitudes]);

  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return solicitudes.filter(
      (s) =>
        (filtro === "todos" || (filtro === "activos" ? activo(s.estado) : s.estado === filtro)) &&
        (!q || `${s.nombre} ${s.descripcion} ${s.solicitante} ${s.alcance}`.toLowerCase().includes(q)),
    );
  }, [solicitudes, filtro, buscar]);

  // Lugar en la fila de prioridad (solo activos): 1 = lo primero que se atiende.
  const lugar = useMemo(() => {
    const m = new Map<number, number>();
    solicitudes.filter((s) => activo(s.estado)).forEach((s, i) => m.set(s.id, i + 1));
    return m;
  }, [solicitudes]);

  const seleccion = solicitudes.find((s) => s.id === abierta) ?? null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-base font-semibold text-slate-900 dark:text-slate-50">Historial de cambios</h2>
        {FILTROS.map((f) => (
          <button
            key={f.k}
            type="button"
            onClick={() => setFiltro(f.k)}
            aria-pressed={filtro === f.k}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              filtro === f.k ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
            }`}
          >
            {f.t} <span className="tabular-nums opacity-70">{cuenta[f.k]}</span>
          </button>
        ))}
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar solicitudes"
          className={`${campo} ml-auto max-w-56`}
        />
        <button type="button" className={botonOscuro} onClick={() => setNueva((x) => !x)}>
          {nueva ? "Cerrar" : "+ Nueva solicitud"}
        </button>
      </div>

      {nueva && <FormaNueva hoy={hoy} usuario={usuario} onListo={(id) => (setNueva(false), setAbierta(id))} />}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-slate-200 text-left text-[11px] tracking-wider text-slate-500 uppercase dark:border-slate-700 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2.5">Lugar</th>
              <th className="px-3 py-2.5">Cambio</th>
              <th className="px-3 py-2.5">Prioridad</th>
              <th className="px-3 py-2.5">Estatus</th>
              <th className="px-3 py-2.5">Solicitante</th>
              <th className="px-3 py-2.5">Solicitud</th>
              <th className="px-3 py-2.5">Compromiso</th>
              <th className="px-3 py-2.5 text-right">Mover</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  {solicitudes.length === 0 ? "Aún no hay solicitudes. Crea la primera con “+ Nueva solicitud”." : "No hay solicitudes con este filtro."}
                </td>
              </tr>
            )}
            {lista.map((s) => {
              const vencida = activo(s.estado) && s.fecha_compromiso && s.fecha_compromiso < hoy;
              const sel = s.id === abierta;
              return (
                <tr
                  key={s.id}
                  onClick={() => setAbierta(sel ? null : s.id)}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 dark:border-slate-800 ${sel ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
                >
                  <td className="px-3 py-2.5 font-semibold tabular-nums text-slate-500">{lugar.get(s.id) ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{s.nombre}</div>
                    {s.descripcion && <div className="line-clamp-1 max-w-[46ch] text-xs text-slate-500">{s.descripcion}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${PUNTO_PRIORIDAD[s.prioridad]}`} />
                      {PRIORIDAD_TXT[s.prioridad]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${PILL_ESTADO[s.estado]}`}>{ESTADO_TXT[s.estado]}</span>
                  </td>
                  <td className="px-3 py-2.5">{s.solicitante.includes("@") ? nombreUsuario(s.solicitante) : s.solicitante}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fc(s.fecha_solicitud)}</td>
                  <td className={`px-3 py-2.5 whitespace-nowrap ${vencida ? "font-semibold text-red-700 dark:text-red-400" : ""}`}>
                    {fc(s.fecha_compromiso)}
                    {vencida ? " · vencida" : ""}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {activo(s.estado) && (
                      <>
                        <button type="button" disabled={pendiente} aria-label="Subir prioridad" title="Subir" className={`${boton} px-2 py-0.5`} onClick={() => start(() => moverSolicitud(s.id, -1))}>
                          ↑
                        </button>{" "}
                        <button type="button" disabled={pendiente} aria-label="Bajar prioridad" title="Bajar" className={`${boton} px-2 py-0.5`} onClick={() => start(() => moverSolicitud(s.id, 1))}>
                          ↓
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {seleccion && <Detalle key={seleccion.id} s={seleccion} hoy={hoy} usuario={usuario} onCerrar={() => setAbierta(null)} />}
    </div>
  );
}

function FormaNueva({ hoy, usuario, onListo }: { hoy: string; usuario: string; onListo: (id: number) => void }) {
  const [estado, accion, enviando] = useActionState(crearSolicitud, undefined);
  useEffect(() => {
    if (estado?.ok) onListo(estado.ok);
  }, [estado, onListo]);
  return (
    <form action={accion} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-4">
      <label className={`${etiqueta} md:col-span-3`}>
        Nombre del cambio
        <input name="nombre" required maxLength={200} className={campo} />
      </label>
      <label className={etiqueta}>
        Prioridad
        <select name="prioridad" defaultValue="media" className={campo}>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
      </label>
      <label className={`${etiqueta} md:col-span-2`}>
        Descripción del cambio
        <textarea name="descripcion" rows={3} className={campo} />
      </label>
      <label className={`${etiqueta} md:col-span-2`}>
        Alcance del cambio
        <textarea name="alcance" rows={3} placeholder="Qué pantallas, procesos o usuarios toca" className={campo} />
      </label>
      <label className={etiqueta}>
        Solicitante
        <input name="solicitante" defaultValue={nombreUsuario(usuario)} className={campo} />
      </label>
      <label className={etiqueta}>
        Fecha de solicitud
        <input name="fecha_solicitud" type="date" defaultValue={hoy} className={campo} />
      </label>
      <label className={etiqueta}>
        Fecha compromiso
        <input name="fecha_compromiso" type="date" className={campo} />
      </label>
      <div className="flex items-end justify-end gap-3">
        {estado?.error && <span className="text-sm text-red-700">{estado.error}</span>}
        <button type="submit" disabled={enviando} className={botonOscuro}>
          {enviando ? "Guardando…" : "Guardar solicitud"}
        </button>
      </div>
    </form>
  );
}

function Detalle({ s, hoy, usuario, onCerrar }: { s: SolicitudCambio; hoy: string; usuario: string; onCerrar: () => void }) {
  const [eventos, setEventos] = useState<EventoCambio[] | null>(null);
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({
    nombre: s.nombre,
    descripcion: s.descripcion,
    alcance: s.alcance,
    solicitante: s.solicitante,
    fecha_solicitud: s.fecha_solicitud ?? "",
    fecha_compromiso: s.fecha_compromiso ?? "",
    prioridad: s.prioridad as string,
  });
  const [nota, setNota] = useState("");
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");
  const [pendiente, start] = useTransition();

  const recargar = () => eventosSolicitud(s.id).then(setEventos);
  useEffect(() => {
    eventosSolicitud(s.id).then(setEventos);
  }, [s.id, s.actualizado_en]);

  const guardar = (campos: Record<string, string>, n?: string) =>
    start(async () => {
      setError("");
      const r = await editarSolicitud(s.id, campos, n);
      if (r.error) setError(r.error);
      else {
        setEditando(false);
        setNota("");
        await recargar();
      }
    });

  const enviarComentario = () =>
    start(async () => {
      setError("");
      const r = await comentarSolicitud(s.id, comentario);
      if (r.error) setError(r.error);
      else {
        setComentario("");
        await recargar();
      }
    });

  const vencida = activo(s.estado) && s.fecha_compromiso && s.fecha_compromiso < hoy;

  return (
    <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 lg:grid-cols-[1fr_380px]">
      <div className="grid content-start gap-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">Solicitud #{s.id}</p>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{s.nombre}</h3>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL_ESTADO[s.estado]}`}>{ESTADO_TXT[s.estado]}</span>
          <button type="button" className={boton} onClick={onCerrar} aria-label="Cerrar detalle">
            ✕
          </button>
        </div>

        {!editando ? (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Dato t="Solicitante">{s.solicitante}</Dato>
              <Dato t="Fecha de solicitud">{fc(s.fecha_solicitud)}</Dato>
              <Dato t="Fecha compromiso">
                <span className={vencida ? "font-semibold text-red-700 dark:text-red-400" : ""}>
                  {fc(s.fecha_compromiso)}
                  {vencida ? " · vencida" : ""}
                </span>
              </Dato>
              <Dato t="Prioridad">{PRIORIDAD_TXT[s.prioridad]}</Dato>
              <Dato t="Creada por">{nombreUsuario(s.creado_por)}</Dato>
              {s.fecha_cierre && <Dato t="Fecha de cierre">{fc(s.fecha_cierre)}</Dato>}
            </dl>
            <Texto t="Descripción del cambio">{s.descripcion}</Texto>
            <Texto t="Alcance del cambio">{s.alcance}</Texto>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" className={boton} onClick={() => setEditando(true)}>
                Editar
              </button>
              <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
              {activo(s.estado) ? (
                <>
                  {s.estado === "pendiente" && (
                    <button type="button" disabled={pendiente} className={boton} onClick={() => guardar({ estado: "en_proceso" }, nota)}>
                      Iniciar
                    </button>
                  )}
                  <span className="text-xs font-semibold text-slate-500">Finalizar como:</span>
                  <button type="button" disabled={pendiente} className={`${boton} text-green-800 dark:text-green-300`} onClick={() => guardar({ estado: "listo" }, nota)}>
                    Listo
                  </button>
                  <button type="button" disabled={pendiente} className={`${boton} text-amber-800 dark:text-amber-300`} onClick={() => guardar({ estado: "pospuesto" }, nota)}>
                    Pospuesto
                  </button>
                  <button type="button" disabled={pendiente} className={`${boton} text-red-800 dark:text-red-300`} onClick={() => guardar({ estado: "cancelado" }, nota)}>
                    Cancelado
                  </button>
                </>
              ) : (
                <button type="button" disabled={pendiente} className={boton} onClick={() => guardar({ estado: "pendiente" }, nota)}>
                  Reabrir
                </button>
              )}
            </div>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Motivo del cambio de estatus (opcional)" className={campo} />
          </>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <label className={`${etiqueta} md:col-span-2`}>
              Nombre del cambio
              <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={campo} />
            </label>
            <label className={etiqueta}>
              Descripción del cambio
              <textarea rows={4} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className={campo} />
            </label>
            <label className={etiqueta}>
              Alcance del cambio
              <textarea rows={4} value={f.alcance} onChange={(e) => setF({ ...f, alcance: e.target.value })} className={campo} />
            </label>
            <label className={etiqueta}>
              Solicitante
              <input value={f.solicitante} onChange={(e) => setF({ ...f, solicitante: e.target.value })} className={campo} />
            </label>
            <label className={etiqueta}>
              Prioridad
              <select value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })} className={campo}>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </label>
            <label className={etiqueta}>
              Fecha de solicitud
              <input type="date" value={f.fecha_solicitud} onChange={(e) => setF({ ...f, fecha_solicitud: e.target.value })} className={campo} />
            </label>
            <label className={etiqueta}>
              Fecha compromiso
              <input type="date" value={f.fecha_compromiso} onChange={(e) => setF({ ...f, fecha_compromiso: e.target.value })} className={campo} />
            </label>
            <label className={`${etiqueta} md:col-span-2`}>
              Motivo del cambio (queda en el historial)
              <input value={nota} onChange={(e) => setNota(e.target.value)} className={campo} />
            </label>
            <div className="flex justify-end gap-2 md:col-span-2">
              <button type="button" className={boton} onClick={() => setEditando(false)}>
                Cancelar
              </button>
              <button type="button" disabled={pendiente || !f.nombre.trim()} className={botonOscuro} onClick={() => guardar(f, nota)}>
                Guardar cambios
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>

      <div className="grid content-start gap-3 lg:border-l lg:border-slate-100 lg:pl-5 dark:lg:border-slate-800">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Historial y conversación</h4>
        <ol className="grid max-h-[460px] gap-3 overflow-y-auto pr-1">
          {eventos === null && <li className="text-sm text-slate-500">Cargando…</li>}
          {eventos?.map((e) => (
            <Evento key={e.id} e={e} mio={e.usuario === usuario} />
          ))}
        </ol>
        <div className="grid gap-2">
          <textarea
            rows={2}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && comentario.trim()) enviarComentario();
            }}
            placeholder="Escribe un comentario…"
            aria-label="Comentario"
            className={campo}
          />
          <button type="button" disabled={pendiente || !comentario.trim()} className={`${botonOscuro} justify-self-end`} onClick={enviarComentario}>
            Comentar
          </button>
        </div>
      </div>
    </section>
  );
}

function valor(k: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "vacío";
  const s = String(v);
  if (k === "estado") return ESTADO_TXT[s as EstadoCambio] ?? s;
  if (k === "prioridad") return PRIORIDAD_TXT[s as Prioridad] ?? s;
  if (k.startsWith("fecha")) return fc(s);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

function Evento({ e, mio }: { e: EventoCambio; mio: boolean }) {
  const quien = nombreUsuario(e.usuario);
  if (e.tipo === "comentario") {
    return (
      <li className={`grid gap-1 rounded-lg px-3 py-2 text-sm ${mio ? "bg-blue-50 dark:bg-blue-950/50" : "bg-slate-100 dark:bg-slate-800"}`}>
        <span className="text-xs text-slate-500">
          <b className="text-slate-700 dark:text-slate-200">{quien}</b> · {fh(e.creado_en)}
        </span>
        <span className="whitespace-pre-wrap">{e.texto}</span>
      </li>
    );
  }
  return (
    <li className="grid gap-0.5 border-l-2 border-slate-200 pl-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
      <span>
        <b className="text-slate-700 dark:text-slate-200">{quien}</b> · {fh(e.creado_en)}
      </span>
      {e.tipo === "creacion" && <span>Creó la solicitud</span>}
      {e.detalle &&
        Object.entries(e.detalle).map(([k, d]) => (
          <span key={k}>
            {CAMPO_TXT[k] ?? k}: {valor(k, d.antes)} → <b>{valor(k, d.despues)}</b>
          </span>
        ))}
      {e.tipo === "cambio" && e.texto && (e.detalle ? <span className="italic">“{e.texto}”</span> : <span>{e.texto}</span>)}
    </li>
  );
}

function Dato({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-px">
      <dt className="text-[11px] tracking-wider text-slate-500 uppercase">{t}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Texto({ t, children }: { t: string; children: string }) {
  return (
    <div className="grid gap-1">
      <p className="text-[11px] tracking-wider text-slate-500 uppercase">{t}</p>
      <p className="text-sm whitespace-pre-wrap">{children || <span className="text-slate-400">Sin capturar</span>}</p>
    </div>
  );
}
