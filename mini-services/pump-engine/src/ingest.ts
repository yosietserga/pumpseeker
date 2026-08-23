import type { ClosedTrade, Position, PumpSignal, SnapshotRow } from "./types";

/**
 * IngestClient — persistencia de señales, trades y snapshots de historia
 * en la app Next.js (Prisma). Fire & forget: si la app no está arriba,
 * el motor sigue vivo igual (el original tampoco persistía nada).
 *
 * INGEST_URL configurable para despliegues en la nube (Railway/Render):
 * apunta a la URL pública del servicio web (…/api/ingest).
 */
const NEXT_URL =
  process.env.INGEST_URL ?? "http://localhost:3000/api/ingest";

export class IngestClient {
  private queue: { type: string; data: unknown }[] = [];
  private flushing = false;

  signal(s: PumpSignal): void {
    this.enqueue({ type: "signal", data: s });
  }

  positionOpened(p: Position): void {
    this.enqueue({ type: "position", data: p });
  }

  trade(t: ClosedTrade): void {
    this.enqueue({ type: "trade", data: t });
  }

  /** Snapshot de historia de un par (estadísticas en un instante) */
  snapshot(row: SnapshotRow): void {
    this.enqueue({ type: "snapshot", data: row });
  }

  snapshots(rows: SnapshotRow[]): void {
    for (const r of rows) this.enqueue({ type: "snapshot", data: r });
  }

  private enqueue(item: { type: string; data: unknown }): void {
    this.queue.push(item);
    if (this.queue.length > 500) this.queue.shift();
    this.flush();
  }

  private flush(): void {
    if (this.flushing) return;
    this.flushing = true;
    setTimeout(async () => {
      const batch = this.queue.splice(0, this.queue.length);
      try {
        await fetch(NEXT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: batch }),
        });
      } catch {
        /* la app aún no está lista — no es fatal */
      } finally {
        this.flushing = false;
        if (this.queue.length) this.flush();
      }
    }, 300);
  }
}
