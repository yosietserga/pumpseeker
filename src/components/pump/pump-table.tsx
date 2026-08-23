"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Flame, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoTip } from "@/components/pump/info-tip";
import { usePumpStore } from "@/lib/pump/store";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/pump/format";
import type { MarketRow } from "@/lib/pump/types";
import { cn } from "@/lib/utils";

type SortKey =
  | "score"
  | "symbol"
  | "priceChangePercent"
  | "percentDiff"
  | "volumeDiff"
  | "volumeDiffProgressive"
  | "quoteVolume"
  | "hotStreak";

const COLUMNS: { key: SortKey; label: string; hint: string; formula?: string }[] = [
    {
      key: "symbol",
      label: "PAR",
      hint: "Par de trading contra USDT. La estrella ⭐ lo añade/quita de tu watchlist manual; ×N = cuántas veces disparó señal (moda).",
    },
    {
      key: "score",
      label: "SCORE",
      hint: "Inercia de pump 0–100: qué tan explosiva es la combinación actual de volumen y precio. ≥50 suele ser pump en curso.",
      formula: "45% Δvol inst + 25% momentum precio + 20% Δvol sesión + 10% hot streak",
    },
    {
      key: "priceChangePercent",
      label: "24H %",
      hint: "Cambio de precio de la ventana rolling de 24h que reporta Binance (igual al % que ves en el exchange).",
      formula: "(último − apertura24h) / apertura24h × 100",
    },
    {
      key: "percentDiff",
      label: "Δ PRECIO",
      hint: "Drift de precio desde que el motor arrancó (baseline de sesión). Mide cuánto se movió desde que tú lo vigilas — no el 24h del exchange.",
      formula: "%24h ahora − %24h del primer tick de la sesión",
    },
    {
      key: "volumeDiff",
      label: "Δ VOL",
      hint: "Expansión del volumen 24h desde el arranque del motor: el combustible del pump. Verde = entró dinero nuevo.",
      formula: "(vol ahora − vol baseline) / vol ahora × 100",
    },
    {
      key: "volumeDiffProgressive",
      label: "Δ VOL INST",
      hint: "Aceleración instantánea de volumen entre ticks consecutivos. Es el indicador más temprano de un pump arrancando.",
      formula: "(vol tick actual − vol tick anterior) / vol actual × 100",
    },
    {
      key: "quoteVolume",
      label: "VOL 24H",
      hint: "Volumen negociado en las últimas 24h medido en USDT. El criterio de volumen mínimo filtra por este valor.",
      formula: "criterio actual: ≥ mínimo configurado en Parámetros",
    },
    {
      key: "hotStreak",
      label: "HOT",
      hint: "Ticks consecutivos con volumen acelerando (🔥N). Un streak largo y creciente = tape caliente, alguien está comprando sin parar.",
    },
  ];

