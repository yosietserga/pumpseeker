import type { EngineConfig, ProfileName } from "./types";

/**
 * Presets del motor — remake directo del menú inquirer de cli/index.js (2024):
 *   [1] Scalping  [2] Intraday  [3] Buy The Dips
 * Mismos números de umbral, misma semántica.
 *
 * Los parámetros del trader (TP/SL/trailing) NO forman parte de los presets:
 * son globales y parametrizables en vivo desde la UI.
 */

export const BASE_CONFIG: EngineConfig = {
  profile: "SCALPING",
  minQuoteVolume: 5_000_000,
  volumeDiffMin: 0.1,
  percentProfit: 0.3,
  priceChangeTop: 15,
  priceChangeBottom: -10,
  futuresOnly: false,
  watchlistOnly: false,
  occurrences: 2,
  confirmations: 1,
  cooldownSec: 120,
  autoTrade: true,
  capital: 500,
  tradeSizeUsd: 100,
  // órbita amplia por defecto: el trailing hace el trabajo de salida
  takeProfitPct: 10,
  stopLossPct: 10,
  // trailing stop: arma con +2% REAL desde la entrada, sigue al precio a 1%
  trailingActivationPct: 2,
  trailingDistancePct: 1,
  maxOpenPositions: 5,
  feePct: 0.1,
  /* —— live trading (opt-in): OFF por defecto, detección en Binance + ejecución multi-exchange —— */
  liveMode: "OFF",
  liveExchange: "binance",
  liveMaxSizeUsd: 50,
  dailyLossLimitUsd: 25,
  /* —— alertas telegram —— */
  telegramEnabled: false,
  telegramChatId: "",
  // historia para patrones: snapshot cada 3 min
  snapshotIntervalMin: 3,
};

type ProfileOverrides = Partial<
  Pick<
    EngineConfig,
    | "minQuoteVolume"
    | "volumeDiffMin"
    | "percentProfit"
    | "priceChangeTop"
    | "priceChangeBottom"
    | "occurrences"
    | "confirmations"
  >
>;

export const PROFILES: Record<Exclude<ProfileName, "CUSTOM">, ProfileOverrides> = {
  /** [1] Scalping: change 0..10%, vol ≥ 5M — caza pumps intraminuto */
  SCALPING: {
    minQuoteVolume: 5_000_000,
    volumeDiffMin: 0.1,
    percentProfit: 0.3,
    priceChangeTop: 10,
    priceChangeBottom: 0,
    occurrences: 2,
    confirmations: 1,
  },
  /** [2] Intraday: change −10..30%, vol ≥ 20M — tendencias del día */
  INTRADAY: {
    minQuoteVolume: 20_000_000,
    volumeDiffMin: 0.1,
    percentProfit: 0.3,
    priceChangeTop: 30,
    priceChangeBottom: -10,
    occurrences: 2,
    confirmations: 1,
  },
  /** [3] Buy The Dips: change −10..1%, vol ≥ 10M — rebotes de caídas con volumen */
  BUY_THE_DIP: {
    minQuoteVolume: 10_000_000,
    volumeDiffMin: 0.1,
    percentProfit: 0.3,
    priceChangeTop: 1,
    priceChangeBottom: -10,
    occurrences: 2,
    confirmations: 1,
  },
};

export function applyProfile(cfg: EngineConfig, profile: ProfileName): EngineConfig {
  if (profile === "CUSTOM") return { ...cfg, profile };
  return { ...cfg, ...PROFILES[profile], profile };
}
