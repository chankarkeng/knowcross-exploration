# Plan: Unifocus Integration API Wrapper Service

## Context

The repo currently contains only `CLAUDE.md`, the Unifocus API PDF spec, and an
`.env` with credentials. We need a minimal Express.js + TypeScript service that
acts as a thin proxy in front of the Unifocus Integration API. Internal services
(and a tester using Swagger UI) should be able to call clean, unsigned endpoints;
this service handles all signing, transport, and logging so callers never deal
with the HMAC scheme.

Goals (per `CLAUDE.md` and user clarification):
- Minimal logic — pure interface service, no business rules
- Per-call request/response logging for easy review
- Self-hosted Swagger UI for testing
- Express.js + TypeScript for easy future BE integration

Non-goals: auth between internal callers and this wrapper, retries, persistence,
rate limiting.

## Progress Checklist

### Project scaffold
- [x] `package.json` with deps + scripts (`dev`, `build`, `start`)
- [x] `tsconfig.json` (strict, target ES2022, outDir `dist/`)
- [x] `.gitignore` (`node_modules/`, `dist/`, `logs/`, `.env`)
- [x] `npm install` runs clean

### Core: signing + transport
- [x] `src/config.ts` — load and type-check `.env`
- [x] `src/unifocus/signature.ts` — `buildSignatureHeaders(method, fullUrl, publicKey, privateKey)`
- [x] `src/unifocus/client.ts` — axios instance + `call({ method, path, query, body, responseType })`

### Logging
- [x] `src/logger.ts` — JSON-line logger to stdout + `logs/requests-YYYY-MM-DD.log`
- [x] Inbound middleware logs request (method, path, body) with correlationId
- [x] Client logs upstream-request and upstream-response with same correlationId
- [x] Outbound middleware logs response (status, body) via `res.json`/`res.send` patch

### Routes (all paths use the upstream `/integrationapi/...` prefix)
- [x] `src/routes/master.ts` — `GET /api/master` → `/integrationapi/master/GetAllPropertyMaster` (injects `PropertyId` from env)
- [x] `src/routes/complain.ts` — `register`, `search`, `update`, `attachment`, `attachment/stream`
- [x] `src/routes/guest.ts` — `lookup` (note upstream is `GuestLookUp`), `baggage-tag`
- [x] `src/routes/automation.ts` — `event`
- [x] `src/routes/glitch.ts` — `search`

### Swagger
- [x] `src/swagger/openapi.ts` — OpenAPI 3.0 doc covering all routes
- [x] Mount `swagger-ui-express` at `/docs` in `src/index.ts`; raw JSON at `/openapi.json`

### Bootstrap
- [x] `src/index.ts` — express app, json middleware, route mounts, swagger, listen

### Verification (manual)
- [x] `npm run dev` boots on port 3000
- [x] `http://localhost:3000/docs` shows all endpoints (200)
- [x] `GET /api/master` returns Unifocus master data (200); log file shows inbound → upstream → response chain with one correlationId
- [x] `POST /api/complain/search` with `{ "Properties": [3038], "StatusCode": "OPN", "PageSize": 3 }` returned `TotalRecords: 319`, 3 results

