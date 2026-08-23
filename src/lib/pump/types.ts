/**
 * Tipos del frontend — espejo de mini-services/pump-engine/src/types.ts.
 * (El motor es un proceso Bun aparte; se duplican para no cruzar builds.)
 */

export interface PumpMetrics {
  priceChangePercent: number;
  percentDiff: number;
  percentDiffProgressive: number;
  volumeDiff: number;
  volumeDiffProgressive: number;
}

export type ProfileName = "SCALPING" | "INTRADAY" | "BUY_THE_DIP" | "CUSTOM";

export interface CriterionResult {
  name: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface PumpSignal {
  id: string;
  symbol: string;
  price: number;
  metrics: PumpMetrics;
  quoteVolume: number;
  score: number;
  criteria: CriterionResult[];
  moda: number;
  profile: ProfileName;
  at: number;
}

export type ExitReason = "TAKE_PROFIT" | "STOP_LOSS" | "TRAILING_STOP" | "MANUAL";

export type LiveMode = "OFF" | "TESTNET" | "LIVE";

export type ExchangeId =
  | "binance"
  | "bybit"
  | "okx"
  | "bitget"
  | "gateio"
  | "kucoin"
  | "htx"
  | "kraken"
  | "bitmart";

export interface ExchangeInfo {
  id: ExchangeId;
  name: string;
  testnetSupported: boolean;
  needsPassphrase: boolean;
  passphraseLabel: string;
  keyUrl: string;
}

export interface LiveStatus {
  mode: LiveMode;
  exchange: ExchangeId;
  keysSet: boolean;
  /** prefill: exchanges con credenciales guardadas (cifradas en disco) */
  keysByExchange: Record<string, boolean>;
  availableExchanges: ExchangeInfo[];
  maxSizeUsd: number;
  dailyLossLimitUsd: number;
  openSymbols: string[];
  realizedPnlUsd: number;
  todayPnlUsd: number;
  lastError: string | null;
  lastOrderAt: number | null;
}

export interface TelegramStatus {
  enabled: boolean;
  tokenSet: boolean;
  chatId: string | null;
  sentCount: number;
  lastError: string | null;
}

export interface Position {
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
  /* estado vivo */
  lastPrice: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
  /* trailing stop — ganancia REAL desde la entrada */
  peakPrice: number;
  trailingActive: boolean;
  trailStopPrice: number;
}

export interface ClosedTrade {
  id: string;
  symbol: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  takeProfit: number;
  stopLoss: number;
  tradeSizeUsd: number;
  exitReason: ExitReason;
  pnlUsd: number;
  pnlPct: number;
  roePct: number;
  feesUsd: number;
  durationSec: number;
  openedAt: number;
  closedAt: number;
  signalId: string | null;
  wasTrailing: boolean;
}

export interface EngineConfig {
  profile: ProfileName;
  minQuoteVolume: number;
  volumeDiffMin: number;
  percentProfit: number;
  priceChangeTop: number;
  priceChangeBottom: number;
  futuresOnly: boolean;
  watchlistOnly: boolean;
  occurrences: number;
  confirmations: number;
  cooldownSec: number;
  autoTrade: boolean;
  capital: number;
  tradeSizeUsd: number;
  takeProfitPct: number;
  stopLossPct: number;
  /** trailing: se arma con esta ganancia REAL desde la entrada (%) */
  trailingActivationPct: number;
  /** trailing: distancia del stop por debajo del pico (%) */
  trailingDistancePct: number;
  maxOpenPositions: number;
  feePct: number;
  /* —— live trading (opt-in) —— */
  liveMode: LiveMode;
  liveExchange: ExchangeId;
  liveMaxSizeUsd: number;
  dailyLossLimitUsd: number;
  /* —— alertas telegram —— */
  telegramEnabled: boolean;
  telegramChatId: string;
  /** cada cuántos minutos se captura un snapshot de historia */
  snapshotIntervalMin: number;
}

export interface MarketRow {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  percentDiff: number;
  percentDiffProgressive: number;
  volumeDiff: number;
  volumeDiffProgressive: number;
  quoteVolume: number;
  hotStreak: number;
  moda: number;
  occurrences: number;
  score: number;
  isCandidate: boolean;
  inWatchlist: boolean;
  criteria: CriterionResult[];
}

export interface TraderStats {
  openPositions: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsd: number;
  totalFeesUsd: number;
  unrealizedPnlUsd: number;
  equity: number;
  avgDurationSec: number;
  bestTradeUsd: number;
  worstTradeUsd: number;
  trailingExits: number;
}

export type EngineStatus = "BOOTING" | "RUNNING" | "STOPPED";
export type FeedStatus = "LIVE" | "RECONNECTING" | "POLLING" | "DOWN";

export interface EngineState {
  status: EngineStatus;
  feed: FeedStatus;
  feedDetail: string;
  config: EngineConfig;
  /** pares del watchlist manual (persistido en disco) */
  manualWatchlist: string[];
  live: LiveStatus;
  telegram: TelegramStatus;
  marketStats: {
    watchlist: number;
    futuresSymbols: number;
    changedLastMin: number;
    ticksPerSec: number;
    lastTickAt: number;
    uptimeSec: number;
    lastSnapshotAt: number;
  };
  stats: TraderStats;
  market: MarketRow[];
  positions: Position[];
  trades: ClosedTrade[];
  signals: PumpSignal[];
  lastSignalAt: number | null;
}

export type ControlAction =
  | { action: "start" }
  | { action: "stop" }
  | { action: "setConfig"; config: Partial<EngineConfig> }
  | { action: "setProfile"; profile: ProfileName }
  | { action: "closePosition"; symbol: string }
  | { action: "closeAll" }
  | { action: "watchlistAdd"; symbol: string }
  | { action: "watchlistRemove"; symbol: string }
  | { action: "setLiveConfig"; liveMode?: LiveMode; exchange?: ExchangeId; liveMaxSizeUsd?: number; dailyLossLimitUsd?: number }
  | { action: "setExchangeKeys"; exchange: ExchangeId; apiKey: string; apiSecret: string; passphrase?: string }
  | { action: "clearExchangeKeys"; exchange: ExchangeId }
  | { action: "testExchangeKeys"; exchange: ExchangeId }
  | { action: "killSwitch" }
  | { action: "setTelegram"; botToken?: string; chatId?: string; enabled?: boolean }
  | { action: "testTelegram" };

export type Role = "ADMIN" | "TRADER" | "VIEWER";
