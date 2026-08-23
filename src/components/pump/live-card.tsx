"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BellRing,
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

/**
 * LiveCard — trading REAL opt-in (paper sigue siendo el default y el ledger).
 *
 * Seguridad por diseño:
 *  - keys API solo en memoria del motor (nunca en el navegador ni en DB)
 *  - TESTNET para probar el flujo completo sin riesgo
 *  - cap por orden + límite de pérdida diaria con kill switch automático
 *  - el modo se fuerza a OFF tras cada reinicio del motor
 *  - KILL SWITCH manual: vende todo a mercado y desactiva
 *
 * Solo ADMIN (ver /api/engine ADMIN_ACTIONS).
 */

export function LiveCard({ role }: { role: Role }) {
  const state = usePumpStore((s) => s.state);
  const control = usePumpStore((s) => s.control);
  const busy = usePumpStore((s) => s.busy);

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
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

  const saveKeys = async () => {
    setTestMsg(null);
    await control({ action: "setLiveKeys", apiKey, apiSecret });
    setApiKey("");
    setApiSecret("");
  };

  const testKeys = async (mode: "TESTNET" | "LIVE") => {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "testLiveKeys", liveMode: mode }),
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
            Trading real — opt-in
            <ModeBadge mode={live.mode} />
            {live.mode !== "OFF" && (
              <span className="font-mono text-[10px] font-normal text-zinc-500">
                paper sigue corriendo en paralelo (paridad PnL)
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
            <Stat label="PnL real hoy" value={fmtMoney(live.todayPnlUsd)} tone={live.todayPnlUsd >= 0 ? "green" : "red"} />
            <Stat label="PnL real total" value={fmtMoney(live.realizedPnlUsd)} tone={live.realizedPnlUsd >= 0 ? "green" : "red"} />
            <Stat label="Posiciones reales" value={String(live.openSymbols.length)} tone="neutral" />
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
              <div className="space-y-1.5">
                <Label className="text-[11px] text-zinc-300">Modo</Label>
                <Select
                  value={live.mode}
                  disabled={busy || (live.mode === "OFF" && !live.keysSet)}
                  onValueChange={(v) => void control({ action: "setLiveConfig", liveMode: v as LiveMode })}
                >
                  <SelectTrigger className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                    <SelectItem value="OFF" className="font-mono text-xs">OFF — solo paper (recomendado)</SelectItem>
                    <SelectItem value="TESTNET" className="font-mono text-xs" disabled={!live.keysSet}>
                      TESTNET — sin riesgo (testnet.binance.vision)
                    </SelectItem>
                    <SelectItem value="LIVE" className="font-mono text-xs text-rose-300" disabled={!live.keysSet}>
                      LIVE — dinero real ⚠️
                    </SelectItem>
                  </SelectContent>
                </Select>
                {live.mode === "OFF" && !live.keysSet && (
                  <p className="font-mono text-[10px] text-zinc-600">
                    guarda las API keys para habilitar TESTNET/LIVE
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                  <KeyRound className="h-3 w-3" aria-hidden />
                  Binance API keys {live.keysSet && <span className="text-emerald-400">✓ guardadas (solo en memoria del motor)</span>}
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
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-zinc-700 font-mono text-[10px] text-zinc-200 hover:bg-zinc-800"
                    disabled={busy || !apiKey || !apiSecret}
                    onClick={() => void saveKeys()}
                  >
                    Guardar keys
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 border-sky-500/40 font-mono text-[10px] text-sky-300 hover:bg-sky-500/10"
                    disabled={testing || !live.keysSet}
                    onClick={() => void testKeys("TESTNET")}
                  >
                    {testing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <FlaskConical className="h-3 w-3" aria-hidden />}
                    Probar (testnet)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-zinc-700 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800"
                    disabled={testing || !live.keysSet}
                    onClick={() => void testKeys("LIVE")}
                  >
                    Probar (live)
                  </Button>
                  {live.keysSet && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-rose-500/40 font-mono text-[10px] text-rose-300 hover:bg-rose-500/10"
                      disabled={busy}
                      onClick={() => void control({ action: "clearLiveKeys" })}
                    >
                      Borrar keys
                    </Button>
                  )}
                </div>
                {testMsg && (
                  <p className="font-mono text-[10px] leading-snug text-zinc-400">{testMsg}</p>
                )}
                <p className="flex items-start gap-1.5 text-[10px] leading-snug text-zinc-600">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500/70" aria-hidden />
                  Crea keys SOLO con permiso de <span className="font-mono">spot trade</span> — sin
                  retiros. Se guardan únicamente en la memoria del motor: tras un reinicio hay que
                  reingresarlas (feature de seguridad, no bug).
                </p>
              </div>
            </>
          ) : (
            <p className="rounded border border-zinc-800 bg-zinc-950/50 px-3 py-2 font-mono text-[10px] text-zinc-500">
              solo un ADMIN puede gestionar las keys y el modo de trading real
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
                Recibe cada señal 🚀 (símbolo, score, Δvol, Δprecio) y cada cierre
                (TP/SL/TRAIL con PnL) directamente en tu chat — el remake moderno del
                node-notifier del original.
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

function ModeBadge({ mode }: { mode: LiveMode }) {
  if (mode === "LIVE") {
    return (
      <span className="inline-flex animate-pulse items-center gap-1 rounded border border-rose-500/50 bg-rose-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-rose-300">
        ● LIVE — DINERO REAL
      </span>
    );
  }
  if (mode === "TESTNET") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300">
        TESTNET
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
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "neutral";
}) {
  const cls =
    tone === "green" ? "text-emerald-400" : tone === "red" ? "text-rose-400" : "text-zinc-100";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={cn("mt-1 font-mono text-base font-bold leading-none", cls)}>{value}</p>
    </div>
  );
}
