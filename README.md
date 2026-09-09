# IBAM Monitor

A Next.js monitoring dashboard for tracking public signal feeds related to @ibamarief, with scoring, deduplication, Supabase persistence, and web-push alerts.

This project is designed to operate without a paid X API subscription, X Developer account, or Bearer token. The runtime is intentionally source-agnostic and can ingest public feeds from RSS/RSSBridge-compatible sources, Zamantika-style mirrors, and other public-source adapters.

## Project goal

The application monitors public content for patterns that match the project’s threat-signaling model, such as:
- key release or archive-related posts
- decryption / passphrase / recovery signals
- suspicious public announcements
- repeated mentions in public feeds

When a post is considered relevant, it is:
1. normalized and deduplicated
2. scored for severity
3. stored in Supabase
4. shown in the dashboard
5. sent as a push notification when the alert is medium or high severity

---

## What this project includes

- Next.js 16 App Router dashboard
- server-side monitor workflow in TypeScript
- multiple public-source adapters
- Supabase-backed persistence layer
- manual trigger and cron-trigger endpoints
- dashboard password protection
- browser push notifications via Web Push / VAPID
- scoring heuristics and dedupe logic
- no direct dependency on the paid X API in the active path

---

## Architecture

The app follows this flow:

Browser / dashboard → Next.js API routes → monitor engine → source adapters → score + dedupe → Supabase → dashboard + push notifications

Core modules:
- `lib/monitor.ts` — orchestrates fetching, dedupe, scoring, persistence, and push dispatch
- `lib/db.ts` — Supabase client and database helpers
- `lib/scoring.ts` — keyword-based severity scoring
- `lib/push.ts` — Web Push delivery and VAPID checks
- `app/api/cron/check/route.ts` — cron-safe monitor check endpoint
- `app/api/cron/trigger/route.ts` — manual trigger endpoint protected by dashboard password
- `app/api/posts/route.ts` — returns stored posts to the frontend
- `app/api/push/subscribe/route.ts` — subscription registration
- `app/api/push/test/route.ts` — push test endpoint

---

## Supported monitoring model

The monitor is intentionally designed around an adapter interface so it can work with more than one public source type.

```ts
export interface MonitorSource {
  name: string;
  fetchLatestPosts(): Promise<MonitorPost[]>;
}
```

Currently the project supports or is compatible with:
- RSS feed sources
- RSSBridge feeds
- Zamantika-style public profile mirrors
- XSyndication-style public syndication sources

This keeps the monitor functional even when any one source is unavailable or blocked.

---

## Source-agnostic strategy

The app does not depend on a single vendor endpoint. Instead, it can be configured with:
- `MONITOR_ENABLE_RSS`
- `MONITOR_ENABLE_RSSBRIDGE`
- `MONITOR_ENABLE_ZAMANTIKA`
- `MONITOR_ENABLE_X_SYNDICATION`

Each enabled source is treated independently. If one source fails, the rest still continue and the system logs the failure without breaking the entire run.

---

## Dashboard behavior

The dashboard in `app/page.tsx` is designed to:
- show recent posts
- filter by query text
- display severity breakdown
- trigger a manual sync via the Sync now button
- allow Web Push opt-in via Enable phone alerts
- require a dashboard password before secure actions

The UI is intentionally preserved and not replaced; the project keeps the existing frontend design while restoring the backend functionality.

---

## Database layer

The application uses Supabase Postgres as the persistence layer.

Required tables:
- `monitor_posts`
- `monitor_state`
- `push_subscriptions`

The DB layer validates schema at runtime and uses the following patterns:
- `monitor_state` keyed by `key` and `value`
- `monitor_posts` keyed by `id`
- `push_subscriptions` stored by `endpoint`

The database contract is enforced in `lib/db.ts` and must match the actual Supabase schema used by the app.

---

## Scoring and deduplication

The score engine in `lib/scoring.ts` looks for relevance signals such as:
- key / key release
- decryption
- passphrase
- archive release
- recovery
- SHA-256 / hash terms
- magnet links
- suspicious or emergency wording

