# wireframe

Wirefen agricultural marketplace and lifecycle platform.

Phase 1 agricultural marketplace: React/TypeScript client, independently served Express REST API, PostgreSQL support, and a zero-configuration SQLite development database.

## Run locally

Requires Node.js 22.19 or later. In PowerShell:

```powershell
cd C:\Users\Admin\Desktop\woko\fivemilli
npm.cmd install
npm.cmd run dev
```

Open http://127.0.0.1:5173. Vite forwards `/api` to port 3001. For the built PWA:

```powershell
npm.cmd run build
npm.cmd start
```

Open http://127.0.0.1:3001. Stop an existing server before starting another on that port. Service workers are enabled in the built app, not the Vite development app.

Choose **Sign in → Buyer / Farmer / Admin** to explore the explicitly labeled sample workspace. These shortcuts only exist outside production and can also be disabled with `SEED_DEMO=false`. Sample users have random passwords. Public registration only permits Buyer or Farmer accounts.

The launch market has not been selected. South Africa/ZAR is illustrative. Configure `MARKET_NAME` and `CURRENCY` before adding launch data. Listing prices and baseline costs use one configured marketplace currency; changing currency does not convert existing amounts.

## Features

- Public catalogue with search, category, minimum/maximum volume, harvest-date and preservative filters; sorting, grid/list views, local saved produce, and listing detail routes.
- Buyer order inquiries persist to a staff queue. Admins progress New → In review → Contacted → Closed. No checkout or payment is implied.
- Farmer workspace, three-step listing creation and four-step historical baseline collection. Baseline PATCH requests preserve previous fields; both wizards persist partial drafts on the server and device.
- Admin farmer directory, CSV export, farmer selection, and assisted baseline/listing entry under server-enforced authorization.
- Clerk session authentication with bearer tokens, server-owned role/ownership checks, E.164 contact profiles, input validation, allowed-origin checks, and authentication/SMS rate limits. Legacy local authentication is available only when Clerk is not configured.
- Timestamped consent audit trail with account changes and SMS START/STOP handling.
- Twilio SDK outbound adapter and signature-validated inbound webhook, message deduplication, conversational state, and a minimal BASELINE → yield draft flow. Full conversational mapping remains Phase 2.
- Installable PWA, local fonts and images, app-shell/public-catalogue caching, offline baseline reopening and reconnect sync. Private API responses are never service-worker cached.

## Configuration and production

The ignored local `.env` contains your supplied Clerk development keys. Never commit it. For another environment, copy `.env.example` and provide that environment?s credentials. The secret stays on the API server; `/api/v1/config` exposes only the publishable key. This React/Vite app loads that public key at runtime, so it is not tied to a Next.js build variable.

| Variable | Purpose |
| --- | --- |
| `PORT` | API/static server port; default 3001 |
| `APP_ORIGIN` | Comma-separated exact allowed browser origins; required for Clerk in production |
| `CLERK_PUBLISHABLE_KEY` | Public Clerk instance key; VITE_/NEXT_PUBLIC_ aliases are also accepted by the API |
| `CLERK_SECRET_KEY` | Server-only Clerk API credential; configure together with the public key |
| `DATABASE_URL` | PostgreSQL connection URL; absent uses `data/wirefen.sqlite` locally |
| `NODE_ENV` | Set `production` to disable demo access and enable Secure cookies |
| `SEED_DEMO` | Set `false` to disable sample seeding outside production |
| `MARKET_NAME` | Human-readable launch market |
| `CURRENCY` | ISO 4217 currency code, default sample `ZAR` |
| `TWILIO_ACCOUNT_SID` | Twilio account for outbound messages |
| `TWILIO_AUTH_TOKEN` | Twilio SDK/signature-validation credential |
| `TWILIO_PHONE_NUMBER` | Provisioned sender number |
| `TWILIO_WEBHOOK_URL` | Exact public HTTPS URL, including path, used for request signature validation |

Deploy the web build and API behind HTTPS at the same origin (the frontend only accesses the API via HTTP). In separate infrastructure, proxy `/api/v1` to the API; the API remains independently usable by other clients. The server binds to loopback by default, suitable for a reverse proxy. Use a fresh PostgreSQL database for production rather than copying sample data. Schema creation runs idempotently at startup; subsequent production schema changes should use reviewed migrations and backups.

To bootstrap an admin, supply `ADMIN_NAME`, `ADMIN_PHONE` (E.164), and `ADMIN_PASSWORD` (at least 14 characters) through a secure process environment, then run:

```powershell
node --env-file-if-exists=.env server/create-admin.mjs
```

