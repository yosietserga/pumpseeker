import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * /api/patterns — laboratorio de patrones.
 *
 * Toma las condiciones ACTUALES de un par (último snapshot), busca momentos
 * históricos con condiciones SIMILARES (misma dirección de momentum, Δvol y
 * Δprecio dentro de tolerancia relativa, score cercano) y calcula qué pasó
 * DESPUÉS (retorno del precio en los siguientes 5–N minutos).
 *
 * GET ?symbol=BTCUSDT&hours=72&horizon=30&tolVol=0.5&tolPd=0.5&tolScore=15
 */

interface PatternSample {
  capturedAt: string;
  volumeDiff: number;
  percentDiff: number;
  percentDiffProgressive: number;
  score: number;
  forwardPct: number;
  minutesAfter: number;
}

interface PatternResponse {
  ok: boolean;
  symbol: string;
  error?: string;
  hint?: string;
  current?: {
    capturedAt: string;
    price: number;
    priceChangePercent: number;
    percentDiff: number;
    percentDiffProgressive: number;
    volumeDiff: number;
    volumeDiffProgressive: number;
    score: number;
  };
  params?: { hours: number; horizon: number; tolVol: number; tolPd: number; tolScore: number };
  stats?: {
    matches: number;
    avgForwardPct: number;
    medianForwardPct: number;
    winRate: number;
    bestPct: number;
    worstPct: number;
  };
  samples?: PatternSample[];
}

