import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { Server } from "socket.io";
import { Engine } from "./src/engine";
import type { EngineConfig, EngineState } from "./src/types";

/**
 * PumpSeeker engine service.
 *
 * Remake moderno de la trilogía de Yosietserga:
 *   crypto-trader-assistant (2021) → Bitcoin_Sismografo (2022) → Crypto-Trends-Seeker (2024)
 *
 * Mismas mecánicas: addChange → criterios → ocurrencias/confirmaciones → señal →
 * paper trading con TP/SL/trailing. Nuevo: TypeScript estricto, socket.io, REST.
 *
 * Dos modos de puerto:
 *
 * 1) Local / sandbox (por defecto):
 *      - 3003: socket.io con path "/" (requerido por el gateway Caddy del sandbox)
 *      - 3004: REST interno (lo consume el proxy /api/engine de Next.js)
 *
 * 2) Nube (Railway / Render / Docker) — definir SOCKET_PATH (ej. "/engine"):
 *      - un solo servidor HTTP en $PORT (o SOCKET_PORT): socket.io en SOCKET_PATH
 *        y REST (/health /state /control) en el mismo puerto público.
 *
 * Variables: PORT | SOCKET_PORT | REST_PORT | SOCKET_PATH | INGEST_URL
 */

const SOCKET_PATH = process.env.SOCKET_PATH ?? "";
const SOCKET_PORT = Number(process.env.PORT || process.env.SOCKET_PORT || 3003);
const REST_PORT = Number(process.env.REST_PORT || 3004);
const singlePortMode = SOCKET_PATH.length > 0 && SOCKET_PATH !== "/";

const engine = new Engine({
  onState: (state: EngineState) => io.emit("state", state),
  onSignal: (signal, position) => io.emit("signal", { signal, position }),
  onTradeClosed: (trade) => io.emit("trade:closed", trade),
  onStatus: () => io.emit("status", engine.buildState()),
});

/* ————————————————————————— REST handler ————————————————————————— */

