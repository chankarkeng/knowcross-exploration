import { createHmac } from "node:crypto";

export interface SignatureHeaders {
  accessHeader: string;
  clientId: string;
  unixSeconds: string;
  signatureRawData: string;
}

// Mirrors C# HttpUtility.UrlEncode: lowercase percent-encoded bytes,
// spaces as '+', and the unreserved set {A-Z a-z 0-9 - _ . ! * ( )}.
function urlEncodeCSharp(input: string): string {
  const safe = /^[A-Za-z0-9\-_.!*()]$/;
  let out = "";
  for (const ch of input) {
    if (ch === " ") {
      out += "+";
      continue;
    }
    if (safe.test(ch)) {
      out += ch;
      continue;
    }
    const bytes = Buffer.from(ch, "utf8");
    for (const b of bytes) {
      out += "%" + b.toString(16).padStart(2, "0");
    }
  }
  return out;
}

export function buildSignatureHeaders(
  method: string,
  fullUrl: string,
  publicKey: string,
  privateKey: string,
  nowMs: number = Date.now(),
): SignatureHeaders {
  const unixSeconds = Math.floor(nowMs / 1000).toString();
  const encodedUri = urlEncodeCSharp(fullUrl.toLowerCase());
  const raw = publicKey + method + encodedUri + unixSeconds;
  const hmac = createHmac("sha256", Buffer.from(privateKey, "utf8"));
  hmac.update(Buffer.from(raw, "utf8"));
  const sig = hmac.digest("base64");
  return {
    accessHeader: `${publicKey}:${sig}:${unixSeconds}`,
    clientId: publicKey,
    unixSeconds,
    signatureRawData: raw,
  };
}
