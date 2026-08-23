import { createHmac } from "crypto";

/**
 * LiveExecutor — ejecución REAL de órdenes en Binance spot (opt-in).
 *
 * Filosofía de producto:
 *  - Paper es el default y el ledger de verdad (TP/SL/trailing se calculan en paper;
 *    las salidas de paper disparan las ventas reales).
 *  - TESTNET (testnet.binance.vision) permite probar el flujo completo sin riesgo.
 *  - LIVE opera con las API keys DEL USUARIO (solo permiso de trade, sin retiros),
 *    guardadas SOLO en memoria del motor — jamás persistidas ni expuestas al navegador.
 *
 * Seguridad:
 *  - cap por orden (liveMaxSizeUsd), límite de pérdida diaria con kill switch
 *    automático (implementado en engine.ts), y el modo se fuerza a OFF tras
 *    cualquier reinicio del motor.
 */

export type LiveMode = "OFF" | "TESTNET" | "LIVE";

export interface LotInfo {
  stepSize: number;
  minQty: number;
  minNotional: number;
}

export interface LiveOrderResult {
  ok: boolean;
  orderId?: number;
  symbol: string;
  side: "BUY" | "SELL";
  executedQty: number;
  quoteAmount: number;
  error?: string;
}

const BASE_URLS: Record<Exclude<LiveMode, "OFF">, string> = {
  TESTNET: "https://testnet.binance.vision",
  LIVE: "https://api.binance.com",
};

export class LiveExecutor {
  constructor(
    private getLotInfo: (symbol: string) => LotInfo | undefined
  ) {}

  private sign(query: string, secret: string): string {
    return createHmac("sha256", secret).update(query).digest("hex");
  }

  private async signedRequest(
    mode: Exclude<LiveMode, "OFF">,
    path: string,
    params: Record<string, string | number>,
    apiKey: string,
    apiSecret: string,
    method: "GET" | "POST" = "POST"
  ): Promise<any> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) q.append(k, String(v));
    q.append("timestamp", String(Date.now()));
    q.append("recvWindow", "5000");
    const signature = this.sign(q.toString(), apiSecret);
    const url = `${BASE_URLS[mode]}${path}?${q.toString()}&signature=${signature}`;

    const res = await fetch(url, {
      method,
      headers: { "X-MBX-APIKEY": apiKey },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (data as any)?.msg ?? `HTTP ${res.status} de Binance (${mode})`;
      throw new Error(msg);
    }
    return data;
  }

  /** Verifica un par de keys contra /api/v3/account en el modo indicado */
  async testKeys(
    mode: Exclude<LiveMode, "OFF">,
    apiKey: string,
    apiSecret: string
  ): Promise<{ balances: number }> {
    const data = await this.signedRequest(
      mode,
      "/api/v3/account",
      {},
      apiKey,
      apiSecret,
      "GET"
    );
    const balances = (data.balances ?? []).filter(
      (b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    );
    return { balances: balances.length };
  }

  /** Redondea una cantidad hacia abajo al stepSize del símbolo (LOT_SIZE) */
  roundQty(symbol: string, qty: number): string {
    const info = this.getLotInfo(symbol);
    if (!info || !info.stepSize || info.stepSize <= 0) return qty.toFixed(8);
    const decimals = Math.max(
      0,
      (info.stepSize.toString().split(".")[1] || "").length
    );
    const rounded = Math.floor(qty / info.stepSize) * info.stepSize;
    return rounded.toFixed(decimals);
  }

  /** Compra a mercado por monto en quote (USDT) — evita cálculo de lote */
  async marketBuy(
    mode: Exclude<LiveMode, "OFF">,
    apiKey: string,
    apiSecret: string,
    symbol: string,
    quoteUsd: number
  ): Promise<LiveOrderResult> {
    try {
      const data = await this.signedRequest(mode, "/api/v3/order", {
        symbol,
        side: "BUY",
        type: "MARKET",
        quoteOrderQty: quoteUsd.toFixed(2),
      }, apiKey, apiSecret);
      return {
        ok: true,
        orderId: data.orderId,
        symbol,
        side: "BUY",
        executedQty: parseFloat(data.executedQty ?? "0"),
        quoteAmount: parseFloat(data.cummulativeQuoteQty ?? "0"),
      };
    } catch (err) {
      return {
        ok: false,
        symbol,
        side: "BUY",
        executedQty: 0,
        quoteAmount: 0,
        error: String(err instanceof Error ? err.message : err),
      };
    }
  }

  /** Vende a mercado la cantidad (base) indicada, redondeada a LOT_SIZE */
  async marketSell(
    mode: Exclude<LiveMode, "OFF">,
    apiKey: string,
    apiSecret: string,
    symbol: string,
    qty: number
  ): Promise<LiveOrderResult> {
    try {
      const quantity = this.roundQty(symbol, qty);
      const info = this.getLotInfo(symbol);
      if (info && info.minNotional > 0) {
        // el notional se valida con precio aproximado — si falla, Binance lo dirá
      }
      const data = await this.signedRequest(mode, "/api/v3/order", {
        symbol,
        side: "SELL",
        type: "MARKET",
        quantity,
      }, apiKey, apiSecret);
      return {
        ok: true,
        orderId: data.orderId,
        symbol,
        side: "SELL",
        executedQty: parseFloat(data.executedQty ?? "0"),
        quoteAmount: parseFloat(data.cummulativeQuoteQty ?? "0"),
      };
    } catch (err) {
      return {
        ok: false,
        symbol,
        side: "SELL",
        executedQty: 0,
        quoteAmount: 0,
        error: String(err instanceof Error ? err.message : err),
      };
    }
  }
}
