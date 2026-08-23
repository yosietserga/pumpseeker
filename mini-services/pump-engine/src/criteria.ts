import type { CriterionResult, EngineConfig, SymbolState } from "./types";

/**
 * CriteriaChain — remake de los 6 __c* del workers/doorman.js original.
 *
 * Original:
 *   __cVolumeMin          quoteVolume ≥ minVolume × 1e6
 *   __cVolumeDiff         volumeDiff ≥ config.volumeDiff
 *   __cPriceIncreased     |percentDiff| ≥ percentProfit
 *   __cPriceChangeTop     percentChange ≤ priceChangeTop
 *   __cPriceChangeBottom  percentChange ≥ −|priceChangeBottom|
 *   __cOnlyFuturesSymbols f_symbols.includes(symbol)
 *
 * Moderno: short-circuit con desglose por criterio para la UI (antes: objeto results).
 */

export interface Criterion {
  name: string;
  label: string;
  test: (st: SymbolState, cfg: EngineConfig, ctx: CriteriaContext) => boolean;
  detail: (st: SymbolState, cfg: EngineConfig) => string;
}

export interface CriteriaContext {
  futuresSymbols: Set<string>;
  manualWatchlist: Set<string>;
}

const fmtUsd = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

export const CRITERIA: Criterion[] = [
  {
    name: "volumeMin",
    label: "Volumen 24h mínimo",
    test: (st, cfg) => (st.current?.quoteVolume ?? 0) >= cfg.minQuoteVolume,
    detail: (st, cfg) => `${fmtUsd(st.current?.quoteVolume ?? 0)} vs mín ${fmtUsd(cfg.minQuoteVolume)}`,
  },
  {
    name: "volumeDiff",
    label: "Expansión de volumen",
    test: (st, cfg) => st.metrics.volumeDiff >= cfg.volumeDiffMin,
    detail: (st, cfg) => `Δvol ${st.metrics.volumeDiff.toFixed(3)}% vs mín ${cfg.volumeDiffMin}%`,
  },
  {
    name: "priceIncreased",
    label: "Movimiento de precio",
    test: (st, cfg) => Math.abs(st.metrics.percentDiff) >= cfg.percentProfit,
    detail: (st, cfg) => `|Δprecio| ${Math.abs(st.metrics.percentDiff).toFixed(3)}% vs mín ${cfg.percentProfit}%`,
  },
  {
    name: "priceChangeTop",
    label: "Techo de cambio 24h",
    test: (st, cfg) => st.metrics.priceChangePercent <= cfg.priceChangeTop,
    detail: (st, cfg) => `${st.metrics.priceChangePercent.toFixed(2)}% ≤ ${cfg.priceChangeTop}%`,
  },
  {
    name: "priceChangeBottom",
    label: "Piso de cambio 24h",
    test: (st, cfg) => st.metrics.priceChangePercent >= cfg.priceChangeBottom,
    detail: (st, cfg) => `${st.metrics.priceChangePercent.toFixed(2)}% ≥ ${cfg.priceChangeBottom}%`,
  },
  {
    name: "futuresOnly",
    label: "Símbolo con futuro USDⓈ-M",
    test: (st, _cfg, ctx) => {
      if (!ctx.futuresSymbols.size) return true; // sin datos → no bloquear (igual que el original)
      return ctx.futuresSymbols.has(st.symbol);
    },
    detail: (st, _cfg) => `futures: ${st.symbol}`,
  },
  {
    name: "watchlistOnly",
    label: "En watchlist manual",
    test: (st, _cfg, ctx) => ctx.manualWatchlist.has(st.symbol),
    detail: (st, _cfg) => `watchlist: ${st.symbol}`,
  },
];

export interface ChainEvaluation {
  passed: boolean;
  results: CriterionResult[];
}

export function evaluateChain(
  st: SymbolState,
  cfg: EngineConfig,
  ctx: CriteriaContext
): ChainEvaluation {
  const results: CriterionResult[] = [];
  let passed = true;

  for (const c of CRITERIA) {
    if (c.name === "futuresOnly" && !cfg.futuresOnly) {
      results.push({ name: c.name, label: c.label, passed: true, detail: "off" });
      continue;
    }
    if (c.name === "watchlistOnly" && !cfg.watchlistOnly) {
      results.push({ name: c.name, label: c.label, passed: true, detail: "off" });
      continue;
    }
    let ok = false;
    try {
      ok = c.test(st, cfg, ctx);
    } catch {
      ok = false;
    }
    results.push({
      name: c.name,
      label: c.label,
      passed: ok,
      detail: c.detail(st, cfg),
    });
    if (!ok && passed) passed = false; // seguimos evaluando para el desglose de UI
  }

  return { passed, results };
}
