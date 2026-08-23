import type {
  ClosedTrade,
  EngineConfig,
  ExitReason,
  Position,
  PumpSignal,
  SymbolState,
  TraderStats,
} from "./types";

let seq = 0;
const nextId = () => `T${Date.now().toString(36)}${(seq++).toString(36).padStart(3, "0")}`;

/**
 * PaperTrader — remake del bloque _trading del doorman original + trailing stop.
 *
 * Original (2024):
 *   buy = askPrice · sell = bid × (1 + percentProfit/100) · sl = bid/1.01
 *   maker cuando buy ≥ bid · taker cuando sell ≤ bid o sell ≤ sl
 *
 * Nuevo (pedido del usuario): TP +10% / SL −10% de órbita amplia, y un
 * TRAILING STOP que se arma con +2% de ganancia REAL desde el precio de
 * ENTRADA (no el % 24h) y persigue al pico con 1% de distancia.
 *   ej: entra a 100 → sube a 102 → arma trailing → SL sube a 100.98
 *       → sube a 105 → SL 103.95 → retrocede a 103.95 → sale (TRAILING_STOP)
 * Todo parametrizable: trailingActivationPct / trailingDistancePct.
 */
export class PaperTrader {
  private positions = new Map<string, Position>();
  private closed: ClosedTrade[] = [];

  constructor(private getConfig: () => EngineConfig) {}

  get openPositions(): Position[] {
    return Array.from(this.positions.values()).sort((a, b) => b.openedAt - a.openedAt);
  }

  get closedTrades(): ClosedTrade[] {
    return this.closed.slice().sort((a, b) => b.closedAt - a.closedAt);
  }

  hasPosition(symbol: string): boolean {
    return this.positions.has(symbol);
  }

  /**
   * Abre posición LONG al precio de mercado tras una señal.
   * TP/SL amplios (10%/10% por defecto) — la salida fina la hace el trailing.
   */
  openFromSignal(sig: PumpSignal): Position | null {
    const cfg = this.getConfig();
    if (!cfg.autoTrade) return null;
    if (this.positions.size >= cfg.maxOpenPositions) return null;
    if (this.positions.has(sig.symbol)) return null;

    const available = cfg.capital + this.realizedPnl();
    if (available < cfg.tradeSizeUsd) return null;

    const slippage = 0.0005; // 0.05% — entrada a mercado
    const entryPrice = sig.price * (1 + slippage);
    const qty = cfg.tradeSizeUsd / entryPrice;
    const feesUsd = entryPrice * qty * (cfg.feePct / 100);

    const pos: Position = {
      id: nextId(),
      symbol: sig.symbol,
      qty,
      entryPrice,
      takeProfit: entryPrice * (1 + cfg.takeProfitPct / 100),
      stopLoss: entryPrice * (1 - cfg.stopLossPct / 100),
      tradeSizeUsd: cfg.tradeSizeUsd,
      feesUsd,
      openedAt: Date.now(),
      signalId: sig.id,
      lastPrice: sig.price,
      unrealizedPnlUsd: 0,
      unrealizedPnlPct: 0,
      // trailing stop — se arma con ganancia real desde la entrada
      peakPrice: entryPrice,
      trailingActive: false,
      trailStopPrice: 0,
    };
    this.positions.set(sig.symbol, pos);
    return pos;
  }

  /**
   * Actualiza una posición con el último precio:
   * 1) rastrea el pico, 2) arma/sube el trailing, 3) ejecuta TP/trail/SL.
   * Devuelve el trade cerrado si disparó.
   */
  updatePrice(symbol: string, price: number): ClosedTrade | null {
    const pos = this.positions.get(symbol);
    if (!pos) return null;

    pos.lastPrice = price;
    const cfg = this.getConfig();

    // 1) pico desde la apertura (el trailing persigue al MÁXIMO, no al precio)
    if (price > pos.peakPrice) pos.peakPrice = price;

    // 2) trailing: ganancia REAL desde la entrada — (price - entry)/entry,
    //    NO el % de cambio 24h de Binance
    const gainPct = ((pos.peakPrice - pos.entryPrice) / pos.entryPrice) * 100;
    if (!pos.trailingActive && gainPct >= cfg.trailingActivationPct) {
      pos.trailingActive = true;
      pos.trailStopPrice = pos.peakPrice * (1 - cfg.trailingDistancePct / 100);
    } else if (pos.trailingActive) {
      // el stop solo sube (ratchet), nunca baja
      const candidate = pos.peakPrice * (1 - cfg.trailingDistancePct / 100);
      if (candidate > pos.trailStopPrice) pos.trailStopPrice = candidate;
    }

    // PnL vivo (neto de fees de entrada; el de salida se cobra al cerrar)
    const gross = (price - pos.entryPrice) * pos.qty;
    pos.unrealizedPnlUsd = gross - pos.feesUsd;
    pos.unrealizedPnlPct = (gross / pos.tradeSizeUsd) * 100;

    // 3) salidas — TP duro primero; trailing ya armado reemplaza al SL inicial
    if (price >= pos.takeProfit) {
      return this.closeInternal(pos, pos.takeProfit, "TAKE_PROFIT");
    }
    if (pos.trailingActive && price <= pos.trailStopPrice) {
      return this.closeInternal(pos, pos.trailStopPrice, "TRAILING_STOP");
    }
    if (!pos.trailingActive && price <= pos.stopLoss) {
      return this.closeInternal(pos, pos.stopLoss, "STOP_LOSS");
    }
    return null;
  }

