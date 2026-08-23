import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * /api/auth/users-lite — listado mínimo para el dropdown del login.
 *
 * Modo demo (DEMO_MODE=true): incluye la contraseña en claro de cada usuario
 * (guardada solo para demo) para el prefill de UN CLIC — email + contraseña.
 * En producción (DEMO_MODE=false) NO se devuelven contraseñas: el dropdown
 * solo prella el email.
 */

const DEMO_MODE = process.env.DEMO_MODE === "true";

export async function GET() {
  try {
    const users = await db.user.findMany({
      select: { email: true, name: true, role: true, demoPassword: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return NextResponse.json(
      {
        demoMode: DEMO_MODE,
        users: users.map((u) => ({
          email: u.email,
          name: u.name,
          role: u.role,
          ...(DEMO_MODE && u.demoPassword ? { password: u.demoPassword } : {}),
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ demoMode: DEMO_MODE, users: [] });
  }
}
