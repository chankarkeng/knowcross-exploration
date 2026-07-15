import { randomUUID } from "node:crypto";
import { join } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import swaggerUi from "swagger-ui-express";

import { config } from "./config";
import { readMasterConfig } from "./configStore";
import { flushCall, logEvent } from "./logger";
import { automationRouter } from "./routes/automation";
import { complainRouter } from "./routes/complain";
import { glitchRouter } from "./routes/glitch";
import { guestRouter } from "./routes/guest";
import { masterRouter } from "./routes/master";
import { openapiDocument } from "./swagger/openapi";

const app = express();
app.use(express.json({ limit: "15mb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId = randomUUID();
  res.locals.correlationId = correlationId;
  res.setHeader("X-Correlation-Id", correlationId);
  const capturedPath = req.path;
  const capturedMethod = req.method;
  const persist = capturedPath.startsWith("/api/");

  logEvent({
    correlationId,
    direction: "inbound-request",
    method: req.method,
    path: req.originalUrl,
    body: req.body,
  });

  let responseLogged = false;
  const logResponse = (body: unknown) => {
    if (responseLogged) return;
    responseLogged = true;
    logEvent({
      correlationId,
      direction: "inbound-response",
      status: res.statusCode,
      body: Buffer.isBuffer(body) ? `<binary ${body.length} bytes>` : body,
    });
  };

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    logResponse(body);
    return originalJson(body);
  };
  const originalSend = res.send.bind(res);
  res.send = (body: unknown) => {
    logResponse(body);
    return originalSend(body);
  };

  if (persist) {
    res.on("finish", () => {
      flushCall(correlationId, { method: capturedMethod, path: capturedPath });
    });
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", baseUrl: config.BASE_URL, propertyId: config.PROPERTY_ID });
});

app.use("/api", masterRouter);
app.use("/api", complainRouter);
app.use("/api", guestRouter);
app.use("/api", automationRouter);
app.use("/api", glitchRouter);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiDocument, { explorer: true }));
app.get("/openapi.json", (_req, res) => res.json(openapiDocument));

app.get("/config.json", async (_req, res) => {
  const raw = await readMasterConfig();
  if (!raw) {
    res.status(404).json({ error: "config.json not yet generated — call GET /api/master first" });
    return;
  }
  res.type("application/json").send(raw);
});

app.get("/config", (_req, res) => {
  res.sendFile(join(process.cwd(), "public", "config.html"));
});

app.get("/service-requests", (_req, res) => {
  res.sendFile(join(process.cwd(), "public", "service-requests.html"));
});

app.get("/", (_req, res) => res.redirect("/config"));

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logEvent({
    correlationId: res.locals.correlationId,
    direction: "upstream-error",
    error: err.message,
    path: req.originalUrl,
  });
  res.status(502).json({ error: "Upstream call failed", message: err.message });
});

app.listen(config.PORT, () => {
  logEvent({
    direction: "startup",
    port: config.PORT,
    baseUrl: config.BASE_URL,
    docs: `http://localhost:${config.PORT}/docs`,
  });
});
