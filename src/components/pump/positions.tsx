"use client";

import { Briefcase, History, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePumpStore } from "@/lib/pump/store";
import { fmtDuration, fmtMoney, fmtPct, fmtPrice, clockTime } from "@/lib/pump/format";
import type { ClosedTrade, ExitReason, Position } from "@/lib/pump/types";
import { cn } from "@/lib/utils";

// referencias estables — evitan re-render infinito en useSyncExternalStore
const EMPTY_POSITIONS: Position[] = [];
const EMPTY_TRADES: ClosedTrade[] = [];

const REASON_META: Record<ExitReason, { label: string; cls: string }> = {
  TAKE_PROFIT: {
    label: "TP",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/10",
  },
  STOP_LOSS: {
    label: "SL",
    cls: "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/10",
  },
  TRAILING_STOP: {
    label: "TRAIL",
    cls: "border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/10",
  },
  MANUAL: {
    label: "MANUAL",
    cls: "border-zinc-600 bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800/60",
  },
};

/**
 * Positions — remake del bloque _trading del doorman + trailing stop:
 * TP/SL amplios de órbita, y un trailing que se arma con +N% REAL desde la
 * entrada y persigue al pico con M% de distancia (todo parametrizable).
 */
export function Positions() {
  const state = usePumpStore((s) => s.state);
  const positions = state?.positions ?? EMPTY_POSITIONS;
  const trades = state?.trades ?? EMPTY_TRADES;
  const busy = usePumpStore((s) => s.busy);
  const control = usePumpStore((s) => s.control);

  return (
    <Card className="min-w-0 border-zinc-800 bg-zinc-900/50 p-0">
      <CardHeader className="border-b border-zinc-800/70 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Briefcase className="h-4 w-4 text-amber-400" aria-hidden />
            Paper trader — trailing stop
            <span className="hidden font-mono text-[10px] font-normal text-zinc-500 md:inline">
              (TP/SL amplios · trailing arma con +% REAL desde entrada y sigue al pico)
            </span>
          </CardTitle>
          {positions.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-rose-500/40 font-mono text-[10px] text-rose-300 hover:bg-rose-500/10"
              disabled={busy}
              onClick={() => void control({ action: "closeAll" })}
            >
              Cerrar todo
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="open">
          <div className="border-b border-zinc-800/70 px-4 pt-2">
            <TabsList className="h-9 bg-zinc-950/60">
              <TabsTrigger
                value="open"
                className="h-7 gap-1.5 font-mono text-xs text-zinc-400 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
              >
                Abiertas
                <span className="rounded bg-zinc-800 px-1.5 text-[10px]">{positions.length}</span>
              </TabsTrigger>
              <TabsTrigger
                value="closed"
                className="h-7 gap-1.5 font-mono text-xs text-zinc-400 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
              >
                <History className="h-3 w-3" aria-hidden />
                Historial
                <span className="rounded bg-zinc-800 px-1.5 text-[10px]">{trades.length}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="open" className="mt-0">
            <div className="thin-scroll max-h-[340px] overflow-auto">
              {positions.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2">
                  <Briefcase className="h-6 w-6 text-zinc-700" aria-hidden />
                  <p className="px-6 text-center font-mono text-xs text-zinc-500">
                    sin posiciones — cuando auto-trade esté ON y dispare una señal con slots
                    libres, abre LONG aquí
                  </p>
                </div>
              ) : (
                <table className="w-full min-w-[980px] caption-bottom text-sm">
                  <TableHeader className="sticky top-0 z-10 bg-zinc-900">
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      {["PAR", "ENTRADA", "ACTUAL", "PICO", "SALIDAS (TP/SL/TRAIL)", "PnL VIVO", "DURACIÓN", ""].map((h) => (
                        <TableHead
                          key={h}
                          className="whitespace-nowrap px-3 py-2 font-mono text-[10px] uppercase text-zinc-500"
                        >
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.map((p) => {
                      const win = p.unrealizedPnlUsd >= 0;
                      const gainFromEntry =
                        ((p.lastPrice - p.entryPrice) / p.entryPrice) * 100;
                      const tpPct = ((p.takeProfit - p.lastPrice) / p.lastPrice) * 100;
                      return (
                        <TableRow key={p.id} className="border-zinc-800/60">
                          <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-xs font-bold text-zinc-100">
                            {p.symbol.replace("USDT", "")}
                            <span className="text-zinc-600">/USDT</span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-300">
                            {fmtPrice(p.entryPrice)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-300">
                            {fmtPrice(p.lastPrice)}
                            <span
                              className={cn(
                                "ml-1 text-[9px]",
                                gainFromEntry >= 0 ? "text-emerald-400/70" : "text-rose-400/70"
                              )}
                            >
                              ({fmtPct(gainFromEntry)})
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-400">
                            {fmtPrice(p.peakPrice)}
                          </TableCell>
                          <TableCell className="px-3 py-2 font-mono text-[10px] leading-relaxed">
                            <div className="whitespace-nowrap text-emerald-400">
                              TP {fmtPrice(p.takeProfit)}
                              <span className="ml-1 text-zinc-600">
                                ({tpPct >= 0 ? "+" : ""}
                                {tpPct.toFixed(1)}% p/ TP)
                              </span>
                            </div>
                            <div
                              className={cn(
                                "whitespace-nowrap",
                                p.trailingActive ? "text-zinc-600 line-through" : "text-rose-400"
                              )}
                            >
                              SL {fmtPrice(p.stopLoss)}
                            </div>
                            {p.trailingActive ? (
                              <div className="whitespace-nowrap font-bold text-violet-400">
                                🔔 TRAIL {fmtPrice(p.trailStopPrice)}
                                <span className="ml-1 font-normal text-zinc-600">
                                  ({fmtPct(
                                    ((p.trailStopPrice - p.entryPrice) / p.entryPrice) * 100
                                  )}{" "}
                                  asegurado)
                                </span>
                              </div>
                            ) : (
                              <div className="whitespace-nowrap text-zinc-600">
                                🔔 arma a +{state?.config.trailingActivationPct ?? 2}%
                              </div>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "whitespace-nowrap px-3 py-2 font-mono text-xs font-bold",
                              win ? "text-emerald-400" : "text-rose-400"
                            )}
                          >
                            {fmtMoney(p.unrealizedPnlUsd)}
                            <span className="ml-1 font-normal opacity-70">
                              ({fmtPct(p.unrealizedPnlPct)})
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-500">
                            {fmtDuration((Date.now() - p.openedAt) / 1000)}
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                              disabled={busy}
                              onClick={() =>
                                void control({ action: "closePosition", symbol: p.symbol })
                              }
                              aria-label={`Cerrar posición de ${p.symbol}`}
                              title="Cerrar a mercado"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </table>
              )}
            </div>
          </TabsContent>

          <TabsContent value="closed" className="mt-0">
            <div className="thin-scroll max-h-[340px] overflow-auto">
              {trades.length === 0 ? (
                <div className="flex h-32 items-center justify-center">
                  <p className="font-mono text-xs text-zinc-500">
                    sin trades cerrados todavía — TP/trailing/SL se ejecutan tick a tick
                  </p>
                </div>
              ) : (
                <table className="w-full min-w-[960px] caption-bottom text-sm">
                  <TableHeader className="sticky top-0 z-10 bg-zinc-900">
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      {["PAR", "ENTRADA → SALIDA", "MOTIVO", "PnL", "ROE", "FEES", "DURACIÓN", "HORA"].map(
                        (h) => (
                          <TableHead
                            key={h}
                            className="whitespace-nowrap px-3 py-2 font-mono text-[10px] uppercase text-zinc-500"
                          >
                            {h}
                          </TableHead>
                        )
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((t) => {
                      const meta = REASON_META[t.exitReason] ?? REASON_META.MANUAL;
                      const win = t.pnlUsd >= 0;
                      return (
                        <TableRow key={t.id} className="border-zinc-800/60">
                          <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-xs font-bold text-zinc-100">
                            {t.symbol.replace("USDT", "")}
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-zinc-400">
                            {fmtPrice(t.entryPrice)} <span className="text-zinc-600">→</span>{" "}
                            {fmtPrice(t.exitPrice)}
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <Badge
                              variant="outline"
                              className={cn("px-1.5 font-mono text-[9px]", meta.cls)}
                            >
                              {meta.label}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "whitespace-nowrap px-3 py-2 font-mono text-xs font-bold",
                              win ? "text-emerald-400" : "text-rose-400"
                            )}
                          >
                            {fmtMoney(t.pnlUsd)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "whitespace-nowrap px-3 py-2 font-mono text-xs",
                              win ? "text-emerald-400/80" : "text-rose-400/80"
                            )}
                          >
                            {fmtPct(t.roePct)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-500">
                            ${t.feesUsd.toFixed(2)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-500">
                            {fmtDuration(t.durationSec)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-zinc-600">
                            {clockTime(t.closedAt)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </table>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
