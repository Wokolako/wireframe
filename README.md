# wireframe

Wirefen agricultural marketplace and lifecycle platform.

Phase 1 agricultural marketplace: a Next.js App Router frontend, Express REST API mounted through Next.js API routes, and Neon PostgreSQL in live mode. SQLite remains available for isolated tests and presentation development.

## Live backend with Neon

Set `NEXT_PUBLIC_USE_BACKEND=true`, `USE_BACKEND=true`, and `SEED_DEMO=false` in `.env`. Set `DATABASE_DRIVER=neon`, a Neon pooled `DATABASE_URL`, and matching Clerk keys. Apply schema migrations as a separate deployment step before starting the app:

```powershell
npm.cmd install
npm.cmd run db:migrate
npm.cmd run dev
```

Open http://127.0.0.1:3000. The Next.js Node server handles both pages and `/api/v1/*`; live mode refuses to start without `DATABASE_URL` and does not silently use SQLite. Startup checks the schema version but does not apply DDL; run `npm.cmd run db:migrate` with a migration-capable database identity before each application deployment. For legacy listing prices without a recorded currency, set `LEGACY_PRICE_CURRENCY` to their actual currency before migrating; migration intentionally refuses to guess. The API uses Neon's WebSocket driver when direct PostgreSQL TCP is unavailable. Run `npm.cmd run db:check` and `npm.cmd run test:neon` to verify the connection, schema, limits and public API. The spreadsheet importer `npm.cmd run seed:limits` upserts the 44 household limits into Neon. It does not create farms, stock, prices, or verified listings. Run it only after confirming the target database, then restart the app to refresh its in-memory limit lookup.

Guest household checkout does not require an account. Online payment is required before an order is confirmed; pay on delivery and manual bank transfer are unavailable. For Malawi, configure `CURRENCY=MWK`, verified MWK listing prices, and server-side `PAYCHANGU_SECRET_KEY` plus `PAYCHANGU_WEBHOOK_SECRET` to show PayChangu mobile money. PayChangu checkouts must total a whole Kwacha. Checkout reserves available stock immediately; the customer can then start a mobile-money request. The customer’s checkout page polls server-side PayChangu verification, while the signed webhook provides an additional settlement path. PayChangu credentials are never exposed to the browser. Stripe/Europe is not configured.

Available stock and supplier locations are restricted to admin reports. The original specification's public `min_volume` and `max_volume` filters are intentionally unavailable to buyers because repeated filter queries would reveal hidden inventory.

## Optional presentation mode

Set both `NEXT_PUBLIC_USE_BACKEND=false` and `USE_BACKEND=false` before starting or building the app. This mode is a separate local demonstration and does not use Neon. Because `NEXT_PUBLIC_*` variables are embedded in client bundles at build time, set this before `npm.cmd run build`; `USE_BACKEND` controls API availability at runtime.

Authentication is real: Clerk handles sign-in, registration, email verification and sessions directly from the frontend. Marketplace items, requests, farmer profiles and EUR/USD example rates remain browser-local dummy data. In this mode, Next.js returns 404 for API routes; no database, SMS gateway or currency provider is used.

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://127.0.0.1:3000. For the installable presentation build:

```powershell
npm.cmd run build
npm.cmd start
```

This runs the native Next.js server on port 3000 (or `PORT` if configured); deploy it as a Node.js application or with the included Dockerfile. Use **Sign in** or **Create account** for your real Clerk account. New buyers and farmers complete a local Wirefen profile. The verified Clerk email **georgechivalo01@gmail.com** opens the Admin workspace automatically. Arbitrary sample-account switching has been removed. Requests, consent preferences, farmer drafts and new listings persist only in browser storage; no real order is sent. Remove the `wirefen-presentation-v1` local-storage entry to reset the sample dataset; clear `wirefen-baseline-*` / `wirefen-listing-*` entries if you also want to reset wizard drafts.

## Backend configuration

Set `NEXT_PUBLIC_USE_BACKEND=true` and `USE_BACKEND=true` before starting or building the app, and configure the server-side Clerk keys and database. Use `npm.cmd run dev` for development, or `npm.cmd run build` followed by `npm.cmd start` for production. The Next.js Node server handles both the app and API in one process. Admin access requires a server-side role or permission; the presentation-mode email shortcut does not grant live API access.

The launch market is still a configurable sample (South Africa/ZAR). Do not treat presentation exchange rates or records as live data.

## Features

