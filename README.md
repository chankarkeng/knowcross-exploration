# Unifocus Integration API — Test Wrapper

A thin Express + TypeScript proxy in front of the Unifocus (Knowcross) Integration API. It handles the HMAC request signing so you can exercise the upstream endpoints from Swagger or a browser without hand-rolling signatures, and it writes a full request/response record for every call so you can review exactly what went over the wire.

This is a **testing tool**, not a production service. See [Security](#security) before you expose it to anything.

## Quick start

```bash
npm install
cp .env.template .env    # then fill in the four values
npm run dev              # http://localhost:3000
```

| Variable | Meaning |
| --- | --- |
| `BASE_URL` | Unifocus API root, e.g. `https://<host>` (trailing slashes are stripped) |
| `PROPERTY_ID` | Default property, used when `GET /api/master` gets no `PropertyId` |
| `PUBLIC_KEY` | Client ID; sent as `X-Knowcross-ClientID` and signed into the access header |
| `PRIVATE_KEY` | HMAC-SHA256 secret. Never commit it — `.env` is gitignored |
| `ACCESS_TOKEN` | Optional. Unset = no gate (fine locally). **Required for any hosted deploy** — see [Access token](#access-token) |

The first four are required; the process throws on startup if any is missing or blank. `PORT` is optional and defaults to 3000.

Scripts: `npm run dev` (ts-node-dev, reloads on change) · `npm run build` (tsc to `dist/`) · `npm start` (run the build).

## What's on the box

| Route | Purpose |
| --- | --- |
| `/docs` | Swagger UI — the main way to drive the API by hand |
| `/config` | Master-config browser: fetch and inspect the property master data |
| `/service-requests` | Guided flow for registering service requests (room → category → description → submit) |
| `/openapi.json` | The raw OpenAPI document |
| `/config.json` | The cached master config; 404s until `GET /api/master` has been called once |
| `/health` | Liveness, plus the configured `BASE_URL` and `PROPERTY_ID` |
| `/` | Redirects to `/config` |

## API endpoints

Each one signs the request and forwards it to the Unifocus path shown. Bodies are passed through unchanged, so the upstream contract is the contract.

| This wrapper | Upstream |
| --- | --- |
| `GET /api/master` | `master/GetAllPropertyMaster` |
| `POST /api/complain/register` | `complain/RegisterCall` |
| `POST /api/complain/search` | `complain/SearchComplain` |
| `POST /api/complain/update` | `complain/UpdateComplain` |
| `GET /api/complain/attachment` | `complain/GetAttachmentComplain` |
| `GET /api/complain/attachment/stream` | `complain/GetComplainAttachmentStream` |
| `POST /api/guest/lookup` | `guest/GuestLookUp` |
| `POST /api/guest/baggage-tag` | `guest/UpdateBaggageTag` |
| `POST /api/glitch/search` | `glitch/Glitch_Search` |
| `POST /api/automation/event` | `automation/PublishEvent` |

Two notes worth knowing before you use them:

- **`GET /api/master` has a side effect.** On a 2xx it caches the response to `data/config.json`, which is what `/config.json` serves and what the `/config` and `/service-requests` pages read. Call it once before using those pages.
- **`POST /api/complain/register` takes an array**, not a single object, and returns one result per element. The `/service-requests` page uses this to queue several requests and submit them in one call.

## Access token

When `ACCESS_TOKEN` is set, every route except `/health` needs it. Share one link:

```
https://<your-app>.onrender.com/config?token=<TOKEN>
```

The token is accepted as `?token=`, an `X-Access-Token` header (handy for curl), or the
`access` cookie. On a page load the server sets that cookie and redirects to the same URL
without the token, so it doesn't sit in the address bar — and from then on the pages' own
`fetch()` calls and Swagger UI work without it. The token is redacted from stdout and from
`logs/` before anything is written.

Generate one with `openssl rand -hex 24`. To revoke, change the env var — every cookie
stops working immediately.

**Know what this is.** A single shared bearer token in a URL is a speed bump, not real
auth: it's in whoever's history you sent it to, there are no per-user identities, and no
revocation short of rotating it for everyone. It's proportionate for keeping a dev tool off
the open internet, and it is *not* proportionate to the fact that this app can write real
records into a real property with your production credentials. Point it at a test property
if you have one.

## Authorization

Per the operations PDF in `docs/`, every upstream call carries two headers:

```
X-Knowcross-ClientID: <PUBLIC_KEY>
X-Knowcross-Access:   <PUBLIC_KEY>:<signature>:<unixSeconds>
```

The signature is HMAC-SHA256 over `PUBLIC_KEY + METHOD + urlEncode(fullUrl.toLowerCase()) + unixSeconds`, keyed by `PRIVATE_KEY`, base64-encoded. See `src/unifocus/signature.ts`.

The encoding step is the fiddly part: it reproduces .NET's `HttpUtility.UrlEncode` rather than JS's `encodeURIComponent`. The differences that actually bite — lowercase percent-encoded bytes (`%2f`, not `%2F`), spaces as `+`, and `!*()` left unescaped. A signature built with `encodeURIComponent` will be rejected upstream.

Because `unixSeconds` is signed, upstream will reject calls if the machine clock drifts too far.

## Logging

Every call gets a UUID correlation id, returned as `X-Correlation-Id` and threaded through both hops.

- **stdout** — one JSON line per event (inbound request, upstream request, upstream response, inbound response).
- **`logs/`** — one JSON file per `/api/*` call, named `<timestamp>-<METHOD>-<path>.json`, written when the response finishes.

Each file holds the inbound request, the upstream request (URL, headers, body, **and the exact `signatureRawData` string that was signed**), the upstream response, and what was sent back. That signature-input field is there to debug signing mismatches — it's the first thing to look at on a 401. Binary bodies are replaced with a `<binary N bytes>` placeholder rather than inlined.

Upstream failures return `502` with the error message; upstream non-2xx status codes are passed through as-is (`validateStatus` is disabled), so a 401 from Unifocus reaches you as a 401.

## Layout

```
src/
  index.ts            express app, correlation-id + logging middleware, static pages
  config.ts           env loading and validation
  logger.ts           per-call JSON records
  configStore.ts      data/config.json read/write
  unifocus/
    signature.ts      HMAC signing (the C#-compatible url encoder lives here)
    client.ts         signs, calls, logs both directions
  routes/             one file per upstream area; all thin pass-throughs
  swagger/openapi.ts  the OpenAPI document served at /docs
public/               config.html, service-requests.html
docs/                 the Unifocus operations PDF and working notes
data/, logs/          generated at runtime; both gitignored
```

## Deploying to Render (free)

`render.yaml` is checked in, so: **New → Blueprint** in the Render dashboard, point it at
this repo, and it reads the build/start commands and health check. Then set the five env
vars — all are marked `sync: false`, so Render prompts for them and they never live in git.

If you instead create a plain **Web Service**, `render.yaml` is ignored and Render's default
build (`npm install`) never compiles anything — you get `Cannot find module dist/index.js`
at startup. Set the build command by hand:

```
npm ci --include=dev && npm run build
```

`--include=dev` matters: Render sets `NODE_ENV=production`, which tells npm to skip
devDependencies — and `typescript` is one, so a plain `npm ci` leaves you with no `tsc` and
a build that "succeeds" without emitting `dist/`.

Two things about the free tier that will look like bugs and aren't:

- **It sleeps after ~15 minutes idle**, and the next request takes ~50s to wake it. Fine for
  a teammate poking at it; don't read it as the app hanging.
- **The disk is ephemeral.** `logs/` and `data/config.json` are wiped on every redeploy and
  every wake. So after a cold start the `/config` and `/service-requests` pages will say the
  master config isn't loaded — hit **Fetch master config** (or `GET /api/master`) and it
  repopulates. It also means the hosted instance is no good for reviewing call logs, which
  is half the point of this tool: run it locally for that.

## Security

The design brief was "minimal implementation just for API testing", and it is exactly that:

- **The only auth is one shared token.** See [Access token](#access-token) for what that
  does and doesn't buy you. Anyone holding it can call the upstream API with your
  credentials, and `/api/complain/register` writes real records into a real property.
- **`logs/` is sensitive.** It contains signed access headers and full request/response
  bodies including guest data. It's gitignored; treat the files the same way.
- `.env` and `data/` are gitignored too. Only `.env.template` is tracked.
