# PumpSeeker 🚀

**Bot de trading de pump-momentum (paper trading)** — remake moderno del motor de
[Yosietserga](https://github.com/yosietserga) (*Crypto-Trends-Seeker* 2024 ·
*Bitcoin_Sismografo* 2022 · *crypto-trader-assistant* 2021), con la misma mecánica
de detección — `addChange` → cadena de criterios → ocurrencias/confirmaciones →
señal — automatizada con trailing stop, y un laboratorio de patrones con historia.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/github/yosietserga/pumpseeker)
[![Deploy to Render](https://render.com/images/deploy-button.svg)](https://render.com/deploy?repo=https://github.com/yosietserga/pumpseeker)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yosietserga/pumpseeker&env=ENGINE_URL,NEXT_PUBLIC_ENGINE_WS_URL&envDescription=URLs%20del%20motor%20para%20conectar%20el%20dashboard)

> ⚠️ **Paper trading** — dinero simulado, sin órdenes reales. Datos públicos de
> Binance. Esto no es asesoría financiera.

---

## Características destacadas

- **Trading real opt-in** — paper es el default; activa TESTNET (sin riesgo) o LIVE
  con tus API keys de Binance (solo permiso de spot trade). Keys guardadas
  **únicamente en memoria del motor**; kill switch manual + límite de pérdida
  diaria con kill automático; el modo se fuerza a OFF tras cada reinicio.
- **Multi-usuario con roles** — ADMIN (todo) / TRADER (control del motor) /
  VIEWER (solo lectura). Primer usuario = ADMIN. Basado en NextAuth + bcrypt.
- **Alertas Telegram** — cada señal 🚀 y cada cierre (TP/SL/TRAIL con PnL)
  directo a tu chat (remake del node-notifier del original).
- Laboratorio de patrones, trailing stop real, watchlist persistente,
  radar de momentum en vivo — ver README de features anterior.

## Cómo funciona

```
                    ┌────────────────────────────────────────────────┐
                    │            pump-engine (Bun + TS)              │
 Binance WS         │                                                │
 !miniTicker@arr ──▶│ ChangeTracker (addChange remake)               │
 (todo el mercado)  │   → percentDiff · percentDiffProgressive       │
                    │   → volumeDiff  · volumeDiffProgressive        │
                    │ CriteriaChain (7 criterios del doorman)        │
                    │ PumpDetector (ocurrencias+confirmaciones+moda) │
                    │ PaperTrader (TP +10% / SL −10% / TRAILING)     │
                    │   └─ arma con +2% REAL desde entrada,          │
                    │      persigue al pico con 1% de distancia      │
                    └──────┬─────────────────────────┬───────────────┘
                     socket.io (en vivo)         REST /state /control
                           │                            │
                           ▼                            ▼
                    ┌────────────────────────────────────────────────┐
                    │        pumpseeker-web (Next.js 16)             │
                    │  Dashboard en vivo · radar de momentum         │
                    │  Prisma/SQLite: señales · trades · snapshots   │
                    │  Laboratorio de patrones (historia vs presente)│
                    │  /api/engine (proxy) · /api/ingest · /api/…    │
                    └────────────────────────────────────────────────┘
```

**Mecánica de detección (fiel al original):**

1. **DETECTAR** — cada tick del mercado actualiza 4 snapshots por par
   (`first/prev/current`) y calcula el fingerprint del pump: drift de precio,
   momentum tick a tick y expansión de volumen 24h (el combustible).
2. **FILTRAR** — la cadena de 7 criterios del doorman: volumen mínimo,
   expansión de volumen, movimiento de precio, techo/piso 24h, símbolo con
   futuro USDⓈ-M, watchlist opcional. Luego el gate anti-flicker: N ocurrencias
   + M confirmaciones + cooldown.
3. **MONTAR** — LONG automático a mercado con TP/SL amplios y **trailing stop**
   que se arma con +2% de ganancia REAL desde la entrada (no el % 24h) y sigue
   al pico con 1% de distancia. Todo parametrizable en vivo.
4. **RECORDAR** — snapshots de estadísticas cada 3 min → el laboratorio de
   patrones responde: *"cuando este par repitió estas condiciones, ¿qué pasó en
   los siguientes 10–120 min?"*

## Despliegue

### Railway (recomendado — pila completa)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/github/yosietserga/pumpseeker)

1. Crea un proyecto y agrega **dos servicios** desde el repo:
   - **Web**: root directory `.` (usa `railway.json` — build con prisma + next)
   - **Motor**: root directory `mini-services/pump-engine` (usa su `railway.json`)
2. Variables del **web**: `ENGINE_URL` y `NEXT_PUBLIC_ENGINE_WS_URL` =
   `https://<url-pública-del-motor>` (Railway genera dominios en Settings →
   Networking → Generate Domain en cada servicio).
3. Variables del **motor**: `SOCKET_PATH=/engine` e `INGEST_URL=https://<url-pública-del-web>/api/ingest`.
4. (Opcional, persistencia) Monta un volumen en el web y define
   `DATABASE_URL=file:/data/custom.db`.

### Render (blueprint one-click)

[![Deploy to Render](https://render.com/images/deploy-button.svg)](https://render.com/deploy?repo=https://github.com/yosietserga/pumpseeker)

El `render.yaml` crea los dos servicios (web + motor). Tras el primer deploy:

1. En `pumpseeker-web`, define `ENGINE_URL` y `NEXT_PUBLIC_ENGINE_WS_URL` con la
   URL pública de `pumpseeker-engine`.
2. En `pumpseeker-engine`, define `INGEST_URL=https://pumpseeker-web.onrender.com/api/ingest`.
3. (Free plan) Los servicios se duermen tras inactividad — el dashboard se
   reconecta solo. Para SQLite persistente: plan starter + disco (ver `render.yaml`).

### Vercel (solo dashboard — motor remoto)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yosietserga/pumpseeker&env=ENGINE_URL,NEXT_PUBLIC_ENGINE_WS_URL&envDescription=URLs%20del%20motor%20para%20conectar%20el%20dashboard)

Vercel es serverless: el motor (WebSocket persistente a Binance) **no puede**
vivir ahí. Despliega la pila completa en Railway/Render y luego este botón con:

- `ENGINE_URL` = `https://<url-del-motor>` (proxy REST del dashboard)
- `NEXT_PUBLIC_ENGINE_WS_URL` = `https://<url-del-motor>` (socket.io directo)

Sin motor configurado, el dashboard queda en modo "esperando motor".

## Desarrollo local

```bash
# 1. Dashboard (Next.js, puerto 3000)
bun install
bun run db:push
bun run dev

# 2. Motor (Bun, socket.io :3003 + REST :3004)
bun run engine:dev
```

Abre http://localhost:3000 — el primer usuario que se registra se convierte en
ADMIN. El motor arranca solo, se conecta a Binance y comienza a detectar. El
`watchlist.json` del motor persiste tus pares favoritos.

### Trading real (opt-in)

1. Como ADMIN: guarda tus API keys de Binance (solo permiso **spot trade**,
   sin retiros) en la tarjeta "Trading real".
2. Prueba con **TESTNET** (keys de testnet.binance.vision) — flujo completo sin riesgo.
3. Ajusta el cap por orden (`liveMaxSizeUsd`) y el límite de pérdida diaria
   (`dailyLossLimitUsd` — 0 lo desactiva).
4. Activa **LIVE** cuando confíes. El botón **KILL SWITCH** vende todo a mercado
   y desactiva el modo en cualquier momento.

## Variables de entorno

| Variable | Servicio | Default | Descripción |
|---|---|---|---|
| `DATABASE_URL` | web | `file:../db/custom.db` | SQLite (usa volumen/disco para persistencia) |
| `ENGINE_URL` | web | `http://127.0.0.1:3004` | REST del motor (proxy `/api/engine`) |
| `NEXT_PUBLIC_ENGINE_WS_URL` | web | *(vacío = local)* | URL pública del socket.io del motor |
| `NEXT_PUBLIC_ENGINE_WS_PATH` | web | `/engine` | Path del socket (modo nube) |
| `INGEST_URL` | motor | `http://localhost:3000/api/ingest` | Endpoint de persistencia del web |
| `NEXTAUTH_SECRET` | web | *(generar)* | Secreto de sesión (obligatorio en producción) |
| `NEXTAUTH_URL` | web | `http://localhost:3000` | URL pública del web |
| `SOCKET_PATH` | motor | *(vacío = local)* | `/engine` = modo nube single-port |
| `PORT` / `SOCKET_PORT` | motor | `3003` | Puerto del socket.io |
| `REST_PORT` | motor | `3004` | Puerto REST (solo modo local) |

## Créditos

Remake funcional (2025) de la trilogía de bots de **Yosiet Serga** — el motor
`addChange`, la cadena de criterios del doorman, los presets Scalping/Intraday/
Buy-The-Dip y el gate de ocurrencias/confirmaciones son un port fiel de su
arquitectura original, modernizado con TypeScript estricto, socket.io, Prisma y
Next.js 16.

- [Crypto-Trends-Seeker](https://github.com/yosietserga/Crypto-Trends-Seeker) (2024)
- [Bitcoin_Sismografo](https://github.com/yosietserga/Bitcoin_Sismografo) (2022)
- [crypto-trader-assistant](https://github.com/yosietserga/crypto-trader-assistant) (2021)

## Licencia

MIT — ver [LICENSE](LICENSE).
