import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const LOG_DIR = join(process.cwd(), "logs");

let dirReady: Promise<void> | null = null;
function ensureDir(): Promise<void> {
  if (!dirReady) {
    dirReady = mkdir(LOG_DIR, { recursive: true }).then(() => undefined);
  }
  return dirReady;
}

/** Strip the access token out of a URL before it reaches stdout or logs/. */
export function redactToken(url: string): string {
  return url.replace(/([?&]token=)[^&]*/gi, "$1<redacted>");
}

export type LogDirection =
  | "inbound-request"
  | "inbound-response"
  | "upstream-request"
  | "upstream-response"
  | "upstream-error"
  | "startup";

export interface LogEvent {
  correlationId?: string;
  direction: LogDirection;
  [k: string]: unknown;
}

interface RecordedEvent extends LogEvent {
  ts: string;
}

const buffers = new Map<string, RecordedEvent[]>();

export function logEvent(event: LogEvent): void {
  const entry: RecordedEvent = { ts: new Date().toISOString(), ...event };
  process.stdout.write(JSON.stringify(entry, replacer) + "\n");
  if (event.correlationId) {
    const arr = buffers.get(event.correlationId) ?? [];
    arr.push(entry);
    buffers.set(event.correlationId, arr);
  }
}

export interface FlushOptions {
  method: string;
  path: string;
}

export function flushCall(correlationId: string, opts: FlushOptions): void {
  const events = buffers.get(correlationId);
  buffers.delete(correlationId);
  if (!events || events.length === 0) return;

  const inbound = events.find((e) => e.direction === "inbound-request");
  const upstream = events.find((e) => e.direction === "upstream-request");
  const upstreamResp = events.find(
    (e) => e.direction === "upstream-response" || e.direction === "upstream-error",
  );
  const outbound = events.find((e) => e.direction === "inbound-response");

  const record = {
    correlationId,
    timestamp: inbound?.ts ?? events[0].ts,
    method: opts.method,
    path: opts.path,
    inboundRequest: inbound
      ? { method: inbound.method, path: inbound.path, body: inbound.body }
      : null,
    upstreamRequest: upstream
      ? {
          method: upstream.method,
          url: upstream.url,
          headers: upstream.headers,
          body: upstream.body,
          signatureRawData: upstream.signatureRawData,
        }
      : null,
    upstreamResponse: upstreamResp
      ? { status: upstreamResp.status, body: upstreamResp.body, error: upstreamResp.error }
      : null,
    inboundResponse: outbound ? { status: outbound.status, body: outbound.body } : null,
    events,
  };

  const filename = `${safeTimestamp(record.timestamp)}-${opts.method.toUpperCase()}-${slug(opts.path)}.json`;
  const filepath = join(LOG_DIR, filename);
  void ensureDir()
    .then(() => writeFile(filepath, JSON.stringify(record, replacer, 2)))
    .catch(() => {
      /* best-effort */
    });
}

function safeTimestamp(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

function slug(path: string): string {
  const noQuery = path.split("?")[0];
  const cleaned = noQuery
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.slice(0, 80) || "root";
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Buffer) {
    return `<binary ${value.length} bytes>`;
  }
  return value;
}
