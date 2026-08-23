import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import type {
  ClosedTrade,
  EngineConfig,
  EngineState,
  FeedStatus,
  MarketRow,
  MarketTick,
  Position,
  PumpSignal,
  SnapshotRow,
  SymbolState,
} from "./types";
import { BASE_CONFIG, applyProfile } from "./profiles";
import { ChangeTracker } from "./tracker";
import { evaluateChain, type CriteriaContext } from "./criteria";
import { PumpDetector } from "./detector";
import { PaperTrader } from "./trader";
import { BinanceAdapter } from "./exchange";
import { IngestClient } from "./ingest";

const WATCHLIST_FILE = fileURLToPath(new URL("../watchlist.json", import.meta.url));

const MARKET_ROWS = 40;
const SIGNALS_SLICE = 60;
const TRADES_SLICE = 60;
const STALE_ROW_MS = 5 * 60 * 1000;
const SNAPSHOT_TOP = 20;
const SNAPSHOT_MAX = 70;

function loadWatchlistFile(): string[] {
  try {
    const data = JSON.parse(readFileSync(WATCHLIST_FILE, "utf-8")) as {
      symbols?: string[];
    };
    return Array.isArray(data.symbols)
      ? data.symbols.filter((s) => typeof s === "string")
      : [];
  } catch {
    return [];
  }
}

/** BTC / btc → BTCUSDT */
export function normalizeSymbol(input: string): string | null {
  let s = input.trim().toUpperCase().replace("/", "").replace("-", "");
  if (!s) return null;
  if (!s.endsWith("USDT")) s += "USDT";
  return /^[A-Z0-9]{2,20}USDT$/.test(s) ? s : null;
}

export interface EngineEvents {
  onState: (state: EngineState) => void;
  onSignal: (signal: PumpSignal, position: Position | null) => void;
  onTradeClosed: (trade: ClosedTrade) => void;
  onStatus: () => void;
}

/**
 * Engine — orquestador. Remake del workers/manager.js + doorman.js:
 * adapter feed → ChangeTracker → CriteriaChain → PumpDetector → PaperTrader.
 * Además: watchlist manual persistente y snapshots de historia para patrones.
 */
export class Engine {
  private cfg: EngineConfig = { ...BASE_CONFIG };
  private tracker = new ChangeTracker();
  private detector = new PumpDetector(() => this.cfg);
  private trader = new PaperTrader(() => this.cfg);
  private adapter: BinanceAdapter;
  private ingest = new IngestClient();

  /** watchlist manual del usuario — persistida en watchlist.json */
  private manualWatchlist = new Set<string>(loadWatchlistFile());

  /** historia para patrones */
  private lastSnapshotAt = 0;
  private snapTimer: ReturnType<typeof setInterval> | null = null;

  status: "BOOTING" | "RUNNING" | "STOPPED" = "BOOTING";
  private feedStatus: FeedStatus = "DOWN";
  private feedDetail = "iniciando";
  private startedAt = Date.now();
  private lastTickAt = 0;
  private ticksCounter = 0;
  private ticksPerSec = 0;
  private changedLastMin = 0;
  private recentChanged = new Set<string>();
  private lastStateEmit = 0;

  constructor(private events: EngineEvents) {
    this.adapter = new BinanceAdapter({
      onTicks: (ticks) => this.onTicks(ticks),
      onFeedStatus: (s, d) => {
        this.feedStatus = s;
        this.feedDetail = d;
        this.events.onStatus();
      },
    });
  }

  get config(): EngineConfig {
    return this.cfg;
  }

  get watchlist(): string[] {
    return [...this.manualWatchlist].sort();
  }

  /* —————————————————— watchlist manual —————————————————— */

  addWatchlist(symbol: string): boolean {
    const s = normalizeSymbol(symbol);
    if (!s) return false;
    if (!this.manualWatchlist.has(s)) {
      this.manualWatchlist.add(s);
      this.persistWatchlist();
      this.emitState(true);
    }
    return true;
  }

  removeWatchlist(symbol: string): void {
    const s = symbol.trim().toUpperCase();
    if (this.manualWatchlist.delete(s)) {
      this.persistWatchlist();
      this.emitState(true);
    }
  }

  private persistWatchlist(): void {
    try {
      writeFileSync(
        WATCHLIST_FILE,
        JSON.stringify({ symbols: this.watchlist }, null, 2)
      );
    } catch {
      /* disco no disponible — seguimos en memoria */
    }
  }

  /* —————————————————— ciclo de vida —————————————————— */

