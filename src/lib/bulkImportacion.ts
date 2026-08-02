import { BULK_IMPORT_FIELDS, DATE_FIELDS, ESTATUS_OPTIONS, FIELD_LABELS } from "@/types/importacion";

const DATE_FIELD_SET = new Set<string>(DATE_FIELDS);

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip accents
}

const HEADER_TO_FIELD = new Map<string, string>();
for (const field of BULK_IMPORT_FIELDS) {
  HEADER_TO_FIELD.set(normalizeHeader(field), field);
  const label = FIELD_LABELS[field];
  if (label) HEADER_TO_FIELD.set(normalizeHeader(label), field);
}

const ESTATUS_SET = new Set<string>(ESTATUS_OPTIONS);
const SEGURO_TRUE_VALUES = new Set(["si", "sí", "true", "1", "yes"]);
const SEGURO_FALSE_VALUES = new Set(["no", "false", "0"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Excel paste produces tabs; typed/pasted CSV uses commas. Detect from the header line.
function detectDelimiter(headerLine: string): "\t" | "," {
  return headerLine.includes("\t") ? "\t" : ",";
}

// Simple RFC4180-style split: only needed for comma mode, since values (like
// addresses) can legitimately contain commas when wrapped in double quotes.
function splitDelimited(line: string, delimiter: "\t" | ","): string[] {
  if (delimiter === "\t") return line.split("\t");

  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

export type BulkImportRow = {
  line: number;
  payload: Record<string, string | number | boolean | null>;
  warnings: string[];
};

export type BulkImportParseResult = {
  rows: BulkImportRow[];
  rejected: { line: number; reason: string }[];
};

export function parseBulkImportText(text: string): BulkImportParseResult {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((l) => l)
    .filter((l) => l.trim() !== "");

  if (lines.length === 0) {
    return { rows: [], rejected: [] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerCells = splitDelimited(lines[0], delimiter).map(normalizeHeader);
  const fieldByColumn = headerCells.map((h) => HEADER_TO_FIELD.get(h) ?? null);

  const rows: BulkImportRow[] = [];
  const rejected: { line: number; reason: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    const cells = splitDelimited(lines[i], delimiter);
    const warnings: string[] = [];
    const payload: Record<string, string | number | boolean | null> = {};

    for (let col = 0; col < fieldByColumn.length; col++) {
      const field = fieldByColumn[col];
      if (!field) continue;
      const raw = (cells[col] ?? "").trim();

      if (field === "seguro") {
        const normalized = raw.toLowerCase();
        if (raw === "") {
          payload.seguro = null;
        } else if (SEGURO_TRUE_VALUES.has(normalized)) {
          payload.seguro = true;
        } else if (SEGURO_FALSE_VALUES.has(normalized)) {
          payload.seguro = false;
        } else {
          warnings.push(`Seguro: valor "${raw}" no reconocido (usa SI o NO), se dejó vacío.`);
          payload.seguro = null;
        }
        continue;
      }

      if (field === "estatus") {
        if (raw === "") {
          payload.estatus = "Vigente";
        } else if (ESTATUS_SET.has(raw as (typeof ESTATUS_OPTIONS)[number])) {
          payload.estatus = raw;
        } else {
          warnings.push(`Estatus: valor "${raw}" no válido (usa Vigente, Finalizado o Cancelado), se usó Vigente.`);
          payload.estatus = "Vigente";
        }
        continue;
      }

      if (field === "dias_demoras") {
        if (raw === "") {
          payload.dias_demoras = null;
        } else {
          const num = Number(raw);
          if (Number.isFinite(num)) {
            payload.dias_demoras = num;
          } else {
            warnings.push(`Días de demoras: valor "${raw}" no es un número, se dejó vacío.`);
            payload.dias_demoras = null;
          }
        }
        continue;
      }

      if (DATE_FIELD_SET.has(field)) {
        if (raw === "") {
          payload[field] = null;
        } else if (DATE_RE.test(raw)) {
          payload[field] = raw;
        } else {
          warnings.push(`${FIELD_LABELS[field] ?? field}: fecha "${raw}" debe tener formato AAAA-MM-DD, se dejó vacía.`);
          payload[field] = null;
        }
        continue;
      }

      payload[field] = raw === "" ? null : raw;
    }

    const booking = payload.booking;
    if (!booking || typeof booking !== "string" || booking.trim() === "") {
      rejected.push({ line: lineNumber, reason: "Falta el Booking (es obligatorio)." });
      continue;
    }

    if (payload.estatus === undefined) payload.estatus = "Vigente";

    rows.push({ line: lineNumber, payload, warnings });
  }

  return { rows, rejected };
}