Do not commit passwords. There is no public admin registration. Configure the reverse proxy and rate limiting for your deployment topology; the included limiter uses process memory, so a multi-instance deployment needs a shared limiter or edge enforcement. Clerk handles sign-in verification and recovery according to its instance settings. The separate Wirefen contact phone is not independently verified. Existing Wirefen accounts are never automatically linked by phone or email. SMS provider credentials and a publicly reachable signed webhook must be connected and tested before real SMS use. The implementation records explicit consent; jurisdiction-specific policy copy and operational compliance still depend on the selected market.

## API

All responses are JSON except the SMS webhook, which returns TwiML. Send JSON with `Content-Type: application/json`. With Clerk enabled, send `Authorization: Bearer <Clerk session token>`; the middleware validates signatures, expiration and authorized parties. `POST /api/v1/auth/onboard` accepts the Wirefen profile only after authentication. Roles come from the relational database, not browser input or Clerk public metadata. Without Clerk keys, authentication uses the legacy `wirefen_session` cookie returned by register/login (seven-day expiry; logout revokes the record).

| Method | Route | Access |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | Public; name, phone, password, role, sms_opt_in; optional farm_name/location |
| POST | `/api/v1/auth/login` | Public; phone, password |
| GET | `/api/v1/auth/me` | Current session or null |
| POST | `/api/v1/auth/logout` | Revoke current session |
| GET | `/api/v1/config` | Public market/provider availability, no credentials |
| PATCH | `/api/v1/account/consent` | Signed in; sms_opt_in boolean |
| GET | `/api/v1/farmers` | Admin |
| GET, POST, PATCH | `/api/v1/farmers/:id/baseline` | Farmer owner or Admin |
| GET, PATCH | `/api/v1/farmers/:id/listing-draft` | Farmer owner or Admin |
| GET | `/api/v1/listings` | Public; category, min_volume, max_volume, harvest_date_after, preservative, search; mine=true requires auth |
| GET | `/api/v1/listings/:id` | Public |
| POST | `/api/v1/listings` | Farmer owner or Admin |
| POST | `/api/v1/orders` | Buyer |
| GET | `/api/v1/orders` | Buyer sees own; Admin sees all |
| PATCH | `/api/v1/orders/:id` | Admin; status |
| POST | `/api/v1/webhooks/sms/receive` | Valid Twilio signature; URL-encoded payload |

Example partial baseline:

```json
{"crop_type":"Tomatoes","avg_land_size":12,"status":"draft"}
```

Completion requires `crop_type`, `avg_land_size`, `avg_yield_per_acre` (kg/acre), `avg_duration_days`, `avg_production_cost` (market currency/season), and `status: "complete"`. Current Phase 1 baseline is one primary-crop record per farmer.

Listings require `farmer_id`, `title`, `crop_category`, `available_volume` (kg), `price` (currency/kg), `harvest_date`, `expiration_date` (ISO dates), `shelf_life_days`, and `preservative_used` (boolean); `description` is optional. The server derives a category illustration. Order inquiries require `listing_id`, `volume`, `delivery_location`, and optional `notes`.

Database tables: users, farmer_profiles, historical_baselines, listings, listing_drafts, order_requests, sessions, sms_consents, conversational_state, sms_messages. See `server/db.mjs` for keys, foreign keys, indexes, and constraints.

## Offline behavior

