# Wirefen
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
User accepted the recommended stack: React and TypeScript frontend, independently served Node REST API, PostgreSQL in production and SQLite for a zero-configuration local environment. The user will specify the launch market; sample South Africa/ZAR is not a launch-market decision.

## Users
Farmers publish available produce and enter historical production baselines, buyers discover supply and request orders, and admins capture data on farmers' behalf over the phone.

## Product Purpose
Phase 1 agricultural marketplace with historical baseline collection and SMS infrastructure readiness. Futures contracting, aggregation, and field verification operations are out of scope.

## Operating Context
Low-bandwidth mobile environments. Offline farmer drafts must survive interruption. Buyers need volume, harvest date, category, and preservative filters. Staff need dense tables and rapid data entry.

## Capabilities and Constraints
EUR/USD currency conversion and an optional converted-price display are supported alongside the configured market currency. Rate dates and fallback state are visible. Stored prices and farmer form inputs remain in the market currency.
Decoupled REST API; E.164 unique phone identities; Farmer, Buyer, Admin RBAC; timestamped SMS consent; partial baseline saves; secured SMS webhook with conversational state; rate limits. PWA caching and offline data entry. Order requests are inquiries, not payments or confirmed purchases.

## Brand Commitments
Wirefen. Minimal, high-contrast farmer UI. User delegated cohesive visual style selection.

## Evidence on Hand
User-supplied Phase 1 technical specification. No real listings, brand assets, accounts, provider credentials, or deployment target supplied. All seeded farms/listings are labeled sample data.

## Open assumptions
South Africa and ZAR are provisional sample-market choices. Production database and SMS credentials must be supplied for deployment. No claim of completed legal compliance or real farmer verification.

## Accessibility & Inclusion
Responsive mobile-first web interface, keyboard access, visible focus, labeled forms, high contrast, reduced motion, and recoverable errors.

## Current delivery mode
Presentation mode is now the default at the user?s request. Clerk handles real login/registration; listings and activity use browser-local dummy data without calling the Wirefen API. The verified email georgechivalo01@gmail.com selects the dummy Admin workspace. New users choose Buyer/Farmer in local profile onboarding. Node backend implementation is retained for later. Enable NEXT_PUBLIC_USE_BACKEND=true and rebuild only when reconnecting deliberately.
