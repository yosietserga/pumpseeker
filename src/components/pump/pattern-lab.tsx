"use client";

import { useState } from "react";
import { FlaskConical, History, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePumpStore } from "@/lib/pump/store";
import { fmtPct, fmtPrice, timeAgo } from "@/lib/pump/format";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/pump/info-tip";

/**
 * PatternLab — comparador de condiciones históricas.
 * Toma las condiciones actuales de un par (score, Δvol, Δprecio, momentum) y
 * busca en la historia de snapshots momentos con condiciones similares para
 * responder: "cuando este par repitió estas condiciones, ¿qué pasó después?"
 */

interface PatternSample {
  capturedAt: string;
  volumeDiff: number;
  percentDiff: number;
  percentDiffProgressive: number;
  score: number;
  forwardPct: number;
  minutesAfter: number;
}

interface PatternResult {
  ok: boolean;
  symbol: string;
  error?: string;
  hint?: string;
  current?: {
    capturedAt: string;
    price: number;
    priceChangePercent: number;
    percentDiff: number;
    percentDiffProgressive: number;
    volumeDiff: number;
    volumeDiffProgressive: number;
    score: number;
  };
  params?: { hours: number; horizon: number; tolVol: number; tolPd: number; tolScore: number };
  stats?: {
    matches: number;
    avgForwardPct: number;
    medianForwardPct: number;
    winRate: number;
    bestPct: number;
    worstPct: number;
  };
  samples?: PatternSample[];
}

const HORIZONS = [10, 30, 60, 120];

