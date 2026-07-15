# Knowcross / Unifocus — Customer Self-Service Request Portal

Generated: 2026-06-06

---

## 1. Current Integration Overview

This wrapper is a thin Express/TypeScript proxy. It handles all HMAC-SHA256 signing so internal callers never touch the `X-Knowcross-Access` scheme. Every call is logged end-to-end with a shared `correlationId`.

### Architecture (as-built)

```
Browser / internal caller
        │
        ▼
  Express wrapper  (localhost:3000)
        │  assigns correlationId
        │  logs inbound request
        │
        ▼
  UnifocusClient.callUnifocus()
        │  builds full URL
        │  computes HMAC-SHA256 signature
        │  adds X-Knowcross-Access + X-Knowcross-ClientID headers
        │  logs upstream-request
        │
        ▼
  Unifocus Integration API
  (demo-usea1-ops-legacy-integration.unifocus.com)
        │
        ▼
  UnifocusClient  (receives response)
        │  logs upstream-response
        │
        ▼
  Express route  →  logs inbound-response  →  caller
```

### Signing scheme

```
encodedUri  = C#-style URL-encode( fullUrl.toLowerCase() )
raw         = publicKey + METHOD + encodedUri + unixSeconds
signature   = base64( HMAC-SHA256( privateKey_utf8, raw_utf8 ) )

Header: X-Knowcross-Access: {publicKey}:{signature}:{unixSeconds}
Header: X-Knowcross-ClientID: {publicKey}
```

---

## 2. Current Endpoint Inventory

| Wrapper route | Method | Upstream path | Purpose |
|---|---|---|---|
| `/api/master` | GET | `/integrationapi/master/GetAllPropertyMaster` | Loads rooms, categories, descriptions, zones — the reference data for everything else |
| `/api/complain/register` | POST | `/integrationapi/complain/RegisterCall` | Create one or many service requests |
| `/api/complain/search` | POST | `/integrationapi/complain/SearchComplain` | Query open/closed requests with filters |
| `/api/complain/update` | POST | `/integrationapi/complain/UpdateComplain` | Update status, remarks, assignment |
| `/api/complain/attachment` | GET | `/integrationapi/complain/GetAttachmentComplain` | Fetch attachment metadata |
| `/api/complain/attachment/stream` | GET | `/integrationapi/complain/GetComplainAttachmentStream` | Stream raw attachment bytes |
| `/api/guest/lookup` | POST | `/integrationapi/guest/GuestLookUp` | Find in-house guests by room/name/reservation |
| `/api/guest/baggage-tag` | POST | `/integrationapi/guest/UpdateBaggageTag` | Update baggage tag on guest record |
| `/api/automation/event` | POST | `/integrationapi/automation/PublishEvent` | Publish room state events (DND, MUR) |
| `/api/glitch/search` | POST | `/integrationapi/glitch/Glitch_Search` | Search maintenance glitches |

Plus local-only routes: `GET /health`, `GET /config.json`, `GET /config`, `GET /service-requests`, `GET /docs`, `GET /openapi.json`.

---

## 3. Core API Flows (Detail)

### 3a. Bootstrap — Load Master Data

Call once on startup (or on demand). The wrapper caches the result in `data/config.json`.

```
GET /api/master?PropertyId=3038

→ Unifocus: GET /integrationapi/master/GetAllPropertyMaster?PropertyId=3038

Response shape:
{
  "data": [{
    "Key": "3038_ENG",
    "Location": [
      { "Id": 31891, "Description": "3301", "LocationTypeCode": "R", "ZoneId": 1122, ... },
      ...
    ],
    "CallCategories": [
      { "Id": 3001, "Description": "Eng-Carpenter", ... },
      ...
    ],
    "CallDescriptions": [
      { "Id": 38777, "CategoryId": 3001, "Description": "Bed to repair", "IsDel": false, ... },
      ...
    ]
  }]
}
```

`LocationTypeCode = "R"` identifies guest rooms. All IDs here are referenced by subsequent calls.