/** puntos de criterios — 7 dots verde/rojo, como el desglose del doorman */
function CriteriaDots({ row }: { row: MarketRow }) {
  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex items-center gap-[3px]">
        {row.criteria.map((c) => (
          <Tooltip key={c.name}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  c.passed ? "bg-emerald-400/90" : "bg-zinc-700"
                )}
                aria-label={`${c.label}: ${c.passed ? "pasó" : "no pasó"}`}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="border-zinc-800 bg-zinc-900 text-xs">
              <p className="font-mono font-semibold text-zinc-100">{c.label}</p>
              <p className={cn("font-mono", c.passed ? "text-emerald-400" : "text-rose-400")}>
                {c.passed ? "✓" : "✗"} {c.detail}
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

function pctClass(n: number): string {
  if (n > 0.01) return "text-emerald-400";
  if (n < -0.01) return "text-rose-400";
  return "text-zinc-400";
}

export function PumpTable() {
  const state = usePumpStore((s) => s.state);
  const control = usePumpStore((s) => s.control);
  const busy = usePumpStore((s) => s.busy);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);

  const rows = useMemo(() => {
    if (!state) return [];
    const arr = [...state.market];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : Number(av) - Number(bv);
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [state, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const toggleWatch = (symbol: string, currently: boolean) => {
    void control({
      action: currently ? "watchlistRemove" : "watchlistAdd",
      symbol,
    });
  };

  return (
    <Card className="min-w-0 border-zinc-800 bg-zinc-900/50 p-0">
      <CardHeader className="border-b border-zinc-800/70 py-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-100">
          <Flame className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          Radar de momentum — top {rows.length}
          <span className="hidden font-mono text-[10px] font-normal text-zinc-500 lg:inline">
            (fila verde = pasó los 7 criterios · puntos = desglose · ⭐ = watchlist)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* scroll nativo con ambos ejes: header sticky vertical + scroll horizontal */}
        <div className="thin-scroll max-h-[520px] overflow-auto">
          <table className="w-full min-w-[940px] caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-zinc-900">
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="w-9 px-2 py-2">
                  <InfoTip
                    term="⭐ WATCHLIST"
                    hint="Tus pares favoritos: siempre visibles en el radar, siempre incluidos en los snapshots de historia, y puedes limitar las señales solo a ellos."
                    side="bottom"
                  />
                </TableHead>
                {COLUMNS.map((col) => (
                  <TableHead
                    key={col.key}
                    className="cursor-pointer select-none whitespace-nowrap px-3 py-2 font-mono text-[10px] uppercase text-zinc-500 hover:text-zinc-300"
                    onClick={() => toggleSort(col.key)}
                    aria-sort={sortKey === col.key ? (sortAsc ? "ascending" : "descending") : "none"}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key ? (
                        sortAsc ? (
                          <ArrowUp className="h-3 w-3 text-emerald-400" aria-hidden />
                        ) : (
                          <ArrowDown className="h-3 w-3 text-emerald-400" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" aria-hidden />
                      )}
                      <InfoTip term={col.label} hint={col.hint} formula={col.formula} side="bottom" />
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow className="border-zinc-800/70">
                  <TableCell colSpan={COLUMNS.length + 1} className="py-10 text-center">
                    <p className="font-mono text-xs text-zinc-500">
                      calibrando baseline de sesión… el radar se llena en ~1 min
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow
                  key={row.symbol}
                  className={cn(
                    "border-zinc-800/60 transition-colors",
                    row.isCandidate
                      ? "bg-emerald-500/[0.07] hover:bg-emerald-500/[0.12]"
                      : "hover:bg-zinc-800/40"
                  )}
                >
                  <TableCell className="w-9 px-2 py-2">
                    <button
                      type="button"
                      onClick={() => toggleWatch(row.symbol, row.inWatchlist)}
                      disabled={busy}
                      className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-amber-500/10 disabled:opacity-40"
                      aria-label={
                        row.inWatchlist
                          ? `Quitar ${row.symbol} del watchlist`
                          : `Añadir ${row.symbol} al watchlist`
                      }
                      title={row.inWatchlist ? "Quitar del watchlist" : "Añadir al watchlist"}
                    >
                      <Star
                        className={cn(
                          "h-3.5 w-3.5 transition-colors",
                          row.inWatchlist
                            ? "fill-amber-400 text-amber-400"
                            : "text-zinc-600 hover:text-amber-400"
                        )}
                        aria-hidden
                      />
                    </button>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap font-mono text-xs font-bold text-zinc-100">
                        {row.symbol.replace("USDT", "")}
                        <span className="text-zinc-600">/USDT</span>
                      </span>
                      {row.isCandidate && (
                        <Badge className="border-emerald-500/40 bg-emerald-500/15 px-1 py-0 font-mono text-[9px] text-emerald-300 hover:bg-emerald-500/15">
                          CAND
                        </Badge>
                      )}
                      {row.moda > 0 && (
                        <span
                          className="font-mono text-[9px] text-amber-400/80"
                          title={`disparó ${row.moda} señales (moda)`}
                        >
                          ×{row.moda}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <CriteriaDots row={row} />
                      <span className="whitespace-nowrap font-mono text-[9px] text-zinc-600">
                        {fmtPrice(row.lastPrice)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex h-6 min-w-[44px] items-center justify-center rounded border px-1.5 font-mono text-xs font-bold",
                        row.score >= 50
                          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                          : row.score >= 20
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                            : "border-zinc-700 bg-zinc-800/50 text-zinc-400"
                      )}
                    >
                      {row.score.toFixed(0)}
                    </span>
                  </TableCell>
                  <TableCell className={cn("whitespace-nowrap px-3 py-2 font-mono text-xs", pctClass(row.priceChangePercent))}>
                    {fmtPct(row.priceChangePercent)}
                  </TableCell>
                  <TableCell className={cn("whitespace-nowrap px-3 py-2 font-mono text-xs", pctClass(row.percentDiff))}>
                    {fmtPct(row.percentDiff)}
                  </TableCell>
                  <TableCell className={cn("whitespace-nowrap px-3 py-2 font-mono text-xs", pctClass(row.volumeDiff))}>
                    {row.volumeDiff.toFixed(3)}%
                  </TableCell>
                  <TableCell className={cn("whitespace-nowrap px-3 py-2 font-mono text-xs", pctClass(row.volumeDiffProgressive))}>
                    {row.volumeDiffProgressive.toFixed(4)}%
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-400">
                    {fmtUsd(row.quoteVolume)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-3 py-2">
                    <span
                      className={cn(
                        "font-mono text-xs",
                        row.hotStreak >= 10 ? "font-bold text-amber-400" : "text-zinc-500"
                      )}
                      title="ticks consecutivos con volumen acelerando"
                    >
                      {row.hotStreak > 0 ? `🔥${row.hotStreak}` : "—"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