The monitor then:
- normalizes text
- creates a stable identity for each post
- removes duplicates across the same or multiple sources
- stores only brand-new items

This prevents repeated alerts from the same content appearing multiple times.

---

## Notification flow

The app sends push notifications only for new `MEDIUM` and `HIGH` severity posts.

Flow:
1. check source returns items
2. dedupe and score
3. persist new records
4. build title/body from the alert
5. send to all valid push subscriptions
6. skip gracefully if VAPID config is missing or placeholder values are used

This behavior is intentionally safe and does not crash the app when browser notification config is absent.

---

## Security and secret handling

This project follows strict secret hygiene:
- `CRON_SECRET` stays server-side only
- `SUPABASE_SECRET_KEY` is never exposed in browser code
- `DASHBOARD_PASSWORD` is checked on the server
- VAPID private keys are only used in server-side push delivery
- secrets are not logged or returned in API responses
- no public API token is required in the active monitoring path

Important: the browser should never receive values like `CRON_SECRET`, `SUPABASE_SECRET_KEY`, or VAPID private keys.

---

## Environment variables

Example variables used by the runtime:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
CRON_SECRET=your-server-side-cron-secret
DASHBOARD_PASSWORD=your-dashboard-password
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:alerts@example.com
MONITOR_ENABLE_RSS=true
MONITOR_FEED_URLS=https://example.com/feed.xml
MONITOR_ENABLE_RSSBRIDGE=false
RSSBRIDGE_FEED_URLS=https://example.com/rssbridge
MONITOR_ENABLE_ZAMANTIKA=true
ZAMANTIKA_PROFILE_API_URL=https://example.com/profile
MONITOR_ENABLE_X_SYNDICATION=false
EXTRA_KEYWORDS=ibamarief,key,release,passphrase
```

Notes:
- `MONITOR_FEED_URLS` and similar values are comma-separated lists
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` must be valid; placeholder values make push opt-in skip gracefully
- if no valid configured source exists, the app returns a clear configuration error instead of crashing

---

## Local development

```bash
npm install
npm run dev
```

If you need to generate VAPID keys locally:

```bash
npx web-push generate-vapid-keys
```

Then put those generated values into `.env.local`.

---

## Production deployment

This app is built for Vercel-style deployment, with cron/server routes available through the Next.js app runtime.

Typical production flow:
- deploy app to Vercel
- configure environment variables in Vercel dashboard
- use cron endpoint or external scheduler to call the monitor
- configure Supabase and push settings

`vercel.json` remains the deploy-time hook for scheduled cron usage.

---

## API endpoints

- `GET /api/posts` — returns posts in the dashboard feed
- `POST /api/cron/check` — cron-protected check route
- `POST /api/cron/trigger` — manual dashboard-trigger endpoint
- `POST /api/push/subscribe` — registers browser push subscriptions
- `GET /api/push/subscribe?key=public` — returns the public VAPID key
- `POST /api/push/test` — sends a test push if configured

---

## Operational notes

- A source failure is isolated and logged without crashing the full run.
- Duplicate posts are intentionally ignored by deduplication.
- Empty or malformed upstream data is handled gracefully.
- The app keeps the existing dashboard UX and only restores the monitoring backend behavior.
- Monitoring remains free-tier friendly and not tied to the paid X API path.

---

## Testing

The project includes a focused mock-driven integration test for the monitor engine:
- `tests/monitor.integration.test.ts`

This validates:
- new post ingestion
- cross-source dedupe
- repeated run suppression
- severity-driven notifications
- source failure isolation

You can run it with:

```bash
npx tsx tests/monitor.integration.test.ts
```

The project also builds successfully with:

```bash
npm run build
```

---

## Summary

This repository is a public-source monitoring system for tracking relevant public posts around @ibamarief, with a preserved dashboard, Supabase storage, severity scoring, public-source adapters, and push alerts. It intentionally avoids paid X API dependencies while keeping the monitor engine, dedupe logic, and notification behavior consistent and production-safe.
