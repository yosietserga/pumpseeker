"use client";

import { Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePumpStore } from "@/lib/pump/store";
import { clockTime, fmtPct, fmtPrice, fmtUsd } from "@/lib/pump/format";
import type { Position, PumpSignal } from "@/lib/pump/types";
import { cn } from "@/lib/utils";

// referencias estables — evitan re-render infinito en useSyncExternalStore
const EMPTY_SIGNALS: PumpSignal[] = [];
const EMPTY_POSITIONS: Position[] = [];

/**
 * SignalsFeed — las señales del detector en vivo.
 * Remake del "tplArr" del doorman (la tabla de consola), ahora con el
 * desglose de criterios que el original calculaba pero no mostraba.
 */
export function SignalsFeed() {
  const state = usePumpStore((s) => s.state);
  const signals = state?.signals ?? EMPTY_SIGNALS;
  const positions = state?.positions ?? EMPTY_POSITIONS;

  return (
    <Card className="flex h-full min-w-0 flex-col border-zinc-800 bg-zinc-900/50">
      <CardHeader className="border-b border-zinc-800/70 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Rocket className="h-4 w-4 text-emerald-400" aria-hidden />
          Señales de pump
          <span className="font-mono text-[10px] font-normal text-zinc-500">
            ({signals.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="max-h-[520px] [&>[data-slot=scroll-area-viewport]]:max-h-[520px]">
          {signals.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center">
              <Rocket className="h-6 w-6 text-zinc-700" aria-hidden />
              <p className="font-mono text-xs text-zinc-500">
                esperando inercia explosiva… cuando un par pase los 6 criterios
                + ocurrencias/confirmaciones, dispara aquí
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800/60">
              {signals.map((sig) => {
                const pos = positions.find((p) => p.signalId === sig.id);
                const passed = sig.criteria.filter((c) => c.passed);
                return (
                  <li key={sig.id} className="px-4 py-3 transition-colors hover:bg-zinc-800/30">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-zinc-50">
                        {sig.symbol.replace("USDT", "")}
                        <span className="text-zinc-600">/USDT</span>
                      </span>
                      <Badge
                        className={cn(
                          "border px-1.5 font-mono text-[9px]",
                          sig.score >= 50
                            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15"
                            : "border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800/60"
                        )}
                      >
                        score {sig.score.toFixed(0)}
                      </Badge>
                      {sig.moda > 1 && (
                        <span className="font-mono text-[9px] text-amber-400/80" title="moda: veces disparada">
                          ×{sig.moda}
                        </span>
                      )}
                      {pos && (
                        <Badge className="border-amber-500/40 bg-amber-500/10 px-1.5 font-mono text-[9px] text-amber-300 hover:bg-amber-500/10">
                          POSICIÓN ABIERTA
                        </Badge>
                      )}
                      <span className="ml-auto font-mono text-[10px] text-zinc-600">
                        {clockTime(sig.at)}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px]">
                      <span className="text-zinc-500">
                        precio <span className="text-zinc-300">{fmtPrice(sig.price)}</span>
                      </span>
                      <span className="text-zinc-500">
                        Δprecio{" "}
                        <span className={sig.metrics.percentDiff >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {fmtPct(sig.metrics.percentDiff)}
                        </span>
                      </span>
                      <span className="text-zinc-500">
                        Δvol{" "}
                        <span className="text-emerald-400">
                          {sig.metrics.volumeDiff.toFixed(3)}%
                        </span>
                      </span>
                      <span className="text-zinc-500">
                        Δvol inst{" "}
                        <span className="text-emerald-400">
                          {sig.metrics.volumeDiffProgressive.toFixed(4)}%
                        </span>
                      </span>
                      <span className="text-zinc-500">
                        vol24h <span className="text-zinc-300">{fmtUsd(sig.quoteVolume)}</span>
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {passed.map((c) => (
                        <span
                          key={c.name}
                          className="rounded border border-emerald-500/25 bg-emerald-500/[0.08] px-1.5 py-px font-mono text-[9px] text-emerald-300/90"
                          title={c.detail}
                        >
                          {c.label}
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
