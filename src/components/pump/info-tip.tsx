"use client";

import { HelpCircle, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * InfoTip — tooltip educativo reutilizable.
 *
 * Enseña qué significa cada columna, botón y dato del dashboard: título
 * corto + explicación + (opcional) la fórmula exacta en mono. Diseñado para
 * onboarding sin fricción: hover = aprender.
 *
 * Variantes:
 *  - "icon"  → iconito de ayuda junto a un label (título, cabeceras)
 *  - "wrap"  → envuelve cualquier elemento (badges, stats, botones)
 *  - "dot"   → puntito discreto para esquinas
 */

export interface InfoTipProps {
  /** término corto, ej: "SCORE" */
  term: string;
  /** explicación en una o dos frases */
  hint: string;
  /** fórmula o detalle técnico en mono (opcional) */
  formula?: string;
  variant?: "icon" | "wrap" | "dot";
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  children?: React.ReactNode;
}

export function InfoTip({
  term,
  hint,
  formula,
  variant = "icon",
  side = "top",
  className,
  children,
}: InfoTipProps) {
  const content = (
    <TooltipContent
      side={side}
      sideOffset={6}
      className="max-w-[260px] border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-left shadow-xl"
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">
        {term}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-zinc-300">{hint}</p>
      {formula && (
        <p className="mt-1.5 rounded border border-zinc-700/60 bg-zinc-950 px-1.5 py-1 font-mono text-[9px] leading-snug text-zinc-400">
          {formula}
        </p>
      )}
    </TooltipContent>
  );

  if (variant === "wrap") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex", className)}>{children}</span>
        </TooltipTrigger>
        {content}
      </Tooltip>
    );
  }

  if (variant === "dot") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 cursor-help rounded-full bg-zinc-600 hover:bg-emerald-400",
              className
            )}
            aria-label={`¿Qué es ${term}?`}
          />
        </TooltipTrigger>
        {content}
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center text-zinc-500 transition-colors hover:text-emerald-400",
            className
          )}
          aria-label={`¿Qué es ${term}? ayuda`}
          tabIndex={-1}
        >
          <HelpCircle className="h-3 w-3" aria-hidden />
        </button>
      </TooltipTrigger>
      {content}
    </Tooltip>
  );
}

/** icono info inline para botones (ligero, sin borde) */
export function InfoGlyph({ className }: { className?: string }) {
  return (
    <Info className={cn("h-3 w-3 shrink-0 opacity-50", className)} aria-hidden />
  );
}