function fail(symbol: string, error: string, hint?: string): PatternResponse {
  return { ok: false, symbol, error, hint };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    return await handle(req);
  } catch (err) {
    // p.ej. despliegues serverless sin SQLite persistente (Vercel)
    return NextResponse.json(
      fail(
        "",
        "base de datos no disponible en este despliegue",
        "la historia de snapshots requiere SQLite persistente: despliega la pila completa (web + motor) en Railway o Render"
      )
    );
  }
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const q = req.nextUrl.searchParams;
  const symbol = (q.get("symbol") ?? "").trim().toUpperCase();
  const hours = Math.min(240, Math.max(6, Number(q.get("hours") ?? 72)));
  const horizon = Math.min(120, Math.max(6, Number(q.get("horizon") ?? 30)));
  const tolVol = Math.min(2, Math.max(0.1, Number(q.get("tolVol") ?? 0.5)));
  const tolPd = Math.min(3, Math.max(0.1, Number(q.get("tolPd") ?? 0.5)));
  const tolScore = Math.min(60, Math.max(2, Number(q.get("tolScore") ?? 15)));

  if (!symbol) {
    return NextResponse.json(fail("", "symbol requerido"), { status: 400 });
  }

  // 1) condiciones actuales = snapshot más reciente del par
  const latest = await db.marketSnapshot.findFirst({
    where: { symbol },
    orderBy: { capturedAt: "desc" },
  });
  if (!latest) {
    return NextResponse.json(
      fail(
        symbol,
        "sin snapshots de este par todavía",
        "agrégalo al watchlist (⭐) para que el motor lo capture en cada snapshot"
      )
    );
  }

  // 2) historia del par en la ventana
  const since = new Date(Date.now() - hours * 3_600_000);
  const history = await db.marketSnapshot.findMany({
    where: { symbol, capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
    take: 4000,
  });
  if (history.length < 2) {
    return NextResponse.json(
      fail(symbol, "historia insuficiente", "espera más ciclos de snapshot (cada 3 min por defecto)")
    );
  }

  // 3) matching: snapshots pasados con condiciones similares a las actuales.
  //    Solo momentos con suficiente futuro conocido (>= horizon + 2 min).
  const minLagMs = (horizon + 2) * 60_000;
  const now = Date.now();
  const matches: { idx: number; forwardPct: number; minutesAfter: number }[] = [];

  const volTol = Math.max(0.15, tolVol * Math.abs(latest.volumeDiff));
  const pdTol = Math.max(0.5, tolPd * Math.abs(latest.percentDiff));
  // epsilon de momentum: valores ~0 son ruido → neutrales, matchean cualquier dirección
  const MOM_EPS = 0.005;
  const curNeutral = Math.abs(latest.percentDiffProgressive) < MOM_EPS;

  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    const age = now - h.capturedAt.getTime();
    if (age < minLagMs) continue; // aún no sabemos cómo terminó
    if (h.id === latest.id) continue;

    // misma dirección de momentum (o ambos/uno neutral)
    const hNeutral = Math.abs(h.percentDiffProgressive) < MOM_EPS;
    if (!curNeutral && !hNeutral && Math.sign(h.percentDiffProgressive) !== Math.sign(latest.percentDiffProgressive)) continue;
    // expansión de volumen dentro de tolerancia
    if (Math.abs(h.volumeDiff - latest.volumeDiff) > volTol) continue;
    // drift de precio dentro de tolerancia
    if (Math.abs(h.percentDiff - latest.percentDiff) > pdTol) continue;
    // score cercano
    if (Math.abs(h.score - latest.score) > tolScore) continue;

    // 4) retorno futuro: primer snapshot entre +5 min y +horizon min
    const from = h.capturedAt.getTime() + 5 * 60_000;
    const to = h.capturedAt.getTime() + horizon * 60_000;
    let next: (typeof history)[number] | null = null;
    for (let j = i + 1; j < history.length; j++) {
      const t = history[j].capturedAt.getTime();
      if (t >= from && t <= to) {
        next = history[j];
        break;
      }
      if (t > to) break;
    }
    if (!next || h.price <= 0) continue;

    const forwardPct = ((next.price - h.price) / h.price) * 100;
    matches.push({
      idx: i,
      forwardPct,
      minutesAfter: Math.round((next.capturedAt.getTime() - h.capturedAt.getTime()) / 60_000),
    });
  }

  const current = {
    capturedAt: latest.capturedAt.toISOString(),
    price: latest.price,
    priceChangePercent: latest.priceChangePercent,
    percentDiff: latest.percentDiff,
    percentDiffProgressive: latest.percentDiffProgressive,
    volumeDiff: latest.volumeDiff,
    volumeDiffProgressive: latest.volumeDiffProgressive,
    score: latest.score,
  };

  if (matches.length === 0) {
    return NextResponse.json({
      ok: true,
      symbol,
      current,
      params: { hours, horizon, tolVol, tolPd, tolScore },
      stats: {
        matches: 0,
        avgForwardPct: 0,
        medianForwardPct: 0,
        winRate: 0,
        bestPct: 0,
        worstPct: 0,
      },
      samples: [],
      hint: "sin coincidencias en la ventana — la historia se acumula con cada snapshot; prueba ampliar el horizonte o revisar más tarde",
    });
  }

  const forwards = matches.map((m) => m.forwardPct);
  const avg = forwards.reduce((a, b) => a + b, 0) / forwards.length;
  const sorted = [...forwards].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const wins = forwards.filter((f) => f > 0).length;

  const samples: PatternSample[] = matches
    .slice(-8)
    .reverse()
    .map((m) => {
      const h = history[m.idx];
      return {
        capturedAt: h.capturedAt.toISOString(),
        volumeDiff: h.volumeDiff,
        percentDiff: h.percentDiff,
        percentDiffProgressive: h.percentDiffProgressive,
        score: h.score,
        forwardPct: Math.round(m.forwardPct * 1000) / 1000,
        minutesAfter: m.minutesAfter,
      };
    });

  return NextResponse.json({
    ok: true,
    symbol,
    current,
    params: { hours, horizon, tolVol, tolPd, tolScore },
    stats: {
      matches: matches.length,
      avgForwardPct: Math.round(avg * 1000) / 1000,
      medianForwardPct: Math.round(median * 1000) / 1000,
      winRate: Math.round((wins / matches.length) * 1000) / 10,
      bestPct: Math.round(sorted[sorted.length - 1] * 1000) / 1000,
      worstPct: Math.round(sorted[0] * 1000) / 1000,
    },
    samples,
  });
}
