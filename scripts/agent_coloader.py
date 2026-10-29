#!/usr/bin/env python3
"""
Agente de Búsqueda y Extracción para Tracking de Coloaders (LCL)
Este agente identifica el coloader asignado en las importaciones LCL,
consulta su portal de rastreo en tiempo real, extrae los hitos operativos
(ETA, ATA, Buque, Terminal, Desconsolidación, Revalidación, Almacén)
y los sincroniza con la base de datos de seguimiento (Track).
"""

import sys
import os
import re
import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
import requests
from bs4 import BeautifulSoup

# Configuración de logs
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("ColoaderTracker")


class InterteamTracker:
    """Extractor para el portal de rastreo de Interteam (intralogs.com.mx)"""
    ENDPOINT = "https://intralogs.com.mx/estatusimportacion/index.php"

    @classmethod
    def track(cls, query_ref: str) -> Optional[Dict[str, Any]]:
        """
        Consulta por HBL o referencia de control.
        """
        ref_clean = query_ref.strip()
        if not ref_clean:
            return None

        logger.info(f"[Interteam] Consultando referencia: {ref_clean}")
        try:
            resp = requests.post(
                cls.ENDPOINT,
                data={"hbl": ref_clean, "search": "SEARCH"},
                headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"},
                timeout=15
            )
            if resp.status_code != 200:
                logger.warning(f"[Interteam] Error HTTP {resp.status_code}")
                return None

            html = resp.text
            if "no se encontraron" in html.lower() or "sin resultados" in html.lower():
                logger.info(f"[Interteam] Sin resultados para {ref_clean}")
                return None

            soup = BeautifulSoup(html, "html.parser")
            tables = soup.find_all("table")
            if not tables:
                return None

            data: Dict[str, Any] = {
                "coloader": "INTERTEAM",
                "consulta_ref": ref_clean,
                "timestamp_extraccion": datetime.now().isoformat(),
                "hbl": ref_clean,
                "mbl": None,
                "naviera": None,
                "origen": None,
                "pol": None,
                "pod": None,
                "buque": None,
                "contenedor": None,
                "eta": None,
                "ata": None,
                "aviso_arribo": None,
                "terminal_portuaria": None,
                "almacen": None,
                "fecha_desconsolidacion": None,
                "hora_desconsolidacion": None,
                "fecha_revalidacion": None,
                "agente_aduanal": None,
                "patente": None,
                "bultos": None,
                "peso_kg": None,
                "volumen_cbm": None
            }

            # Procesar filas de todas las tablas encontradas
            for table in tables:
                rows = table.find_all("tr")
                for r in rows:
                    ths = [th.get_text(strip=True).upper() for th in r.find_all(["th", "td"])]
                    row_text = " | ".join(ths)

                    # Tabla 1: HBL / MBL / Naviera / Bultos
                    if "HBL" in row_text and "MBL" in row_text:
                        next_tr = r.find_next_sibling("tr")
                        if next_tr:
                            tds = [td.get_text(strip=True) for td in next_tr.find_all("td")]
                            if len(tds) >= 8:
                                data["hbl"] = tds[0] or data["hbl"]
                                data["bultos"] = tds[1]
                                data["peso_kg"] = tds[2]
                                data["volumen_cbm"] = tds[3]
                                data["agente_aduanal"] = tds[6]
                                data["mbl"] = tds[7]
                                if len(tds) >= 9:
                                    data["naviera"] = tds[8]

                    # Tabla 2: Origen / POL / POD / Buque / Contenedor / ETA
                    if "ORIGEN" in row_text and "BUQUE" in row_text:
                        next_tr = r.find_next_sibling("tr")
                        if next_tr:
                            tds = [td.get_text(strip=True) for td in next_tr.find_all("td")]
                            if len(tds) >= 6:
                                data["origen"] = tds[0]
                                data["pol"] = tds[1]
                                data["pod"] = tds[2]
                                data["buque"] = tds[3]
                                data["contenedor"] = tds[4]
                                raw_eta = tds[5]
                                if raw_eta:
                                    data["eta"] = raw_eta.replace("/", "-")

                    # Tabla 3: Arribo / ATA / Descarga / Terminal
                    if "AVISO DE ARRIBO" in row_text and "TERMINAL" in row_text:
                        next_tr = r.find_next_sibling("tr")
                        if next_tr:
                            tds = [td.get_text(strip=True) for td in next_tr.find_all("td")]
                            if len(tds) >= 7:
                                data["aviso_arribo"] = tds[0]
                                raw_ata = tds[2]
                                if raw_ata:
                                    data["ata"] = raw_ata.replace("/", "-")
                                data["terminal_portuaria"] = tds[6]

                    # Tabla 4: Almacén / Desconsolidación
                    if "ALMACEN" in row_text and "DESCONSOLIDACION" in row_text:
                        next_tr = r.find_next_sibling("tr")
                        if next_tr:
                            tds = [td.get_text(strip=True) for td in next_tr.find_all("td")]
                            if len(tds) >= 3:
                                data["almacen"] = tds[0]
                                raw_desc = tds[1]
                                if raw_desc:
                                    data["fecha_desconsolidacion"] = raw_desc.replace("/", "-")
                                data["hora_desconsolidacion"] = tds[2]

                    # Tabla 5: Revalidación
                    if "REVALIDACIÓN" in row_text and "PATENTE" in row_text:
                        next_tr = r.find_next_sibling("tr")
                        if next_tr:
                            tds = [td.get_text(strip=True) for td in next_tr.find_all("td")]
                            if len(tds) >= 6:
                                raw_reval = tds[2] or tds[0]
                                if raw_reval:
                                    data["fecha_revalidacion"] = raw_reval.replace("/", "-")
                                if len(tds) >= 5:
                                    data["patente"] = tds[5]

            logger.info(f"[Interteam] Extracción exitosa para {ref_clean}: Buque={data.get('buque')}, ETA={data.get('eta')}, Almacén={data.get('almacen')}")
            return data
        except Exception as e:
            logger.error(f"[Interteam] Error consultando {ref_clean}: {e}")
            return None