---

### 3b. Guest Lookup

Resolves a guest by reservation or room to get their `GuestId` and confirmed `LocationId`.

```
POST /api/guest/lookup
Body: { "PropertyId": 3038, "ReservationStatus": 2 }
  (ReservationStatus 2 = in-house; can also filter by LName, ConfirmationId, LocationDescription)

→ Unifocus: POST /integrationapi/guest/GuestLookUp

Response shape:
{
  "Result": [{
    "GuestId": 1200207,
    "FullName": "Halim Wadidi",
    "FName": "Halim",
    "LName": "Wadidi",
    "LocationDescription": "3303",
    "LocationId": 31893,
    "PropertyId": 3038,
    "PMSReservationId": "74282",
    "ConfirmationId": "79085",
    "ArrivalDate": "2024-04-02T18:30:00Z",
    "DepartureDate": "2026-10-28T18:30:00Z",
    "VIP": null,
    "GuestContacts": []
  }]
}
```

Key output: `GuestId` + `LocationId` — these drive every subsequent call on behalf of the guest.

---

### 3c. Register a Service Request

```
POST /api/complain/register
Body (array):
[{
  "PropertyId": 3038,
  "LocationId": 31897,           ← guest's room
  "CategoryId": 3001,
  "CallDescriptionsId": 38777,
  "Priority": 1,                 ← 1=Normal 2=Urgent 3=Extra Urgent 4=Crisis
  "IsGuestCall": true,
  "Remarks": "Bed slats broken",
  "Operation": 1,
  "CurrentStatus": "OPN"
}]

→ Unifocus: POST /integrationapi/complain/RegisterCall

Response shape:
{
  "HasError": false,
  "Errors": null,
  "Result": [{
    "ComplainId": 1333453,
    "DisplayCallNo": 168,
    "CurrentStatus": "OPN",
    "AssignedTo": 9966,
    "AssignToName": "Ismail Tome",
    "CategoryDescription": "Eng-Carpenter",
    "CallDescription": "Bed to repair",
    "LocationName": "3307",
    "RegisteredAt": "2026-05-23T05:54:42.527Z",
    "MRT": 30,                   ← Mean Resolution Time (minutes)
    "CalculatedFinishDate": "2026-05-23T06:24:42.527Z",
    "DepartmentName": "Engineering",
    "PriorityDescription": "Normal",
    ...
  }]
}
```

Note: if an identical open request already exists for that room+category+description, Unifocus returns the existing record with `CurrentStatus: "DUP"` rather than creating a duplicate.

---

### 3d. Search Service Requests

```
POST /api/complain/search
Body:
{
  "Properties": [3038],
  "Locations": [31897],         ← filter by room (optional)
  "StatusCode": "OPN",          ← OPN / CLS / PRK / USN / SNL
  "PageNumber": 0,
  "PageSize": 25
}

→ Unifocus: POST /integrationapi/complain/SearchComplain

Response shape:
{
  "TotalRecords": 319,
  "HasError": false,
  "Result": [{ ...same fields as register response... }]
}
```

Guest-specific filter (needed for self-service): add `"GuestId": [1200207]` to restrict to one guest's requests.

---

### 3e. Update a Request

```
POST /api/complain/update
Body:
{
  "ComplainId": 1333453,
  "PropertyId": 3038,
  "Remarks": "Please bring extra pillows too",
  "CurrentStatus": "OPN"
}

→ Unifocus: POST /integrationapi/complain/UpdateComplain
```

Guests should only be allowed to add remarks. Status changes (CLS, PRK) must remain staff-only.

---

## 4. Self-Service Portal — What's Missing

The current wrapper is an **internal testing tool**. Promoting it to customer-facing requires these additions:

### 4a. Guest Identity & Session

**Problem:** There is no auth between callers and the wrapper. Any request is accepted.

