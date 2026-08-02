import { jsPDF } from "jspdf";
import type { Importacion, Incidencia } from "@/types/importacion";
import { FIELD_LABELS, FIELD_SECTIONS } from "@/types/importacion";

function formatValue(row: Importacion, field: string): string {
  const value = (row as unknown as Record<string, string | number | null>)[field];
  if (value === null || value === undefined || value === "") return "(sin datos)";
  return String(value);
}

export function buildImportacionPdf(row: Importacion, incidencias: Incidencia[] = []): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 40;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 50;

  const heading = row.booking || `Registro de importación #${row.id}`;

  doc.setFontSize(16);
  doc.text(heading, marginX, y);
  y += 28;

  for (const section of FIELD_SECTIONS) {
    if (y > pageHeight - 80) {
      doc.addPage();
      y = 50;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(section.title, marginX, y);
    y += 8;
    doc.setDrawColor(200);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);

    for (const field of section.fields) {
      if (y > pageHeight - 60) {
        doc.addPage();
        y = 50;
      }

      const label = FIELD_LABELS[field] ?? field;
      const value = formatValue(row, field);
      const isEmpty = value === "(sin datos)";

      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, marginX, y);

      doc.setFont("helvetica", "normal");
      if (isEmpty) {
        doc.setTextColor(200, 0, 0);
      } else {
        doc.setTextColor(30, 30, 30);
      }

      const lines = doc.splitTextToSize(value, pageWidth - marginX * 2 - 180);
      doc.text(lines, marginX + 200, y);
      doc.setTextColor(30, 30, 30);

      y += 16 * Math.max(lines.length, 1);
    }

    y += 12;
  }

  if (y > pageHeight - 80) {
    doc.addPage();
    y = 50;
  }

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Incidencias", marginX, y);
  y += 8;
  doc.setDrawColor(200);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 18;

  doc.setFontSize(8.5);
  if (incidencias.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text("Sin incidencias registradas.", marginX, y);
    doc.setTextColor(30, 30, 30);
    y += 16;
  } else {
    for (const inc of incidencias) {
      if (y > pageHeight - 60) {
        doc.addPage();
        y = 50;
      }
      doc.setFont("helvetica", "bold");
      doc.text(inc.fecha, marginX, y);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(inc.texto, pageWidth - marginX * 2 - 90);
      doc.text(lines, marginX + 80, y);
      y += 16 * Math.max(lines.length, 1) + 4;
    }
  }

  return doc;
}
