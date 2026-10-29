import type { ColoaderAgent, ColoaderTrackingResult } from "./coloaderTypes";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseTableRows(html: string): string[][] {
  const rows: string[][] = [];
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const match of rowMatches) {
    const trContent = match[1];
    const cellMatches = trContent.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
    const cells: string[] = [];
    for (const cm of cellMatches) {
      cells.push(stripHtml(cm[1]));
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  return rows;
}

function normalizeDate(raw?: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return null;
  const y = match[1];
  const m = match[2].padStart(2, "0");
  const d = match[3].padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export class InterteamAgent implements ColoaderAgent {
  readonly nombre = "INTERTEAM";
  readonly endpoint = "https://intralogs.com.mx/estatusimportacion/index.php";

  soporta(coloaderName: string): boolean {
    return coloaderName.toUpperCase().includes("INTERTEAM");
  }

  async rastrear(referencia: string): Promise<ColoaderTrackingResult> {
    const refClean = referencia.trim();
    const timestamp = new Date().toISOString();

    if (!refClean) {
      return {
        coloader: this.nombre,
        referenciaConsultada: referencia,
        exito: false,
        error: "Referencia vacía",
        timestamp,
      };
    }

    try {
      const body = new URLSearchParams({ hbl: refClean, search: "SEARCH" });
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        },
        body: body.toString(),
      });

      if (!res.ok) {
        return {
          coloader: this.nombre,
          referenciaConsultada: refClean,
          exito: false,
          error: `Error HTTP ${res.status}`,
          timestamp,
        };
      }

      const text = await res.text();
      if (text.toLowerCase().includes("no se encontraron") || text.toLowerCase().includes("sin resultados")) {
        return {
          coloader: this.nombre,
          referenciaConsultada: refClean,
          exito: false,
          error: "No se encontraron registros para esta referencia en el portal de Interteam",
          timestamp,
        };
      }

      const tableMatches = Array.from(text.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi));
      if (!tableMatches || tableMatches.length === 0) {
        return {
          coloader: this.nombre,
          referenciaConsultada: refClean,
          exito: false,
          error: "No se encontraron tablas de resultados en la respuesta",
          timestamp,
        };
      }

      const result: ColoaderTrackingResult = {
        coloader: this.nombre,
        referenciaConsultada: refClean,
        exito: true,
        timestamp,
        hbl: refClean,
      };

      // Tabla 0: HBL, Bultos, Kgs, CBM, Liberar Contra, Flete, Agente Aduanal, MBL, Naviera
      if (tableMatches[0]) {
        const rows = parseTableRows(tableMatches[0][1]);
        if (rows.length > 1) {
          const dataRow = rows[1]; // Fila de datos tras thead
          if (dataRow.length >= 8) {
            result.hbl = dataRow[0] || result.hbl;
            result.bultos = dataRow[1] || null;
            result.pesoKg = dataRow[2] || null;
            result.volumenCbm = dataRow[3] || null;
            result.agenteAduanal = dataRow[6] || null;
            result.mbl = dataRow[7] || null;
            if (dataRow.length >= 9) {
              result.naviera = dataRow[8] || null;
            }
          }
        }
      }

      // Tabla 1: Origen, POL, POD, Buque, Cntr No, ETA
      if (tableMatches[1]) {
        const rows = parseTableRows(tableMatches[1][1]);
        if (rows.length > 1) {
          const dataRow = rows[1];
          if (dataRow.length >= 6) {
            result.origen = dataRow[0] || null;
            result.pol = dataRow[1] || null;
            result.pod = dataRow[2] || null;
            result.buque = dataRow[3] || null;
            result.contenedor = dataRow[4] || null;
            result.eta = normalizeDate(dataRow[5]);
          }
        }
      }

      // Tabla 2: Aviso Arribo, Fondeo, ATA, ATA Time, Descarga Cntr, Hora Descarga, Terminal
      if (tableMatches[2]) {
        const rows = parseTableRows(tableMatches[2][1]);
        if (rows.length > 1) {
          const dataRow = rows[1];
          if (dataRow.length >= 7) {
            result.avisoArribo = dataRow[0] || null;
            result.ata = normalizeDate(dataRow[2]);
            result.terminalPortuaria = dataRow[6] || null;
          }
        }
      }

      // Tabla 3: Almacén, Fecha Desconsolidación, Hora Desconsolidación, Bultos Finales, Embalajes
      if (tableMatches[3]) {
        const rows = parseTableRows(tableMatches[3][1]);
        if (rows.length > 1) {
          const dataRow = rows[1];
          if (dataRow.length >= 3) {
            result.almacen = dataRow[0] || null;
            result.fechaDesconsolidacion = normalizeDate(dataRow[1]);
            result.horaDesconsolidacion = dataRow[2] || null;
          }
        }
      }

      // Tabla 4: Revalidación, Revalidación Electrónica, Patente
      if (tableMatches[4]) {
        const rows = parseTableRows(tableMatches[4][1]);
        // Fila 0 y 1 son cabeceras, fila 2 es datos
        const dataRow = rows.find((r) => r.length >= 5 && /\d{4}/.test(r[0]));
        if (dataRow) {
          result.fechaRevalidacion = normalizeDate(dataRow[2] || dataRow[0]);
          result.agenteAduanal = dataRow[4] || result.agenteAduanal;
          result.patente = dataRow[5] || null;
        }
      }

      result.estatusTexto = `Interteam: Buque ${result.buque ?? "N/A"}, ETA ${result.eta ?? "N/A"}, Almacén ${result.almacen ?? "N/A"}, Desconsolidación ${result.fechaDesconsolidacion ?? "Pendiente"}`;
      return result;
    } catch (err) {
      return {
        coloader: this.nombre,
        referenciaConsultada: refClean,
        exito: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp,
      };
    }
  }
}
