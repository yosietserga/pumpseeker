import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Proxy hacia el REST del pump-engine.
 * - Local/sandbox: http://127.0.0.1:3004 (default)
 * - Nube: ENGINE_URL = URL pública del servicio del motor
 * Requiere sesión (multi-usuario). VIEWER solo puede GET.
 */

const ENGINE_URL = process.env.ENGINE_URL ?? "http://127.0.0.1:3004";

async function requireSession(readOnly = false) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "no autenticado" }, { status: 401 }) };
  const role = (session.user as { role?: string }).role ?? "VIEWER";
  if (!readOnly && role === "VIEWER") {
    return { error: NextResponse.json({ error: "rol VIEWER: solo lectura" }, { status: 403 }) };
  }
  // acciones sensibles (keys live / telegram / kill) solo ADMIN
  return { session, role };
}

const ADMIN_ACTIONS = new Set([
  "setExchangeKeys",
  "clearExchangeKeys",
  "testExchangeKeys",
  "setLiveConfig",
  "killSwitch",
  "setTelegram",
  "testTelegram",
]);

export async function GET() {
  const auth = await requireSession(true);
  if (auth.error) return auth.error;
  try {
    const res = await fetch(`${ENGINE_URL}/state`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `engine respondió ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "motor no disponible", detail: String(err) },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(false);
  if (auth.error) return auth.error;
  try {
    const body = (await req.json()) as { action?: string };
    if (ADMIN_ACTIONS.has(body.action ?? "") && auth.role !== "ADMIN") {
      return NextResponse.json(
        { error: "esta acción requiere rol ADMIN" },
        { status: 403 }
      );
    }
    const res = await fetch(`${ENGINE_URL}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: "motor no disponible", detail: String(err) },
      { status: 503 }
    );
  }
}
