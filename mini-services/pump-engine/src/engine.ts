import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import type {
  ClosedTrade,
  EngineConfig,
  EngineState,
  FeedStatus,
  LivePosition,
  LiveStatus,
  MarketRow,
  MarketTick,
  Position,
  PumpSignal,
  SnapshotRow,
  SymbolState,
  TelegramStatus,
} from "./types";
import { BASE_CONFIG, applyProfile } from "./profiles";
import { ChangeTracker } from "./tracker";
import { evaluateChain, type CriteriaContext } from "./criteria";
import { PumpDetector } from "./detector";
import { PaperTrader } from "./trader";
import { BinanceAdapter } from "./exchange";
import { IngestClient } from "./ingest";
import { LiveExecutor } from "./live";

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
  private liveExecutor: LiveExecutor;

  /* —— secretos: SOLO en memoria del motor, jamás en buildState() —— */
  private secrets = {
    liveApiKey: "",
    liveApiSecret: "",
    telegramBotToken: "",
  };

  /* —— módulo live (espejo real de las operaciones paper) —— */
  private livePositions = new Map<string, LivePosition>();
  private liveRealizedPnl = 0;
  private liveTodayPnl = 0;
  private liveTodayDay = "";
  private liveLastError: string | null = null;
  private liveLastOrderAt: number | null = null;
  private telegramSentCount = 0;
  private telegramLastError: string | null = null;

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
    this.liveExecutor = new LiveExecutor((symbol) =>
      this.adapter.lotInfo.get(symbol)
    );
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
    // seguridad: el live SIEMPRE arranca OFF tras reinicio — hay que reactivarlo a mano
    if (this.cfg.liveMode !== "OFF") {
      this.cfg.liveMode = "OFF";
      this.liveLastError =
        "Live desactivado tras reinicio (seguridad) — reingresa las keys y reactívalo.";
    }
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
    // posiciones reales abiertas: cierre best-effort antes de detener
    if (this.livePositions.size > 0 && this.cfg.liveMode !== "OFF") {
      void this.closeAllLive("motor detenido");
    }
    this.cfg.liveMode = "OFF";
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
      void this.mirrorCloseLive(t);
      this.notifyTelegramTrade(t);
      this.events.onTradeClosed(t);
      this.emitState(true);
    }
    return t;
  }

  closeAll(): ClosedTrade[] {
    const out = this.trader.closeAllManual();
    for (const t of out) {
      this.ingest.trade(t);
      void this.mirrorCloseLive(t);
      this.notifyTelegramTrade(t);
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
        if (pos) {
          this.ingest.positionOpened(pos);
          // espejo real (opt-in): la misma señal ejecuta orden REAL a mercado
          void this.mirrorOpenLive(pos);
        }
        this.notifyTelegramSignal(signal);
        this.events.onSignal(signal, pos);
      }

      // 3) posiciones vivas: TP / trailing / SL tick a tick
      const closed = this.trader.updatePrice(st.symbol, tick.lastPrice);
      if (closed) {
        this.ingest.trade(closed);
        void this.mirrorCloseLive(closed);
        this.notifyTelegramTrade(closed);
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

  /* —————————————————— live trading (opt-in) —————————————————— */

  private liveReady(): boolean {
    return (
      this.cfg.liveMode !== "OFF" &&
      !!this.secrets.liveApiKey &&
      !!this.secrets.liveApiSecret
    );
  }

  /** Espejo REAL de una apertura paper: MARKET BUY por monto acotado */
  private async mirrorOpenLive(pos: Position): Promise<void> {
    if (!this.liveReady() || this.livePositions.has(pos.symbol)) return;
    const size = Math.min(pos.tradeSizeUsd, this.cfg.liveMaxSizeUsd);
    if (size <= 0) return;

    const res = await this.liveExecutor.marketBuy(
      this.cfg.liveMode,
      this.secrets.liveApiKey,
      this.secrets.liveApiSecret,
      pos.symbol,
      size
    );
    if (res.ok && res.executedQty > 0) {
      this.livePositions.set(pos.symbol, {
        symbol: pos.symbol,
        orderId: res.orderId ?? null,
        qty: res.executedQty,
        quoteSpent: res.quoteAmount,
        openedAt: Date.now(),
      });
      this.liveLastOrderAt = Date.now();
      this.liveLastError = null;
      console.log(
        `[live] BUY ${pos.symbol} ${res.executedQty} @ ~$${res.quoteAmount.toFixed(2)} (${this.cfg.liveMode})`
      );
    } else {
      this.liveLastError = `BUY ${pos.symbol} falló: ${res.error ?? "sin fill"}`;
      console.error(`[live] ${this.liveLastError}`);
    }
    this.emitState(true);
  }

  /** Espejo REAL de un cierre paper: MARKET SELL + PnL real + límite diario */
  private async mirrorCloseLive(trade: ClosedTrade): Promise<void> {
    const live = this.livePositions.get(trade.symbol);
    if (!live || !this.liveReady()) {
      // sin modo activo pero con posición espejo (kill switch path) → vender igual
      if (live && (this.secrets.liveApiKey || this.secrets.liveApiSecret)) {
        return this.sellLive(live, this.cfg.liveMode === "OFF" ? "LIVE" : this.cfg.liveMode);
      }
      return;
    }
    await this.sellLive(live, this.cfg.liveMode);
  }

  private async sellLive(live: LivePosition, mode: "TESTNET" | "LIVE"): Promise<void> {
    const res = await this.liveExecutor.marketSell(
      mode,
      this.secrets.liveApiKey,
      this.secrets.liveApiSecret,
      live.symbol,
      live.qty
    );
    if (res.ok) {
      const pnl = res.quoteAmount - live.quoteSpent;
      this.liveRealizedPnl += pnl;
      this.liveTodayPnl += pnl;
      this.livePositions.delete(live.symbol);
      this.liveLastOrderAt = Date.now();
      this.liveLastError = null;
      console.log(
        `[live] SELL ${live.symbol} ${res.executedQty} → PnL $${pnl.toFixed(2)}`
      );
      // límite de pérdida diaria → kill switch automático
      if (
        this.cfg.dailyLossLimitUsd > 0 &&
        this.liveTodayPnl <= -this.cfg.dailyLossLimitUsd
      ) {
        await this.killSwitch(
          `límite de pérdida diaria alcanzado ($${this.liveTodayPnl.toFixed(2)})`
        );
      }
    } else {
      this.liveLastError = `SELL ${live.symbol} falló: ${res.error ?? "sin fill"} — ¡posición REAL puede seguir abierta!`;
      console.error(`[live] ${this.liveLastError}`);
    }
    this.emitState(true);
  }

  /** KILL SWITCH: modo OFF + venta a mercado de TODO lo real + alerta */
  async killSwitch(reason: string): Promise<void> {
    const hadMode = this.cfg.liveMode;
    this.cfg.liveMode = "OFF";
    const symbols = [...this.livePositions.keys()];
    for (const sym of symbols) {
      const live = this.livePositions.get(sym);
      if (live) await this.sellLive(live, hadMode === "OFF" ? "LIVE" : hadMode);
    }
    this.liveLastError = `KILL SWITCH: ${reason}`;
    console.warn(`[live] KILL SWITCH — ${reason}`);
    this.notifyTelegram(`⛔ <b>KILL SWITCH</b>\n${reason}`);
    this.emitState(true);
  }

  private async closeAllLive(reason: string): Promise<void> {
    await this.killSwitch(reason);
  }

  /* —— control de live desde la UI —— */

  setLiveConfig(patch: {
    liveMode?: EngineConfig["liveMode"];
    liveMaxSizeUsd?: number;
    dailyLossLimitUsd?: number;
  }): { ok: boolean; error?: string } {
    if (patch.liveMode && patch.liveMode !== "OFF") {
      if (!this.secrets.liveApiKey || !this.secrets.liveApiSecret) {
        return {
          ok: false,
          error: "guarda las API keys antes de activar TESTNET/LIVE",
        };
      }
      if (patch.liveMode === "LIVE") {
        this.liveLastError =
          "⚠️ LIVE ACTIVO — órdenes reales con dinero real. Kill switch disponible.";
      }
    }
    this.cfg = {
      ...this.cfg,
      ...(patch.liveMode !== undefined ? { liveMode: patch.liveMode } : {}),
      ...(patch.liveMaxSizeUsd !== undefined ? { liveMaxSizeUsd: patch.liveMaxSizeUsd } : {}),
      ...(patch.dailyLossLimitUsd !== undefined
        ? { dailyLossLimitUsd: patch.dailyLossLimitUsd }
        : {}),
    };
    this.events.onStatus();
    return { ok: true };
  }

  setLiveKeys(apiKey: string, apiSecret: string): void {
    this.secrets.liveApiKey = apiKey.trim();
    this.secrets.liveApiSecret = apiSecret.trim();
    this.emitState(true);
  }

  clearLiveKeys(): void {
    this.secrets.liveApiKey = "";
    this.secrets.liveApiSecret = "";
    this.cfg.liveMode = "OFF";
    this.emitState(true);
  }

  async testLiveKeys(mode: "TESTNET" | "LIVE"): Promise<{ ok: boolean; detail: string }> {
    if (!this.secrets.liveApiKey || !this.secrets.liveApiSecret) {
      return { ok: false, detail: "no hay keys guardadas" };
    }
    try {
      const { balances } = await this.liveExecutor.testKeys(
        mode,
        this.secrets.liveApiKey,
        this.secrets.liveApiSecret
      );
      this.liveLastError = null;
      return { ok: true, detail: `conexión OK (${mode}) — ${balances} balances con saldo` };
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err);
      this.liveLastError = `test de keys: ${msg}`;
      return { ok: false, detail: msg };
    }
  }

  /* —————————————————— telegram —————————————————— */

  setTelegram(patch: { botToken?: string; chatId?: string; enabled?: boolean }): void {
    if (patch.botToken !== undefined) this.secrets.telegramBotToken = patch.botToken.trim();
    if (patch.chatId !== undefined) this.cfg.telegramChatId = patch.chatId.trim();
    if (patch.enabled !== undefined) this.cfg.telegramEnabled = patch.enabled;
    this.emitState(true);
  }

  async testTelegram(): Promise<{ ok: boolean; detail: string }> {
    if (!this.secrets.telegramBotToken || !this.cfg.telegramChatId) {
      return { ok: false, detail: "falta bot token o chat id" };
    }
    const res = await this.sendTelegram(
      "✅ <b>PumpSeeker conectado</b> — recibirás señales y cierres aquí."
    );
    return res.ok
      ? { ok: true, detail: "mensaje de prueba enviado" }
      : { ok: false, detail: res.error ?? "error desconocido" };
  }

  private async sendTelegram(html: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.secrets.telegramBotToken || !this.cfg.telegramChatId) {
      return { ok: false, error: "telegram no configurado" };
    }
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.secrets.telegramBotToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: this.cfg.telegramChatId,
            text: html,
            parse_mode: "HTML",
          }),
          signal: AbortSignal.timeout(10000),
        }
      );
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || data?.ok !== true) {
        this.telegramLastError = data?.description ?? `HTTP ${res.status}`;
        return { ok: false, error: this.telegramLastError };
      }
      this.telegramSentCount += 1;
      this.telegramLastError = null;
      return { ok: true };
    } catch (err) {
      this.telegramLastError = String(err instanceof Error ? err.message : err);
      return { ok: false, error: this.telegramLastError };
    }
  }

  private notifyTelegramSignal(sig: PumpSignal): void {
    if (!this.cfg.telegramEnabled) return;
    const m = sig.metrics;
    void this.sendTelegram(
      `🚀 <b>PUMP ${sig.symbol}</b>\n` +
        `score ${sig.score.toFixed(0)} · moda ×${sig.moda}\n` +
        `Δvol ${m.volumeDiff.toFixed(2)}% · Δvol inst ${m.volumeDiffProgressive.toFixed(3)}%\n` +
        `Δprecio ${m.percentDiff.toFixed(2)}% · 24h ${m.priceChangePercent.toFixed(2)}%\n` +
        `precio ${sig.price}`
    );
  }

  private notifyTelegramTrade(t: ClosedTrade): void {
    if (!this.cfg.telegramEnabled) return;
    const icon =
      t.exitReason === "TAKE_PROFIT"
        ? "🟢"
        : t.exitReason === "STOP_LOSS"
          ? "🔴"
          : t.exitReason === "TRAILING_STOP"
            ? "🟣"
            : "⚪";
    void this.sendTelegram(
      `${icon} <b>${t.exitReason} ${t.symbol}</b>\n` +
        `PnL ${t.pnlUsd >= 0 ? "+" : ""}$${t.pnlUsd.toFixed(2)} (${t.roePct.toFixed(2)}%)\n` +
        `duración ${t.durationSec}s${t.wasTrailing ? " · trailing armado" : ""}`
    );
  }

  private notifyTelegram(html: string): void {
    if (!this.cfg.telegramEnabled) return;
    void this.sendTelegram(html);
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

    // rollover diario del PnL live
    const today = new Date().toISOString().slice(0, 10);
    if (this.liveTodayDay !== today) {
      this.liveTodayDay = today;
      this.liveTodayPnl = 0;
    }

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
      live: {
        mode: this.cfg.liveMode,
        keysSet: !!this.secrets.liveApiKey && !!this.secrets.liveApiSecret,
        maxSizeUsd: this.cfg.liveMaxSizeUsd,
        dailyLossLimitUsd: this.cfg.dailyLossLimitUsd,
        openSymbols: [...this.livePositions.keys()],
        realizedPnlUsd: Math.round(this.liveRealizedPnl * 100) / 100,
        todayPnlUsd: Math.round(this.liveTodayPnl * 100) / 100,
        lastError: this.liveLastError,
        lastOrderAt: this.liveLastOrderAt,
      },
      telegram: {
        enabled: this.cfg.telegramEnabled,
        tokenSet: !!this.secrets.telegramBotToken,
        chatId: this.cfg.telegramChatId || null,
        sentCount: this.telegramSentCount,
        lastError: this.telegramLastError,
      },
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
