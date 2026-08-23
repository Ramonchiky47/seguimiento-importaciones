import crypto from "node:crypto";

export const REPORTE_VENDEDORES_URL = (
  process.env.REPORTE_VENDEDORES_URL || "https://reporte-vendedores-cargolink.vercel.app"
).trim();

const SSO_SHARED_SECRET = (process.env.SSO_SHARED_SECRET || "").trim();

/** Firma un token de acceso único (60s) para entrar ya autenticado a la app
 * de reporte de vendedores (mismo catálogo de accesos, sin pedir login de
 * nuevo). Devuelve null si no hay secreto compartido configurado. */
export function buildWebappSsoUrl(email: string, next: string): string | null {
  if (!SSO_SHARED_SECRET) return null;

  const payload = Buffer.from(JSON.stringify({ email, iat: Date.now() / 1000 })).toString(
    "base64url",
  );
  const signature = crypto.createHmac("sha256", SSO_SHARED_SECRET).update(payload).digest("hex");
  const token = `${payload}.${signature}`;

  const target = new URL("/sso", REPORTE_VENDEDORES_URL);
  target.searchParams.set("token", token);
  target.searchParams.set("next", next);
  return target.toString();
}