  /** Cierre manual desde la UI */
  closeManual(symbol: string): ClosedTrade | null {
    const pos = this.positions.get(symbol);
    if (!pos) return null;
    return this.closeInternal(pos, pos.lastPrice, "MANUAL");
  }

  closeAllManual(): ClosedTrade[] {
    const out: ClosedTrade[] = [];
    for (const pos of Array.from(this.positions.values())) {
      const t = this.closeInternal(pos, pos.lastPrice, "MANUAL");
      if (t) out.push(t);
    }
    return out;
  }

  private closeInternal(pos: Position, exitPrice: number, reason: ExitReason): ClosedTrade {
    this.positions.delete(pos.symbol);
    const exitFees = exitPrice * pos.qty * (this.getConfig().feePct / 100);
    const feesUsd = pos.feesUsd + exitFees;
    const pnlUsd = (exitPrice - pos.entryPrice) * pos.qty - feesUsd;
    const pnlPct = (pnlUsd / pos.tradeSizeUsd) * 100;
    const closedAt = Date.now();

    const trade: ClosedTrade = {
      id: pos.id,
      symbol: pos.symbol,
      qty: pos.qty,
      entryPrice: pos.entryPrice,
      exitPrice,
      takeProfit: pos.takeProfit,
      stopLoss: pos.stopLoss,
      tradeSizeUsd: pos.tradeSizeUsd,
      exitReason: reason,
      pnlUsd: Math.round(pnlUsd * 100) / 100,
      pnlPct: Math.round(pnlPct * 1000) / 1000,
      roePct: Math.round(pnlPct * 1000) / 1000,
      feesUsd: Math.round(feesUsd * 100) / 100,
      durationSec: Math.round((closedAt - pos.openedAt) / 1000),
      openedAt: pos.openedAt,
      closedAt,
      signalId: pos.signalId,
      wasTrailing: pos.trailingActive,
    };
    this.closed.unshift(trade);
    if (this.closed.length > 400) this.closed.length = 400;
    return trade;
  }

  realizedPnl(): number {
    return this.closed.reduce((acc, t) => acc + t.pnlUsd, 0);
  }

  unrealizedPnl(): number {
    let sum = 0;
    for (const p of this.positions.values()) sum += p.unrealizedPnlUsd;
    return sum;
  }

  stats(): TraderStats {
    const cfg = this.getConfig();
    const total = this.closed.length;
    const wins = this.closed.filter((t) => t.pnlUsd > 0).length;
    const losses = total - wins;
    const totalPnl = this.realizedPnl();
    const unrealized = this.unrealizedPnl();
    const avgDuration = total ? this.closed.reduce((a, t) => a + t.durationSec, 0) / total : 0;
    const best = this.closed.reduce((a, t) => Math.max(a, t.pnlUsd), 0);
    const worst = this.closed.reduce((a, t) => Math.min(a, t.pnlUsd), 0);
    const trailingExits = this.closed.filter((t) => t.exitReason === "TRAILING_STOP").length;

    return {
      openPositions: this.positions.size,
      totalTrades: total,
      wins,
      losses,
      winRate: total ? Math.round((wins / total) * 1000) / 10 : 0,
      totalPnlUsd: Math.round(totalPnl * 100) / 100,
      totalFeesUsd:
        Math.round(this.closed.reduce((a, t) => a + t.feesUsd, 0) * 100) / 100,
      unrealizedPnlUsd: Math.round(unrealized * 100) / 100,
      equity: Math.round((cfg.capital + totalPnl + unrealized) * 100) / 100,
      avgDurationSec: Math.round(avgDuration),
      bestTradeUsd: Math.round(best * 100) / 100,
      worstTradeUsd: Math.round(worst * 100) / 100,
      trailingExits,
    };
  }

  /** Cierra posiciones de símbolos que ya no existen en el universo (delisting) */
  reconcile(symbols: Set<string>): void {
    for (const pos of Array.from(this.positions.values())) {
      if (!symbols.has(pos.symbol)) {
        this.closeInternal(pos, pos.lastPrice, "MANUAL");
      }
    }
  }
}
