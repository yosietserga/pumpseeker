"use client";

import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import type {
  ClosedTrade,
  ControlAction,
  EngineState,
  Position,
  PumpSignal,
} from "./types";

/**
 * Store del dashboard — estado vivo del motor vía socket.io
 * (canal /?XTransformPort=3003 a través del gateway) + acciones REST vía /api/engine.
 */

interface PumpStore {
  state: EngineState | null;
  socketConnected: boolean;
  busy: boolean;
  error: string | null;
  lastSignal: PumpSignal | null;
  lastClosedTrade: ClosedTrade | null;
  /* acciones */
  init: () => void;
  dispose: () => void;
  control: (action: ControlAction) => Promise<void>;
}

let socket: Socket | null = null;
let initialized = false;

export const usePumpStore = create<PumpStore>((set, get) => ({
  state: null,
  socketConnected: false,
  busy: false,
  error: null,
  lastSignal: null,
  lastClosedTrade: null,

  init: () => {
    if (initialized) return;
    initialized = true;

    // bootstrap REST (fallback si el socket tarda)
    fetch("/api/engine", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: EngineState | null) => {
        if (data && !get().state) set({ state: data });
      })
      .catch(() => undefined);

    // Conexión del socket.io del motor:
    // - Nube: NEXT_PUBLIC_ENGINE_WS_URL (ej. https://pumpseeker-engine.up.railway.app)
    //   + NEXT_PUBLIC_ENGINE_WS_PATH (default /engine)
    // - Sandbox/local (default): gateway Caddy → io("/?XTransformPort=3003")
    //   NUNCA escribir el puerto en la URL aquí: siempre XTransformPort.
    const wsUrl = process.env.NEXT_PUBLIC_ENGINE_WS_URL;
    const wsPath = process.env.NEXT_PUBLIC_ENGINE_WS_PATH ?? "/engine";
    socket = wsUrl
      ? io(wsUrl, {
          path: wsPath,
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          timeout: 10000,
        })
      : io("/?XTransformPort=3003", {
          transports: ["websocket", "polling"],
          forceNew: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          timeout: 10000,
        });

    socket.on("connect", () => set({ socketConnected: true, error: null }));
    socket.on("disconnect", () => set({ socketConnected: false }));

    socket.on("state", (s: EngineState) => set({ state: s }));
    socket.on("status", (s: EngineState) => set({ state: s }));

    socket.on("signal", ({ signal, position }: { signal: PumpSignal; position: Position | null }) => {
      set((prev) => {
        if (!prev.state) return prev;
        const signals = [signal, ...prev.state.signals.filter((x) => x.id !== signal.id)].slice(0, 60);
        const positions = position
          ? [position, ...prev.state.positions.filter((x) => x.id !== position.id)]
          : prev.state.positions;
        return {
          lastSignal: signal,
          state: { ...prev.state, signals, positions, lastSignalAt: signal.at },
        };
      });
    });

    socket.on("trade:closed", (trade: ClosedTrade) => {
      set((prev) => {
        if (!prev.state) return { lastClosedTrade: trade };
        const positions = prev.state.positions.filter((x) => x.id !== trade.id);
        const trades = [trade, ...prev.state.trades.filter((x) => x.id !== trade.id)].slice(0, 60);
        return {
          lastClosedTrade: trade,
          state: { ...prev.state, positions, trades },
        };
      });
    });
  },

  dispose: () => {
    socket?.disconnect();
    socket = null;
    initialized = false;
    set({ socketConnected: false });
  },

  control: async (action) => {
    set({ busy: true, error: null });
    try {
      const res = await fetch("/api/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // el estado llega por socket en <2s; refrescamos por REST para acelerar
      const fresh = await fetch("/api/engine", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (fresh) set({ state: fresh });
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ busy: false });
    }
  },
}));
