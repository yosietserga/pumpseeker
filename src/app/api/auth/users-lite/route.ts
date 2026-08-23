import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * /api/auth/users-lite — listado público mínimo para el dropdown del login.
 *
 * Devuelve solo { email, name, role } de usuarios activos: permite el acceso
 * rápido (prefill del email + chip de rol) sin exponer nada sensible.
 * No incluye hashes, ids ni fechas.
 */
export async function GET() {
  try {
    const users = await db.user.findMany({
      select: { email: true, name: true, role: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return NextResponse.json(
      { users },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ users: [] });
  }
}
