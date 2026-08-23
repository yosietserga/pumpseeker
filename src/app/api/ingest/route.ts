import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * /api/ingest — punto de persistencia del motor (pump-engine :3004 → aquí).
 * Recibe lotes de eventos: signal | position | trade | snapshot.
 * Es interno (localhost); si falla, el motor sigue operando en memoria.
 */

interface IngestSignal {
  id: string;
  symbol: string;
  price: number;
  metrics: {
    percentDiff: number;
    percentDiffProgressive: number;
    volumeDiff: number;
    volumeDiffProgressive: number;
  };
  quoteVolume: number;
  score: number;
  moda: number;
  profile: string;
  at: number;
}

interface IngestPosition {
  id: string;
  symbol: string;
  qty: number;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  tradeSizeUsd: number;
  feesUsd: number;
  openedAt: number;
  signalId: string | null;
}

interface IngestTrade {
  id: string;
  symbol: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  takeProfit: number;
  stopLoss: number;
  tradeSizeUsd: number;
  exitReason: string;
  pnlUsd: number;
  pnlPct: number;
  roePct: number;
  feesUsd: number;
  durationSec: number;
  openedAt: number;
  closedAt: number;
  signalId: string | null;
}

interface IngestSnapshot {
  symbol: string;
  price: number;
  priceChangePercent: number;
  percentDiff: number;
  percentDiffProgressive: number;
  volumeDiff: number;
  volumeDiffProgressive: number;
  quoteVolume: number;
  score: number;
  hotStreak: number;
  moda: number;
  capturedAt: number;
}

const SNAPSHOT_RETENTION_DAYS = 10;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      events?: { type: string; data: unknown }[];
    };
    const events = body.events ?? [];
    let saved = 0;
    let snapshots = 0;

    for (const ev of events) {
      try {
        if (ev.type === "signal" && ev.data) {
          const s = ev.data as IngestSignal;
          await db.pumpSignal.create({
            data: {
              id: s.id,
              symbol: s.symbol,
              price: s.price,
              percentDiff: s.metrics?.percentDiff ?? 0,
              percentDiffProgressive: s.metrics?.percentDiffProgressive ?? 0,
              volumeDiff: s.metrics?.volumeDiff ?? 0,
              volumeDiffProgressive: s.metrics?.volumeDiffProgressive ?? 0,
              quoteVolume: s.quoteVolume ?? 0,
              score: s.score ?? 0,
              moda: s.moda ?? 1,
              profile: s.profile ?? "SCALPING",
            },
          });
          saved++;
        } else if (ev.type === "position" && ev.data) {
          const p = ev.data as IngestPosition;
          await db.pumpTrade.create({
            data: {
              id: p.id,
              symbol: p.symbol,
              qty: p.qty,
              entryPrice: p.entryPrice,
              takeProfit: p.takeProfit,
              stopLoss: p.stopLoss,
              tradeSizeUsd: p.tradeSizeUsd,
              status: "OPEN",
              feesUsd: p.feesUsd,
              signalId: p.signalId,
              openedAt: new Date(p.openedAt),
            },
          });
          saved++;
        } else if (ev.type === "trade" && ev.data) {
          const t = ev.data as IngestTrade;
          await db.pumpTrade.upsert({
            where: { id: t.id },
            create: {
              id: t.id,
              symbol: t.symbol,
              qty: t.qty,
              entryPrice: t.entryPrice,
              exitPrice: t.exitPrice,
              takeProfit: t.takeProfit,
              stopLoss: t.stopLoss,
              tradeSizeUsd: t.tradeSizeUsd,
              status: t.exitReason,
              exitReason: t.exitReason,
              pnlUsd: t.pnlUsd,
              pnlPct: t.pnlPct,
              feesUsd: t.feesUsd,
              durationSec: t.durationSec,
              signalId: t.signalId,
              openedAt: new Date(t.openedAt),
              closedAt: new Date(t.closedAt),
            },
            update: {
              exitPrice: t.exitPrice,
              status: t.exitReason,
              exitReason: t.exitReason,
              pnlUsd: t.pnlUsd,
              pnlPct: t.pnlPct,
              feesUsd: t.feesUsd,
              durationSec: t.durationSec,
              closedAt: new Date(t.closedAt),
            },
          });
          saved++;
        } else if (ev.type === "snapshot" && ev.data) {
          const r = ev.data as IngestSnapshot;
          await db.marketSnapshot.create({
            data: {
              symbol: r.symbol,
              price: r.price ?? 0,
              priceChangePercent: r.priceChangePercent ?? 0,
              percentDiff: r.percentDiff ?? 0,
              percentDiffProgressive: r.percentDiffProgressive ?? 0,
              volumeDiff: r.volumeDiff ?? 0,
              volumeDiffProgressive: r.volumeDiffProgressive ?? 0,
              quoteVolume: r.quoteVolume ?? 0,
              score: r.score ?? 0,
              hotStreak: r.hotStreak ?? 0,
              moda: r.moda ?? 0,
              capturedAt: new Date(r.capturedAt ?? Date.now()),
            },
          });
          saved++;
          snapshots++;
        }
      } catch (err) {
        // un evento duplicado/caído no debe tumbar el lote
        console.error("[ingest] evento ignorado:", String(err));
      }
    }

    // mantenimiento oportunista (~5% de los lotes con snapshots)
    if (snapshots > 0 && Math.random() < 0.05) {
      try {
        await db.marketSnapshot.deleteMany({
          where: {
            capturedAt: { lt: new Date(Date.now() - SNAPSHOT_RETENTION_DAYS * 86_400_000) },
          },
        });
        // posiciones que quedaron abiertas tras un reinicio del motor → cerradas
        await db.pumpTrade.updateMany({
          where: {
            status: "OPEN",
            openedAt: { lt: new Date(Date.now() - 6 * 3_600_000) },
          },
          data: { status: "MANUAL", exitReason: "EXPIRED" },
        });
      } catch {
        /* mantenimiento best-effort */
      }
    }

    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 400 });
  }
}
