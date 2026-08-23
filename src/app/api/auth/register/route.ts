import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions, ROLES, type Role } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * /api/auth/register
 *   GET  → { hasUsers } — la UI decide entre "crear admin" o "iniciar sesión"
 *   POST → crea usuario:
 *          - si NO hay usuarios: primer usuario = ADMIN (setup inicial)
 *          - si hay: requiere sesión ADMIN (gestión de usuarios desde la UI)
 */

export async function GET() {
  const count = await db.user.count();
  return NextResponse.json({ hasUsers: count > 0 });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
      role?: string;
    };
    const email = body.email?.toLowerCase().trim() ?? "";
    const password = body.password ?? "";
    const name = body.name?.trim() || null;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "email inválido" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "la contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    const count = await db.user.count();
    let role: Role = "VIEWER";

    if (count === 0) {
      // bootstrap: el primer usuario es ADMIN
      role = "ADMIN";
    } else {
      const session = await getServerSession(authOptions);
      const sessionRole = (session?.user as { role?: string } | undefined)?.role;
      if (sessionRole !== "ADMIN") {
        return NextResponse.json(
          { error: "solo un ADMIN puede crear usuarios" },
          { status: 403 }
        );
      }
      role = (ROLES as readonly string[]).includes(body.role ?? "")
        ? (body.role as Role)
        : "VIEWER";
    }

    const exists = await db.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ error: "ese email ya está registrado" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        email,
        name,
        passwordHash,
        role,
        // modo demo: guardar contraseña en claro para el prefill del dropdown
        ...(process.env.DEMO_MODE === "true" ? { demoPassword: password } : {}),
      },
      select: { id: true, email: true, name: true, role: true },
    });

    return NextResponse.json({ ok: true, user, firstAdmin: count === 0 }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
