/**
 * exchanges.ts — capa multi-exchange con los SDKs de Siebly (github.com/sieblyio):
 *   bybit-api · okx-api · bitget-api · gateio-api · kucoin-api · bitmart-api
 *   @siebly/htx-api (Huobi/HTX — homenaje al Sismografo original) · @siebly/kraken-api
 *
 * Arquitectura: la DETECCIÓN corre sobre Binance (mayor liquidez, un solo stream);
 * la EJECUCIÓN live puede espejarse en cualquiera de estos 9 exchanges.
 * Mapeo de símbolos, lotes (público) y órdenes a mercado (firmadas por cada SDK).
 */

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

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  /** passphrase (KuCoin/OKX/Bitget) o memo (BitMart) */
  passphrase?: string;
}

export interface ExchangeMeta {
  id: ExchangeId;
  name: string;
  testnetSupported: boolean;
  needsPassphrase: boolean;
  passphraseLabel: string;
  keyUrl: string;
}

export interface OrderOutcome {
  ok: boolean;
  orderId?: string;
  symbol: string;
  side: "BUY" | "SELL";
  /** base qty estimada/ejecutada */
  executedQty: number;
  /** monto quote gastado/recibido */
  quoteAmount: number;
  error?: string;
}

export interface LotInfo {
  stepSize: number;
  minQty: number;
  minNotional: number;
}

export const EXCHANGES: ExchangeMeta[] = [
  { id: "binance", name: "Binance", testnetSupported: true, needsPassphrase: false, passphraseLabel: "", keyUrl: "https://binance.com/my/api" },
  { id: "bybit", name: "Bybit", testnetSupported: true, needsPassphrase: false, passphraseLabel: "", keyUrl: "https://bybit.com/app/user/api-management" },
  { id: "okx", name: "OKX", testnetSupported: false, needsPassphrase: true, passphraseLabel: "passphrase", keyUrl: "https://okx.com/account/my-api" },
  { id: "bitget", name: "Bitget", testnetSupported: false, needsPassphrase: true, passphraseLabel: "passphrase", keyUrl: "https://bitget.com/apiManage" },
  { id: "gateio", name: "Gate.io", testnetSupported: false, needsPassphrase: false, passphraseLabel: "", keyUrl: "https://gate.com/my/api" },
  { id: "kucoin", name: "KuCoin", testnetSupported: false, needsPassphrase: true, passphraseLabel: "passphrase", keyUrl: "https://kucoin.com/account/api" },
  { id: "htx", name: "HTX (Huobi)", testnetSupported: false, needsPassphrase: false, passphraseLabel: "", keyUrl: "https://htx.com/usbound/usercenter/overview" },
  { id: "kraken", name: "Kraken", testnetSupported: false, needsPassphrase: false, passphraseLabel: "", keyUrl: "https://kraken.com/u/security/api" },
  { id: "bitmart", name: "BitMart", testnetSupported: false, needsPassphrase: true, passphraseLabel: "memo", keyUrl: "https://bitmart.com/api-management" },
];

export function exchangeMeta(id: ExchangeId): ExchangeMeta {
  return EXCHANGES.find((e) => e.id === id) ?? EXCHANGES[0];
}

/* ——————————————————— símbolos (formato Binance → exchange) ——————————————————— */

export function mapSymbol(exchange: ExchangeId, binanceSymbol: string): string {
  const base = binanceSymbol.replace("USDT", "");
  switch (exchange) {
    case "bybit":
    case "bitget":
      return binanceSymbol; // BTCUSDT
    case "okx":
    case "kucoin":
      return `${base}-USDT`;
    case "gateio":
    case "bitmart":
      return `${base}_USDT`;
    case "htx":
      return binanceSymbol.toLowerCase(); // btcusdt
    case "kraken":
      // Kraken usa XBT en vez de BTC para la mayoría de pares legacy
      return `${base === "BTC" ? "XBT" : base}USDT`;
    default:
      return binanceSymbol;
  }
}

