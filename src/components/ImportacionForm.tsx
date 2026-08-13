"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { unstable_rethrow } from "next/navigation";
import type { Importacion } from "@/types/importacion";
import { ESTATUS_OPTIONS, FIELD_LABELS } from "@/types/importacion";

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  locked = false,
  onValueChange,
  wide = false,
  inputRef,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | number | null;
  locked?: boolean;
  onValueChange?: (value: string) => void;
  wide?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const isEmpty = value === null || value === undefined || value === "";

  return (
    <div className={wide ? "col-span-2" : undefined}>
      <label
        htmlFor={name}
        title={label}
        className="mb-0.5 block truncate whitespace-nowrap text-[10px] font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
      </label>
      <input
        ref={inputRef}
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        readOnly={locked}
        tabIndex={locked ? -1 : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          onValueChange?.(e.target.value);
        }}
        className={`w-full rounded-md border bg-white px-2.5 py-1.5 text-[10px] focus:outline-none dark:bg-slate-800 ${
          locked
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600"
            : isEmpty
              ? "border-red-500 focus:border-red-500 dark:border-red-500"
              : "border-slate-300 focus:border-slate-500 dark:border-slate-700 dark:focus:border-slate-500"
        }`}
      />
    </div>
  );
}

function SelectField({
  name,
  label,
  options,
  defaultValue,
  includeBlank = true,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string | null;
  includeBlank?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const isEmpty = includeBlank && (value === null || value === undefined || value === "");

  return (
    <div>
      <label
        htmlFor={name}
        title={label}
        className="mb-0.5 block truncate whitespace-nowrap text-[10px] font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        onChange={(e) => setValue(e.target.value)}
        className={`w-full rounded-md border bg-white px-2.5 py-1.5 text-[10px] focus:outline-none dark:bg-slate-800 ${
          isEmpty
            ? "border-red-500 focus:border-red-500 dark:border-red-500"
            : "border-slate-300 focus:border-slate-500 dark:border-slate-700 dark:focus:border-slate-500"
        }`}
      >
        {includeBlank && <option value="">— Selecciona —</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function OperativoField({
  label,
  options,
  defaultValues,
}: {
  label: string;
  options: string[];
  defaultValues: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultValues);
  const isEmpty = selected.length === 0;
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function toggle(option: string) {
    setSelected((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option],
    );
  }

  return (
    <div>
      <label
        title={label}
        className="mb-0.5 block truncate whitespace-nowrap text-[10px] font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
      </label>
      <details
        ref={detailsRef}
        className="relative"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            detailsRef.current?.removeAttribute("open");
          }
        }}
      >
        <summary
          className={`flex w-full cursor-pointer list-none items-center justify-between rounded-md border bg-white px-2.5 py-1.5 text-[10px] focus:outline-none dark:bg-slate-800 ${
            isEmpty
              ? "border-red-500 dark:border-red-500"
              : "border-slate-300 dark:border-slate-700"
          }`}
        >
          <span className="truncate">
            {isEmpty ? "— Selecciona —" : selected.join(", ")}
          </span>
          <span className="ml-1 shrink-0 text-[9px]">▾</span>
        </summary>
        <div className="absolute left-0 z-20 mt-1 max-h-48 w-56 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {options.length === 0 && (
            <p className="px-2 py-1 text-[10px] text-slate-400 dark:text-slate-500">
              Sin operativos activos.
            </p>
          )}
          {options.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 rounded px-2 py-1 text-[10px] hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <input
                type="checkbox"
                name="operativo"
                value={option}
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
                className="h-3 w-3 rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-slate-700 dark:text-slate-300">{option}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

export function ImportacionForm({
  action,
  initialValue,
  operativoOptions = [],
  terminalPortuariaOptions = [],
}: {
  action: (formData: FormData) => Promise<void>;
  initialValue?: Importacion;
  operativoOptions?: string[];
  terminalPortuariaOptions?: string[];
}) {
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [typeValue, setTypeValue] = useState(initialValue?.type ?? "");
  const isLCLI = typeValue.trim().toUpperCase() === "LCLI";
  const isFCLI = typeValue.trim().toUpperCase() === "FCLI";

  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const formRef = useRef<HTMLFormElement>(null);
  const notificacionArriboRef = useRef<HTMLInputElement>(null);
  const validacion48Ref = useRef<HTMLInputElement>(null);
  const revalidacion48Ref = useRef<HTMLInputElement>(null);

  // Rellena un campo con (ETA - días) solo mientras siga vacío — si el
  // operativo ya lo cambió a mano, no se le vuelve a pisar encima.
  function autocompletarDesdeEta(
    input: HTMLInputElement | null,
    nuevaEta: string,
    diasARestar: number,
  ) {
    if (!input || input.value || !nuevaEta) return;
    const fecha = new Date(`${nuevaEta}T00:00:00Z`);
    fecha.setUTCDate(fecha.getUTCDate() - diasARestar);
    input.value = fecha.toISOString().slice(0, 10);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function handleEtaChange(nuevaEta: string) {
    autocompletarDesdeEta(notificacionArriboRef.current, nuevaEta, 7);
    autocompletarDesdeEta(validacion48Ref.current, nuevaEta, 2);
    autocompletarDesdeEta(revalidacion48Ref.current, nuevaEta, 2);
  }

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!dirtyRef.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor || (anchor.target && anchor.target !== "_self")) return;
      if (anchor.dataset.discardChanges === "true") return;

      e.preventDefault();
      e.stopPropagation();
      const wantsSave = window.confirm("¿Quieres guardar los cambios antes de salir?");
      if (wantsSave) {
        formRef.current?.requestSubmit();
      }
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return (
    <form
      ref={formRef}
      onChange={() => setDirty(true)}
      action={async (formData) => {
        setPending(true);
        setErrorMsg(null);
        try {
          await action(formData);
        } catch (err) {
          unstable_rethrow(err);
          setErrorMsg(err instanceof Error ? err.message : "Error al guardar.");
        } finally {
          setPending(false);
        }
      }}
      className="space-y-5"
    >
      <section>
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Información general
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Field name="booking" label={FIELD_LABELS.booking} defaultValue={initialValue?.booking} />
          <SelectField
            name="estatus"
            label={FIELD_LABELS.estatus}
            options={[...ESTATUS_OPTIONS]}
            defaultValue={initialValue?.estatus ?? "Vigente"}
            includeBlank={false}
          />
          <Field name="fecha" label={FIELD_LABELS.fecha} type="date" defaultValue={initialValue?.fecha} />
          <Field
            name="type"
            label={FIELD_LABELS.type}
            defaultValue={initialValue?.type}
            onValueChange={setTypeValue}
          />
          <Field name="vendedor" label={FIELD_LABELS.vendedor} defaultValue={initialValue?.vendedor} />
          <Field name="oficina" label={FIELD_LABELS.oficina} defaultValue={initialValue?.oficina} />
          <OperativoField
            label={FIELD_LABELS.operativo}
            options={operativoOptions}
            defaultValues={
              initialValue?.operativo
                ? initialValue.operativo.split(",").map((s) => s.trim()).filter(Boolean)
                : []
            }
          />
          <Field name="client" label={FIELD_LABELS.client} defaultValue={initialValue?.client} />
          <Field name="agente" label={FIELD_LABELS.agente} defaultValue={initialValue?.agente} />
          <Field
            name="naviera"
            label={FIELD_LABELS.naviera}
            defaultValue={initialValue?.naviera}
            locked={isLCLI}
          />
          <div className="flex items-end gap-1.5 pb-1.5">
            <input
              id="seguro"
              name="seguro"
              type="checkbox"
              defaultChecked={initialValue?.seguro ?? false}
              className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600"
            />
            <label
              htmlFor="seguro"
              title={FIELD_LABELS.seguro}
              className="truncate whitespace-nowrap text-[10px] font-medium text-slate-700 dark:text-slate-300"
            >
              {FIELD_LABELS.seguro}
            </label>
          </div>
          <SelectField
            name="asegurado_por"
            label={FIELD_LABELS.asegurado_por}
            options={["Contenedor", "Mercancía"]}
            defaultValue={initialValue?.asegurado_por}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Documentos y puertos
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <SelectField
            name="terminal_portuaria"
            label={FIELD_LABELS.terminal_portuaria}
            options={terminalPortuariaOptions}
            defaultValue={initialValue?.terminal_portuaria}
          />
          <Field name="pol" label={FIELD_LABELS.pol} defaultValue={initialValue?.pol} />
          <Field name="pod" label={FIELD_LABELS.pod} defaultValue={initialValue?.pod} />
          <Field name="mbl" label={FIELD_LABELS.mbl} defaultValue={initialValue?.mbl} />
          <Field name="telex_mbl" label={FIELD_LABELS.telex_mbl} defaultValue={initialValue?.telex_mbl} />
          <Field name="hbl" label={FIELD_LABELS.hbl} defaultValue={initialValue?.hbl} />
          <Field name="telex_hbl" label={FIELD_LABELS.telex_hbl} defaultValue={initialValue?.telex_hbl} />
          <Field
            name="contenedor"
            label={FIELD_LABELS.contenedor}
            defaultValue={initialValue?.contenedor}
            wide
          />
          <Field
            name="cantidad_contenedores_tipo"
            label={FIELD_LABELS.cantidad_contenedores_tipo}
            defaultValue={initialValue?.cantidad_contenedores_tipo}
          />
          <Field
            name="shipper"
            label={FIELD_LABELS.shipper}
            defaultValue={initialValue?.shipper}
            wide
          />
          <Field
            name="direccion_recoleccion"
            label={FIELD_LABELS.direccion_recoleccion}
            defaultValue={initialValue?.direccion_recoleccion}
            wide
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Fechas de tránsito
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Field name="etd_atd" label={FIELD_LABELS.etd_atd} type="date" defaultValue={initialValue?.etd_atd} />
          <Field
            name="confirmacion_48_horas"
            label={FIELD_LABELS.confirmacion_48_horas}
            type="date"
            defaultValue={initialValue?.confirmacion_48_horas}
          />
          <Field
            name="eta_ata"
            label={FIELD_LABELS.eta_ata}
            type="date"
            defaultValue={initialValue?.eta_ata}
            onValueChange={handleEtaChange}
          />
          <Field
            name="notificacion_arribo_7_dias"
            label={FIELD_LABELS.notificacion_arribo_7_dias}
            type="date"
            defaultValue={initialValue?.notificacion_arribo_7_dias}
            inputRef={notificacionArriboRef}
          />
          <Field
            name="validacion_48_horas_antes_eta"
            label={FIELD_LABELS.validacion_48_horas_antes_eta}
            type="date"
            defaultValue={initialValue?.validacion_48_horas_antes_eta}
            inputRef={validacion48Ref}
          />
          <Field
            name="revalidacion_48_horas_antes_eta"
            label={FIELD_LABELS.revalidacion_48_horas_antes_eta}
            type="date"
            defaultValue={initialValue?.revalidacion_48_horas_antes_eta}
            inputRef={revalidacion48Ref}
          />
          <Field
            name="recepcion_eir"
            label={FIELD_LABELS.recepcion_eir}
            type="date"
            defaultValue={initialValue?.recepcion_eir}
            locked={isLCLI}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Corte y demoras
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Field
            name="dias_libres_demoras"
            label={FIELD_LABELS.dias_libres_demoras}
            type="number"
            defaultValue={initialValue?.dias_libres_demoras}
            locked={!isFCLI}
          />
          <Field
            name="ultimo_dia_libre_demoras"
            label={FIELD_LABELS.ultimo_dia_libre_demoras}
            type="date"
            defaultValue={initialValue?.ultimo_dia_libre_demoras}
            locked
          />
          <Field
            name="fecha_solicita_corte_naviera"
            label={FIELD_LABELS.fecha_solicita_corte_naviera}
            type="date"
            defaultValue={initialValue?.fecha_solicita_corte_naviera}
            locked={isLCLI}
          />
          <Field
            name="fecha_recibimos_corte_demoras_naviera"
            label={FIELD_LABELS.fecha_recibimos_corte_demoras_naviera}
            type="date"
            defaultValue={initialValue?.fecha_recibimos_corte_demoras_naviera}
            locked={isLCLI}
          />
          <Field
            name="fecha_confirmo_corte_cliente"
            label={FIELD_LABELS.fecha_confirmo_corte_cliente}
            type="date"
            defaultValue={initialValue?.fecha_confirmo_corte_cliente}
            locked={isLCLI}
          />
          <Field
            name="dias_demoras"
            label={FIELD_LABELS.dias_demoras}
            type="number"
            defaultValue={initialValue?.dias_demoras}
            locked
          />
        </div>
      </section>

      {errorMsg && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[10px] text-red-700 dark:bg-red-950 dark:text-red-300">
          {errorMsg}
        </p>
      )}

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
        <a
          href="/importaciones"
          data-discard-changes="true"
          onClick={() => {
            dirtyRef.current = false;
            setDirty(false);
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancelar
        </a>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {pending ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}
