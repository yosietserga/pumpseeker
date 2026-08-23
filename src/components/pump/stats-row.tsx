"use client";

import {
  Radar,
  Rocket,
  Briefcase,
  Target,
  Wallet,
  TrendingUp,
  GitCommitHorizontal,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePumpStore } from "@/lib/pump/store";
import { fmtMoney, fmtUsd, timeAgo } from "@/lib/pump/format";
import { InfoTip } from "@/components/pump/info-tip";
import { cn } from "@/lib/utils";

export function StatsRow() {
  const state = usePumpStore((s) => s.state);

  if (!state) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-lg bg-zinc-900" />
        ))}
      </div>
    );
  }

  const st = state.stats;
  const cards: {
    icon: typeof Radar;
    label: string;
    value: string;
    sub: string;
    tone: string;
    iconColor: string;
    term: string;
    hint: string;
    formula?: string;
  }[] = [
    {
      icon: Radar,
      label: "Radar",
      term: "RADAR",
      hint: "Pares USDT que el motor vigila en vivo (stream de todo el mercado Binance). \"Activos\" = pares que se movieron en el último minuto; ticks/s = velocidad del feed.",
      formula: "1 stream !miniTicker@arr → 470+ pares",
      value: String(state.marketStats.watchlist),
      sub: `${state.marketStats.changedLastMin} activos · ${state.marketStats.ticksPerSec.toFixed(0)} ticks/s`,
      tone: "text-zinc-50",
      iconColor: "text-sky-400",
    },
    {
      icon: Rocket,
      label: "Señales de pump",
      term: "SEÑAL DE PUMP",
      hint: "Veces que un par pasó TODOS los criterios + el gate anti-flicker (ocurrencias y confirmaciones consecutivas). Cada señal puede abrir posición automática.",
      formula: "criterios ✓ → N ocurrencias → M confirmaciones → SEÑAL",
      value: String(state.signals.length),
      sub: state.lastSignalAt ? `última ${timeAgo(state.lastSignalAt)}` : "esperando despegue…",
      tone: "text-zinc-50",
      iconColor: "text-emerald-400",
    },
    {
      icon: Briefcase,
      label: "Posiciones",
      term: "POSICIONES",
      hint: "Posiciones LONG de paper trading abiertas sobre el máximo simultáneo configurado. Con auto-trade ON se abren solas al disparar señales.",
      value: `${st.openPositions}/${state.config.maxOpenPositions}`,
      sub: state.config.autoTrade ? "auto-trade ON" : "auto-trade OFF",
      tone: "text-zinc-50",
      iconColor: "text-amber-400",
    },
    {
      icon: Target,
      label: "Win rate",
      term: "WIN RATE",
      hint: "Porcentaje de trades cerrados con PnL positivo (neto de comisiones simuladas). Incluye salidas por TP, SL, trailing y manuales.",
      formula: "wins / trades cerrados × 100",
      value: st.totalTrades ? `${st.winRate}%` : "—",
      sub: st.totalTrades
        ? `${st.wins}W / ${st.losses}L · ${st.avgDurationSec}s prom`
        : "sin trades cerrados",
      tone: "text-zinc-50",
      iconColor: "text-violet-400",
    },
    {
      icon: Wallet,
      label: "PnL",
      term: "PnL (PAPER)",
      hint: "Ganancia/pérdida total simulada: realizado (trades cerrados, neto de fees) + abierto (fluctuación de posiciones vivas). Dinero simulado, no real.",
      formula: "PnL total = realizado + no realizado",
      value: fmtMoney(st.totalPnlUsd + st.unrealizedPnlUsd),
      sub: `realizado ${fmtMoney(st.totalPnlUsd)} · abierto ${fmtMoney(st.unrealizedPnlUsd)}`,
      tone: cn(st.totalPnlUsd + st.unrealizedPnlUsd >= 0 ? "text-emerald-400" : "text-rose-400"),
      iconColor: "text-emerald-400",
    },
    {
      icon: TrendingUp,
      label: "Equity",
      term: "EQUITY",
      hint: "Valor total de la cuenta paper: capital inicial + PnL acumulado. Las comisiones taker simuladas se descuentan — contabilidad honesta.",
      formula: "equity = capital + PnL realizado + PnL abierto",
      value: fmtUsd(st.equity, 2),
      sub: `capital ${fmtUsd(state.config.capital)} · fees ${fmtUsd(st.totalFeesUsd, 2)}`,
      tone: st.equity >= state.config.capital ? "text-emerald-400" : "text-rose-400",
      iconColor: "text-emerald-400",
    },
    {
      icon: GitCommitHorizontal,
      label: "Salidas trailing",
      term: "SALIDAS TRAILING",
      hint: "Trades cerrados por el trailing stop: se arma con +N% de ganancia REAL desde tu entrada y sigue al precio pico a M% de distancia, solo subiendo (ratchet).",
      formula: `arma a +${state.config.trailingActivationPct}% → stop = pico × ${(100 - state.config.trailingDistancePct).toFixed(0)}%`,
      value: String(st.trailingExits ?? 0),
      sub: `trail ${state.config.trailingActivationPct}%/${state.config.trailingDistancePct}% · TP ${state.config.takeProfitPct}% · SL ${state.config.stopLossPct}%`,
      tone: (st.trailingExits ?? 0) > 0 ? "text-violet-400" : "text-zinc-50",
      iconColor: "text-violet-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {cards.map((card) => {
        const { icon: Icon, label, value, sub, tone, iconColor } = card;
        return (
        <Card key={label} className="border-zinc-800 bg-zinc-900/60 p-0">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Icon className={cn("h-3.5 w-3.5", iconColor)} aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
              <InfoTip
                term={card.term}
                hint={card.hint}
                formula={card.formula}
                side="bottom"
              />
            </div>
            <p className={cn("mt-1.5 font-mono text-xl font-bold tracking-tight", tone)}>{value}</p>
            <p className="mt-0.5 truncate text-[10px] text-zinc-500" title={sub}>
              {sub}
            </p>
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}
