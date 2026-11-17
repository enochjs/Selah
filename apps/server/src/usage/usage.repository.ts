import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { createHmac, randomBytes } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";
import type { HymnCatalog } from "../domain/hymns";
import type { UsageBatch } from "../domain/usage";
import { usageDay, usageDays } from "../domain/usage";
import { atomicJson, missing, readJson } from "../infrastructure/json-file";

const aggregateColumns = `COUNT(DISTINCT device) AS devices,
  COUNT(DISTINCT CASE WHEN type = 'visit' THEN session END) AS sessions,
  SUM(type = 'view') AS views,
  COALESCE(SUM(CASE WHEN type = 'active' THEN seconds ELSE 0 END), 0) AS activeSeconds,
  COALESCE(SUM(CASE WHEN type = 'listen' AND kind = 'hymn' THEN seconds ELSE 0 END), 0) AS hymnSeconds,
  COALESCE(SUM(CASE WHEN type = 'listen' AND kind = 'scripture' THEN seconds ELSE 0 END), 0) AS scriptureSeconds`;
function totals(row: Record<string, SQLOutputValue> = {}) {
  return {
    devices: Number(row.devices ?? 0),
    sessions: Number(row.sessions ?? 0),
    views: Number(row.views ?? 0),
    activeSeconds: Number(row.activeSeconds ?? 0),
    hymnSeconds: Number(row.hymnSeconds ?? 0),
    scriptureSeconds: Number(row.scriptureSeconds ?? 0),
  };
}
@Injectable()
export class UsageRepository implements OnModuleInit, OnModuleDestroy {
  private database!: DatabaseSync;
  private salt!: string;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  constructor(
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
  ) {}
  async onModuleInit() {
    const folder = path.join(this.options.stateRoot, "usage");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    try {
      this.salt = await readJson<string>(path.join(folder, "salt.json"));
    } catch (error) {
      if (!missing(error)) throw error;
      this.salt = randomBytes(32).toString("hex");
      await atomicJson(path.join(folder, "salt.json"), this.salt);
    }
    const file = path.join(folder, "usage.sqlite");
    this.database = new DatabaseSync(file);
    await chmod(file, 0o600);
    this.database.exec(`PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA secure_delete = ON;
      CREATE TABLE IF NOT EXISTS events (
        device TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL,
        day TEXT NOT NULL, session TEXT NOT NULL, type TEXT NOT NULL,
        page TEXT NOT NULL, seconds INTEGER NOT NULL,
        kind TEXT, contentId TEXT, platform TEXT NOT NULL, version TEXT NOT NULL,
        PRIMARY KEY (device, id)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS events_day ON events(day);`);
    this.prune();
    this.cleanupTimer = setInterval(() => this.prune(), 3600000);
    this.cleanupTimer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
    this.database?.close();
  }
  private prune() {
    this.database
      .prepare("DELETE FROM events WHERE day < ?")
      .run(usageDays(90)[0]);
  }
  async hymnTitles() {
    try {
      const catalog = await readJson<HymnCatalog>(
        path.join(this.options.contentRoot, "hymns.json"),
      );
      return new Map(catalog.items.map((item) => [item.id, item.titleZh]));
    } catch (error) {
      if (!missing(error)) throw error;
      return new Map<string, string>();
    }
  }
  append(batch: UsageBatch) {
    const hash = (value: string) =>
      createHmac("sha256", this.salt).update(value).digest("hex");
    const device = hash(batch.deviceId.toLowerCase());
    const insert = this.database.prepare(`INSERT INTO events
      (device, id, at, day, session, type, page, seconds, kind, contentId, platform, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(device, id) DO NOTHING`);
    let accepted = 0;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const event of batch.events) {
        const result = insert.run(
          device,
          event.id,
          event.at,
          usageDay(event.at),
          hash(`${device}:${event.sessionId}`),
          event.type,
          event.page,
          event.seconds,
          event.kind ?? null,
          event.contentId ?? null,
          batch.platform,
          batch.version,
        );
        accepted += Number(result.changes);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return { accepted };
  }
  dashboard(dates: string[]) {
    const args = [dates[0], dates[dates.length - 1]];
    const range = "day >= ? AND day <= ?";
    const summary = this.database
      .prepare(
        `SELECT ${aggregateColumns}, MIN(at) AS firstAt FROM events WHERE ${range}`,
      )
      .get(...args)!;
    const daily = new Map(
      this.database
        .prepare(
          `SELECT day, ${aggregateColumns} FROM events WHERE ${range} GROUP BY day`,
        )
        .all(...args)
        .map((row) => [String(row.day), totals(row)]),
    );
    return {
      firstEventAt:
        summary.firstAt === null
          ? null
          : new Date(Number(summary.firstAt)).toISOString(),
      totals: totals(summary),
      daily: dates.map((day) => ({ day, ...(daily.get(day) ?? totals()) })),
      pages: this.database
        .prepare(
          `SELECT page, SUM(type = 'view') AS views, COUNT(DISTINCT device) AS devices FROM events WHERE ${range} GROUP BY page ORDER BY views DESC`,
        )
        .all(...args)
        .map((row) => ({
          page: String(row.page),
          views: Number(row.views),
          devices: Number(row.devices),
        })),
      platforms: ["android", "ios", "web"].map((platform) => ({
        platform,
        devices: Number(
          this.database
            .prepare(
              `SELECT COUNT(DISTINCT device) AS devices FROM events WHERE ${range} AND platform = ?`,
            )
            .get(...args, platform)!.devices,
        ),
      })),
      versions: this.database
        .prepare(
          `SELECT platform || ' ' || version AS version, COUNT(DISTINCT device) AS devices FROM events WHERE ${range} GROUP BY platform, version ORDER BY devices DESC LIMIT 20`,
        )
        .all(...args)
        .map((row) => ({
          version: String(row.version),
          devices: Number(row.devices),
        })),
      content: this.database
        .prepare(
          `SELECT kind, contentId, SUM(seconds) AS seconds, COUNT(DISTINCT device) AS devices FROM events WHERE ${range} AND type = 'listen' GROUP BY kind, contentId ORDER BY seconds DESC LIMIT 20`,
        )
        .all(...args)
        .map((row) => ({
          kind: String(row.kind),
          contentId: String(row.contentId),
          seconds: Number(row.seconds),
          devices: Number(row.devices),
        })),
    };
  }
}
