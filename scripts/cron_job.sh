#!/bin/bash
# Script para sincronización diaria de Cargolink (6:30 PM)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR" || exit 1

LOG_FILE="$SCRIPT_DIR/cron_sync.log"
echo "==================================================" >> "$LOG_FILE"
echo "[$(date)] Iniciando actualización automática..." >> "$LOG_FILE"

npx --yes tsx scripts/run_sync.ts >> "$LOG_FILE" 2>&1

echo "[$(date)] Consultando hitos de rastreo en portales de coloaders (LCL)..." >> "$LOG_FILE"
npx --yes tsx scripts/run_coloader_agent.ts >> "$LOG_FILE" 2>&1

EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "[$(date)] Sincronización y tracking completados exitosamente." >> "$LOG_FILE"
else
  echo "[$(date)] Error en la sincronización o tracking. Código de salida: $EXIT_CODE" >> "$LOG_FILE"
fi
