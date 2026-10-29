import type { ColoaderAgent, ColoaderTrackingResult } from "./coloaderTypes";
import { InterteamAgent } from "./interteamAgent";
import { CTLAgent } from "./ctlAgent";

class ColoaderRegistry {
  private agents: ColoaderAgent[] = [new InterteamAgent(), new CTLAgent()];

  registrar(agent: ColoaderAgent) {
    this.agents.push(agent);
  }

  obtenerAgente(coloaderName: string): ColoaderAgent | null {
    if (!coloaderName) return null;
    return this.agents.find((a) => a.soporta(coloaderName)) ?? null;
  }

  async rastrear(coloaderName: string, referencia: string): Promise<ColoaderTrackingResult> {
    const agente = this.obtenerAgente(coloaderName);
    if (!agente) {
      return {
        coloader: coloaderName,
        referenciaConsultada: referencia,
        exito: false,
        error: `No hay un agente automatizado configurado para el coloader '${coloaderName}'. Requiere acceso privado o portal manual.`,
        timestamp: new Date().toISOString(),
      };
    }
    return agente.rastrear(referencia);
  }
}

export const coloaderRegistry = new ColoaderRegistry();