/* ——————————————————— lotes vía endpoints públicos ——————————————————— */

const lotCache = new Map<string, LotInfo>();

const stepFromDecimals = (decimals: number): number => Math.pow(10, -decimals);

function decimalsFromStep(step: string | number): number {
  const s = String(step);
  if (s.includes(".")) return s.split(".")[1].replace(/0+$/, "").length || 0;
  // pasos tipo "1000" → 0 decimales; "0.001" manejado arriba
  return 0;
}

export async function fetchLotInfo(
  exchange: ExchangeId,
  binanceSymbol: string
): Promise<LotInfo | undefined> {
  const cacheKey = `${exchange}:${binanceSymbol}`;
  const cached = lotCache.get(cacheKey);
  if (cached) return cached;

  try {
    let lot: LotInfo | undefined;
    switch (exchange) {
      case "bybit": {
        const r = await fetchJson(
          `https://api.bybit.com/v5/market/instruments-info?category=spot&symbol=${binanceSymbol}`
        );
        const f = r?.result?.list?.[0]?.lotSizeFilter;
        if (f)
          lot = {
            stepSize: parseFloat(f.qtyStep ?? "0"),
            minQty: parseFloat(f.minOrderQty ?? "0"),
            minNotional: parseFloat(f.minOrderAmt ?? "0"),
          };
        break;
      }
      case "okx": {
        const r = await fetchJson(
          `https://www.okx.com/api/v5/public/instruments?instType=SPOT&instId=${mapSymbol("okx", binanceSymbol)}`
        );
        const d = r?.data?.[0];
        if (d)
          lot = {
            stepSize: parseFloat(d.lotSz ?? "0"),
            minQty: parseFloat(d.minSz ?? "0"),
            minNotional: 0,
          };
        break;
      }
      case "bitget": {
        const r = await fetchJson(
          `https://api.bitget.com/api/v2/spot/public/symbols?symbol=${binanceSymbol}`
        );
        const d = r?.data?.[0];
        if (d)
          lot = {
            stepSize: stepFromDecimals(d.quantityPrecision ?? 4),
            minQty: 0,
            minNotional: parseFloat(d.minTradeAmount ?? "0"),
          };
        break;
      }
      case "gateio": {
        const r = await fetchJson(
          `https://api.gateio.ws/api/v4/spot/currency_pairs/${mapSymbol("gateio", binanceSymbol)}`
        );
        if (r)
          lot = {
            stepSize: stepFromDecimals(r.amount_precision ?? 4),
            minQty: parseFloat(r.min_base_amount ?? "0"),
            minNotional: parseFloat(r.min_quote_amount ?? "0"),
          };
        break;
      }
      case "kucoin": {
        const r = await fetchJson(
          `https://api.kucoin.com/api/v2/symbols/${mapSymbol("kucoin", binanceSymbol)}`
        );
        const d = r?.data;
        if (d)
          lot = {
            stepSize: parseFloat(d.baseIncrement ?? "0"),
            minQty: parseFloat(d.baseMinSize ?? "0"),
            minNotional: parseFloat(d.quoteMinSize ?? "0"),
          };
        break;
      }
      case "htx": {
        const r = await fetchJson(
          `https://api.huobi.pro/v1/common/symbols?symbols=${mapSymbol("htx", binanceSymbol)}`
        );
        const d = r?.data?.[0];
        if (d)
          lot = {
            stepSize: stepFromDecimals(d["amount-precision"] ?? 4),
            minQty: parseFloat(d["min-order-size"] ?? "0"),
            minNotional: parseFloat(d["min-order-amt"] ?? "0"),
          };
        break;
      }
      case "kraken": {
        const pair = mapSymbol("kraken", binanceSymbol);
        const r = await fetchJson(
          `https://api.kraken.com/0/public/AssetPairs?pair=${pair}`
        );
        const d = r?.result?.[pair] ?? Object.values(r?.result ?? {})[0];
        if (d)
          lot = {
            stepSize: stepFromDecimals(d.lot_decimals ?? 8),
            minQty: parseFloat(d.ordermin ?? "0"),
            minNotional: 0,
          };
        break;
      }
      case "bitmart": {
        const r = await fetchJson(
          `https://api-cloud.bitmart.com/spot/v1/symbols/details?symbol=${mapSymbol("bitmart", binanceSymbol)}`
        );
        const d = r?.data?.symbols?.[0];
        if (d)
          lot = {
            stepSize: stepFromDecimals(d.base_precision ?? d.quantity_precision ?? 4),
            minQty: parseFloat(d.min_sell_amount ?? "0"),
            minNotional: parseFloat(d.min_buy_amount ?? "0"),
          };
        break;
      }
    }
    if (lot && lot.stepSize > 0) lotCache.set(cacheKey, lot);
    return lot;
  } catch {
    return undefined;
  }
}

