"use client";

import { useState } from "react";
import { ChevronDown, RefreshCcw, Settings2, Zap, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { usePumpStore } from "@/lib/pump/store";
import type { EngineConfig, Role } from "@/lib/pump/types";

/**
 * EngineControls — remake del menú inquirer de cli/index.js:
 * los mismos umbrales del doorman, pero editables en vivo.
 *
 * El draft arranca como "espejo del motor"; cualquier edición lo convierte
 * en perfil CUSTOM (igual que el original: tocar un número = perfil propio).
 */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-[11px] font-medium text-zinc-300">{label}</Label>
        {hint && <span className="font-mono text-[10px] text-zinc-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function EngineControls({ role }: { role: Role }) {
  const state = usePumpStore((s) => s.state);
  const control = usePumpStore((s) => s.control);
  const busy = usePumpStore((s) => s.busy);

  const [draft, setDraft] = useState<EngineConfig | null>(null);
  const [open, setOpen] = useState(false);
  const readOnly = role === "VIEWER";

  if (!state) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="flex items-center gap-2 py-4">
          <Settings2 className="h-4 w-4 text-zinc-600" aria-hidden />
          <span className="font-mono text-xs text-zinc-600">conectando con el motor…</span>
        </CardContent>
      </Card>
    );
  }

  // mientras no se edite nada, el draft espeja la config viva del motor
  const live = state.config;
  const effective: EngineConfig = draft ?? live;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(live);
  const profileDrift = draft !== null && draft.profile !== live.profile;

  const set = <K extends keyof EngineConfig>(key: K, value: EngineConfig[K]) =>
    setDraft((d) => ({ ...(d ?? live), [key]: value, profile: "CUSTOM" }));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-3 hover:bg-zinc-900/80">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <Settings2 className="h-4 w-4 text-emerald-400" aria-hidden />
                Parámetros del motor
                <span className="hidden font-mono text-[10px] font-normal text-zinc-500 sm:inline">
                  (los 6 criterios del doorman + trader)
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                {dirty && (
                  <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                    sin aplicar
                  </span>
                )}
                {profileDrift && (
                  <span className="rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
                    perfil del motor: {live.profile}
                  </span>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="border-t border-zinc-800/70 pt-5">
            {profileDrift && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2">
                <p className="text-[11px] text-zinc-300">
                  El motor ahora corre el perfil{" "}
                  <span className="font-mono font-bold text-sky-300">{live.profile}</span>. Tus
                  cambios sin aplicar quedaron del perfil anterior.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-7 border-sky-500/40 font-mono text-[10px] text-sky-300 hover:bg-sky-500/10"
                  onClick={() => setDraft(null)}
                >
                  <RefreshCcw className="mr-1 h-3 w-3" aria-hidden />
                  Cargar config del motor
                </Button>
              </div>
            )}

            {readOnly && (
              <p className="mb-4 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 font-mono text-[11px] text-zinc-400">
                rol VIEWER — parámetros en solo lectura (un TRADER/ADMIN puede editarlos)
              </p>
            )}
            <div
              className={`grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3 ${readOnly ? "pointer-events-none opacity-60" : ""}`}
              aria-readonly={readOnly}
            >
              {/* —— detección —— */}
              <Field
                label="Volumen 24h mínimo"
                hint={`${(effective.minQuoteVolume / 1e6).toFixed(0)}M USDT`}
              >
                <Slider
                  value={[effective.minQuoteVolume / 1e6]}
                  min={1}
                  max={100}
                  step={1}
                  onValueChange={([v]) => set("minQuoteVolume", v * 1e6)}
                />
              </Field>
              <Field label="Expansión de volumen mín." hint={`${effective.volumeDiffMin.toFixed(2)}%`}>
                <Slider
                  value={[effective.volumeDiffMin]}
                  min={0}
                  max={2}
                  step={0.05}
                  onValueChange={([v]) => set("volumeDiffMin", v)}
                />
              </Field>
              <Field label="Movimiento de precio mín." hint={`${effective.percentProfit.toFixed(2)}%`}>
                <Slider
                  value={[effective.percentProfit]}
                  min={0}
                  max={3}
                  step={0.1}
                  onValueChange={([v]) => set("percentProfit", v)}
                />
              </Field>
              <Field label="Techo de cambio 24h" hint={`${effective.priceChangeTop}%`}>
                <Slider
                  value={[effective.priceChangeTop]}
                  min={1}
                  max={100}
                  step={1}
                  onValueChange={([v]) => set("priceChangeTop", v)}
                />
              </Field>
              <Field label="Piso de cambio 24h" hint={`${effective.priceChangeBottom}%`}>
                <Slider
                  value={[effective.priceChangeBottom]}
                  min={-50}
                  max={0}
                  step={1}
                  onValueChange={([v]) => set("priceChangeBottom", v)}
                />
              </Field>
              <Field label="Solo símbolos con futuro USDⓈ-M" hint={effective.futuresOnly ? "on" : "off"}>
                <div className="flex h-9 items-center">
                  <Switch
                    checked={effective.futuresOnly}
                    onCheckedChange={(v) => set("futuresOnly", v)}
                    aria-label="Solo símbolos con futuro"
                  />
                </div>
              </Field>
              <Field label="Ocurrencias (pases consecutivos)" hint={`${effective.occurrences}`}>
                <Slider
                  value={[effective.occurrences]}
                  min={1}
                  max={10}
                  step={1}
                  onValueChange={([v]) => set("occurrences", v)}
                />
              </Field>
              <Field label="Confirmaciones" hint={`${effective.confirmations}`}>
                <Slider
                  value={[effective.confirmations]}
                  min={1}
                  max={5}
                  step={1}
                  onValueChange={([v]) => set("confirmations", v)}
                />
              </Field>
              <Field label="Cooldown por símbolo" hint={`${effective.cooldownSec}s`}>
                <Slider
                  value={[effective.cooldownSec]}
                  min={30}
                  max={600}
                  step={30}
                  onValueChange={([v]) => set("cooldownSec", v)}
                />
              </Field>

              {/* —— paper trader —— */}
              <div className="md:col-span-2 xl:col-span-3">
                <div className="mb-3 flex items-center gap-2 border-t border-zinc-800/70 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <Zap className="h-3.5 w-3.5 text-amber-400" aria-hidden />
                  Paper trader & trailing stop — automatización
                </div>
              </div>
              <Field label="Auto-trade al disparar señal" hint={effective.autoTrade ? "ON" : "OFF"}>
                <div className="flex h-9 items-center">
                  <Switch
                    checked={effective.autoTrade}
                    onCheckedChange={(v) => set("autoTrade", v)}
                    aria-label="Auto trade"
                  />
                </div>
              </Field>
              <Field label="Tamaño por operación" hint="USDT">
                <Input
                  type="number"
                  min={10}
                  max={effective.capital}
                  value={effective.tradeSizeUsd}
                  onChange={(e) => set("tradeSizeUsd", Number(e.target.value))}
                  className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-200"
                />
              </Field>
              <Field label="Capital de la cuenta" hint="USDT">
                <Input
                  type="number"
                  min={100}
                  max={100000}
                  step={100}
                  value={effective.capital}
                  onChange={(e) => set("capital", Number(e.target.value))}
                  className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-200"
                />
              </Field>
              <Field label="Take profit" hint={`${effective.takeProfitPct.toFixed(1)}%`}>
                <Slider
                  value={[effective.takeProfitPct]}
                  min={0.5}
                  max={25}
                  step={0.5}
                  onValueChange={([v]) => set("takeProfitPct", v)}
                />
              </Field>
              <Field label="Stop loss" hint={`${effective.stopLossPct.toFixed(1)}%`}>
                <Slider
                  value={[effective.stopLossPct]}
                  min={0.5}
                  max={25}
                  step={0.5}
                  onValueChange={([v]) => set("stopLossPct", v)}
                />
              </Field>
              <Field
                label="Trailing: activación (ganancia real)"
                hint={`+${effective.trailingActivationPct.toFixed(2)}% desde entrada`}
              >
                <Slider
                  value={[effective.trailingActivationPct]}
                  min={0}
                  max={10}
                  step={0.25}
                  onValueChange={([v]) => set("trailingActivationPct", v)}
                />
              </Field>
              <Field
                label="Trailing: distancia del stop"
                hint={`${effective.trailingDistancePct.toFixed(2)}% bajo el pico`}
              >
                <Slider
                  value={[effective.trailingDistancePct]}
                  min={0.25}
                  max={5}
                  step={0.25}
                  onValueChange={([v]) => set("trailingDistancePct", v)}
                />
              </Field>
              <Field label="Posiciones simultáneas máx." hint={`${effective.maxOpenPositions}`}>
                <Slider
                  value={[effective.maxOpenPositions]}
                  min={1}
                  max={10}
                  step={1}
                  onValueChange={([v]) => set("maxOpenPositions", v)}
                />
              </Field>
              <Field label="Comisión taker por lado" hint={`${effective.feePct.toFixed(2)}%`}>
                <Slider
                  value={[effective.feePct]}
                  min={0}
                  max={0.5}
                  step={0.01}
                  onValueChange={([v]) => set("feePct", v)}
                />
              </Field>

              {/* —— historia para patrones —— */}
              <div className="md:col-span-2 xl:col-span-3">
                <div className="mb-3 flex items-center gap-2 border-t border-zinc-800/70 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <History className="h-3.5 w-3.5 text-violet-400" aria-hidden />
                  Historia para detección de patrones
                </div>
              </div>
              <Field
                label="Snapshot de estadísticas cada"
                hint={`${effective.snapshotIntervalMin} min`}
              >
                <Slider
                  value={[effective.snapshotIntervalMin]}
                  min={1}
                  max={10}
                  step={1}
                  onValueChange={([v]) => set("snapshotIntervalMin", v)}
                />
              </Field>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-9 bg-emerald-600 font-mono text-xs text-white hover:bg-emerald-500"
                disabled={!dirty || busy || readOnly}
                onClick={() => {
                  if (draft) void control({ action: "setConfig", config: draft });
                }}
              >
                Aplicar al motor
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 border-zinc-700 font-mono text-xs text-zinc-300 hover:bg-zinc-800"
                disabled={!dirty && !profileDrift}
                onClick={() => setDraft(null)}
              >
                Descartar cambios
              </Button>
              <p className="ml-auto hidden font-mono text-[10px] text-zinc-600 md:block">
                perfil en vivo: {live.profile}
                {dirty && " → CUSTOM al aplicar"}
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