  /** Arranque: bootstrap + feed (antes: manager.start(ex) → doorman.start()) */
  async start(): Promise<void> {
    this.status = "BOOTING";
    this.events.onStatus();
    try {
      await this.adapter.bootstrap();
      this.startedAt = Date.now();
      this.status = "RUNNING";
      this.adapter.connect();

      // captura de historia para patrones
      if (this.snapTimer) clearInterval(this.snapTimer);
      this.snapTimer = setInterval(() => this.maybeSnapshot(), 30_000);
    } catch (err) {
      this.feedStatus = "DOWN";
      this.feedDetail = `bootstrap error: ${String(err)}`;
      this.status = "STOPPED";
    }
    this.events.onStatus();
  }

  stop(): void {
    this.adapter.dispose();
    if (this.snapTimer) {
      clearInterval(this.snapTimer);
      this.snapTimer = null;
    }
    this.status = "STOPPED";
    this.feedStatus = "DOWN";
    this.feedDetail = "motor detenido por el usuario";
    this.events.onStatus();
  }

  setConfig(patch: Partial<EngineConfig>): void {
    this.cfg = { ...this.cfg, ...patch, profile: patch.profile ?? this.cfg.profile };
    this.events.onStatus();
  }

  setProfile(profile: EngineConfig["profile"]): void {
    this.cfg = applyProfile(this.cfg, profile);
    this.events.onStatus();
  }

  closePosition(symbol: string): ClosedTrade | null {
    const t = this.trader.closeManual(symbol);
    if (t) {
      this.ingest.trade(t);
      this.events.onTradeClosed(t);
      this.emitState(true);
    }
    return t;
  }

  closeAll(): ClosedTrade[] {
    const out = this.trader.closeAllManual();
    for (const t of out) {
      this.ingest.trade(t);
      this.events.onTradeClosed(t);
    }
    if (out.length) this.emitState(true);
    return out;
  }

  /* —————————————————— pipeline —————————————————— */

  private ctx(): CriteriaContext {
    return {
      futuresSymbols: this.adapter.futuresSymbols,
      manualWatchlist: this.manualWatchlist,
    };
  }

  /**
   * Pipeline por lote de ticks — el corazón (antes: __listen + __callCriteria cada 60s;
   * ahora event-driven por push del stream).
   */
  private onTicks(ticks: MarketTick[]): void {
    this.ticksCounter += ticks.length;
    this.lastTickAt = Date.now();

    const ctx = this.ctx();

    for (const tick of ticks) {
      const st = this.tracker.addTick(tick);
      if (!st) continue;
      this.recentChanged.add(st.symbol);

      // 1) cadena de criterios (short-circuit + desglose)
      const evalChain = evaluateChain(st, this.cfg, ctx);

      // 2) gate de ocurrencias/confirmaciones → señal
      const signal = this.detector.onSymbolTick(st, evalChain.passed, evalChain.results);
      if (signal) {
        const pos = this.trader.openFromSignal(signal);
        this.ingest.signal(signal);
        if (pos) this.ingest.positionOpened(pos);
        this.events.onSignal(signal, pos);
      }

      // 3) posiciones vivas: TP / trailing / SL tick a tick
      const closed = this.trader.updatePrice(st.symbol, tick.lastPrice);
      if (closed) {
        this.ingest.trade(closed);
        this.events.onTradeClosed(closed);
      }
    }

    this.emitState();
  }

  /* —————————————————— snapshots de historia —————————————————— */

  private maybeSnapshot(): void {
    if (this.status !== "RUNNING") return;
    const intervalMs = Math.max(1, this.cfg.snapshotIntervalMin) * 60_000;
    if (Date.now() - this.lastSnapshotAt >= intervalMs) {
      this.lastSnapshotAt = Date.now();
      this.captureSnapshot();
    }
  }

  /**
   * Captura el estado estadístico de: top N por score + watchlist completo +
   * cualquier par con tape caliente (hotStreak ≥ 5). La UI de patrones compara
   * estas condiciones históricas con las actuales para predecir comportamiento.
   */
  private captureSnapshot(): void {
    const now = Date.now();
    const states: SymbolState[] = [];
    for (const st of this.tracker.entries()) {
      if (!st.current) continue;
      if (now - st.lastUpdate > STALE_ROW_MS) continue;
      states.push(st);
    }

    states.sort((a, b) => PumpDetector.score(b) - PumpDetector.score(a));

    const rows: SnapshotRow[] = [];
    const chosen = new Set<string>();
    for (const st of states) {
      if (rows.length >= SNAPSHOT_TOP) break;
      rows.push(this.snapshotFromState(st, now));
      chosen.add(st.symbol);
    }
    for (const st of states) {
      if (rows.length >= SNAPSHOT_MAX) break;
      const isWatch = this.manualWatchlist.has(st.symbol);
      if ((isWatch || st.hotStreak >= 5) && !chosen.has(st.symbol)) {
        rows.push(this.snapshotFromState(st, now));
        chosen.add(st.symbol);
      }
    }

    if (rows.length) {
      this.ingest.snapshots(rows);
      console.log(
        `[pump-engine] snapshot capturado: ${rows.length} pares (${new Date().toLocaleTimeString()})`
      );
    }
  }