/** extrae mensaje legible de Errores, respuestas SDK (objetos) y strings */
function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  const anyErr = err as any;
  return (
    anyErr?.retMsg ??
    anyErr?.response?.retMsg ??
    anyErr?.msg ??
    anyErr?.message ??
    anyErr?.["err-msg"] ??
    anyErr?.detail ??
    JSON.stringify(err)
  ).slice(0, 200);
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Redondea una cantidad base hacia abajo al lote del exchange */
export async function roundQty(
  exchange: ExchangeId,
  binanceSymbol: string,
  qty: number
): Promise<string> {
  const lot = await fetchLotInfo(exchange, binanceSymbol);
  if (!lot || lot.stepSize <= 0) return qty.toFixed(8);
  const decimals = decimalsFromStep(lot.stepSize);
  const rounded = Math.floor(qty / lot.stepSize) * lot.stepSize;
  return rounded.toFixed(decimals);
}

/* ——————————————————— test de credenciales ——————————————————— */

export async function testExchangeKeys(
  exchange: ExchangeId,
  creds: ExchangeCredentials,
  testnet: boolean
): Promise<{ ok: boolean; detail: string }> {
  try {
    switch (exchange) {
      case "binance": {
        // firma HMAC nativa (el engine ya la implementa en live.ts)
        return testBinanceKeys(creds, testnet);
      }
      case "bybit": {
        const { RestClientV5 } = await import("bybit-api");
        const c = new RestClientV5({
          key: creds.apiKey,
          secret: creds.apiSecret,
          testnet,
        });
        const r = await c.getWalletBalance({ accountType: "UNIFIED" });
        if (r.retCode !== 0) throw new Error(r.retMsg);
        return { ok: true, detail: `Bybit ${testnet ? "testnet" : "live"} OK` };
      }
      case "okx": {
        const { RestClient } = await import("okx-api");
        const c = new RestClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          apiPassphrase: creds.passphrase ?? "",
        });
        const r = await c.getBalance();
        if (r.code !== "0")
          throw new Error(r.data?.[0]?.sMsg ?? r.msg ?? `code ${r.code}`);
        return { ok: true, detail: "OKX OK" };
      }
      case "bitget": {
        const { RestClient } = await import("bitget-api");
        const c = new RestClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          apiPassphrase: creds.passphrase ?? "",
        });
        const r = await c.getSpotAssets();
        if (r.code !== "00000") throw new Error(r.msg ?? `code ${r.code}`);
        return { ok: true, detail: "Bitget OK" };
      }
      case "gateio": {
        const { RestClient } = await import("gateio-api");
        const c = new RestClient({ key: creds.apiKey, secret: creds.apiSecret });
        await c.getSpotAccounts();
        return { ok: true, detail: "Gate.io OK" };
      }
      case "kucoin": {
        const { SpotClient } = await import("kucoin-api");
        const c = new SpotClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          passphrase: creds.passphrase ?? "",
        });
        const r = await c.getAccountDetail();
        if (r.code !== "200000") throw new Error(r.msg ?? `code ${r.code}`);
        return { ok: true, detail: "KuCoin OK" };
      }
      case "htx": {
        const { SpotClient } = await import("@siebly/htx-api");
        const c = new SpotClient({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });
        const r = await c.getAccounts();
        if (r.status !== "ok" || !Array.isArray(r.data))
          throw new Error(r["err-msg"] ?? "respuesta inválida");
        return {
          ok: true,
          detail: `HTX OK — ${r.data.length} cuentas (spot account-id: ${r.data[0]?.id})`,
        };
      }
      case "kraken": {
        const { SpotClient } = await import("@siebly/kraken-api");
        const c = new SpotClient({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });
        const r = await c.getAccountBalance();
        if (r.error && r.error.length > 0)
          throw new Error(r.error.join("; "));
        return { ok: true, detail: "Kraken OK" };
      }
      case "bitmart": {
        const { RestClient } = await import("bitmart-api");
        const c = new RestClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          apiMemo: creds.passphrase ?? "",
        });
        const r = await c.getAccountBalancesV1();
        if (r.code !== 1000 && r.code !== "1000")
          throw new Error(r.message ?? r.msg ?? `code ${r.code}`);
        return { ok: true, detail: "BitMart OK" };
      }
    }
  } catch (err) {
    return { ok: false, detail: errText(err) };
  }
}

