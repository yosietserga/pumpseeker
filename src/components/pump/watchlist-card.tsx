"use client";

import { useState } from "react";
import { Plus, Star, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePumpStore } from "@/lib/pump/store";
import type { MarketRow, Role } from "@/lib/pump/types";

// referencias estables — evitan re-render infinito en useSyncExternalStore
const EMPTY_WATCHLIST: string[] = [];
const EMPTY_MARKET: MarketRow[] = [];

/**
 * WatchlistCard — gestión manual de pares favoritos.
 * Los pares marcados siempre aparecen en el radar (⭐) y entran en cada
 * snapshot de historia. Con "solo watchlist", las señales se limitan a estos.
 */
export function WatchlistCard({ role }: { role: Role }) {
  const state = usePumpStore((s) => s.state);
  const control = usePumpStore((s) => s.control);
  const busy = usePumpStore((s) => s.busy);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const watchlist = state?.manualWatchlist ?? EMPTY_WATCHLIST;
  const watchlistOnly = state?.config.watchlistOnly ?? false;
  const readOnly = role === "VIEWER";
  const marketSymbols = (state?.market ?? EMPTY_MARKET).map((r) => r.symbol);

  const add = () => {
    const raw = input.trim().toUpperCase();
    if (!raw) return;
    const sym = raw.endsWith("USDT") ? raw : `${raw}USDT`;
    if (!/^[A-Z0-9]{2,20}USDT$/.test(sym)) {
      setError("símbolo inválido (ej: BTC o BTCUSDT)");
      return;
    }
    setError(null);
    setInput("");
    void control({ action: "watchlistAdd", symbol: sym });
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
            Watchlist manual
            <span className="font-mono text-[10px] font-normal text-zinc-500">
              (⭐ en el radar · entra en cada snapshot de historia · persiste en disco)
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label
              htmlFor="watchlist-only"
              className="font-mono text-[10px] leading-none text-zinc-400"
            >
              solo señales del watchlist
            </Label>
            <Switch
              id="watchlist-only"
              checked={watchlistOnly}
              onCheckedChange={(v) =>
                void control({ action: "setConfig", config: { watchlistOnly: v } })
              }
              disabled={busy || readOnly}
              aria-label="Solo señales del watchlist"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          {watchlist.length === 0 && (
            <p className="font-mono text-xs text-zinc-500">
              vacía — añade pares para vigilarlos siempre (ej: BTC, SOL, DOGE)
            </p>
          )}
          {watchlist.map((sym) => (
            <span
              key={sym}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/[0.08] py-1 pl-2.5 pr-1 font-mono text-xs font-semibold text-amber-200"
            >
              {sym}
              <button
                type="button"
                onClick={() => void control({ action: "watchlistRemove", symbol: sym })}
                disabled={busy || readOnly}
                className="flex h-4 w-4 items-center justify-center rounded text-amber-400/60 transition-colors hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-40"
                aria-label={`Quitar ${sym} del watchlist`}
                title="Quitar del watchlist"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="BTC, SOL, DOGE…"
              disabled={busy}
              list="pump-market-symbols"
              className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs uppercase text-zinc-200 placeholder:normal-case placeholder:text-zinc-600"
              aria-label="Añadir par al watchlist"
            />
            <datalist id="pump-market-symbols">
              {marketSymbols.slice(0, 40).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1 border-amber-500/40 font-mono text-xs text-amber-300 hover:bg-amber-500/10"
            disabled={busy || !input.trim()}
            onClick={add}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Añadir
          </Button>
          {error && <span className="font-mono text-[10px] text-rose-400">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
