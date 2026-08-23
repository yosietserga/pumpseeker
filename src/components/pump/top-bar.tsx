"use client";

import { Activity, Radio, RefreshCcw, Square, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePumpStore } from "@/lib/pump/store";
import type { ProfileName } from "@/lib/pump/types";
import { cn } from "@/lib/utils";

const PROFILE_LABELS: Record<ProfileName, string> = {
  SCALPING: "Scalping — pumps intraminuto",
  INTRADAY: "Intraday — tendencia del día",
  BUY_THE_DIP: "Buy The Dip — rebotes con volumen",
  CUSTOM: "Personalizado",
};

export function TopBar() {
  const state = usePumpStore((s) => s.state);
  const socketConnected = usePumpStore((s) => s.socketConnected);
  const busy = usePumpStore((s) => s.busy);
  const control = usePumpStore((s) => s.control);

  const status = state?.status ?? "BOOTING";
  const feed = state?.feed ?? "DOWN";
  const running = status === "RUNNING";

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        {/* marca */}
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10">
            <Activity className="h-5 w-5 text-emerald-400" aria-hidden />
            {running && (
              <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
            )}
          </span>
          <div>
            <h1 className="text-base font-black leading-none tracking-tight text-zinc-50">
              Pump<span className="text-emerald-400">Seeker</span>
            </h1>
            <p className="mt-0.5 hidden text-[10px] leading-none text-zinc-500 sm:block">
              remake 2025 · motor de pump-momentum (ADN Crypto-Trends-Seeker)
            </p>
          </div>
        </div>

        {/* estados */}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Badge
            className={cn(
              "gap-1.5 border font-mono text-[10px]",
              status === "RUNNING" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
              status === "BOOTING" && "border-amber-500/40 bg-amber-500/10 text-amber-300",
              status === "STOPPED" && "border-rose-500/40 bg-rose-500/10 text-rose-300"
            )}
            variant="outline"
          >
            <Radio className="h-3 w-3" aria-hidden />
            motor {status}
          </Badge>
          <Badge
            className={cn(
              "gap-1.5 border font-mono text-[10px]",
              feed === "LIVE" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
              feed === "POLLING" && "border-amber-500/40 bg-amber-500/10 text-amber-300",
              (feed === "RECONNECTING" || feed === "DOWN") &&
                "border-rose-500/40 bg-rose-500/10 text-rose-300"
            )}
            variant="outline"
          >
            Binance {feed}
          </Badge>
          <Badge
            className={cn(
              "gap-1.5 border font-mono text-[10px]",
              socketConnected
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-zinc-700 bg-zinc-900 text-zinc-400"
            )}
            variant="outline"
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", socketConnected ? "bg-emerald-400" : "bg-zinc-600")} aria-hidden />
            ws {socketConnected ? "on" : "off"}
          </Badge>
        </div>

        {/* controles */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Select
            value={state?.config.profile ?? "SCALPING"}
            onValueChange={(v) => void control({ action: "setProfile", profile: v as ProfileName })}
            disabled={busy}
          >
            <SelectTrigger className="h-9 w-full border-zinc-800 bg-zinc-900 font-mono text-xs text-zinc-200 sm:w-[230px]">
              <SelectValue placeholder="perfil" />
            </SelectTrigger>
            <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
              {(Object.keys(PROFILE_LABELS) as ProfileName[]).map((p) => (
                <SelectItem key={p} value={p} className="font-mono text-xs">
                  {PROFILE_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {running ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-9 gap-1.5 font-mono text-xs"
              disabled={busy}
              onClick={() => void control({ action: "stop" })}
            >
              <Square className="h-3.5 w-3.5" aria-hidden />
              Detener
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-emerald-600 font-mono text-xs text-white hover:bg-emerald-500"
              disabled={busy}
              onClick={() => void control({ action: "start" })}
            >
              {status === "BOOTING" ? (
                <RefreshCcw className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden />
              )}
              Arrancar
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
