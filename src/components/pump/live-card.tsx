"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BellRing,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Loader2,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePumpStore } from "@/lib/pump/store";
import { fmtMoney } from "@/lib/pump/format";
import type { LiveMode, Role } from "@/lib/pump/types";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/pump/info-tip";

/**
 * LiveCard — trading REAL opt-in multi-exchange (SDKs Siebly).
 *
 * Detección en Binance (mayor liquidez) · Ejecución en 9 exchanges:
 * Binance · Bybit · OKX · Bitget · Gate.io · KuCoin · HTX (Huobi) · Kraken · BitMart.
 *
 * Prefill: las credenciales se guardan CIFRADAS en disco (AES-256-GCM) y se
 * recargan al arrancar — acceso rápido sin reingresarlas. El modo live sigue
 * requiriendo reactivación manual tras cada reinicio (seguridad).
 *
 * Solo ADMIN (ver /api/engine ADMIN_ACTIONS).
 */

export function LiveCard({ role }: { role: Role }) {
  const state = usePumpStore((s) => s.state);
  const control = usePumpStore((s) => s.control);
  const busy = usePumpStore((s) => s.busy);

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [tgToken, setTgToken] = useState("");
  const [tgChat, setTgChat] = useState("");
  const [tgMsg, setTgMsg] = useState<string | null>(null);
  const [tgTesting, setTgTesting] = useState(false);

  if (!state) return null;
  const live = state.live;
  const telegram = state.telegram;
  const isAdmin = role === "ADMIN";
  const exchanges = live.availableExchanges ?? [];
  const meta =
    exchanges.find((e) => e.id === live.exchange) ?? exchanges[0] ?? null;
  const keysForActive = !!live.keysByExchange?.[live.exchange];

  const testKeys = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "testExchangeKeys", exchange: live.exchange }),
      });
      const data = await res.json();
      setTestMsg(data.detail ?? data.error ?? "sin respuesta");
    } catch (err) {
      setTestMsg(String(err));
    } finally {
      setTesting(false);
    }
  };

  const testTelegram = async () => {
    setTgTesting(true);
    setTgMsg(null);
    try {
      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "testTelegram" }),
      });
      const data = await res.json();
      setTgMsg(data.detail ?? data.error ?? "sin respuesta");
    } catch (err) {
      setTgMsg(String(err));
    } finally {
      setTgTesting(false);
    }
  };

  return (
    <Card
      className={cn(
        "border bg-zinc-900/50",
        live.mode === "LIVE"
          ? "border-rose-500/50 shadow-[0_0_40px_-15px_rgba(244,63,94,0.35)]"
          : live.mode === "TESTNET"
            ? "border-amber-500/40"
            : "border-zinc-800"
      )}
    >
      <CardHeader className="border-b border-zinc-800/70 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-100">
            <Zap className="h-4 w-4 text-amber-400" aria-hidden />
            Trading real — opt-in · multi-exchange
            <InfoTip
              term="TRADING REAL OPT-IN"
              hint="El paper trading (dinero simulado) es el default y SIEMPRE corre. Aquí decides si las mismas señales se ejecutan con dinero real en el exchange que elijas — detección en Binance, ejecución en 9 exchanges."
              formula="paper (siempre) + espejo real opcional"
              side="bottom"
            />
            <ModeBadge mode={live.mode} exchange={meta?.name ?? ""} />
            {live.mode !== "OFF" && (
              <span className="font-mono text-[10px] font-normal text-zinc-500">
                detección Binance · ejecución {meta?.name}
              </span>
            )}
          </CardTitle>
          {live.mode !== "OFF" && isAdmin && (
            <Button
              size="sm"
              className="h-7 gap-1.5 bg-rose-600 font-mono text-[10px] font-bold text-white hover:bg-rose-500"
              disabled={busy}
              onClick={() => void control({ action: "killSwitch" })}
            >
              <ShieldAlert className="h-3 w-3" aria-hidden />
              KILL SWITCH — vender todo y desactivar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 pt-5 lg:grid-cols-2">
        {/* —— columna exchange —— */}
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat
              label="PnL real hoy"
              value={fmtMoney(live.todayPnlUsd)}
              tone={live.todayPnlUsd >= 0 ? "green" : "red"}
              hint="Resultado REAL del día en el exchange elegido (se reinicia a medianoche). Si llega al límite de pérdida diaria, el kill switch automático vende todo."
            />
            <Stat
              label="PnL real total"
              value={fmtMoney(live.realizedPnlUsd)}
              tone={live.realizedPnlUsd >= 0 ? "green" : "red"}
              hint="Resultado REAL acumulado desde que activaste el modo live por primera vez (comisiones reales del exchange incluidas)."
            />
            <Stat
              label="Posiciones reales"
              value={String(live.openSymbols.length)}
              tone="neutral"
              hint="Pares con orden de compra REAL ejecutada y aún no vendida — espejo exacto de las posiciones paper que ves arriba."
            />
          </div>

          {live.lastError && (
            <p
              className={cn(
                "rounded border px-3 py-2 font-mono text-[11px] leading-snug",
                live.lastError.includes("KILL")
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : "border-amber-500/30 bg-amber-500/[0.07] text-amber-300"
              )}
            >
              {live.lastError}
            </p>
          )}

          {isAdmin ? (
            <>
              {/* selector de exchange */}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-zinc-300">Exchange de ejecución</Label>
                <Select
                  value={live.exchange}
                  disabled={busy}
                  onValueChange={(v) =>
                    void control({ action: "setLiveConfig", exchange: v as typeof live.exchange })
                  }
                >
                  <SelectTrigger className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                    {exchanges.map((e) => (
                      <SelectItem key={e.id} value={e.id} className="font-mono text-xs">
                        {e.name}
                        {live.keysByExchange?.[e.id] ? " ✓" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* prefill badges por exchange */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {exchanges.map((e) => (
                    <span
                      key={e.id}
                      title={
                        live.keysByExchange?.[e.id]
                          ? `credenciales de ${e.name} guardadas (cifradas)`
                          : `${e.name}: sin credenciales`
                      }
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[9px]",
                        live.keysByExchange?.[e.id]
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                          : "border-zinc-700 bg-zinc-800/40 text-zinc-500"
                      )}
                    >
                      {e.name}
                      {live.keysByExchange?.[e.id] ? " ✓" : ""}
                    </span>
                  ))}
                </div>
              </div>

              {/* modo */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-[11px] text-zinc-300">
                  Modo
                  <InfoTip
                    term="MODOS DE TRADING"
                    hint="OFF = solo simulación (recomendado para empezar) · TESTNET = órdenes al sandbox del exchange, flujo idéntico sin riesgo · LIVE = dinero real. Tras cada reinicio del motor vuelve a OFF por seguridad."
                    side="bottom"
                  />
                </Label>
                <Select
                  value={live.mode}
                  disabled={busy || (live.mode === "OFF" && !keysForActive)}
                  onValueChange={(v) => void control({ action: "setLiveConfig", liveMode: v as LiveMode })}
                >
                  <SelectTrigger className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                    <SelectItem value="OFF" className="font-mono text-xs">OFF — solo paper (recomendado)</SelectItem>
                    <SelectItem
                      value="TESTNET"
                      className="font-mono text-xs"
                      disabled={!keysForActive || !meta?.testnetSupported}
                    >
                      TESTNET{!meta?.testnetSupported ? " (no disponible aquí)" : " — sin riesgo"}
                    </SelectItem>
                    <SelectItem
                      value="LIVE"
                      className="font-mono text-xs text-rose-300"
                      disabled={!keysForActive}
                    >
                      LIVE — dinero real ⚠️
                    </SelectItem>
                  </SelectContent>
                </Select>
                {live.mode === "OFF" && !keysForActive && (
                  <p className="font-mono text-[10px] text-zinc-600">
                    guarda las credenciales de {meta?.name} para habilitar TESTNET/LIVE
                  </p>
                )}
              </div>

              {/* credenciales del exchange activo */}
              <div className="space-y-1.5">
                <Label className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-300">
                  <KeyRound className="h-3 w-3" aria-hidden />
                  Credenciales {meta?.name}
                  {keysForActive && (
                    <span className="text-emerald-400">
                      ✓ guardadas (cifradas — prefill tras reinicio)
                    </span>
                  )}
                  {meta?.keyUrl && (
                    <a
                      href={meta.keyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-sky-400 hover:underline"
                    >
                      crear keys <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                    </a>
                  )}
                </Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    type="password"
                    placeholder="API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs"
                    autoComplete="off"
                  />
                  <Input
                    type="password"
                    placeholder="API secret"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs"
                    autoComplete="off"
                  />
                  {meta?.needsPassphrase && (
                    <Input
                      type="password"
                      placeholder={`${meta.passphraseLabel} (requerido)`}
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs sm:col-span-2"
                      autoComplete="off"
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-zinc-700 font-mono text-[10px] text-zinc-200 hover:bg-zinc-800"
                    disabled={busy || !apiKey || !apiSecret}
                    onClick={() => {
                      void control({
                        action: "setExchangeKeys",
                        exchange: live.exchange,
                        apiKey,
                        apiSecret,
                        ...(passphrase ? { passphrase } : {}),
                      });
                      setApiKey("");
                      setApiSecret("");
                      setPassphrase("");
                    }}
                  >
                    Guardar (cifra en disco)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 border-sky-500/40 font-mono text-[10px] text-sky-300 hover:bg-sky-500/10"
                    disabled={testing || !keysForActive}
                    onClick={() => void testKeys()}
                  >
                    {testing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <FlaskConical className="h-3 w-3" aria-hidden />}
                    Probar conexión
                  </Button>
                  {keysForActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-rose-500/40 font-mono text-[10px] text-rose-300 hover:bg-rose-500/10"
                      disabled={busy}
                      onClick={() => void control({ action: "clearExchangeKeys", exchange: live.exchange })}
                    >
                      Borrar credenciales
                    </Button>
                  )}
                </div>
                {testMsg && (
                  <p className="font-mono text-[10px] leading-snug text-zinc-400">{testMsg}</p>
                )}
                <p className="flex items-start gap-1.5 text-[10px] leading-snug text-zinc-600">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500/70" aria-hidden />
                  Keys con permiso de <span className="font-mono">trade</span> únicamente — sin
                  retiros. Se guardan cifradas (AES-256-GCM) en el motor y se recargan solas tras
                  reinicios; el modo live siempre requiere reactivación manual.
                </p>
              </div>
            </>
          ) : (
            <p className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2 font-mono text-[10px] text-zinc-500">
              solo un ADMIN puede gestionar exchanges, credenciales y el modo de trading real
            </p>
          )}
        </div>

        {/* —— columna telegram —— */}
        <div className="space-y-4 border-t border-zinc-800/70 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="flex items-center justify-between gap-3">
            <Label className="flex items-center gap-1.5 text-[11px] text-zinc-300">
              <BellRing className="h-3.5 w-3.5 text-sky-400" aria-hidden />
              Alertas Telegram
              {telegram.enabled && (
                <Badge className="border-emerald-500/40 bg-emerald-500/10 px-1.5 font-mono text-[9px] text-emerald-300 hover:bg-emerald-500/10">
                  ON · {telegram.sentCount} enviados
                </Badge>
              )}
            </Label>
            {isAdmin && (
              <Switch
                checked={telegram.enabled}
                disabled={busy || (!telegram.tokenSet && !telegram.enabled)}
                onCheckedChange={(v) =>
                  void control({ action: "setTelegram", enabled: v })
                }
                aria-label="Activar alertas Telegram"
              />
            )}
          </div>

          {isAdmin ? (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  type="password"
                  placeholder="bot token (BotFather)"
                  value={tgToken}
                  onChange={(e) => setTgToken(e.target.value)}
                  className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs"
                  autoComplete="off"
                />
                <Input
                  placeholder="chat id (ej: 123456789)"
                  value={tgChat}
                  onChange={(e) => setTgChat(e.target.value)}
                  className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-zinc-700 font-mono text-[10px] text-zinc-200 hover:bg-zinc-800"
                  disabled={busy || (!tgToken.trim() && !tgChat.trim())}
                  onClick={() =>
                    void control({
                      action: "setTelegram",
                      ...(tgToken.trim() ? { botToken: tgToken.trim() } : {}),
                      ...(tgChat.trim() ? { chatId: tgChat.trim() } : {}),
                    })
                  }
                >
                  Guardar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 border-sky-500/40 font-mono text-[10px] text-sky-300 hover:bg-sky-500/10"
                  disabled={tgTesting}
                  onClick={() => void testTelegram()}
                >
                  {tgTesting && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                  Enviar prueba
                </Button>
                <span className="font-mono text-[10px] text-zinc-600">
                  {telegram.tokenSet ? "token ✓" : "sin token"} ·{" "}
                  {telegram.chatId ? `chat ${telegram.chatId}` : "sin chat id"}
                </span>
              </div>
              {(tgMsg || telegram.lastError) && (
                <p className="font-mono text-[10px] leading-snug text-zinc-400">
                  {tgMsg ?? telegram.lastError}
                </p>
              )}
              <p className="text-[10px] leading-snug text-zinc-600">
                Recibe cada señal 🚀 y cada cierre (TP/SL/TRAIL con PnL) directamente en tu
                chat — el remake del node-notifier del original.
              </p>
            </>
          ) : (
            <p className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2 font-mono text-[10px] text-zinc-500">
              {telegram.enabled
                ? "alertas activas — gestión por ADMIN"
                : "alertas desactivadas"}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ModeBadge({ mode, exchange }: { mode: LiveMode; exchange: string }) {
  if (mode === "LIVE") {
    return (
      <span className="inline-flex animate-pulse items-center gap-1 rounded border border-rose-500/50 bg-rose-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-rose-300">
        ● LIVE {exchange}
      </span>
    );
  }
  if (mode === "TESTNET") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300">
        TESTNET {exchange}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800/50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-zinc-400">
      OFF · paper
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "neutral";
  hint?: string;
}) {
  const cls =
    tone === "green" ? "text-emerald-400" : tone === "red" ? "text-rose-400" : "text-zinc-100";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
        {label}
        {hint && <InfoTip term={label} hint={hint} side="bottom" />}
      </p>
      <p className={cn("mt-1 font-mono text-base font-bold leading-none", cls)}>{value}</p>
    </div>
  );
}
