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
  const cards = [
    {
      icon: Radar,
      label: "Radar",
      value: String(state.marketStats.watchlist),
      sub: `${state.marketStats.changedLastMin} activos · ${state.marketStats.ticksPerSec.toFixed(0)} ticks/s`,
      tone: "text-zinc-50",
      iconColor: "text-sky-400",
    },
    {
      icon: Rocket,
      label: "Señales de pump",
      value: String(state.signals.length),
      sub: state.lastSignalAt ? `última ${timeAgo(state.lastSignalAt)}` : "esperando despegue…",
      tone: "text-zinc-50",
      iconColor: "text-emerald-400",
    },
    {
      icon: Briefcase,
      label: "Posiciones",
      value: `${st.openPositions}/${state.config.maxOpenPositions}`,
      sub: st.autoTrade ? "auto-trade ON" : "auto-trade OFF",
      tone: "text-zinc-50",
      iconColor: "text-amber-400",
    },
    {
      icon: Target,
      label: "Win rate",
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
      value: fmtMoney(st.totalPnlUsd + st.unrealizedPnlUsd),
      sub: `realizado ${fmtMoney(st.totalPnlUsd)} · abierto ${fmtMoney(st.unrealizedPnlUsd)}`,
      tone: cn(st.totalPnlUsd + st.unrealizedPnlUsd >= 0 ? "text-emerald-400" : "text-rose-400"),
      iconColor: "text-emerald-400",
    },
    {
      icon: TrendingUp,
      label: "Equity",
      value: fmtUsd(st.equity, 2),
      sub: `capital ${fmtUsd(state.config.capital)} · fees ${fmtUsd(st.totalFeesUsd, 2)}`,
      tone: st.equity >= state.config.capital ? "text-emerald-400" : "text-rose-400",
      iconColor: "text-emerald-400",
    },
    {
      icon: GitCommitHorizontal,
      label: "Salidas trailing",
      value: String(st.trailingExits ?? 0),
      sub: `trail ${state.config.trailingActivationPct}%/${state.config.trailingDistancePct}% · TP ${state.config.takeProfitPct}% · SL ${state.config.stopLossPct}%`,
      tone: (st.trailingExits ?? 0) > 0 ? "text-violet-400" : "text-zinc-50",
      iconColor: "text-violet-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {cards.map(({ icon: Icon, label, value, sub, tone, iconColor }) => (
        <Card key={label} className="border-zinc-800 bg-zinc-900/60 p-0">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-zinc-500">
              <Icon className={cn("h-3.5 w-3.5", iconColor)} aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
            </div>
            <p className={cn("mt-1.5 font-mono text-xl font-bold tracking-tight", tone)}>{value}</p>
            <p className="mt-0.5 truncate text-[10px] text-zinc-500" title={sub}>
              {sub}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
