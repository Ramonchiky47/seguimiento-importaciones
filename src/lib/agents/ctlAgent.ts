import type { ColoaderAgent, ColoaderTrackingResult } from "./coloaderTypes";

export class CTLAgent implements ColoaderAgent {
  readonly nombre = "CTL LOGISTICS";
  readonly sheetId = "1EekX1Be3yBeYgxrrXegZjbBFuRf2so2u4RTS9ndmZUM";
  readonly gvUrl = `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq`;

  soporta(coloaderName: string): boolean {
    const c = coloaderName.toUpperCase();
    return c.includes("CTL") || c.includes("CHARTER LINK") || c.includes("CHARTERLINK");
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
      const escapedRef = refClean.replace(/'/g, "\\'");
      const tq = `select * where C contains '${escapedRef}' or D contains '${escapedRef}' or E contains '${escapedRef}' or O contains '${escapedRef}'`;
      const url = `${this.gvUrl}?tqx=out:json&gid=0&headers=1&range=A1:AZ&tq=${encodeURIComponent(tq)}`;

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        },
      });

      if (!res.ok) {
        return {
          coloader: this.nombre,
          referenciaConsultada: refClean,
          exito: false,
          error: `Error HTTP ${res.status} al consultar portal CTL`,
          timestamp,
        };
      }

      const text = await res.text();
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end === -1) {
        return {
          coloader: this.nombre,
          referenciaConsultada: refClean,
          exito: false,
          error: "Respuesta no estructurada del portal",
          timestamp,
        };
      }

      const parsed = JSON.parse(text.slice(start, end + 1));
      const rows = parsed?.table?.rows ?? [];
      if (rows.length === 0) {
        return {
          coloader: this.nombre,
          referenciaConsultada: refClean,
          exito: false,
          error: `Sin registros en CTL para ${refClean}`,
          timestamp,
        };
      }

      const cols: string[] = (parsed.table.cols ?? []).map(
        (c: { label?: string; id?: string }) => c.label || c.id || "",
      );
      const firstRowVals = (rows[0].c ?? []).map(
        (cell: { v?: unknown; f?: string } | null) => (cell ? cell.f ?? cell.v : null),
      );

      const map: Record<string, unknown> = {};
      cols.forEach((col, idx) => {
        if (col) map[col] = firstRowVals[idx];
      });

      return {
        coloader: this.nombre,
        referenciaConsultada: refClean,
        exito: true,
        timestamp,
        buque: (map["Motonave"] as string) ?? null,
        viaje: (map["Viaje"] as string) ?? null,
        mbl: (map["MBL"] as string) ?? null,
        hbl: (map["HBL"] as string) ?? null,
        origen: (map["Origen"] as string) ?? null,
        contenedor: (map["Contenedor"] as string) ?? null,
        almacen: (map["Almacén / Patio"] as string) ?? null,
        bultos: map["Cantidad de Bultos"] != null ? String(map["Cantidad de Bultos"]) : null,
        pesoKg: map["Peso"] != null ? String(map["Peso"]) : null,
        volumenCbm: map["Volumen"] != null ? String(map["Volumen"]) : null,
        estatusTexto: `CTL: Motonave ${map["Motonave"] ?? "N/A"}, Almacén ${map["Almacén / Patio"] ?? "N/A"}, Estado: ${map["Estado"] ?? "N/A"}`,
        raw: map,
      };
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
