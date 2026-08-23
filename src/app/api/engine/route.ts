import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy hacia el REST del pump-engine.
 * - Local/sandbox: http://127.0.0.1:3004 (default)
 * - Nube: ENGINE_URL = URL pública del servicio del motor (ej. https://pumpseeker-engine.up.railway.app)
 */

const ENGINE_URL = process.env.ENGINE_URL ?? "http://127.0.0.1:3004";

export async function GET() {
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
  try {
    const body = await req.json();
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