export function PatternLab() {
  const state = usePumpStore((s) => s.state);

  const [symbol, setSymbol] = useState<string>("");
  const [horizon, setHorizon] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PatternResult | null>(null);

  // opciones: watchlist + top del radar (memo por id de estado para no recomputar de más)
  const symbolOptions = (() => {
    const set = new Set<string>();
    for (const s of state?.manualWatchlist ?? []) set.add(s);
    for (const r of state?.market ?? []) set.add(r.symbol);
    return [...set].sort();
  })();
  const effectiveSymbol = symbol || symbolOptions[0] || "";

  const analyze = async () => {
    if (!effectiveSymbol) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/patterns?symbol=${effectiveSymbol}&horizon=${horizon}&hours=72`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as PatternResult;
      setResult(data);
    } catch (err) {
      setResult({ ok: false, symbol: effectiveSymbol, error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const stats = result?.stats;

  return (
    <Card className="border-zinc-800 bg-zinc-900/50 p-0">
      <CardHeader className="border-b border-zinc-800/70 py-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-100">
          <FlaskConical className="h-4 w-4 text-violet-400" aria-hidden />
          Laboratorio de patrones — historia vs presente
          <InfoTip
            term="LABORATORIO DE PATRONES"
            hint="El motor fotografía el mercado cada pocos minutos. Este lab busca en esa historia momentos con condiciones SIMILARES a las actuales del par (misma dirección de momentum, Δvol y Δprecio cercanos, score parecido) y calcula qué pasó con el precio después — estadística de futuro sobre tu propia data."
            formula="match: Δvol ±50% rel · Δprecio ±50% rel · score ±15 · mismo signo de momentum"
            side="bottom"
          />
          <span className="hidden font-mono text-[10px] font-normal text-zinc-500 md:inline">
            (cuando este par repitió condiciones similares, ¿qué pasó después?)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5">
        {/* controles */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <span className="block font-mono text-[10px] uppercase text-zinc-500">par</span>
            <Select value={effectiveSymbol} onValueChange={setSymbol}>
              <SelectTrigger className="h-9 w-[180px] border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-200">
                <SelectValue placeholder="par" />
              </SelectTrigger>
              <SelectContent className="max-h-72 border-zinc-800 bg-zinc-900 text-zinc-200">
                {symbolOptions.map((s) => (
                  <SelectItem key={s} value={s} className="font-mono text-xs">
                    {s}
                  </SelectItem>
                ))}
                {symbolOptions.length === 0 && (
                  <div className="px-3 py-2 font-mono text-xs text-zinc-500">
                    sin pares — el radar se llena en ~1 min
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <span className="block font-mono text-[10px] uppercase text-zinc-500">
              horizonte futuro
            </span>
            <Select value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}>
              <SelectTrigger className="h-9 w-[130px] border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                {HORIZONS.map((h) => (
                  <SelectItem key={h} value={String(h)} className="font-mono text-xs">
                    {h} min
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-violet-600 font-mono text-xs text-white hover:bg-violet-500"
            disabled={loading || !effectiveSymbol}
            onClick={() => void analyze()}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Search className="h-3.5 w-3.5" aria-hidden />
            )}
            Buscar patrones
          </Button>
          <span className="ml-auto hidden font-mono text-[10px] text-zinc-600 lg:block">
            snapshot cada {state?.config.snapshotIntervalMin ?? 3} min · ventana 72h · tolerancias
            adaptativas
          </span>
        </div>

        {/* error / hint */}
        {result && !result.ok && (
          <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
            <p className="font-mono text-xs text-amber-300">{result.error}</p>
            {result.hint && <p className="mt-1 text-[11px] text-zinc-400">{result.hint}</p>}
          </div>
        )}

        {/* resultado */}
        {result?.ok && result.current && stats && (
          <div className="mt-5 space-y-5">
            {/* condiciones actuales */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                condiciones actuales de {result.symbol}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip label="score" value={result.current.score.toFixed(0)} tone="violet" />
                <Chip
                  label="Δvol"
                  value={`${result.current.volumeDiff.toFixed(2)}%`}
                  tone={result.current.volumeDiff >= 0 ? "green" : "red"}
                />
                <Chip
                  label="Δvol inst"
                  value={`${result.current.volumeDiffProgressive.toFixed(3)}%`}
                  tone={result.current.volumeDiffProgressive >= 0 ? "green" : "red"}
                />
                <Chip
                  label="Δprecio"
                  value={fmtPct(result.current.percentDiff)}
                  tone={result.current.percentDiff >= 0 ? "green" : "red"}
                />
                <Chip
                  label="24h"
                  value={fmtPct(result.current.priceChangePercent)}
                  tone={result.current.priceChangePercent >= 0 ? "green" : "red"}
                />
                <Chip label="precio" value={fmtPrice(result.current.price)} tone="neutral" />
              </div>
            </div>

            {/* stats de coincidencias */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatBox label="coincidencias" value={String(stats.matches)} tone="neutral" />
              <StatBox
                label="retorno prom."
                value={fmtPct(stats.avgForwardPct)}
                tone={stats.avgForwardPct >= 0 ? "green" : "red"}
                sub={`mediana ${fmtPct(stats.medianForwardPct)}`}
              />
              <StatBox
                label="win rate"
                value={`${stats.winRate}%`}
                tone={stats.winRate >= 50 ? "green" : "red"}
                sub="retornos > 0"
              />
              <StatBox
                label="mejor"
                value={fmtPct(stats.bestPct)}
                tone="green"
                sub={`a ${result.params?.horizon} min`}
              />
              <StatBox
                label="peor"
                value={fmtPct(stats.worstPct)}
                tone="red"
                sub={`a ${result.params?.horizon} min`}
              />
            </div>

            {/* muestras */}
            {stats.matches > 0 && result.samples && result.samples.length > 0 ? (
              <div>
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <History className="h-3.5 w-3.5" aria-hidden />
                  momentos similares encontrados (últimos {result.samples.length})
                </p>
                <div className="thin-scroll mt-2 max-h-[260px] overflow-auto rounded-lg border border-zinc-800">
                  <table className="w-full min-w-[560px] caption-bottom text-sm">
                    <thead className="sticky top-0 z-10 bg-zinc-900">
                      <tr className="border-b border-zinc-800">
                        {["cuándo", "Δvol", "Δprecio", "score", "retorno"].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left font-mono text-[10px] uppercase text-zinc-500"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.samples.map((s) => (
                        <tr key={s.capturedAt} className="border-b border-zinc-800/60">
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-zinc-400">
                            {timeAgo(new Date(s.capturedAt).getTime())}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-zinc-300">
                            {s.volumeDiff.toFixed(2)}%
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-zinc-300">
                            {fmtPct(s.percentDiff)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-zinc-300">
                            {s.score.toFixed(0)}
                          </td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-3 py-2 font-mono text-[11px] font-bold",
                              s.forwardPct >= 0 ? "text-emerald-400" : "text-rose-400"
                            )}
                          >
                            {fmtPct(s.forwardPct)}
                            <span className="ml-1 font-normal text-zinc-600">
                              en {s.minutesAfter}m
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-600">
                  coincidencia = misma dirección de momentum + Δvol ±50% (relativo) + Δprecio ±50%
                  (relativo) + score ±15, dentro de las últimas 72h. Retorno = cambio de precio en
                  los {result.params?.horizon} min siguientes al momento matcheado. Historia viva:
                  cada snapshot añade más casos.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-5 text-center">
                <p className="font-mono text-xs text-zinc-500">
                  {result.hint ?? "sin coincidencias todavía — la historia se acumula con cada snapshot"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* estado inicial */}
        {!result && (
          <div className="mt-5 flex flex-col items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-8 text-center">
            <History className="h-6 w-6 text-zinc-700" aria-hidden />
            <p className="max-w-md font-mono text-xs leading-relaxed text-zinc-500">
              el motor guarda un snapshot de estadísticas cada{" "}
              {state?.config.snapshotIntervalMin ?? 3} min (top del radar + watchlist + pares con
              tape caliente). Elige un par y busca qué pasó las veces que repitió las condiciones
              actuales.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "violet" | "neutral";
}) {
  const toneCls = {
    green: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300",
    red: "border-rose-500/30 bg-rose-500/[0.08] text-rose-300",
    violet: "border-violet-500/30 bg-violet-500/[0.08] text-violet-300",
    neutral: "border-zinc-700 bg-zinc-800/50 text-zinc-300",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs",
        toneCls
      )}
    >
      <span className="text-[9px] uppercase opacity-60">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}

function StatBox({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "neutral";
  sub?: string;
}) {
  const toneCls = {
    green: "text-emerald-400",
    red: "text-rose-400",
    neutral: "text-zinc-100",
  }[tone];
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={cn("mt-1 font-mono text-lg font-bold leading-none", toneCls)}>{value}</p>
      {sub && <p className="mt-1 font-mono text-[9px] text-zinc-600">{sub}</p>}
    </div>
  );
}