The Admin workspace includes a searchable **Produce price references** table with 44 rows transcribed from the supplied `malawi_produce_top40_prices.csv` screenshots. The reusable source is `shared/produce-prices.json`; full names match the existing household-limit catalogue. GBP values retain their original units and ranges. `mwk_visible_from` records only the visible start of each Malawi price; the clipped range endings and market notes remain unknown. Three clipped GBP range endings are also `null`. The source price date is unknown. These references do not change listing prices, create stock, or convert currencies, and work in both live and presentation builds without a database import.

- Public catalogue with search, category, minimum/maximum volume, harvest-date and preservative filters; sorting, grid/list views, local saved produce, and listing detail routes.
- Buyer order inquiries persist to a staff queue. Admins progress New → In review → Contacted → Closed. No checkout or payment is implied.
- Farmer workspace, three-step listing creation and four-step historical baseline collection. Baseline PATCH requests preserve previous fields; both wizards persist partial drafts on the server and device.
- Admin farmer directory, CSV export, farmer selection, and assisted baseline/listing entry under server-enforced authorization.
- Clerk session authentication with bearer tokens, server-owned role/ownership checks, E.164 contact profiles, input validation, allowed-origin checks, and authentication/SMS rate limits. Legacy local authentication is available only when Clerk is not configured.
- Timestamped consent audit trail with account changes and SMS START/STOP handling.
- Twilio SDK outbound adapter and signature-validated inbound webhook, message deduplication, conversational state, and a minimal BASELINE → yield draft flow. Full conversational mapping remains Phase 2.
- Installable PWA, local fonts and images, app-shell/public-catalogue caching, offline baseline reopening and reconnect sync. Private API responses are never service-worker cached.

## Configuration and production

The ignored local `.env` contains your supplied Clerk development keys. Never commit it. For another environment, copy `.env.example` and provide that environment?s credentials. The secret stays on the server; `/api/v1/config` exposes only the publishable key. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is the client-side override; otherwise `src/auth-config.ts` uses the public development fallback.

