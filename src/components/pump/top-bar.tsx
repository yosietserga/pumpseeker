"use client";

import { Activity, LogOut, Radio, RefreshCcw, Square, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoleBadge, UserManager } from "@/components/pump/auth-gate";
import { usePumpStore } from "@/lib/pump/store";
import type { ProfileName, Role } from "@/lib/pump/types";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/pump/info-tip";

const PROFILE_LABELS: Record<ProfileName, string> = {
  SCALPING: "Scalping — pumps intraminuto",
  INTRADAY: "Intraday — tendencia del día",
  BUY_THE_DIP: "Buy The Dip — rebotes con volumen",
  CUSTOM: "Personalizado",
};

export function TopBar({
  userName,
  userRole,
  onLogout,
}: {
  userName: string;
  userRole: Role;
  onLogout: () => void;
}) {
  const state = usePumpStore((s) => s.state);
  const socketConnected = usePumpStore((s) => s.socketConnected);
  const busy = usePumpStore((s) => s.busy);
  const control = usePumpStore((s) => s.control);

  const status = state?.status ?? "BOOTING";
  const feed = state?.feed ?? "DOWN";
  const running = status === "RUNNING";
  const liveMode = state?.live.mode ?? "OFF";
  const readOnly = userRole === "VIEWER";

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
          <InfoTip
            term="MOTOR"
            hint="Estado del motor de detección: RUNNING = escaneando el mercado en vivo · BOOTING = calibrando baseline de sesión · STOPPED = detenido (puedes arrancarlo)."
            side="bottom"
            variant="wrap"
          >
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
          </InfoTip>
          <InfoTip
            term="FEED DE MERCADO"
            hint="Conexión con Binance: LIVE = websocket en vivo · POLLING = fallback REST (el stream cayó, sigue funcionando) · RECONNECTING/DOWN = reconectando."
            side="bottom"
            variant="wrap"
          >
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
          </InfoTip>
          <InfoTip
            term="WEBSOCKET"
            hint="Canal en tiempo real navegador ↔ motor: sin él el dashboard solo refresca cada pocos segundos vía REST. Si se apaga, se reconecta solo."
            side="bottom"
            variant="wrap"
          >
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
          </InfoTip>
          {liveMode !== "OFF" && (
            <InfoTip
              term={liveMode === "LIVE" ? "⚠️ LIVE — DINERO REAL" : "TESTNET"}
              hint={
                liveMode === "LIVE"
                  ? "Las señales del bot ejecutan órdenes REALES con tu dinero en el exchange seleccionado. Kill switch disponible en la tarjeta de Trading real."
                  : "Las señales se ejecutan en el sandbox del exchange (testnet): flujo completo sin riesgo real."
              }
              side="bottom"
              variant="wrap"
            >
              <Badge
                className={cn(
                  "gap-1 border font-mono text-[10px] font-bold",
                  liveMode === "LIVE"
                    ? "animate-pulse border-rose-500/50 bg-rose-500/15 text-rose-300"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                )}
                variant="outline"
              >
                {liveMode === "LIVE" ? "● LIVE" : "TESTNET"}
              </Badge>
            </InfoTip>
          )}
          {/* usuario */}
          <div className="flex items-center gap-1.5">
            <span className="hidden max-w-[120px] truncate font-mono text-[11px] text-zinc-400 sm:block" title={userName}>
              {userName}
            </span>
            <RoleBadge role={userRole} />
            {userRole === "ADMIN" && <UserManager />}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              onClick={onLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </div>

        {/* controles */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Select
            value={state?.config.profile ?? "SCALPING"}
            onValueChange={(v) => void control({ action: "setProfile", profile: v as ProfileName })}
            disabled={busy || readOnly}
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
              disabled={busy || readOnly}
              onClick={() => void control({ action: "stop" })}
            >
              <Square className="h-3.5 w-3.5" aria-hidden />
              Detener
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-emerald-600 font-mono text-xs text-white hover:bg-emerald-500"
              disabled={busy || readOnly}
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
