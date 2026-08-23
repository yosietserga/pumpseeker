/**
 * PumpSeeker — tipos del motor.
 *
 * Remake moderno (2025) del motor de detección de pumps de Yosiet Serga
 * (Crypto-Trends-Seeker 2024 / Bitcoin_Sismografo 2022 / crypto-trader-assistant 2021).
 * Mismas métricas, mismo ADN — tipado estricto y sin globals implícitas.
 */

/** Tick de mercado normalizado (antes: response de websockets.prevDay) */
export interface MarketTick {
  symbol: string;
  lastPrice: number;
  /** precio de apertura de la ventana 24h (para calcular el % rolling) */
  openPrice: number;
  high: number;
  low: number;
  /** volumen 24h en moneda base */
  volume: number;
  /** volumen 24h en quote (USDT) — el "combustible" del pump */
  quoteVolume: number;
  ts: number;
}

/**
 * Las 4 métricas del motor addChange() original — el fingerprint del pump.
 */
export interface PumpMetrics {
  /** % cambio de la ventana rolling 24h: (last - open) / open * 100 */
  priceChangePercent: number;
  /** drift de precio desde el baseline de la sesión: now% − first% */
  percentDiff: number;
  /** momentum tick a tick: now% − prev% */
  percentDiffProgressive: number;
  /** expansión del volumen 24h desde el baseline: (q_now − q_first) / q_now * 100 */
  volumeDiff: number;
  /** aceleración instantánea de volumen: (q_now − q_prev) / q_now * 100 */
  volumeDiffProgressive: number;
}

export type ProfileName = "SCALPING" | "INTRADAY" | "BUY_THE_DIP" | "CUSTOM";

/** Estado por símbolo (antes: __cData[symbol].changes + data.often + __moda) */
export interface SymbolState {
  symbol: string;
  first: MarketTick | null;
  prev: MarketTick | null;
  current: MarketTick | null;
  metrics: PumpMetrics;
  /** pases consecutivos de la cadena de criterios (antes: symbol:occurrences) */
  occurrences: number;
  /** confirmaciones acumuladas (antes: symbol:confirmations) */
  confirmations: number;
  /** cuántas veces disparó señal (antes: __moda del extension) */
  moda: number;
  /** ticks consecutivos con volumeDiffProgressive > 0 (hottape del tape) */
  hotStreak: number;
  lastSignalAt: number;
  lastUpdate: number;
}

/** Resultado de un criterio individual para el desglose en UI */
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
  /** score compuesto 0-100 para rankear la inercia explosiva */
  score: number;
  criteria: CriterionResult[];
  moda: number;
  profile: ProfileName;
  at: number;
}

export type ExitReason = "TAKE_PROFIT" | "STOP_LOSS" | "TRAILING_STOP" | "MANUAL";

export type LiveMode = "OFF" | "TESTNET" | "LIVE";

/** Posición real espejo en el exchange (el ledger de verdad sigue siendo paper) */
export interface LivePosition {
  symbol: string;
  orderId: number | null;
  qty: number;
  quoteSpent: number;
  openedAt: number;
}

/** Estado del módulo live — SIN secretos (nunca salen del motor) */
export interface LiveStatus {
  mode: LiveMode;
  keysSet: boolean;
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
  /* trailing stop — ganancia REAL desde la entrada, no el % 24h */
  /** máximo precio alcanzado desde la apertura */
  peakPrice: number;
  /** el trailing se armó (precio tocó entry × (1 + activación)) */
  trailingActive: boolean;
  /** stop dinámico actual: peak × (1 − distancia) — solo sube */
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
  /** true si el trailing estaba armado al cerrar (para estadísticas) */
  wasTrailing: boolean;
}

/** Configuración del motor (antes: myData 'config:*' + presets del CLI inquirer) */
export interface EngineConfig {
  profile: ProfileName;
  /* —— detección (los 6 criterios del doorman) —— */
  /** volumen mínimo 24h en USDT (antes: minVolume en millones) */
  minQuoteVolume: number;
  /** expansión mínima de volumen % (antes: volumeDiff 0.1) */
  volumeDiffMin: number;
  /** drift mínimo de precio |percentDiff| % (antes: percentProfit) */
  percentProfit: number;
  /** techo del % 24h (antes: priceChangeTop) */
  priceChangeTop: number;
  /** piso del % 24h (antes: priceChangeBottom, negativo) */
  priceChangeBottom: number;
  /** filtrar solo símbolos con futuro USDⓈ-M (antes: __cOnlyFuturesSymbols) */
  futuresOnly: boolean;
  /** solo generar señales/trades de los pares del watchlist manual */
  watchlistOnly: boolean;
  /* —— anti-flicker (antes: occurrences/confirmations) —— */
  occurrences: number;
  confirmations: number;
  /** cooldown de señal por símbolo, seg */
  cooldownSec: number;
  /* —— paper trader (antes: _trading/_capital en doorman) —— */
  autoTrade: boolean;
  capital: number;
  tradeSizeUsd: number;
  takeProfitPct: number;
  stopLossPct: number;
  /** trailing: se arma cuando la ganancia REAL desde la entrada llega a este % */
  trailingActivationPct: number;
  /** trailing: distancia del stop por debajo del pico, % */
  trailingDistancePct: number;
  maxOpenPositions: number;
  /** comisión taker por lado % (modernización: honestidad de costos) */
  feePct: number;
  /* —— live trading (opt-in, keys solo en memoria del motor) —— */
  liveMode: LiveMode;
  /** cap por orden real en USDT */
  liveMaxSizeUsd: number;
  /** límite de pérdida diaria real antes del kill switch automático (0 = off) */
  dailyLossLimitUsd: number;
  /* —— alertas telegram —— */
  telegramEnabled: boolean;
  telegramChatId: string;
  /* —— historia para detección de patrones —— */
  /** cada cuántos minutos se captura un snapshot de estadísticas */
  snapshotIntervalMin: number;
}

/** Fila de mercado para la UI (top del radar) */
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
  /** pasó la cadena completa de criterios */
  isCandidate: boolean;
  /** está en el watchlist manual del usuario */
  inWatchlist: boolean;
  criteria: CriterionResult[];
}

/**
 * Snapshot de estadísticas de un par en un instante — la "historia"
 * para comparar condiciones actuales vs pasadas y predecir comportamientos.
 */
export interface SnapshotRow {
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