async function testBinanceKeys(
  creds: ExchangeCredentials,
  testnet: boolean
): Promise<{ ok: boolean; detail: string }> {
  // reutiliza el LiveExecutor nativo de live.ts vía firma HMAC
  const { LiveExecutor } = await import("./live");
  const exec = new LiveExecutor(() => undefined);
  try {
    const { balances } = await exec.testKeys(
      testnet ? "TESTNET" : "LIVE",
      creds.apiKey,
      creds.apiSecret
    );
    return {
      ok: true,
      detail: `Binance ${testnet ? "testnet" : "live"} OK — ${balances} balances`,
    };
  } catch (err) {
    return { ok: false, detail: errText(err) };
  }
}

/* ——————————————————— órdenes a mercado ——————————————————— */

let oidSeq = 0;
const clientOid = () =>
  `ps${Date.now().toString(36)}${(oidSeq++).toString(36).padStart(3, "0")}`;

export interface MarketOrderArgs {
  exchange: ExchangeId;
  creds: ExchangeCredentials;
  testnet: boolean;
  binanceSymbol: string;
  /** para BUY: monto en quote (USDT). para SELL: cantidad base */
  amount: number;
  /** precio de referencia (último tick Binance) para estimar qty/kraken */
  referencePrice: number;
}

export async function marketBuy(args: MarketOrderArgs): Promise<OrderOutcome> {
  const { exchange, creds, testnet, binanceSymbol, amount, referencePrice } = args;
  const qtyEstimate = referencePrice > 0 ? amount / referencePrice : 0;
  const base: OrderOutcome = {
    ok: false,
    symbol: binanceSymbol,
    side: "BUY",
    executedQty: qtyEstimate,
    quoteAmount: amount,
  };
  try {
    switch (exchange) {
      case "binance": {
        const { LiveExecutor } = await import("./live");
        const exec = new LiveExecutor(() => undefined);
        const r = await exec.marketBuy(
          testnet ? "TESTNET" : "LIVE",
          creds.apiKey,
          creds.apiSecret,
          binanceSymbol,
          amount
        );
        return {
          ...base,
          ok: r.ok,
          orderId: r.orderId ? String(r.orderId) : undefined,
          executedQty: r.executedQty || qtyEstimate,
          quoteAmount: r.quoteAmount || amount,
          error: r.error,
        };
      }
      case "bybit": {
        const { RestClientV5 } = await import("bybit-api");
        const c = new RestClientV5({
          key: creds.apiKey,
          secret: creds.apiSecret,
          testnet,
        });
        const r = await c.submitOrder({
          category: "spot",
          symbol: binanceSymbol,
          side: "Buy",
          orderType: "Market",
          marketUnit: "quoteCoin",
          qty: amount.toFixed(2),
        });
        if (r.retCode !== 0) throw new Error(r.retMsg);
        return { ...base, ok: true, orderId: r.result?.orderId };
      }
      case "okx": {
        const { RestClient } = await import("okx-api");
        const c = new RestClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          apiPassphrase: creds.passphrase ?? "",
        });
        const r = await c.submitOrder({
          instId: mapSymbol("okx", binanceSymbol),
          tdMode: "cash",
          side: "buy",
          ordType: "market",
          sz: amount.toFixed(2),
          tgtCcy: "quote_ccy",
        });
        if (r.code !== "0")
          throw new Error(r.data?.[0]?.sMsg ?? r.msg ?? `code ${r.code}`);
        return { ...base, ok: true, orderId: r.data?.[0]?.ordId };
      }
      case "bitget": {
        const { RestClient } = await import("bitget-api");
        const c = new RestClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          apiPassphrase: creds.passphrase ?? "",
        });
        // Bitget v2 spot: market buy → size en QUOTE
        const r = await c.spotSubmitOrder({
          symbol: binanceSymbol,
          side: "buy",
          orderType: "market",
          force: "gtc",
          size: amount.toFixed(2),
        });
        if (r.code !== "00000") throw new Error(r.msg ?? `code ${r.code}`);
        return { ...base, ok: true, orderId: r.data?.orderId };
      }
      case "gateio": {
        const { RestClient } = await import("gateio-api");
        const c = new RestClient({ key: creds.apiKey, secret: creds.apiSecret });
        // Gate v4: market buy → amount en QUOTE
        const r = await c.submitSpotOrder({
          currency_pair: mapSymbol("gateio", binanceSymbol),
          side: "buy",
          type: "market",
          amount,
        });
        return { ...base, ok: true, orderId: String(r.id ?? "") };
      }
      case "kucoin": {
        const { SpotClient } = await import("kucoin-api");
        const c = new SpotClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          passphrase: creds.passphrase ?? "",
        });
        // KuCoin: market buy → funds (quote)
        const r = await c.submitOrder({
          clientOid: clientOid(),
          side: "buy",
          symbol: mapSymbol("kucoin", binanceSymbol),
          type: "market",
          funds: amount.toFixed(2),
        });
        if (r.code !== "200000") throw new Error(r.msg ?? `code ${r.code}`);
        return { ...base, ok: true, orderId: r.data?.orderId };
      }
      case "htx": {
        const { SpotClient } = await import("@siebly/htx-api");
        const c = new SpotClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
        });
        const acc = await c.getAccounts();
        if (acc.status !== "ok" || !acc.data?.length)
          throw new Error(acc["err-msg"] ?? "sin cuentas HTX");
        // HTX: buy-market → amount en QUOTE
        const r = await c.submitOrder({
          "account-id": acc.data[0].id,
          symbol: mapSymbol("htx", binanceSymbol),
          type: "buy-market",
          amount: String(amount),
        });
        if (r.status !== "ok") throw new Error(r["err-msg"] ?? "error HTX");
        return { ...base, ok: true, orderId: String(r.data ?? "") };
      }
      case "kraken": {
        const { SpotClient } = await import("@siebly/kraken-api");
        const c = new SpotClient({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });
        // Kraken: volume siempre en BASE → estimar desde precio de referencia
        if (referencePrice <= 0) throw new Error("sin precio de referencia para Kraken");
        const volume = await roundQty("kraken", binanceSymbol, amount / referencePrice);
        const r = await c.submitOrder({
          pair: mapSymbol("kraken", binanceSymbol),
          type: "buy",
          ordertype: "market",
          volume,
        });
        if (r.error && r.error.length > 0) throw new Error(r.error.join("; "));
        return {
          ...base,
          ok: true,
          orderId: r.result?.txid?.[0],
          executedQty: parseFloat(volume),
          quoteAmount: parseFloat(volume) * referencePrice,
        };
      }
      case "bitmart": {
        const { RestClient } = await import("bitmart-api");
        const c = new RestClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          apiMemo: creds.passphrase ?? "",
        });
        // BitMart v2: market buy → notional (quote)
        const r = await c.submitSpotOrderV2({
          symbol: mapSymbol("bitmart", binanceSymbol),
          side: "buy",
          type: "market",
          notional: amount.toFixed(2),
        });
        if (r.code !== 1000 && r.code !== "1000")
          throw new Error(r.message ?? r.msg ?? `code ${r.code}`);
        return { ...base, ok: true, orderId: r.data?.order_id };
      }
    }
  } catch (err) {
    return { ...base, ok: false, error: errText(err) };
  }
}