**What to build:**
- `POST /portal/identify` — takes room number + last name (or confirmation ID), calls `GuestLookUp`, verifies the match, then issues a short-lived JWT (or server session) containing `{ guestId, locationId, propertyId, expiresAt }`.
- All subsequent `/portal/*` routes validate this token and inject the stored context.
- Session TTL should match a hotel night (8–12 hours max).

**Identity lookup flow:**
```
Guest submits: { room: "3303", lastName: "Wadidi" }
→ POST /integrationapi/guest/GuestLookUp { PropertyId, LocationDescription: "3303" }
→ Match result where LName.toLowerCase() === "wadidi"
→ Return JWT { guestId: 1200207, locationId: 31893, propertyId: 3038 }
```

Rate-limit this endpoint (5 attempts per IP per 15 minutes) to prevent room-number + surname brute force.

---

### 4b. Filtered Menu Endpoint

**Problem:** `CallCategories` contains all hotel categories including back-of-house items guests should never see.

**What to build:**
- `GET /portal/menu` — reads cached master data, filters categories and descriptions to a guest-visible allow-list (configured in `data/config.json` or a separate `guestCategories.json`), and returns only `{ id, label }` pairs.
- No raw master data dump to browsers.

---

### 4c. Guest-Scoped Request Endpoints

New wrapper routes that sit in front of the existing ones and enforce guest context:

| Portal route | Method | Delegates to | Notes |
|---|---|---|---|
| `POST /portal/identify` | POST | `GuestLookUp` | Issues session; rate-limited |
| `GET /portal/menu` | GET | Master cache | Returns filtered categories/descriptions |
| `POST /portal/request` | POST | `RegisterCall` | Injects `LocationId`, `PropertyId`, `RequestedByGuestId`, `IsGuestCall: true` from session |
| `GET /portal/my-requests` | GET | `SearchComplain` | Filters by `GuestId` from session |
| `POST /portal/request/:id/remark` | POST | `UpdateComplain` | Only allows adding remarks; status locked to current value |

---

### 4d. Security Hardening

| Item | Current state | Required for portal |
|---|---|---|
| Auth between caller and wrapper | None | JWT / session on all `/portal/*` routes |
| CORS | Open | Lock to portal domain |
| CSRF | Not needed (API client) | Cookie-based sessions need CSRF token |
| Rate limiting | None | Identify: 5 req/15 min/IP; others: 30 req/min/session |
| Input validation on Remarks | None | Strip special chars (Unifocus rejects them); max 1000 chars |
| Exposed internal IDs | Raw IDs passed through | `ComplainId`, `LocationId`, `GuestId` are OK to expose read-only; signing keys never leave server |
| Signing keys in `.env` | Server-side only (correct) | Keep server-side; never send to browser |

---

### 4e. UI Requirements

The current `/service-requests` page is an internal prototype. For customer-facing use:

- **Mobile-first layout** — guests are on phones in a hotel room
- **Hotel branding** — logo, colour palette, language selector
- **Simplified flow:**
  1. Enter room + last name → authenticate
  2. Pick request category → pick specific description → add note → submit
  3. See "Your requests" list with live status
- **No admin controls** — no raw JSON preview, no StatusCode picker, no PropertyId fields
- **Status language** — translate codes (`OPN` → "Open", `CLS` → "Completed", `PRK` → "Parked") to human text
- **Confirmation screen** — show assigned staff name + MRT ("Expected within 30 minutes")

---

## 5. Full End-to-End Portal API Flow

