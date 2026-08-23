import type { MarketTick, PumpMetrics, SymbolState } from "./types";

/**
 * ChangeTracker — remake tipado del addChange() original.
 *
 * Original (src/functions/binance.js, 2024):
 *   __cData[code].changes = { first, prev, current, historic }
 *   prev.percentDiff            = percentChange_now − percentChange_first
 *   prev.percentDiffProgressive = percentChange_now − percentChange_prev
 *   current.volumeDiff            = (volume_now − volume_first) / volume_now * 100
 *   current.volumeDiffProgressive = (volume_now − volume_prev) / volume_now * 100
 *
 * Aquí: Map<symbol, SymbolState>, sin globals, sin fugas de memoria
 * (no guardamos historic infinito — el historial vive en la DB vía ingest).
 */
export class ChangeTracker {
  private states = new Map<string, SymbolState>();

  get size(): number {
    return this.states.size;
  }

  get(symbol: string): SymbolState | undefined {
    return this.states.get(symbol);
  }

  /** % rolling 24h — Binance lo manda como P; con miniTicker se deriva de (c-o)/o */
  private static pctChange(tick: MarketTick): number {
    if (!tick.openPrice) return 0;
    return ((tick.lastPrice - tick.openPrice) / tick.openPrice) * 100;
  }

  /**
   * Registra un tick y recalcula las 4 métricas del pump.
   * Devuelve el estado si hubo cambio real (antes: hash de "volume:close"),
   * o null si el tick no movió nada.
   */
  addTick(tick: MarketTick): SymbolState | null {
    let st = this.states.get(tick.symbol);
    if (!st) {
      st = {
        symbol: tick.symbol,
        first: null,
        prev: null,
        current: null,
        metrics: {
          priceChangePercent: 0,
          percentDiff: 0,
          percentDiffProgressive: 0,
          volumeDiff: 0,
          volumeDiffProgressive: 0,
        },
        occurrences: 0,
        confirmations: 0,
        moda: 0,
        hotStreak: 0,
        lastSignalAt: 0,
        lastUpdate: tick.ts,
      };
      this.states.set(tick.symbol, st);
    }

    // detección de cambio real (antes: Math.abs(`${volume}:${close}`.hash()))
    if (
      st.current &&
      st.current.lastPrice === tick.lastPrice &&
      st.current.quoteVolume === tick.quoteVolume
    ) {
      return null;
    }

    // baseline de sesión = primer tick visto (antes: changes.first)
    if (!st.first) st.first = tick;
    st.prev = st.current ?? tick;
    st.current = tick;
    st.lastUpdate = tick.ts;

    const m = st.metrics as PumpMetrics;
    const nowPct = ChangeTracker.pctChange(tick);
    const firstPct = st.first ? ChangeTracker.pctChange(st.first) : nowPct;
    const prevPct = st.prev ? ChangeTracker.pctChange(st.prev) : nowPct;

    m.priceChangePercent = nowPct;
    m.percentDiff = nowPct - firstPct;
    m.percentDiffProgressive = nowPct - prevPct;

    // expansión de volumen — el combustible del pump
    if (tick.quoteVolume > 0) {
      m.volumeDiff = st.first
        ? ((tick.quoteVolume - st.first.quoteVolume) / tick.quoteVolume) * 100
        : 0;
      m.volumeDiffProgressive = st.prev
        ? ((tick.quoteVolume - st.prev.quoteVolume) / tick.quoteVolume) * 100
        : 0;
    }

    // "tape caliente": ticks consecutivos con volumen acelerando
    // (moderno reemplazo del gate avg-trade-time ≤ 20s del doorman)
    if (m.volumeDiffProgressive > 0) st.hotStreak += 1;
    else st.hotStreak = 0;

    return st;
  }

  /** Snapshot iterable (para el loop de detección y la tabla del radar) */
  entries(): IterableIterator<SymbolState> {
    return this.states.values();
  }
}