  private snapshotFromState(st: SymbolState, now: number): SnapshotRow {
    return {
      symbol: st.symbol,
      price: st.current?.lastPrice ?? 0,
      priceChangePercent: st.metrics.priceChangePercent,
      percentDiff: st.metrics.percentDiff,
      percentDiffProgressive: st.metrics.percentDiffProgressive,
      volumeDiff: st.metrics.volumeDiff,
      volumeDiffProgressive: st.metrics.volumeDiffProgressive,
      quoteVolume: st.current?.quoteVolume ?? 0,
      score: PumpDetector.score(st),
      hotStreak: st.hotStreak,
      moda: st.moda,
      capturedAt: now,
    };
  }

  /* —————————————————— estado para UI/API —————————————————— */

  private rowFromState(st: SymbolState, ctx: CriteriaContext): MarketRow | null {
    if (!st.current) return null;
    const isWatch = this.manualWatchlist.has(st.symbol);
    const ev = evaluateChain(st, this.cfg, ctx);
    return {
      symbol: st.symbol,
      lastPrice: st.current.lastPrice,
      priceChangePercent: st.metrics.priceChangePercent,
      percentDiff: st.metrics.percentDiff,
      percentDiffProgressive: st.metrics.percentDiffProgressive,
      volumeDiff: st.metrics.volumeDiff,
      volumeDiffProgressive: st.metrics.volumeDiffProgressive,
      quoteVolume: st.current.quoteVolume,
      hotStreak: st.hotStreak,
      moda: st.moda,
      occurrences: st.occurrences,
      score: PumpDetector.score(st),
      isCandidate: ev.passed,
      inWatchlist: isWatch,
      criteria: ev.results,
    };
  }

  /** Snapshot completo del motor para UI/API */
  buildState(): EngineState {
    const now = Date.now();
    const ctx = this.ctx();

    // métricas de throughput
    if (!this.lastStateEmit) this.lastStateEmit = now;
    const elapsed = (now - this.startedAt) / 1000;
    if (elapsed > 0) {
      this.ticksPerSec = Math.round((this.ticksCounter / elapsed) * 10) / 10;
    }

    const rows: MarketRow[] = [];
    for (const st of this.tracker.entries()) {
      if (now - st.lastUpdate > STALE_ROW_MS) continue;
      const isWatch = this.manualWatchlist.has(st.symbol);
      // el watchlist siempre aparece en el radar aunque el volumen sea bajo
      if (!isWatch && (st.current?.quoteVolume ?? 0) < this.cfg.minQuoteVolume * 0.5) continue;
      const row = this.rowFromState(st, ctx);
      if (row) rows.push(row);
    }
    rows.sort((a, b) => b.score - a.score);
    if (rows.length > MARKET_ROWS) {
      // el top N se recorta, pero el watchlist manual siempre entra
      const kept = rows.slice(0, MARKET_ROWS);
      for (const r of rows.slice(MARKET_ROWS)) {
        if (this.manualWatchlist.has(r.symbol)) kept.push(r);
      }
      rows.length = 0;
      rows.push(...kept);
    }

    if (this.recentChanged.size) {
      this.changedLastMin = this.recentChanged.size;
    }

    return {
      status: this.status,
      feed: this.feedStatus,
      feedDetail: this.feedDetail,
      config: { ...this.cfg },
      manualWatchlist: this.watchlist,
      marketStats: {
        watchlist: this.adapter.watchlist.size,
        futuresSymbols: this.adapter.futuresSymbols.size,
        changedLastMin: this.changedLastMin,
        ticksPerSec: this.ticksPerSec,
        lastTickAt: this.lastTickAt,
        uptimeSec: Math.round((now - this.startedAt) / 1000),
        lastSnapshotAt: this.lastSnapshotAt,
      },
      stats: this.trader.stats(),
      market: rows,
      positions: this.trader.openPositions,
      trades: this.trader.closedTrades.slice(0, TRADES_SLICE),
      signals: this.detector.signals.slice(0, SIGNALS_SLICE),
      lastSignalAt: this.detector.signals[0]?.at ?? null,
    };
  }

  /** Emite estado a los sockets con throttle de 2s */
  emitState(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastStateEmit < 2000) return;
    this.lastStateEmit = now;
    this.events.onState(this.buildState());
  }
}