```
STEP 1: Guest identifies themselves
──────────────────────────────────
Browser  POST /portal/identify  { room: "3303", lastName: "Wadidi" }
  └─► Server calls POST /api/guest/lookup { PropertyId, LocationDescription: "3303" }
  └─► Match: GuestId=1200207, LocationId=31893
  └─► Issue JWT: { guestId, locationId, propertyId, exp }
  └─► Return: { name: "Halim Wadidi", room: "3303", token: "eyJ..." }

STEP 2: Load request menu
──────────────────────────
Browser  GET /portal/menu  (Bearer token)
  └─► Server reads data/config.json (master cache)
  └─► Filters to guest-visible categories + descriptions
  └─► Return: [{ categoryId, categoryLabel, descriptions: [{ id, label }] }]

STEP 3: Guest submits request
──────────────────────────────
Browser  POST /portal/request  (Bearer token)
  Body: { categoryId: 3001, descriptionId: 38777, priority: 1, remarks: "Bed slats broken" }
  └─► Server enriches: PropertyId=3038, LocationId=31893, RequestedByGuestId=1200207, IsGuestCall=true
  └─► Calls POST /api/complain/register [{ PropertyId, LocationId, CategoryId, CallDescriptionsId,
                                           Priority, IsGuestCall, Remarks, Operation:1, CurrentStatus:"OPN" }]
  └─► Return: { requestId: 1333453, displayNo: 168, assignedTo: "Ismail Tome",
                eta: "2026-05-23T06:24:42Z", status: "Open" }

STEP 4: Guest tracks their requests
─────────────────────────────────────
Browser  GET /portal/my-requests  (Bearer token)
  └─► Calls POST /api/complain/search { Properties:[3038], GuestId:[1200207],
                                         StatusCode:"OPN", PageNumber:0, PageSize:10 }
  └─► Return: simplified array of { displayNo, category, description, status, registeredAt, assignedTo }

STEP 5 (optional): Guest adds a remark
────────────────────────────────────────
Browser  POST /portal/request/1333453/remark  (Bearer token)
  Body: { text: "Please also check the air con" }
  └─► Calls POST /api/complain/update { ComplainId:1333453, PropertyId:3038,
                                         Remarks:"Please also check the air con",
                                         CurrentStatus:"OPN" }
  └─► Return: { ok: true }
```

---

## 6. What NOT to Expose to Customers

| Endpoint | Reason |
|---|---|
| `POST /api/complain/update` (full) | Guests can only add remarks; they must not change status or assignment |
| `POST /api/automation/event` | DND/MUR room state is a staff operation |
| `POST /api/glitch/search` | Internal maintenance data |
| `GET /api/complain/attachment` / `stream` | Only expose if you build an "upload photo" feature |
| `GET /api/master` (raw) | Contains all internal location IDs, section codes, zone config — not for browsers |
| Signing key fields | Already server-side only; never reference in frontend |

---

## 7. Implementation Priority Order

1. **Session middleware** — `POST /portal/identify` + JWT validation middleware
2. **Filtered menu** — `GET /portal/menu` using existing master cache
3. **Submit request** — `POST /portal/request` (wraps register with session injection)
4. **Track requests** — `GET /portal/my-requests` (wraps search with GuestId filter)
5. **Rate limiting** — `express-rate-limit` on identify; standard limit on all portal routes
6. **Input validation** — remarks sanitisation (strip `<>"';&` etc.)
7. **Customer UI** — mobile-first form + status list, hotel branding
8. **Add remark** — `POST /portal/request/:id/remark`
9. **CORS** — lock to portal domain once deployed
10. **Confirmation email/SMS** — nice-to-have; fire after successful register via a webhook or queue

---

## 8. Data Dependencies Map

```
GET /api/master
  ├─► Location[].Id             ─── used as LocationId in register/search
  ├─► CallCategories[].Id       ─── used as CategoryId in register
  └─► CallDescriptions[].Id     ─── used as CallDescriptionsId in register
        (filtered by CategoryId)

POST /api/guest/lookup
  └─► GuestId                   ─── used as RequestedByGuestId in register
                                     and as GuestId filter in search

POST /api/complain/register
  └─► ComplainId                ─── used as ComplainId in update

POST /api/complain/search
  └─► Result[].ComplainId       ─── used for update / attachment fetch
```

All reference IDs are property-scoped (PropertyId is the root key). A single wrapper instance serves one property; multi-property deployments would need PropertyId to be session-scoped rather than `.env`-configured.
