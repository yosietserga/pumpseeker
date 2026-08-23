import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * /api/history — señales y operaciones persistidas (Prisma/SQLite).
 */

export async function GET(req: NextRequest) {
  const limit = Math.min(
    500,
    Number(req.nextUrl.searchParams.get("limit") ?? 100)
  );

  try {
    const [signals, trades, agg] = await Promise.all([
      db.pumpSignal.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      db.pumpTrade.findMany({
        orderBy: { openedAt: "desc" },
        take: limit,
      }),
      db.pumpTrade.aggregate({
        where: { status: { not: "OPEN" } },
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json(
      { signals, trades, closedCount: agg._count._all },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
