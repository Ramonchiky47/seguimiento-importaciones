import { NextResponse } from "next/server";
import { ejecutarSincronizacionAutomatica } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}

async function handleSync(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecretHeader = request.headers.get("x-cron-secret");
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret) {
      const isBearerValid = authHeader === `Bearer ${expectedSecret}`;
      const isHeaderValid = cronSecretHeader === expectedSecret;
      if (!isBearerValid && !isHeaderValid) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
      }
    }

    const resultado = await ejecutarSincronizacionAutomatica();

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      resultado,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido durante la sincronización";
    console.error("[CRON SYNC ERROR]:", message);
    return NextResponse.json(
      {
        ok: false,
        timestamp: new Date().toISOString(),
        error: message,
      },
      { status: 500 },
    );
  }
}
