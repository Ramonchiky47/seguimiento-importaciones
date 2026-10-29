import fs from "fs";
import path from "path";
import { coloaderRegistry } from "../src/lib/agents/coloaderRegistry";
import { sincronizarTodosLosLcl, sincronizarTrackingBooking } from "../src/lib/agents/syncColoaderTracking";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

async function main() {
  const args = process.argv.slice(2);
  console.log(`[${new Date().toISOString()}] Iniciando Agente de Tracking de Coloaders LCL...`);

  // Modo 1: Consulta manual por argumento: npx tsx scripts/run_coloader_agent.ts "INTERTEAM" "83679105"
  if (args.length >= 2) {
    const [coloader, ref] = args;
    console.log(`\nConsultando Coloader: ${coloader} con Referencia: ${ref}...`);
    const res = await coloaderRegistry.rastrear(coloader, ref);
    console.log("\nResultado de la consulta:");
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  // Modo 2: Sincronización general de todos los LCL en la base de datos de Track
  try {
    console.log("Ejecutando barrido automático sobre importaciones LCL vigentes...");
    const stats = await sincronizarTodosLosLcl();
    console.log(`\n[${new Date().toISOString()}] Resumen de sincronización con Coloaders:`);
    console.log(`  - Total LCL en seguimiento: ${stats.totalLcl}`);
    console.log(`  - Consultados con agente: ${stats.consultados}`);
    console.log(`  - Actualizados con éxito en Track: ${stats.actualizados}`);
    console.log(`  - Omitidos (sin referencia o portal no integrado): ${stats.omitidos}`);
    if (stats.errores.length > 0) {
      console.log(`  - Errores (${stats.errores.length}):`, stats.errores);
    }
  } catch (err) {
    console.error("Error durante la ejecución del agente:", err);
    process.exit(1);
  }
}

main();
