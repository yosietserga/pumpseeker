"use client";

import { App } from "@/components/pump/auth-gate";

/**
 * PumpSeeker — remake 2025 de la trilogía de Yosietserga.
 * Misma mecánica de detección (addChange → criterios → ocurrencias → señal →
 * paper trading + live opt-in), stack moderno: TS + socket.io + Prisma + Next.js.
 * Única ruta visible: / — el AuthGate decide entre login y dashboard.
 */
export default function Home() {
  return <App />;
}
