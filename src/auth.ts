import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { config } from "./config";

export const TOKEN_PARAM = "token";
const COOKIE = "access";

// Hash both sides first so timingSafeEqual gets equal-length buffers and the
// comparison leaks neither the token nor its length.
function tokenMatches(supplied: string): boolean {
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(config.ACCESS_TOKEN).digest();
  return timingSafeEqual(a, b);
}

function cookieToken(header: string | undefined): string | undefined {
  return header
    ?.split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === COOKIE)?.[1];
}

/**
 * Fixed-token gate. The token may arrive as ?token=, an X-Access-Token header,
 * or the cookie we set once either has been accepted — the cookie is what makes
 * the pages' own fetch() calls and Swagger UI work without appending it everywhere.
 */
export function requireToken(req: Request, res: Response, next: NextFunction): void {
  if (!config.ACCESS_TOKEN) return next(); // unset = open, for local dev
  if (req.path === "/health") return next(); // Render pings this before the token exists

  const fromQuery = typeof req.query[TOKEN_PARAM] === "string" ? req.query[TOKEN_PARAM] : undefined;
  const fromHeader = req.get("X-Access-Token") ?? undefined;
  const supplied = fromQuery ?? fromHeader ?? cookieToken(req.headers.cookie);

  if (!supplied || !tokenMatches(supplied)) {
    res.status(401).json({ error: "Unauthorized", hint: `append ?${TOKEN_PARAM}=<token>` });
    return;
  }

  if (fromQuery) {
    res.cookie(COOKIE, fromQuery, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.secure, // needs `trust proxy` so Render's X-Forwarded-Proto counts
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    // Bounce the token out of the URL bar (and out of any Referer we send) once
    // it's in the cookie. Only for page loads — a redirect would break API calls.
    if (req.method === "GET" && req.accepts("html") && !req.path.startsWith("/api/")) {
      const url = new URL(req.originalUrl, "http://placeholder");
      url.searchParams.delete(TOKEN_PARAM);
      res.redirect(url.pathname + url.search);
      return;
    }
  }
  next();
}