class CTLTracker:
    """Extractor para Charter Link / CTL Logistics"""
    SHEET_ID = "1EekX1Be3yBeYgxrrXegZjbBFuRf2so2u4RTS9ndmZUM"
    GV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq"

    @classmethod
    def track(cls, ref: str) -> Optional[Dict[str, Any]]:
        ref_clean = ref.strip()
        if not ref_clean:
            return None

        logger.info(f"[CTL] Consultando referencia: {ref_clean}")
        try:
            # Consulta general por MBL, HBL o NBL
            query = f"select * where C contains '{ref_clean}' or D contains '{ref_clean}' or E contains '{ref_clean}' or O contains '{ref_clean}'"
            params = {
                "tqx": "out:json",
                "gid": "0",
                "headers": "1",
                "range": "A1:AZ",
                "tq": query
            }
            resp = requests.get(cls.GV_URL, params=params, timeout=15)
            if resp.status_code != 200:
                return None

            text = resp.text
            start = text.find("{")
            end = text.rfind("}")
            if start == -1 or end == -1:
                return None

            data_json = json.loads(text[start:end+1])
            rows = data_json.get("table", {}).get("rows", [])
            if not rows:
                return None

            cols = [c.get("label") or c.get("id") for c in data_json.get("table", {}).get("cols", [])]
            first_row = [c.get("v") if c else None for c in rows[0].get("c", [])]
            raw_map = dict(zip(cols, first_row))

            return {
                "coloader": "CTL LOGISTICS",
                "consulta_ref": ref_clean,
                "timestamp_extraccion": datetime.now().isoformat(),
                "buque": raw_map.get("Motonave"),
                "viaje": raw_map.get("Viaje"),
                "mbl": raw_map.get("MBL"),
                "hbl": raw_map.get("HBL"),
                "nbl": raw_map.get("NBL"),
                "origen": raw_map.get("Origen"),
                "consignatario": raw_map.get("Consignatario"),
                "papeleta": raw_map.get("Nro de Papeleta"),
                "fecha_recepcion": str(raw_map.get("Fecha Recepción")),
                "contenedor": raw_map.get("Contenedor"),
                "almacen": raw_map.get("Almacén / Patio"),
                "ubicacion": raw_map.get("Ubicación"),
                "estado": raw_map.get("Estado"),
                "bultos": raw_map.get("Cantidad de Bultos"),
                "peso": raw_map.get("Peso"),
                "volumen": raw_map.get("Volumen")
            }
        except Exception as e:
            logger.error(f"[CTL] Error consultando {ref_clean}: {e}")
            return None


