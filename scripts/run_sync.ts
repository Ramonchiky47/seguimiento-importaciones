import fs from "fs";
import path from "path";
import { ejecutarSincronizacionAutomatica } from "../src/lib/sync";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

async function main() {
  console.log(`[${new Date().toISOString()}] Iniciando actualización de referencias desde Cargolink...`);
  try {
    const res = await ejecutarSincronizacionAutomatica();
    console.log(`[${new Date().toISOString()}] Actualización completada con éxito:`);
    console.log(`  - Total revisados en Cargolink: ${res.totalRevisados}`);
    console.log(`  - Nuevos encontrados: ${res.nuevos}`);
    console.log(`  - Insertados en Supabase: ${res.insertados}`);
    console.log(`  - Completados con ~20 campos: ${res.enriquecidos}`);
    if (res.errores.length > 0) {
      console.error(`  - Errores (${res.errores.length}):`, res.errores);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error durante la actualización:`, err);
    process.exit(1);
  }
}

main();