The Currency converter supports EUR, USD and the configured market currency. The header selector converts catalogue, shortlist, detail and farm-listing prices for display; persisted prices and farmer cost-entry forms stay in the market currency. Rates come from [Frankfurter](https://frankfurter.dev/), through `GET /api/v1/exchange-rates`. The API coalesces concurrent requests and caches rates for an hour. Dated fallback rates are explicitly labeled and expire after seven days. The browser remembers display preference and rates for offline use. Conversions are estimates and do not set payment terms.

Visit online once to install/cache the shell. Previously loaded catalogue requests can be reopened offline. The browser keeps a minimal last-session display snapshot to reopen its own saved draft; this does not authorize server operations. Actual API access is always checked by the server. Baseline and listing drafts are scoped to account + farmer and synchronized on reconnect. Final submissions need connectivity. Multiple-device concurrent draft edits use last-write-wins in Phase 1. Clearing site data removes unsynced drafts. Saved produce is a browser-local shortlist.

## Verification

```powershell
npm.cmd test
npm.cmd run build
# Start the built app, then (requires installed Google Chrome):
npm.cmd run test:ui
```

API tests use an isolated in-memory SQLite database. Browser tests use the local sample workspace and create clearly named test inquiries. Screenshots are saved in `test-results/`. The PostgreSQL adapter and live Twilio delivery require your infrastructure for integration validation.

## Assets

Photographs are local sample/category illustrations, not evidence of actual farm inventory. Sources are recorded in `public/images/sources.json`. DM Sans is distributed by `@fontsource/dm-sans`. Icons use Lucide; the Wirefen sprout mark is a simple project SVG. Design guidance is in `DESIGN.md` and product constraints in `PRODUCT.md`.

## Clerk account migration and admin access

Existing farm records and local users are retained. To explicitly link an existing account (including an admin created with the script above), first verify the intended identities as an operator. Supply `CLERK_USER_ID` and `WIREFEN_USER_ID` in the process environment, then run:

```powershell
node --env-file=.env server/link-clerk-user.mjs
```

The script checks the Clerk user exists and creates a unique identity link; it does not change roles or merge records. For new admins, create the Wirefen admin with `server/create-admin.mjs`, then link it before using Clerk. No admin role can be requested through public onboarding.

## Get app and mobile PWA

**Get app** sits beside Settings in the desktop rail and drawer, and is a direct destination in the mobile bottom navigation. The install page offers the native browser prompt when available, handles dismissal and installation, and gives Safari/iPhone or Chrome/Edge instructions otherwise. It never claims installation from a button click alone. Standalone detection, Apple home-screen metadata and safe-area spacing are included.

Use the built app over HTTPS for installation on a phone. Loopback localhost also works for desktop development; a phone?s localhost points to the phone, not this computer. The service worker caches the app and public catalogue; Clerk sessions and private API responses are excluded. Sign-in needs connectivity. An offline reopening uses the last local workspace and existing farmer draft; reconnect reloads Clerk before server synchronization.

Validation: `npm.cmd test` covers APIs, Clerk JWT validation, role/owner authorization, legacy-session rejection, onboarding rollback and currency logic. `npm.cmd run test:ui` checks the isolated local workspace and offline drafts. With the configured app running, `node tests/clerk-pwa-ui.mjs` checks live Clerk modal loading, protected API denial, simulated browser install events, mobile navigation and offline catalogue reload. No real signup or verification challenge is completed by this smoke test.

## First-visit installation and session persistence

A nonblocking invitation appears on the first eligible visit. The native browser install dialog still requires a click. iPhone and browsers without that dialog open the installation guide. Dismissal and prompt history persist, and Get app always remains available.

`GET /api/v1/pwa/session` creates or resumes a random, HttpOnly, SameSite visitor cookie and returns install state. `POST /api/v1/pwa/events` accepts `prompted`, `dismissed`, or `installed`; confirmed installation requires an `appinstalled`, `standalone`, or `related-app` source. Tables `pwa_visitors` and `pwa_accounts` retain timestamps. Visitor tokens are hashed in the database. These records track installation preferences, not browsing activity; no fingerprint or IP history is stored.

An installed state is monotonic: future dismissals cannot erase it. Signing in merges the device history into the account, suppressing invitations on another signed-in device. Local storage supports offline decisions; the cookie/database also recovers state if local storage alone is cleared. Browser display-mode and supported related-app detection suppress invitations for already installed apps. An anonymous visitor who clears all site data or switches browsers cannot be recognized reliably; signing in restores account history. Uninstall detection is not reliable, so automatic invitations stay suppressed once installation has been recorded.

## Node backend and deployment

The Node 22 / Express 5 API serves the entire Phase 1 app: Clerk/local authentication, profile onboarding, role and farm ownership checks, baseline/listing draft persistence, searchable catalogue, produce creation, buyer inquiries, admin order progression, consent records, signed SMS webhook, currency rates, and persistent install sessions. PostgreSQL and SQLite use the same relational schema. `GET /api/v1/health` checks database connectivity. SIGTERM/SIGINT stop accepting new connections and close the database.

A Dockerfile and PostgreSQL Compose service are included. Set production Clerk keys, an exact HTTPS `APP_ORIGIN`, and a long URL-safe `POSTGRES_PASSWORD`, then use `docker compose up --build -d`. Terminate HTTPS at your reverse proxy; the app port is bound to host loopback. `TRUST_PROXY_HOPS=1` assumes exactly one trusted proxy; adjust to your real deployment. Runtime credentials are injected into the container and excluded from the image build. Configure Twilio credentials before sending SMS. Back up the PostgreSQL volume and use a shared/edge rate limiter for multiple API instances. Container/PostgreSQL deployment configuration is provided but was not executed on this workstation.

GitHub Actions runs dependency installation, all backend tests, and the production build. Run `node tests/pwa-ui.mjs` for first-visit, persistence, installed-state, cross-device account, standalone, and responsive invitation checks. Run `npm.cmd run test:ui` for the full marketplace flow.