class ColoaderAgentManager:
    """Orquestador para identificar y ejecutar el agente según el coloader"""

    @staticmethod
    def identify_and_track(coloader_name: str, ref: str) -> Optional[Dict[str, Any]]:
        c_upper = (coloader_name or "").upper()
        if not ref:
            return None

        if "INTERTEAM" in c_upper:
            return InterteamTracker.track(ref)
        elif "CTL" in c_upper or "CHARTER" in c_upper:
            return CTLTracker.track(ref)
        else:
            logger.info(f"Coloader {coloader_name} pendiente de adaptador automatizado o requiere sesión.")
            return None

    @staticmethod
    def map_to_track_payload(extracted: Dict[str, Any]) -> Dict[str, Any]:
        """Convierte los datos extraídos al esquema de seguimiento_importaciones"""
        payload: Dict[str, Any] = {}

        if extracted.get("eta"):
            # Normalizar a YYYY-MM-DD
            m = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", str(extracted["eta"]))
            if m:
                payload["eta_ata"] = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

        if extracted.get("ata"):
            m = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", str(extracted["ata"]))
            if m:
                payload["eta_ata"] = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

        if extracted.get("fecha_desconsolidacion"):
            m = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", str(extracted["fecha_desconsolidacion"]))
            if m:
                # Se mapea a 'revalidacion_48_horas_antes_eta' que es Fecha de Desconsolidación en LCL
                payload["revalidacion_48_horas_antes_eta"] = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

        if extracted.get("fecha_revalidacion"):
            m = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", str(extracted["fecha_revalidacion"]))
            if m:
                payload["validacion_48_horas_antes_eta"] = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

        if extracted.get("terminal_portuaria"):
            payload["terminal_portuaria"] = str(extracted["terminal_portuaria"]).strip()

        if extracted.get("contenedor"):
            payload["contenedor"] = str(extracted["contenedor"]).strip()

        if extracted.get("mbl"):
            payload["mbl"] = str(extracted["mbl"]).strip()

        if extracted.get("hbl"):
            payload["hbl"] = str(extracted["hbl"]).strip()

        return payload


def main():
    logger.info("=== Iniciando Agente de Tracking de Coloaders LCL ===")
    
    # 1. Probar extracción en vivo con un caso real
    test_coloader = "INTERTEAM"
    test_ref = "83679105"
    logger.info(f"Ejecutando prueba de rastreo con Coloader: {test_coloader}, Ref: {test_ref}")
    
    res = ColoaderAgentManager.identify_and_track(test_coloader, test_ref)
    if res:
        print("\n--- DATOS EXTRAÍDOS DEL PORTAL DEL COLOADER ---")
        print(json.dumps(res, indent=2, ensure_ascii=False))
        
        track_payload = ColoaderAgentManager.map_to_track_payload(res)
        print("\n--- CAMPOS LISTOS PARA PEGAR EN TRACK (seguimiento_importaciones) ---")
        print(json.dumps(track_payload, indent=2, ensure_ascii=False))
        
        # Generar texto de incidencia / bitácora
        log_text = (
            f"Hito de Coloader [{res.get('coloader')}]: "
            f"Buque: {res.get('buque') or 'N/A'}, "
            f"ETA/ATA: {track_payload.get('eta_ata') or 'N/A'}, "
            f"Terminal: {track_payload.get('terminal_portuaria') or 'N/A'}, "
            f"Almacén: {res.get('almacen') or 'N/A'}, "
            f"Desconsolidado: {track_payload.get('revalidacion_48_horas_antes_eta') or 'Pendiente'}"
        )
        print("\n--- REGISTRO PARA BITÁCORA / INCIDENCIAS ---")
        print(log_text)
    else:
        logger.warning("No se pudo obtener información de la referencia de prueba.")

if __name__ == "__main__":
    main()
