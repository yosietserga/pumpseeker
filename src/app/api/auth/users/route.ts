import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/** GET /api/auth/users — lista de usuarios (solo ADMIN) */
export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session) {
    return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  }
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "solo ADMIN" }, { status: 403 });
  }
  const users = await db.user.findMany({
    select: { id: true, email: true, name: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
}
