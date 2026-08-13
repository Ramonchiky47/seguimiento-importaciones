"use client";

import { useRef, useState } from "react";
import type { BulkImportResult } from "@/app/(app)/catalogos/carga-masiva/actions";

export function CargaMasivaForm({
  action,
  headerLine,
}: {
  action: (text: string) => Promise<BulkImportResult>;
  headerLine: string;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setFileName(file.name);
    };
    reader.onerror = () => {
      setErrorMsg("No se pudo leer el archivo.");
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Cargar desde un archivo (.csv o .txt)
        </label>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Seleccionar archivo
          </button>
          {fileName && (
            <span className="text-xs text-slate-500 dark:text-slate-400">{fileName}</span>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor="bulk-text"
          className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          O pega aquí las filas (desde Excel, incluyendo el renglón de encabezados)
        </label>
        <textarea
          id="bulk-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName(null);
          }}
          rows={14}
          placeholder={headerLine}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
        />
      </div>

      {errorMsg && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {errorMsg}
        </p>
      )}

      {result && (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="font-medium text-slate-800 dark:text-slate-200">
            Creados: {result.created} · Actualizados: {result.updated} · Errores: {result.errors.length} ·
            Avisos: {result.warnings.length}
          </p>
          {result.errors.length > 0 && (
            <div>
              <p className="font-medium text-red-700 dark:text-red-400">Errores:</p>
              <ul className="list-disc space-y-0.5 pl-5 text-red-700 dark:text-red-400">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {result.warnings.length > 0 && (
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-400">Avisos:</p>
              <ul className="list-disc space-y-0.5 pl-5 text-amber-700 dark:text-amber-400">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <a
          href="/catalogos"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Volver
        </a>
        <button
          type="button"
          disabled={pending || text.trim() === ""}
          onClick={async () => {
            setPending(true);
            setErrorMsg(null);
            setResult(null);
            try {
              const res = await action(text);
              setResult(res);
              if (res.errors.length === 0) setText("");
            } catch (err) {
              setErrorMsg(err instanceof Error ? err.message : "Error al cargar los registros.");
            } finally {
              setPending(false);
            }
          }}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {pending ? "Cargando..." : "Cargar"}
        </button>
      </div>
    </div>
  );
}