### Signing notes (learned during smoke test)
- Private key is HMAC-keyed as UTF-8 string bytes (NOT as `Guid.ToByteArray()` little-endian bytes, despite what the C# sample in the PDF appendix suggests).
- Public key is sent in its original case from `.env` (no lowercase normalization).
- URL is lowercased before C#-style URL encoding (lowercase `%xx`, spaces as `+`), then concatenated as `publicKey + method + encodedUri + unixSeconds`.

## Architecture

```
caller ──► Express route (clean schema)
              │
              ├─► log inbound
              ├─► UnifocusClient.call(method, path, body)
              │       └─► sign() → axios → upstream Unifocus API
              ├─► log outbound + upstream response
              └─► return upstream response body to caller
```

One client, one signer, thin per-domain route files that forward to it. No
DTO mapping unless the wire format genuinely needs it — pass payloads through.

## File layout

```
package.json
tsconfig.json
.gitignore
src/
  index.ts                  # express bootstrap, mounts routes + swagger
  config.ts                 # dotenv load + typed env export
  logger.ts                 # single JSON-line logger (stdout + logs/requests.log)
  unifocus/
    signature.ts            # buildSignatureHeader(method, fullUrl, publicKey, privateKey)
    client.ts               # UnifocusClient: axios instance + request/response logging
  routes/
    master.ts               # GET  /api/master                 → /Master/GetAllPropertyMaster
    complain.ts             # POST /api/complain/register      → /Complain/RegisterCall
                            # POST /api/complain/search        → /Complain/SearchComplain
                            # POST /api/complain/update        → /Complain/UpdateComplain
                            # GET  /api/complain/attachment    → /Complain/GetAttachmentComplain
                            # GET  /api/complain/attachment/stream → /complain/GetComplainAttachmentStream
    guest.ts                # POST /api/guest/lookup           → /Guest/GuestLookup
                            # POST /api/guest/baggage-tag      → /Guest/UpdateBaggageTag
    automation.ts           # POST /api/automation/event       → /Automation/PublishEvent
    glitch.ts               # POST /api/glitch/search          → /integrationapi/glitch/Glitch_Search
  swagger/
    openapi.ts              # OpenAPI 3.0 document (object literal)
docs/                       # existing — left untouched
.env                        # existing
```

## Key implementation details

### Signature (`src/unifocus/signature.ts`)

Per PDF appendix:
1. `requestUri = encodeURIComponent(fullAbsoluteUrl.toLowerCase())`
2. `raw = publicKey + method + requestUri + unixSeconds`
3. `sig = base64(HMAC_SHA256(privateKey, raw))`  using Node's built-in `crypto.createHmac`
4. Header `X-Knowcross-Access: "{publicKey}:{sig}:{unixSeconds}"`
5. Also send `X-Knowcross-ClientID: {publicKey}` (shown in the C# sample)

Pure function, no I/O — easy to unit-check.

### Client (`src/unifocus/client.ts`)

Single `axios` instance with `baseURL = config.BASE_URL`. Expose
`call({ method, path, query?, body?, responseType? })`:
- Builds full URL (including query string) so signature matches what is sent
- Computes signature against the final URL
- Adds the two headers
- Logs `{ correlationId, direction: "upstream-request", method, url, body }`
- Awaits axios call
- Logs `{ correlationId, direction: "upstream-response", status, body }`
- Returns `{ status, data, headers }`

`responseType: "arraybuffer"` path is needed for the attachment-stream endpoint.

### Logger (`src/logger.ts`)

One JSON-line-per-event logger. Emits to both `process.stdout` and
`logs/requests-YYYY-MM-DD.log` (append). No external dep needed —
`fs.appendFile` is fine for a testing tool. Each route attaches a UUID
correlationId (use `crypto.randomUUID()`) to `res.locals` and passes it to the
client so inbound + upstream + outbound events share an ID.

Express middleware logs inbound request (method, path, body) on entry and
outbound response (status, body) on `res.on("finish")`.

### Routes

Each route is ~5 lines: validate nothing extra, call `client.call(...)`, return
upstream `data` with upstream `status`. The wrapper does NOT re-shape payloads —
internal callers pass Unifocus-native bodies. The simplification is purely
"signing + logging handled for you," not "DSL on top of Unifocus."

For the master endpoint, the wrapper injects `PropertyId` from `.env` if the
caller omits it, since `PROPERTY_ID` is already configured.

### Swagger (`src/swagger/openapi.ts` + mount in `index.ts`)

Build the OpenAPI 3.0 doc as a TS object literal — keeps types close to routes
and avoids YAML drift. Mount with `swagger-ui-express` at `/docs`. Document the
13 endpoint operations grouped by tag (Master, Complain, Guest, Automation,
Glitch). Schemas mirror PDF section bodies; for fields we don't yet know
precisely, use `additionalProperties: true` to keep it permissive (this is a
testing tool).

### Dependencies

Runtime: `express`, `axios`, `dotenv`, `swagger-ui-express`
Dev: `typescript`, `ts-node-dev`, `@types/express`, `@types/node`,
`@types/swagger-ui-express`

Scripts:
- `dev`: `ts-node-dev --respawn src/index.ts`
- `build`: `tsc`
- `start`: `node dist/index.js`

## Endpoint mapping table

| Wrapper route                          | Method | Upstream                                                |
|----------------------------------------|--------|---------------------------------------------------------|
| `/api/master`                          | GET    | `/Master/GetAllPropertyMaster?PropertyId={id}`          |
| `/api/complain/register`               | POST   | `/Complain/RegisterCall`                                |
| `/api/complain/search`                 | POST   | `/Complain/SearchComplain`                              |
| `/api/complain/update`                 | POST   | `/Complain/UpdateComplain`                              |
| `/api/complain/attachment`             | GET    | `/Complain/GetAttachmentComplain?CallRegAttachmentId=…` |
| `/api/complain/attachment/stream`      | GET    | `/complain/GetComplainAttachmentStream?CallRegAttachmentId=…` |
| `/api/guest/lookup`                    | POST   | `/Guest/GuestLookup`                                    |
| `/api/guest/baggage-tag`               | POST   | `/Guest/UpdateBaggageTag`                               |
| `/api/automation/event`                | POST   | `/Automation/PublishEvent`                              |
| `/api/glitch/search`                   | POST   | `/integrationapi/glitch/Glitch_Search`                  |

(Items 3, 6, 12 in the PDF — "multiple" variants — share the same upstream URL
with array payloads, so no extra wrapper routes are needed.)