export async function marketSell(args: MarketOrderArgs): Promise<OrderOutcome> {
  const { exchange, creds, testnet, binanceSymbol, amount, referencePrice } = args;
  const base: OrderOutcome = {
    ok: false,
    symbol: binanceSymbol,
    side: "SELL",
    executedQty: amount,
    quoteAmount: amount * referencePrice,
  };
  try {
    switch (exchange) {
      case "binance": {
        const { LiveExecutor } = await import("./live");
        const exec = new LiveExecutor(async (sym) => {
          const lot = await fetchLotInfo("binance", sym);
          return lot
            ? { stepSize: lot.stepSize, minQty: lot.minQty, minNotional: lot.minNotional }
            : undefined;
        });
        const r = await exec.marketSell(
          testnet ? "TESTNET" : "LIVE",
          creds.apiKey,
          creds.apiSecret,
          binanceSymbol,
          amount
        );
        return {
          ...base,
          ok: r.ok,
          orderId: r.orderId ? String(r.orderId) : undefined,
          executedQty: r.executedQty || amount,
          quoteAmount: r.quoteAmount || amount * referencePrice,
          error: r.error,
        };
      }
      case "bybit": {
        const { RestClientV5 } = await import("bybit-api");
        const c = new RestClientV5({
          key: creds.apiKey,
          secret: creds.apiSecret,
          testnet,
        });
        const qty = await roundQty("bybit", binanceSymbol, amount);
        const r = await c.submitOrder({
          category: "spot",
          symbol: binanceSymbol,
          side: "Sell",
          orderType: "Market",
          marketUnit: "baseCoin",
          qty,
        });
        if (r.retCode !== 0) throw new Error(r.retMsg);
        return { ...base, ok: true, orderId: r.result?.orderId, executedQty: parseFloat(qty) };
      }
      case "okx": {
        const { RestClient } = await import("okx-api");
        const c = new RestClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          apiPassphrase: creds.passphrase ?? "",
        });
        const qty = await roundQty("okx", binanceSymbol, amount);
        const r = await c.submitOrder({
          instId: mapSymbol("okx", binanceSymbol),
          tdMode: "cash",
          side: "sell",
          ordType: "market",
          sz: qty,
          tgtCcy: "base_ccy",
        });
        if (r.code !== "0")
          throw new Error(r.data?.[0]?.sMsg ?? r.msg ?? `code ${r.code}`);
        return { ...base, ok: true, orderId: r.data?.[0]?.ordId, executedQty: parseFloat(qty) };
      }
      case "bitget": {
        const { RestClient } = await import("bitget-api");
        const c = new RestClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          apiPassphrase: creds.passphrase ?? "",
        });
        const qty = await roundQty("bitget", binanceSymbol, amount);
        // Bitget v2 spot: market sell → size en BASE
        const r = await c.spotSubmitOrder({
          symbol: binanceSymbol,
          side: "sell",
          orderType: "market",
          force: "gtc",
          size: qty,
        });
        if (r.code !== "00000") throw new Error(r.msg ?? `code ${r.code}`);
        return { ...base, ok: true, orderId: r.data?.orderId, executedQty: parseFloat(qty) };
      }
      case "gateio": {
        const { RestClient } = await import("gateio-api");
        const c = new RestClient({ key: creds.apiKey, secret: creds.apiSecret });
        const qty = await roundQty("gateio", binanceSymbol, amount);
        // Gate v4: market sell → amount en BASE
        const r = await c.submitSpotOrder({
          currency_pair: mapSymbol("gateio", binanceSymbol),
          side: "sell",
          type: "market",
          amount: parseFloat(qty),
        });
        return { ...base, ok: true, orderId: String(r.id ?? ""), executedQty: parseFloat(qty) };
      }
      case "kucoin": {
        const { SpotClient } = await import("kucoin-api");
        const c = new SpotClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          passphrase: creds.passphrase ?? "",
        });
        const qty = await roundQty("kucoin", binanceSymbol, amount);
        const r = await c.submitOrder({
          clientOid: clientOid(),
          side: "sell",
          symbol: mapSymbol("kucoin", binanceSymbol),
          type: "market",
          size: qty,
        });
        if (r.code !== "200000") throw new Error(r.msg ?? `code ${r.code}`);
        return { ...base, ok: true, orderId: r.data?.orderId, executedQty: parseFloat(qty) };
      }
      case "htx": {
        const { SpotClient } = await import("@siebly/htx-api");
        const c = new SpotClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
        });
        const acc = await c.getAccounts();
        if (acc.status !== "ok" || !acc.data?.length)
          throw new Error(acc["err-msg"] ?? "sin cuentas HTX");
        const qty = await roundQty("htx", binanceSymbol, amount);
        // HTX: sell-market → amount en BASE
        const r = await c.submitOrder({
          "account-id": acc.data[0].id,
          symbol: mapSymbol("htx", binanceSymbol),
          type: "sell-market",
          amount: qty,
        });
        if (r.status !== "ok") throw new Error(r["err-msg"] ?? "error HTX");
        return { ...base, ok: true, orderId: String(r.data ?? ""), executedQty: parseFloat(qty) };
      }
      case "kraken": {
        const { SpotClient } = await import("@siebly/kraken-api");
        const c = new SpotClient({ apiKey: creds.apiKey, apiSecret: creds.apiSecret });
        const volume = await roundQty("kraken", binanceSymbol, amount);
        const r = await c.submitOrder({
          pair: mapSymbol("kraken", binanceSymbol),
          type: "sell",
          ordertype: "market",
          volume,
        });
        if (r.error && r.error.length > 0) throw new Error(r.error.join("; "));
        return {
          ...base,
          ok: true,
          orderId: r.result?.txid?.[0],
          executedQty: parseFloat(volume),
        };
      }
      case "bitmart": {
        const { RestClient } = await import("bitmart-api");
        const c = new RestClient({
          apiKey: creds.apiKey,
          apiSecret: creds.apiSecret,
          apiMemo: creds.passphrase ?? "",
        });
        const qty = await roundQty("bitmart", binanceSymbol, amount);
        // BitMart v2: market sell → size (base)
        const r = await c.submitSpotOrderV2({
          symbol: mapSymbol("bitmart", binanceSymbol),
          side: "sell",
          type: "market",
          size: qty,
        });
        if (r.code !== 1000 && r.code !== "1000")
          throw new Error(r.message ?? r.msg ?? `code ${r.code}`);
        return { ...base, ok: true, orderId: r.data?.order_id, executedQty: parseFloat(qty) };
      }
    }
  } catch (err) {
    return { ...base, ok: false, error: errText(err) };
  }
}