| Variable | Purpose |
| --- | --- |
| `PORT` | Next.js server port; default 3000 |
| `NEXT_PUBLIC_USE_BACKEND` | Client mode: set to `true` for live API/database mode; set before build |
| `USE_BACKEND` | Server-side API switch; set to `true` to enable live API routes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Optional public Clerk key override, embedded in the client bundle |
| `APP_ORIGIN` | Comma-separated exact allowed browser origins; required for Clerk in production |
| `CLERK_PUBLISHABLE_KEY` | Public Clerk instance key; `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is also accepted |
| `CLERK_SECRET_KEY` | Server-only Clerk API credential; configure together with the public key |
| `DATABASE_URL` | PostgreSQL connection URL; absent uses `data/wirefen.sqlite` locally |
| `DATABASE_DRIVER` | Required with `DATABASE_URL`: `neon` or `postgres`; the app does not infer a driver |
| `LEGACY_PRICE_CURRENCY` | Actual currency for pre-migration listing prices that have no currency label; required only when such rows exist |
| `NODE_ENV` | Set `production` to disable demo access and enable Secure cookies |
| `SEED_DEMO` | Set `false` to disable sample seeding outside production |
| `MARKET_NAME` | Human-readable launch market |
| `CURRENCY` | ISO 4217 currency code, default sample `ZAR` |
| `PAYCHANGU_SECRET_KEY` | Server-only PayChangu API key; required with `CURRENCY=MWK` to enable mobile money |
| `PAYCHANGU_WEBHOOK_SECRET` | Server-only secret used to validate PayChangu webhook signatures |
| `PAYCHANGU_TEST_MODE` | Set `true` only to exercise sandbox credentials while non-production demo data is enabled |
| `TWILIO_ACCOUNT_SID` | Twilio account for outbound messages |
| `TWILIO_AUTH_TOKEN` | Twilio SDK/signature-validation credential |
| `TWILIO_PHONE_NUMBER` | Provisioned sender number |
| `TWILIO_WEBHOOK_URL` | Exact public HTTPS URL, including path, used for request signature validation |

Deploy the web build and API behind HTTPS at the same origin (the frontend only accesses the API via HTTP). In separate infrastructure, proxy `/api/v1` to the API; the API remains independently usable by other clients. The server binds to loopback by default, suitable for a reverse proxy. Use a fresh PostgreSQL database for production rather than copying sample data. Apply reviewed versioned migrations before application startup and back up existing data first.

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
| POST | `/api/v1/guest-orders/basket` | Public household checkout; requires configured online PayChangu payment; unpaid checkouts are excluded from fulfilment |
| GET | `/api/v1/guest-orders/:id/payment-status` | Checkout ID bearer token; returns sanitized status and verifies pending PayChangu payments server-side |
| GET | `/api/v1/paychangu/operators` | Public when PayChangu is enabled; returns Malawi mobile-money operators |
| POST | `/api/v1/paychangu/initialize` | Checkout ID bearer token; starts payment after household checkout reserves stock |
| POST | `/api/v1/paychangu/webhook` | PayChangu; HMAC-signed webhook verified against the provider before settlement |
| POST | `/api/v1/orders` | Buyer |
| GET | `/api/v1/orders` | Buyer sees own; Farmer sees requests for own listings; Admin sees all |
| PATCH | `/api/v1/orders/:id` | Farmer manages requests for own listings; Admin manages all |
| POST | `/api/v1/webhooks/sms/receive` | Valid Twilio signature; URL-encoded payload |

Example partial baseline:

```json
{"crop_type":"Tomatoes","avg_land_size":12,"status":"draft"}
```

Completion requires `crop_type`, `avg_land_size`, `avg_yield_per_acre` (kg/acre), `avg_duration_days`, `avg_production_cost` (market currency/season), and `status: "complete"`. Current Phase 1 baseline is one primary-crop record per farmer.

Listings require `farmer_id`, `title`, `crop_category`, `available_volume` (kg), `price` (currency/kg), `harvest_date`, `expiration_date` (ISO dates), `shelf_life_days`, and `preservative_used` (boolean); `description` is optional. The server derives a category illustration. Order inquiries require `listing_id`, `volume`, `delivery_location`, and optional `notes`.

Database tables: users, farmer_profiles, historical_baselines, listings, listing_drafts, order_requests, sessions, sms_consents, conversational_state, sms_messages. See `server/db.mjs` for keys, foreign keys, indexes, and constraints.

## Offline behavior

The Currency converter supports EUR, USD, GBP, MWK, ZMW, and ZAR when each quote is available. The header selector converts catalogue, shortlist, detail and farm-listing prices for display; persisted prices and farmer cost-entry forms stay in the listing currency. Rates come from [Frankfurter v2](https://frankfurter.dev/), through `GET /api/v1/exchange-rates`; the API records the actual effective date and source for each quote. It coalesces concurrent requests and caches rates for an hour. Missing or older-than-seven-day quotes are unavailable, while still-current saved quotes are explicitly labeled during an outage. The browser remembers display preference and rates for offline use. Conversions are indicative estimates and do not set payment terms.

Visit online once to install/cache the shell. Previously loaded catalogue requests can be reopened offline. The browser keeps a minimal last-session display snapshot to reopen its own saved draft; this does not authorize server operations. Actual API access is always checked by the server. Baseline and listing drafts are scoped to account + farmer and synchronized on reconnect. Final submissions need connectivity. Multiple-device concurrent draft edits use last-write-wins in Phase 1. Clearing site data removes unsynced drafts. Saved produce is a browser-local shortlist.

## Online payment policy

Checkout quotes are calculated and signed by the server, expire after ten minutes (or earlier when a source rate expires), and are bound to the basket, prices and payment method. Checkout reserves stock with `Awaiting payment` status. Only server-side provider verification moves it to `Confirmed`; unpaid or pending checkouts never enter the fulfilment queue. Pay on delivery and manual bank-transfer checkout are rejected. Manual payment collection cannot bypass mobile-money verification.

Confirm and pay sends one mobile-money request for approval on the buyer's phone. Polling and refresh never send another prompt. Pay again checks the existing attempt and only starts a new charge after a confirmed failure or expiry; a pending or unverified charge is never replaced. The provider controls delivery of phone prompts and messages.

Unpaid checkouts can be cancelled from their status page. Cancellation checks pending provider state, locks the checkout, releases stock once, stops browser polling, and returns the items to the basket. Already-sent provider prompts cannot be recalled: buyers must not approve them after cancellation. If a signed, verified webhook reports a late payment, the order stays Cancelled and appears to staff as refund required, without returning to fulfilment. Paid orders otherwise require a refund process. Settlement always verifies the stored payment quote without recalculating FX.

Mixed-currency baskets retain each line's original price and use USD for the combined total. A current server quote converts that total to whole MWK for PayChangu; the selected display currency remains an estimate. Missing rates never fall back to an invented multiplier. Bank payment remains unavailable until a working integration is configured.

Farmer order requests follow buyer commitment → farmer approval → approved request in the basket → verified online payment. Commitment records the exact unit price, currency, quantity and delivery details with an audit event. Farmers and admins cannot approve an uncommitted request. Existing unpaid requests require the buyer to review and commit before approval. Approval does not charge the buyer or hold stock; stock is reserved atomically when the buyer confirms checkout. Approved requests retain their agreed prices and use their own checkout, without household quantity caps. Repeated checkout calls resume the same active checkout. Cancelling payment returns the approved request to the basket without adding its bulk quantity to household items. Verified settlement updates the original request and its receipt; manual payment records cannot bypass verification.

Run `npm run db:migrate` before starting an existing database with this version (migration 8 adds commitment and checkout links). Buyer routes are `POST /api/v1/orders/:id/commit`, `/withdraw`, `/quote` and `/checkout`; farmer approval uses `PATCH /api/v1/orders/:id`. Commitment and approval are separate from paid fulfilment.

Set `CHECKOUT_QUOTE_SECRET` to the same long random value across app instances, or retain the same existing server credential from which quote signing is derived. Configure PayChangu credentials and its signed webhook before accepting live payments. Presentation mode does not offer real checkout.

## Verification

Checkout status is restored from the saved checkout reference or a `/basket?checkout=...` link, for online payment. Status failures show a retry action and retain the reference; retrying does not place another order. Keep checkout links private because they grant access to the payment status.

Currency rates are fetched through the server, with Frankfurter as the primary provider and ExchangeRate-API filling missing quotes or covering outages. Rates retain their actual dates and sources; expired rates and fixed example rates are never used for settlement. Shared server caching supports fresh browser sessions. The converter retains valid saved rates during outages, while payments require a current applicable quote.

Run `node tests/reliability-ui.mjs` for isolated Chrome and installed Edge checks of fresh-browser conversion, payment-status retries, online checkout, payment gating, refresh recovery, and recovery with browser storage blocked.

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

The Next.js Node server delivers the app and mounts the Express 5 API at `/api/*`: Clerk/local authentication, profile onboarding, role and farm ownership checks, baseline/listing draft persistence, searchable catalogue, produce creation, buyer inquiries, admin order progression, consent records, signed SMS webhook, currency rates, and persistent install sessions. PostgreSQL and SQLite use the same relational schema. `GET /api/v1/health` checks database connectivity. Versioned schema changes run through `npm.cmd run db:migrate` as a deployment step; API startup only verifies that the database is current and fails with a migration instruction if it is not.

A Dockerfile and PostgreSQL Compose services are included. Set `NEXT_PUBLIC_USE_BACKEND=true` at build time and production Clerk keys, an exact HTTPS `APP_ORIGIN`, and long URL-safe migration/runtime database passwords, then use `docker compose up --build -d`. Compose waits for a one-off migration service to apply schema changes and grant data-only privileges to the app's runtime role before starting the app. Terminate HTTPS at your reverse proxy; the app port is bound to host loopback. `TRUST_PROXY_HOPS=1` assumes exactly one trusted proxy; adjust to your real deployment. Runtime credentials are injected into the container and excluded from the image build. Configure Twilio credentials before sending SMS. Back up the PostgreSQL volume and use a shared/edge rate limiter for multiple API instances. Container/PostgreSQL deployment configuration is provided but was not executed on this workstation.

GitHub Actions runs dependency installation, all backend tests, and the production build. Browser checks start a Next.js development server with an isolated SQLite database; `node tests/pwa-ui.mjs` checks first-visit, persistence, installed-state, cross-device account, standalone, and responsive invitation behavior. Run `npm.cmd run test:ui` for Next.js routing, API health, catalogue filtering, and mobile-layout checks.

Presentation validation: `npm.cmd run test:presentation` launches the Next.js app in presentation mode, checks that API routes are unavailable, and checks the dummy catalogue/converter, live Clerk dialogs and phone layout. `node --env-file=.env tests/clerk-registration-ui.mjs` creates a temporary Clerk development test account through the real registration form, verifies email, completes onboarding, signs out/in, and deletes that test account. No real emails are sent. Unit tests check the verified-email admin rule and local profile isolation. Backend integration browser tests (`test:ui`, `test:pwa`, Clerk smoke tests) require `NEXT_PUBLIC_USE_BACKEND=true`; `npm.cmd test` tests backend modules independently.

Clerk configuration: `src/auth-config.ts` contains only the public development instance identifier as a fallback; `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` overrides it. The secret is never bundled. Development-instance restrictions still apply; use production Clerk keys and configured domains when going live. Marketplace demo data remains separate from Clerk accounts.
