import type { FeedStatus, MarketTick } from "./types";

/**
 * BinanceAdapter — remake del src/functions/binance.js original.
 *
 * Original (2024): node-binance-api → b.websockets.prevDay(all, cb) + REST exchangeInfo.
 * Moderno: WebSocket nativo `!miniTicker@arr` (un solo stream, todo el mercado),
 * bootstrap REST para baseline + lista de futuros USDⓈ-M, reconexión con backoff
 * y fallback automático a polling REST si el stream cae.
 *
 * El patrón adapter se mantiene (el Sismografo lo usaba para Huobi): toda
 * normalización de exchange vive aquí; el motor es exchange-agnóstico.
 */

const STABLES = new Set([
  "USDC", "FDUSD", "TUSD", "DAI", "BUSD", "USDP", "EUR", "GBP", "TRY", "BRL",
  "ARS", "AEUR", "USDE", "USD1", "XUSD", "EURI", "PAXG", "WBTC", "LDUSDT", "LDC",
]);
const LEVERAGED_RE = /(UP|DOWN|BULL|BEAR)$/;

export interface AdapterEvents {
  onTicks: (ticks: MarketTick[]) => void;
  onFeedStatus: (status: FeedStatus, detail: string) => void;
}

export interface AdapterState {
  watchlist: Set<string>;
  futuresSymbols: Set<string>;
}

export class BinanceAdapter {
  readonly watchlist = new Set<string>();
  readonly futuresSymbols = new Set<string>();

  private ws: WebSocket | null = null;
  private pollTimer: Timer | null = null;
  private reconnectTimer: Timer | null = null;
  private attempts = 0;
  private disposed = false;
  private pollTicks = 0;

  constructor(private events: AdapterEvents) {}

  /**
   * Bootstrap: universo de símbolos spot USDT + futuros USDⓈ-M + baseline 24h.
   * (antes: getCurrencyList() + loadSymbols() del cli/index.js)
   */
  async bootstrap(): Promise<void> {
    // 1) exchangeInfo spot → watchlist
    const info = await this.fetchJson<any>(
      "https://api.binance.com/api/v3/exchangeInfo"
    );
    for (const s of info.symbols ?? []) {
      if (
        s.status === "TRADING" &&
        s.quoteAsset === "USDT" &&
        s.isSpotTradingAllowed !== false &&
        !STABLES.has(s.baseAsset) &&
        !LEVERAGED_RE.test(s.baseAsset) &&
        s.baseAsset !== "USDT"
      ) {
        this.watchlist.add(s.symbol);
      }
    }
    this.events.onFeedStatus(
      "RECONNECTING",
      `watchlist: ${this.watchlist.size} pares USDT`
    );

    // 2) futuros USDⓈ-M (antes: fapi.binance.com/fapi/v1/exchangeInfo en cli/index.js)
    try {
      const fapi = await this.fetchJson<any>(
        "https://fapi.binance.com/fapi/v1/exchangeInfo"
      );
      for (const s of fapi.symbols ?? []) {
        if (s.status === "TRADING" && s.quoteAsset === "USDT") {
          this.futuresSymbols.add(s.symbol);
        }
      }
    } catch {
      // el original tampoco fallaba si no había lista: seguía con el trabajo
    }

    // 3) baseline 24h para sembrar el tracker (evita volumeDiff=0 inicial)
    const tickers = await this.fetchJson<any[]>(
      "https://api.binance.com/api/v3/ticker/24hr"
    );
    const ticks: MarketTick[] = [];
    const now = Date.now();
    for (const t of tickers) {
      if (!this.watchlist.has(t.symbol)) continue;
      ticks.push(this.normalize24h(t, now));
    }
    if (ticks.length) this.events.onTicks(ticks);
  }

  /** Conecta el stream `!miniTicker@arr` (moderno `prevDay` de todo el mercado) */
  connect(): void {
    if (this.disposed) return;
    this.stopPolling();
    const url = "wss://stream.binance.com:9443/ws/!miniTicker@arr";
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.scheduleReconnect(`ws construct error: ${String(err)}`);
      return;
    }

    this.ws.onopen = () => {
      this.attempts = 0;
      this.events.onFeedStatus("LIVE", "stream !miniTicker@arr conectado");
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        const arr = JSON.parse(String(ev.data));
        if (!Array.isArray(arr) || arr.length === 0) return;
        const ticks: MarketTick[] = [];
        const now = Date.now();
        for (const t of arr) {
          if (!this.watchlist.has(t.s)) continue;
          ticks.push(this.normalizeMini(t, now));
        }
        if (ticks.length) this.events.onTicks(ticks);
      } catch {
        /* payload parcial — ignorar */
      }
    };

    this.ws.onerror = () => {
      this.events.onFeedStatus("RECONNECTING", "error de websocket");
    };

    this.ws.onclose = () => {
      if (this.disposed) return;
      this.scheduleReconnect("stream cerrado");
    };
  }

  /** Reconexión con backoff; tras 4 fallos seguidos → polling REST */
  private scheduleReconnect(reason: string): void {
    this.attempts += 1;
    const usePolling = this.attempts >= 4;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.attempts, 5));
    this.events.onFeedStatus(
      usePolling ? "POLLING" : "RECONNECTING",
      `${reason} — reintento #${this.attempts} en ${Math.round(delay / 1000)}s`
    );

    if (usePolling) {
      this.startPolling();
      return;
    }
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  /** Fallback: polling REST cada 5s (equivalente funcional del stream) */
  private startPolling(): void {
    this.stopPolling();
    const poll = async () => {
      try {
        const tickers = await this.fetchJson<any[]>(
          "https://api.binance.com/api/v3/ticker/24hr"
        );
        this.pollTicks += 1;
        const ticks: MarketTick[] = [];
        const now = Date.now();
        for (const t of tickers) {
          if (!this.watchlist.has(t.symbol)) continue;
          ticks.push(this.normalize24h(t, now));
        }
        if (ticks.length) this.events.onTicks(ticks);
        this.events.onFeedStatus(
          "POLLING",
          `modo polling REST activo (#${this.pollTicks})`
        );
      } catch (err) {
        this.events.onFeedStatus("DOWN", `polling error: ${String(err)}`);
      }
    };
    poll();
    this.pollTimer = setInterval(poll, 5000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** Cierra el feed */
  dispose(): void {
    this.disposed = true;
    this.stopPolling();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
  }

  private normalizeMini(t: any, ts: number): MarketTick {
    return {
      symbol: t.s,
      lastPrice: parseFloat(t.c),
      openPrice: parseFloat(t.o),
      high: parseFloat(t.h),
      low: parseFloat(t.l),
      volume: parseFloat(t.v),
      quoteVolume: parseFloat(t.q),
      ts,
    };
  }

  private normalize24h(t: any, ts: number): MarketTick {
    return {
      symbol: t.symbol,
      lastPrice: parseFloat(t.lastPrice),
      openPrice: parseFloat(t.openPrice),
      high: parseFloat(t.highPrice),
      low: parseFloat(t.lowPrice),
      volume: parseFloat(t.volume),
      quoteVolume: parseFloat(t.quoteVolume),
      ts,
    };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return (await res.json()) as T;
  }
}
