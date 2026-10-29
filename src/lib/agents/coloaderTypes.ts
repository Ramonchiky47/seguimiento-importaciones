export type ColoaderTrackingResult = {
  coloader: string;
  referenciaConsultada: string;
  exito: boolean;
  error?: string;
  timestamp: string;

  // Hitos de transporte y fechas
  buque?: string | null;
  viaje?: string | null;
  naviera?: string | null;
  pol?: string | null;
  pod?: string | null;
  origen?: string | null;
  contenedor?: string | null;
  mbl?: string | null;
  hbl?: string | null;

  // Fechas clave operativas
  etd?: string | null;
  eta?: string | null;
  ata?: string | null;
  avisoArribo?: string | null;
  terminalPortuaria?: string | null;
  almacen?: string | null;
  fechaDesconsolidacion?: string | null;
  horaDesconsolidacion?: string | null;
  fechaRevalidacion?: string | null;

  // Datos comerciales / aduanales
  agenteAduanal?: string | null;
  patente?: string | null;
  bultos?: string | null;
  pesoKg?: string | null;
  volumenCbm?: string | null;
  estatusTexto?: string | null;

  raw?: Record<string, unknown>;
};

export interface ColoaderAgent {
  readonly nombre: string;
  soporta(coloaderName: string): boolean;
  rastrear(referencia: string, booking?: Record<string, unknown>): Promise<ColoaderTrackingResult>;
}
