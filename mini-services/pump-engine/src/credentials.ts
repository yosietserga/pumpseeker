import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import type { ExchangeCredentials, ExchangeId } from "./exchanges";

/**
 * credentials.ts — almacén cifrado de credenciales por exchange.
 *
 * "Prefill de credenciales para acceso rápido": las keys se guardan CIFRADAS
 * en disco (AES-256-GCM) y se recargan al arrancar el motor, listas para usar
 * sin reingresarlas. El modo live sigue requiriendo reactivación manual tras
 * cada reinicio (feature de seguridad que se mantiene).
 *
 * Clave maestra: env SECRETS_KEY (hex 64) o auto-generada en .credentials.key
 * (mismo directorio que credentials.json). Quien tenga acceso al disco + la
 * clave puede descifrar; roba SECRETS_KEY entre entornos con cuidado.
 */

const CREDENTIALS_FILE = fileURLToPath(
  new URL("../credentials.json", import.meta.url)
);
const MASTER_KEY_FILE = fileURLToPath(
  new URL("../.credentials.key", import.meta.url)
);

function getMasterKey(): Buffer {
  const fromEnv = process.env.SECRETS_KEY;
  if (fromEnv && /^[0-9a-fA-F]{64}$/.test(fromEnv)) {
    return Buffer.from(fromEnv, "hex");
  }
  try {
    if (existsSync(MASTER_KEY_FILE)) {
      const k = readFileSync(MASTER_KEY_FILE, "utf-8").trim();
      if (/^[0-9a-fA-F]{64}$/.test(k)) return Buffer.from(k, "hex");
    }
    const key = randomBytes(32).toString("hex");
    writeFileSync(MASTER_KEY_FILE, key + "\n", { mode: 0o600 });
    return Buffer.from(key, "hex");
  } catch {
    // disco no disponible → clave efímera (las credenciales no persisten)
    return randomBytes(32);
  }
}

function encrypt(plain: string): string {
  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decrypt(blob: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = blob.split(":");
    const key = getMasterKey();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]);
    return dec.toString("utf-8");
  } catch {
    return null;
  }
}

const PREFS_FILE = fileURLToPath(new URL("../prefs.json", import.meta.url));

/** Preferencias no sensibles del motor (exchange seleccionado, etc.) */
export function loadPrefs(): { liveExchange?: string } {
  try {
    if (!existsSync(PREFS_FILE)) return {};
    return JSON.parse(readFileSync(PREFS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function savePrefs(prefs: Record<string, unknown>): void {
  try {
    writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
  } catch {
    /* best effort */
  }
}

/** Carga las credenciales cifradas del disco (prefill al arrancar) */
export function loadCredentials(): Map<ExchangeId, ExchangeCredentials> {
  const out = new Map<ExchangeId, ExchangeCredentials>();
  try {
    if (!existsSync(CREDENTIALS_FILE)) return out;
    const raw = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf-8")) as Record<
      string,
      string
    >;
    for (const [exchange, blob] of Object.entries(raw)) {
      const json = decrypt(blob);
      if (!json) continue;
      const creds = JSON.parse(json) as ExchangeCredentials;
      if (creds?.apiKey && creds?.apiSecret) {
        out.set(exchange as ExchangeId, creds);
      }
    }
    if (out.size > 0) {
      console.log(
        `[credentials] ${out.size} exchange(s) con credenciales prefilled (${[...out.keys()].join(", ")})`
      );
    }
  } catch {
    /* archivo corrupto → empezar limpio */
  }
  return out;
}

/** Persiste el mapa completo cifrado */
export function saveCredentials(creds: Map<ExchangeId, ExchangeCredentials>): void {
  try {
    const raw: Record<string, string> = {};
    for (const [exchange, c] of creds) {
      raw[exchange] = encrypt(JSON.stringify(c));
    }
    writeFileSync(CREDENTIALS_FILE, JSON.stringify(raw, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error("[credentials] no se pudo persistir:", String(err));
  }
}
