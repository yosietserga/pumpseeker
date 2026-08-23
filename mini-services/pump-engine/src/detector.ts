import type { CriterionResult, EngineConfig, PumpSignal, SymbolState } from "./types";

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * PumpDetector — remake del gate de ocurrencias/confirmaciones + señal.
 *
 * Original (doorman, 2024/2022):
 *   if passed → occurrences[symbol]++
 *     if occurrences ≥ config.occurrences → occurrences=1, confirmations++
 *       if confirmations ≥ config.confirmations → SEÑAL (y __moda[symbol]++ en la extensión)
 *   (en 2024 el gate estaba en `if(true)`; en 2022 usaba 10 ocurrencias / 3 confirmaciones)
 *
 * Moderno: además reset de ocurrencias al fallar (anti-flicker real) y cooldown
 * por símbolo para no spamear la misma moneda.
 */
export class PumpDetector {
  private lastSignals: PumpSignal[] = [];
  private static MAX_HISTORY = 200;

  constructor(private getConfig: () => EngineConfig) {}

  get signals(): PumpSignal[] {
    return this.lastSignals;
  }

  /**
   * Score compuesto de inercia 0-100 — modernización del sorting del original.
   * Pondera: aceleración de volumen (peso mayor, el combustible del pump),
   * momentum de precio tick a tick, expansión acumulada de volumen y hot streak.
   */
  static score(st: SymbolState): number {
    const m = st.metrics;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const volAcc = clamp01(m.volumeDiffProgressive / 1.5); // 1.5%/tick = score máximo
    const priceMom = clamp01(Math.abs(m.percentDiffProgressive) / 0.8);
    const volTotal = clamp01(m.volumeDiff / 8); // 8% expansión sesión = score máximo
    const hot = clamp01(st.hotStreak / 30);
    const raw = volAcc * 45 + priceMom * 25 + volTotal * 20 + hot * 10;
    return Math.round(Math.min(100, raw) * 10) / 10;
  }

  /**
   * Procesa un símbolo cuyo tick cambió. Devuelve una señal si disparó.
   */
  onSymbolTick(st: SymbolState, criteriaPassed: boolean, criteria: CriterionResult[]): PumpSignal | null {
    const cfg = this.getConfig();
    const now = Date.now();

    if (criteriaPassed) {
      st.occurrences += 1;
      if (st.occurrences >= cfg.occurrences) {
        st.occurrences = 0;
        st.confirmations += 1;

        const cooled = now - st.lastSignalAt >= cfg.cooldownSec * 1000;
        if (st.confirmations >= cfg.confirmations && cooled) {
          st.confirmations = 0;
          st.moda += 1;
          st.lastSignalAt = now;

          const price = st.current?.lastPrice ?? 0;
          const signal: PumpSignal = {
            id: nextId(),
            symbol: st.symbol,
            price,
            metrics: { ...st.metrics },
            quoteVolume: st.current?.quoteVolume ?? 0,
            score: PumpDetector.score(st),
            criteria,
            moda: st.moda,
            profile: cfg.profile,
            at: now,
          };
          this.pushSignal(signal);
          return signal;
        }
      }
    } else {
      // el original nunca reseteaba al fallar (bug latente); aquí sí — anti-flicker
      st.occurrences = 0;
      st.confirmations = 0;
    }

    return null;
  }

  private pushSignal(s: PumpSignal) {
    this.lastSignals.unshift(s);
    if (this.lastSignals.length > PumpDetector.MAX_HISTORY) {
      this.lastSignals.length = PumpDetector.MAX_HISTORY;
    }
  }
}
