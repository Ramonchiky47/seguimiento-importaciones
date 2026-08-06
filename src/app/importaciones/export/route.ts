import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyPermissions } from "@/lib/permissions";
import { FIELD_LABELS, LIST_COLUMNS } from "@/types/importacion";

const SORTABLE_FIELDS = new Set<string>(LIST_COLUMNS);

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  const myPermissions = await getMyPermissions();
  if (!myPermissions.puede_exportar) {
    return new Response("No tienes permiso para exportar.", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const sort = searchParams.get("sort") ?? undefined;
  const dir = searchParams.get("dir") ?? undefined;
  const estatusRaw = searchParams.getAll("estatus");
  const estatusFilter = estatusRaw.length > 0 ? estatusRaw : ["Vigente"];
  const isTodosEstatus = estatusFilter.includes("Todos");
  const isNingunoEstatus = estatusFilter.includes("Ninguno");
  const polFilter = searchParams.getAll("pol");
  const podFilter = searchParams.getAll("pod");

  const supabase = await createClient();

  const sortField = sort && SORTABLE_FIELDS.has(sort) ? sort : "id";
  const sortAscending = dir === "asc";

  let query = supabase
    .from("seguimiento_importaciones")
    .select("*")
    .order(sortField, { ascending: sortAscending });

  if (q) {
    query = query.or(
      `booking.ilike.%${q}%,client.ilike.%${q}%,contenedor.ilike.%${q}%,mbl.ilike.%${q}%,hbl.ilike.%${q}%,naviera.ilike.%${q}%,operativo.ilike.%${q}%`,
    );
  }

  if (isNingunoEstatus) {
    query = query.eq("id", -1);
  } else if (!isTodosEstatus) {
    query = query.in("estatus", estatusFilter);
  }

  if (polFilter.length > 0) {
    query = query.in("pol", polFilter);
  }

  if (podFilter.length > 0) {
    query = query.in("pod", podFilter);
  }

  const { data, error } = await query;

  if (error) {
    return new Response(`Error al exportar: ${error.message}`, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, string | number | null>[];

  const header = LIST_COLUMNS.map((field) => csvEscape(FIELD_LABELS[field] ?? field)).join(",");
  const lines = rows.map((row) =>
    LIST_COLUMNS.map((field) => csvEscape(row[field])).join(","),
  );
  const csv = "﻿" + [header, ...lines].join("\r\n");

  const fecha = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="importaciones-${fecha}.csv"`,
    },
  });
}
