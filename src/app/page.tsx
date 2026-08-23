"use client";

import { useEffect } from "react";
import { Rocket, TrendingDown, TrendingUp, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TopBar } from "@/components/pump/top-bar";
import { StatsRow } from "@/components/pump/stats-row";
import { EngineControls } from "@/components/pump/engine-controls";
import { WatchlistCard } from "@/components/pump/watchlist-card";
import { PumpTable } from "@/components/pump/pump-table";
import { SignalsFeed } from "@/components/pump/signals-feed";
import { Positions } from "@/components/pump/positions";
import { PatternLab } from "@/components/pump/pattern-lab";
import { usePumpStore } from "@/lib/pump/store";
import { fmtPct, fmtPrice } from "@/lib/pump/format";

/**
 * PumpSeeker — remake 2025 de la trilogía de Yosietserga.
 * Misma mecánica de detección (addChange → criterios → ocurrencias → señal →
 * paper trading), stack moderno: TS + socket.io + Prisma + Next.js.
 */
export default function Home() {
  const init = usePumpStore((s) => s.init);
  const dispose = usePumpStore((s) => s.dispose);
  const state = usePumpStore((s) => s.state);
  const { toast } = useToast();

  useEffect(() => {
    init();
    return () => dispose();
  }, [init, dispose]);

  // toasts de señal (el remake del node-notifier del original)
  const lastSignal = usePumpStore((s) => s.lastSignal);
  useEffect(() => {
    if (!lastSignal) return;
    toast({
      title: `🚀 Pump: ${lastSignal.symbol.replace("USDT", "")}/USDT`,
      description: `score ${lastSignal.score.toFixed(0)} · Δvol ${lastSignal.metrics.volumeDiff.toFixed(2)}% · Δprecio ${fmtPct(lastSignal.metrics.percentDiff)} · ${fmtPrice(lastSignal.price)}`,
    });
  }, [lastSignal, toast]);

  // toasts de cierre de trade
  const lastClosedTrade = usePumpStore((s) => s.lastClosedTrade);
  useEffect(() => {
    if (!lastClosedTrade) return;
    const win = lastClosedTrade.pnlUsd >= 0;
    toast({
      title: `${win ? "🟢 Take profit" : lastClosedTrade.exitReason === "STOP_LOSS" ? "🔴 Stop loss" : "⚪ Cierre manual"}: ${lastClosedTrade.symbol.replace("USDT", "")}/USDT`,
      description: `PnL ${lastClosedTrade.pnlUsd >= 0 ? "+" : "−"}$${Math.abs(lastClosedTrade.pnlUsd).toFixed(2)} · ROE ${fmtPct(lastClosedTrade.roePct)} · duración ${lastClosedTrade.durationSec}s`,
    });
  }, [lastClosedTrade, toast]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <TopBar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {/* manifiesto breve */}
        <section className="mb-6">
          <h2 className="text-lg font-bold tracking-tight text-zinc-50 sm:text-xl">
            Bot de trading de <span className="text-emerald-400">inercia explosiva</span> — detección de pump en vivo
          </h2>
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-zinc-500 sm:text-sm">
            Remake del motor de Yosietserga con stack 2025: stream de todo el mercado Binance
            (<span className="font-mono text-zinc-400">!miniTicker@arr</span>) → motor{" "}
            <span className="font-mono text-zinc-400">addChange</span> (Δprecio / Δvol / Δvol
            instantáneo) → cadena de 7 criterios → ocurrencias + confirmaciones → señal → LONG
            automático con TP/SL amplios + <span className="text-violet-400">trailing stop</span>{" "}
            (+2% real desde entrada, 1% de trail) → snapshots de historia para detectar patrones
            repetidos. Paper trading, sin dinero real.
          </p>
        </section>

        {/* stats */}
        <StatsRow />

        {/* controles */}
        <section className="mt-4">
          <EngineControls />
        </section>

        {/* watchlist manual */}
        <section className="mt-4">
          <WatchlistCard />
        </section>

        {/* radar + señales */}
        <section className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
          <PumpTable />
          <SignalsFeed />
        </section>

        {/* posiciones */}
        <section className="mt-4">
          <Positions />
        </section>

        {/* laboratorio de patrones */}
        <section className="mt-4">
          <PatternLab />
        </section>

        {/* motor explicado — fidelidad al original */}
        <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="flex items-center gap-2 font-mono text-[11px] font-bold text-emerald-400">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
              01 · DETECTAR — addChange()
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
              Cada tick actualiza 4 snapshots por par (first/prev/current) y calcula{" "}
              <span className="font-mono text-zinc-300">percentDiff</span> (drift desde el baseline
              de sesión), <span className="font-mono text-zinc-300">percentDiffProgressive</span>{" "}
              (momentum tick a tick) y <span className="font-mono text-zinc-300">volumeDiff</span> /
              <span className="font-mono text-zinc-300">Progressive</span> — la expansión de
              volumen es el combustible del pump.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="flex items-center gap-2 font-mono text-[11px] font-bold text-emerald-400">
              <Rocket className="h-3.5 w-3.5" aria-hidden />
              02 · FILTRAR — cadena de criterios
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
              Los 6 criterios del doorman original: volumen 24h mínimo, expansión de volumen,
              movimiento de precio, techo/piso de cambio 24h y filtro de símbolos con futuro
              USDⓈ-M. Luego el gate anti-flicker: N ocurrencias + M confirmaciones y cooldown por
              símbolo.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="flex items-center gap-2 font-mono text-[11px] font-bold text-emerald-400">
              <TrendingDown className="h-3.5 w-3.5" aria-hidden />
              03 · MONTAR — paper trader + trailing
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
              Al disparar la señal: LONG automático a mercado (con slippage), TP/SL amplios
              (+10%/−10% por defecto) y un trailing stop que se arma con +2% de ganancia REAL
              desde la entrada (no el % 24h) y persigue al pico con 1% de distancia — ej: entra
              a 100 → 102 arma → SL 100.98 → 105 → SL 103.95. Comisión taker por lado y sizing
              fijo. Todo parametrizable en vivo.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="flex items-center gap-2 font-mono text-[11px] font-bold text-emerald-400">
              <History className="h-3.5 w-3.5" aria-hidden />
              04 · RECORDAR — historia y patrones
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
              Cada pocos minutos el motor guarda un snapshot de estadísticas (top del radar +
              watchlist + pares calientes). El laboratorio de patrones compara las condiciones
              actuales de un par con su historia: “cuando repitió estas condiciones, ¿qué pasó en
              los siguientes 10–120 min?” — base para predecir comportamientos similares.
            </p>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="font-mono text-[10px] leading-relaxed text-zinc-600">
            ⚠️ Paper trading — dinero simulado, sin órdenes reales. Los datos son públicos
            (Binance). Esto no es asesoría financiera.
          </p>
          <p className="font-mono text-[10px] text-zinc-700">
            remake del motor de yosietserga (Crypto-Trends-Seeker 2024 · Bitcoin_Sismografo 2022 ·
            crypto-trader-assistant 2021)
          </p>
        </div>
      </footer>
    </div>
  );
}
