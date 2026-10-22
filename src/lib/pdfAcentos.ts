import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from "pdf-lib";
import { repararAcentos } from "@/lib/etapasCargolink";

// Los PDF de Cargolink (FPDF, fuentes Helvetica con WinAnsiEncoding) traen
// los acentos guardados como "?" ("D?as libres"). Se corrigen las palabras
// conocidas en el texto de cada página: en WinAnsi las vocales acentuadas y
// la ñ ocupan un byte, el mismo código que en latin1, así que la corrección
// se hace sobre el contenido leído como latin1 y se vuelve a comprimir.
export async function corregirAcentosPdf(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  let cambios = 0;
  for (const page of doc.getPages()) {
    const contenido = page.node.get(PDFName.of("Contents"));
    const refs: PDFRef[] =
      contenido instanceof PDFRef ? [contenido] : contenido instanceof PDFArray ? (contenido.asArray().filter((r) => r instanceof PDFRef) as PDFRef[]) : [];
    for (const ref of refs) {
      const stream = doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      const crudo = decodePDFRawStream(stream).decode();
      const texto = Buffer.from(crudo).toString("latin1");
      if (!texto.includes("?")) continue;
      const corregido = repararAcentos(texto);
      if (corregido === texto) continue;
      doc.context.assign(ref, doc.context.flateStream(Buffer.from(corregido, "latin1")));
      cambios++;
    }
  }
  if (cambios === 0) return bytes;
  const salida = await doc.save({ useObjectStreams: false });
  return salida.buffer.slice(salida.byteOffset, salida.byteOffset + salida.byteLength) as ArrayBuffer;
}
