# Market-Data (Price) Access Contract — Plan Brief

> Full plan: `context/changes/market-data-access-contract/plan.md`

## What & Why

Wire a stock-price source behind a **thin, cached, provider-agnostic internal adapter** so every later slice (S-01 holding value, S-04 company page, S-07 overview) consumes one stable `getQuotes()` contract instead of an external API — and the app **stays usable when that source is down** (FR-003, the ~15-min freshness NFR, and the "usable despite a source outage" guardrail / US-01 acceptance criteria). This is foundation slice **F-02**.

## Starting Point

F-01 shipped the migration workflow, the per-account RLS template, committed generated types, and the pgTAP + CI verification path. Supabase is the only durable store wired (no KV/Cache/service-role on Cloudflare), and there is **no TypeScript test runner yet** — only pgTAP for the DB.

## Desired End State

A `src/lib/services/prices.ts` service exposes `getQuotes(symbols) => Map<symbol, PriceResult>`: it serves a cached quote within a 15-minute TTL, otherwise fetches the source and upserts a durable snapshot, and on a source failure returns the last-known value flagged `stale` (or `unavailable` if never seen) — **never throwing**. A durable `price_snapshots` table backs it, a Vitest suite proves it offline in CI, and an on-demand live smoke checks real GPW + US quotes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Price source | **Yahoo `v8/chart`** (free, unofficial), provider-agnostic | The only *free* source confirmed to cover the user's GPW/Warsaw **and** US tickers — no free official API does. | Plan |
| ~~stooq for price~~ | Corrected → stooq is for **news** (S-04) | User clarified stooq was meant for the news scraper, not price. | Plan |
| Cache store | **Supabase `price_snapshots` table** | Only durable option that survives Cloudflare cold-starts + a source outage without new infra/secret. | Plan |
| Cache RLS shape | **Shared reference table** (no `user_id`) | Prices are public data; a deliberate, documented departure from the per-account template. | Plan |
| Contract shape | **Batch-first `getQuotes(symbols[])`** | Overview/portfolio fetch many tickers at once; one cache round-trip, one place for partial-failure handling. | Plan |
| Degradation | **Last-known + `stale` flag, never throw**; `unavailable` if never cached | Implements the outage guardrail + US-01 AC directly. | Plan |
| Freshness | **Serve cache within ~15-min TTL**, fall back on failure | Meets the NFR, minimizes calls to an unofficial (ban-prone) source. | Plan |
| Symbol mapping | Adapter ships `toYahooSymbol(ticker, market)`; **S-01 owns market capture** | Provider-symbol knowledge lives in the adapter; market capture is S-01's per the roadmap. | Plan |
| Delivery surface | **Server-side lib module only** (no HTTP route) | Smallest surface; nothing needs client-side price fetching yet. | Plan |
| Test runner | **Add Vitest**, mock `fetch` + injected store | Establishes the TS test foundation; deterministic, offline CI. | Plan |
| Verify gate | **Unit CI + separate on-demand live smoke** | Keeps CI deterministic; smoke catches a real Yahoo format change without reddening PRs. | Plan |

## Scope

**In scope:** durable `price_snapshots` table + RLS + pgTAP; provider-agnostic price service (cache/TTL/degradation); Yahoo provider; `toYahooSymbol` helper; `PriceQuote`/`PriceResult` types; Vitest + unit tests + CI wiring; live smoke; docs.

**Out of scope:** UI / holdings integration / gain-loss math (S-01); any HTTP route; news + stooq (S-04); currency/FX conversion; background/cron refresh (parked); multi-provider fallback; KV/Cache/service-role.

## Architecture / Approach

`consumer → getQuotes(symbols) → [read snapshots (1 query)] → fresh? return : fetch PriceProvider (Yahoo, concurrent) → upsert snapshot → return; on failure → return stale snapshot / unavailable`. The service is a **factory with injected `{ supabase, provider, ttlMs, now }`**, so both the DB cache and the network are mockable in plain Vitest — the design choice that makes CI deterministic and the source swappable to a paid API later without touching consumers.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Durable price-cache table | `price_snapshots` migration + shared-reference RLS + pgTAP + regenerated types | Getting the *shared* RLS shape right (departs from the F-01 per-user template) |
| 2. Price access contract | Vitest + service + Yahoo provider + symbol helper + unit tests | Degradation/TTL semantics; parsing an unofficial, changeable Yahoo shape |
| 3. CI enforcement, live smoke & docs | `npm run test` in CI, excluded live smoke, `CLAUDE.md` conventions | Keeping the live source out of CI so outages don't redden PRs |

**Prerequisites:** F-01 done (it is). Local Supabase (Docker) for the DB loop. No external accounts or secrets needed (Yahoo is keyless).
**Estimated effort:** ~2–3 focused sessions across the 3 phases.

## Open Risks & Assumptions

- **Yahoo is unofficial** — it can rate-limit (`429`/`999`) or change its response shape without notice. Mitigated by the cache + never-throw degradation and the on-demand smoke; a hard break is a localized `PriceProvider` swap, not a rework.
- **Shared cache is writable by any authenticated user** — acceptable for public data at single-user MVP scale (snapshots are overwritten on next fetch); revisit if the app opens up.
- **Assumes the app depends on Supabase being up anyway** — storing last-known price there is coherent because if Supabase is down the whole app is down.

## Success Criteria (Summary)

- A later slice imports `getQuotes` and gets a live GPW **or** US price, cached and fresh within ~15 minutes.
- When Yahoo is unavailable, the contract returns the last-known value flagged `stale` rather than throwing — the screen never breaks.
- `npm run test` (offline) and `npx supabase test db` both gate every PR; `npm run test:smoke` confirms the real source on demand.