function restHandler(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${SOCKET_PORT}`);
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method === "GET" && url.pathname === "/health") {
    const state = engine.buildState();
    return send(200, { ok: true, engine: engine.status, feed: state.feed });
  }
  if (req.method === "GET" && (url.pathname === "/state" || url.pathname === "/")) {
    return send(200, engine.buildState());
  }
  if (req.method === "POST" && url.pathname === "/control") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}") as {
          action?: string;
          config?: Partial<EngineConfig>;
          profile?: EngineConfig["profile"];
          symbol?: string;
          liveMode?: EngineConfig["liveMode"];
          apiKey?: string;
          apiSecret?: string;
          liveMaxSizeUsd?: number;
          dailyLossLimitUsd?: number;
          botToken?: string;
          chatId?: string;
          enabled?: boolean;
        };
        switch (payload.action) {
          case "start":
            void engine.start();
            return send(200, { ok: true, started: true });
          case "stop":
            engine.stop();
            return send(200, { ok: true, stopped: true });
          case "setConfig":
            if (payload.config) engine.setConfig(payload.config);
            return send(200, { ok: true, config: engine.config });
          case "setProfile":
            if (payload.profile) engine.setProfile(payload.profile);
            return send(200, { ok: true, config: engine.config });
          case "closePosition":
            if (!payload.symbol) return send(400, { ok: false, error: "symbol requerido" });
            return send(200, { ok: true, trade: engine.closePosition(payload.symbol) });
          case "closeAll":
            return send(200, { ok: true, trades: engine.closeAll() });
          case "watchlistAdd":
            if (!payload.symbol) return send(400, { ok: false, error: "symbol requerido" });
            if (!engine.addWatchlist(payload.symbol)) {
              return send(400, { ok: false, error: "símbolo inválido" });
            }
            return send(200, { ok: true, watchlist: engine.watchlist });
          case "watchlistRemove":
            if (!payload.symbol) return send(400, { ok: false, error: "symbol requerido" });
            engine.removeWatchlist(payload.symbol);
            return send(200, { ok: true, watchlist: engine.watchlist });
          case "setLiveConfig": {
            const r = engine.setLiveConfig({
              liveMode: payload.liveMode,
              liveMaxSizeUsd: payload.liveMaxSizeUsd,
              dailyLossLimitUsd: payload.dailyLossLimitUsd,
            });
            if (!r.ok) return send(400, { ok: false, error: r.error });
            return send(200, { ok: true, config: engine.config });
          }
          case "setLiveKeys": {
            const { apiKey, apiSecret } = payload as { apiKey?: string; apiSecret?: string };
            if (!apiKey || !apiSecret) {
              return send(400, { ok: false, error: "apiKey y apiSecret requeridos" });
            }
            engine.setLiveKeys(apiKey, apiSecret);
            return send(200, { ok: true, keysSet: true });
          }
          case "clearLiveKeys":
            engine.clearLiveKeys();
            return send(200, { ok: true, keysSet: false });
          case "testLiveKeys": {
            const mode = payload.liveMode === "LIVE" ? "LIVE" : "TESTNET";
            const r = await engine.testLiveKeys(mode);
            return send(r.ok ? 200 : 400, { ok: r.ok, detail: r.detail });
          }
          case "killSwitch":
            await engine.killSwitch("kill switch manual desde el dashboard");
            return send(200, { ok: true, killed: true });
          case "setTelegram": {
            const { botToken, chatId, enabled } = payload as {
              botToken?: string;
              chatId?: string;
              enabled?: boolean;
            };
            engine.setTelegram({ botToken, chatId, enabled });
            return send(200, { ok: true });
          }
          case "testTelegram": {
            const r = await engine.testTelegram();
            return send(r.ok ? 200 : 400, { ok: r.ok, detail: r.detail });
          }
          default:
            return send(400, { ok: false, error: "acción desconocida" });
        }
      } catch (err) {
        return send(400, { ok: false, error: String(err) });
      }
    });
    return;
  }
  send(404, { error: "not found" });
}

/* ————————————————————————— servers ————————————————————————— */

let io: Server;

if (singlePortMode) {
  // MODO NUBE: un servidor — socket.io en SOCKET_PATH + REST en el resto
  const server = createServer(restHandler);
  io = new Server(server, {
    path: SOCKET_PATH,
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
  });
  io.on("connection", (socket) => {
    socket.emit("state", engine.buildState());
    socket.on("error", (e) => console.error("[socket]", String(e)));
  });
  server.listen(SOCKET_PORT, () => {
    console.log(
      `[pump-engine] single-port ${SOCKET_PORT}: socket.io en ${SOCKET_PATH} + REST`
    );
    console.log("[pump-engine] arrancando motor (bootstrap Binance)…");
    void engine.start();
  });
} else {
  // MODO LOCAL/SANDBOX: socket.io en 3003 (path "/") y REST en 3004
  const socketServer = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });

  io = new Server(socketServer, {
    // NO cambiar el path "/": lo usa el gateway Caddy del sandbox para rutear
    path: "/",
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket) => {
    // snapshot inmediato al conectar
    socket.emit("state", engine.buildState());
    socket.on("error", (e) => console.error("[socket]", String(e)));
  });

  socketServer.listen(SOCKET_PORT, () => {
    console.log(`[pump-engine] socket.io escuchando en puerto ${SOCKET_PORT}`);
    console.log("[pump-engine] arrancando motor (bootstrap Binance)…");
    void engine.start();
  });

  const restServer = createServer(restHandler);
  restServer.listen(REST_PORT, "127.0.0.1", () => {
    console.log(`[pump-engine] REST interno escuchando en puerto ${REST_PORT}`);
  });
}

/* ————————————————————————— latidos ————————————————————————— */

// estado completo cada 5s (además del throttle event-driven de 2s)
setInterval(() => {
  if (engine.status === "RUNNING") engine.emitState(true);
}, 5000);

process.on("SIGTERM" as string, () => {
  console.log("[pump-engine] SIGTERM — cerrando");
  process.exit(0);
});
process.on("SIGINT" as string, () => {
  console.log("[pump-engine] SIGINT — cerrando");
  process.exit(0);
});
