import axios, { AxiosError, type ResponseType } from "axios";
import { config } from "../config";
import { logEvent } from "../logger";
import { buildSignatureHeaders } from "./signature";

export type QueryValue = string | number | boolean | undefined | null;

export interface CallOptions {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  responseType?: ResponseType;
  correlationId: string;
}

export interface CallResult {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

function buildUrl(base: string, path: string, query?: CallOptions["query"]): string {
  const normalizedBase = base.endsWith("/") ? base : base + "/";
  const url = new URL(path.replace(/^\/+/, ""), normalizedBase);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

export async function callUnifocus(opts: CallOptions): Promise<CallResult> {
  const fullUrl = buildUrl(config.BASE_URL, opts.path, opts.query);
  const sig = buildSignatureHeaders(
    opts.method,
    fullUrl,
    config.PUBLIC_KEY,
    config.PRIVATE_KEY,
  );
  const headers: Record<string, string> = {
    "X-Knowcross-Access": sig.accessHeader,
    "X-Knowcross-ClientID": sig.clientId,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  logEvent({
    correlationId: opts.correlationId,
    direction: "upstream-request",
    method: opts.method,
    url: fullUrl,
    headers,
    body: opts.body,
    signatureRawData: sig.signatureRawData,
  });

  try {
    const resp = await axios.request({
      method: opts.method,
      url: fullUrl,
      data: opts.body,
      headers,
      responseType: opts.responseType,
      validateStatus: () => true,
    });
    const loggedBody =
      opts.responseType === "arraybuffer" && Buffer.isBuffer(resp.data)
        ? `<binary ${resp.data.length} bytes>`
        : resp.data;
    logEvent({
      correlationId: opts.correlationId,
      direction: "upstream-response",
      status: resp.status,
      body: loggedBody,
    });
    return {
      status: resp.status,
      data: resp.data,
      headers: resp.headers as Record<string, string>,
    };
  } catch (err) {
    const axErr = err as AxiosError;
    logEvent({
      correlationId: opts.correlationId,
      direction: "upstream-error",
      error: axErr.message,
      code: axErr.code,
    });
    throw err;
  }
}
