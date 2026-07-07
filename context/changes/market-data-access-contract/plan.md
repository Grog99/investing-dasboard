# Market-Data (Price) Access Contract — Implementation Plan

## Overview

This is the second foundation slice (F-02). It stands up a **resilient, cached, provider-agnostic price adapter** behind a single stable internal contract (`getQuotes()`), so every later slice that needs a stock price (S-01 holding value/gain, S-04 company page, S-07 overview) consumes one mockable internal contract instead of talking to an external source directly — and the app **stays usable when that source is down** (the "usable despite a source outage" guardrail, US-01 acceptance criteria).

The point is not Yahoo per se — it is establishing the **contract shape, the durable last-known-value cache, the graceful-degradation semantics, and the TypeScript test-runner foundation** that make price data safe to depend on. The default source is **Yahoo Finance `v8/finance/chart`** (the only genuinely free source confirmed to cover the user's GPW/Warsaw holdings *and* US tickers), wired behind a `PriceProvider` interface so a paid official API can later replace it without touching any consumer.

> **Source correction (2026-07-07):** The roadmap/`change.md` originally recorded **stooq.pl** as the price source. In planning it was corrected: stooq is earmarked for the **news** feed (an S-04 concern, out of scope here), and research confirmed **no free *official* API covers GPW** (Twelve Data, Finnhub, EODHD all paywall Warsaw; Alpha Vantage GPW coverage undocumented). The only free GPW+US source is unofficial **Yahoo `v8/chart`** — which is exactly why this foundation's cache + degradation layer exists. See "Migration Notes" for the roadmap follow-up.

## Current State Analysis

- **F-01 is done and provides the pattern to reuse.** `supabase/migrations/20260706161102_create_holdings.sql` establishes the migration workflow, the per-account RLS template, the `moddatetime` `updated_at` trigger, committed generated types (`src/db/database.types.ts`), and the pgTAP + CI verification path (`supabase/tests/`, `.github/workflows/database-tests.yml`).
- **Runtime is Cloudflare Workers** (`workerd`, `nodejs_compat` on per `wrangler.jsonc`). Outbound `fetch` is available. **No KV namespace, no Cache API, and no service-role key are wired** — the only ASSETS binding exists. Any durable cache means Supabase (already wired) or new infra.
- **Supabase is the only durable store currently in place.** `src/lib/supabase.ts` returns a typed `SupabaseClient<Database> | null` (null when unconfigured). It is authenticated as the current user via SSR cookies.
- **There is no TypeScript test runner.** Only pgTAP exists (for the DB). CI (`.github/workflows/ci.yml`) runs `lint` + `build` on push/PR to `main`; `database-tests.yml` runs pgTAP. Adding a TS runner (Vitest) is part of this foundation, as pgTAP was for F-01.
- **`holdings.ticker` is free text with no market column.** F-01 deliberately deferred GPW-vs-US ticker reconciliation to S-01. Yahoo needs `.WA` for GPW (e.g. `CDR.WA`, PLN) and a bare symbol for US (`AAPL`, USD) — so provider-symbol formatting is F-02's concern, but *capturing which market a user's ticker belongs to* stays S-01's.
- **`src/types.ts`** currently exports only `Holding`/`HoldingInsert` derived from generated types — the extension point for new domain/DTO types.

### Key Discoveries:

- **No free official API covers the user's GPW holdings** (verified against current docs). Yahoo `v8/finance/chart/{symbol}?interval=1d&range=1d` is the only free source returning GPW+US last price with currency + timestamp in one keyless JSON call. Its `v7/quote` sibling now returns 401 (crumb/cookie wall) — `v8/chart` must be the endpoint. Response path: `chart.result[0].meta.regularMarketPrice`, `.currency`, `.regularMarketTime` (unix seconds), `.exchangeName`; `chart.error` non-null signals failure.
- **Yahoo blocks empty/bot User-Agents.** The provider must send a browser-like `User-Agent` header and expect occasional `429`/`999` — absorbed by the cache + degradation layer.
- **Market prices are public, non-user data**, so the cache table is a **shared reference table** (keyed by `symbol`, no `user_id`) — a deliberate, documented departure from F-01's `auth.uid() = user_id` template. The cross-account-privacy guardrail governs private holdings/notes, not public quotes.
- **Anon denial comes from the grant, not a policy.** As in F-01, granting table privileges only to `authenticated` (never `anon`) makes anon hit a `42501` permission error before RLS even applies — the pgTAP test asserts this.

## Desired End State

Running `npx supabase db reset` applies a `price_snapshots` migration (shared-reference table, RLS enabled, `authenticated`-only grants, `updated_at` trigger). `npx supabase test db` passes a pgTAP suite proving any authenticated user can read/upsert snapshots, a *second* authenticated user sees the *same* snapshot (the shared-reference intent, inverse of the holdings isolation test), and anon is denied. A `src/lib/services/prices.ts` service exposes `getQuotes(symbols) => Promise<Map<symbol, PriceResult>>` (and a `getQuote` convenience) that: serves a cached quote when younger than a 15-minute TTL; otherwise fetches Yahoo, upserts the snapshot, and returns it fresh; on source failure returns the last-known snapshot flagged `stale: true`, or an explicit `unavailable` result if a symbol was never cached — and **never throws for a source issue**. `npm run test` runs a deterministic Vitest suite (mocked `fetch` + injected store) green in CI, and `npm run test:smoke` hits real Yahoo for one GPW + one US symbol on demand (never in CI).

Verify by: `npx supabase db reset` + `npx supabase test db` (green) + `npm run test` (green) + `npm run build` (type-checks against the contract) + a PR showing CI (lint+build+test) green. A later slice needing prices imports `getQuotes` and gets caching, freshness, and outage-resilience for free.

## What We're NOT Doing

- **No UI, no holdings integration, no gain/loss math.** Consuming the contract to show a holding's value is S-01. F-02 ships only the internal service + its verification.
- **No HTTP/API route.** The adapter is a server-side lib module only; a browser-facing `/api/prices` route is added by whichever later slice needs client-side fetching.
- **No news, no stooq.** Company news (and its source) is S-04 per the roadmap. stooq is not touched here.
- **No currency conversion / FX.** The adapter passes through the provider's native currency (PLN for GPW, USD for US). Reconciling a holding's buy-price currency against the quote currency is an S-01 concern; no multi-currency math here.
- **No background/scheduled refresh (Cloudflare Cron).** Parked in the roadmap. F-02 fetches on demand (on view) with the durable cache; cron is promoted to a foundation only if/when needed.
- **No multi-provider fallback chain.** One provider (Yahoo) behind a swappable interface. A second source (e.g. stooq as a price fallback, or a paid API) is a later, localized change — the interface makes it cheap, but it is out of scope now.
- **No ticker→market capture UI or heuristic.** F-02 ships a `toYahooSymbol(ticker, market)` helper; deciding how the user specifies a market is S-01.
- **No KV / Cache API / service-role key.** Durability uses the already-wired Supabase store; no new Cloudflare binding or secret is introduced.

## Implementation Approach

Three phases in deliberate risk order, mirroring F-01: **build the durable store → build and prove the contract → enforce and operationalize.** Phase 1 lands the cache table (the service can't degrade without a durable last-known value) and proves its deliberately-different RLS shape. Phase 2 builds the provider-agnostic service and the Yahoo provider *together with* the Vitest suite that is its verification path (the roadmap ties the mockable adapter to testability). Phase 3 enforces the tests in CI, adds the on-demand live smoke, and documents the conventions. Each phase is independently verifiable.

The load-bearing design choice is **dependency injection**: the service is a factory taking `{ supabase, provider, ttlMs, now }`, so both the network (provider) and the cache (Supabase client) are mockable in plain Vitest without a live DB or live Yahoo — which is what makes CI deterministic and every downstream price consumer testable.

## Critical Implementation Details

- **Shared-reference RLS is intentional and inverts the F-01 template.** `price_snapshots` has no `user_id`; all `authenticated` users read and upsert the same rows. This is safe *because prices are public data* — asserting a second user sees the first user's snapshot is the test that documents the intent. Do not copy the `auth.uid() = user_id` policy here.
- **Upsert requires both `insert` and `update` policies.** `insert ... on conflict (symbol) do update` exercises both RLS paths; grant and policy both `select, insert, update` to `authenticated` (no `delete` needed, no grant to `anon`).
- **`updated_at` is the TTL clock.** The `moddatetime` trigger stamps `updated_at` on every upsert, so freshness = `now - updated_at <= ttlMs`. `as_of` separately stores the provider's market timestamp (`regularMarketTime`). Do not add a redundant `fetched_at`.
- **Yahoo needs a browser `User-Agent` and defensive parsing.** Treat any of: non-200 status, `chart.error != null`, or missing `result[0].meta.regularMarketPrice` as a fetch failure that triggers degradation — never let a shape change throw out of the service.
- **The live smoke test must be excluded from the default/CI run** (e.g. an `exclude` glob for `*.smoke.test.ts` in `vitest.config.ts`), run only via `npm run test:smoke`. A real Yahoo outage or format change must not redden unrelated PRs.

---

## Phase 1: Durable price-cache table

### Overview

Create the `price_snapshots` shared-reference cache table with its deliberately-permissive-but-anon-denied RLS and the `updated_at` audit trigger, prove the access shape with a pgTAP suite, and regenerate + commit the DB types plus curated snapshot types.

### Changes Required:

#### 1. Price-snapshots migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_price_snapshots.sql` (generate with `npx supabase migration new create_price_snapshots`)

**Intent**: Create the durable last-known-value cache as a **shared reference table** (public market data, keyed by symbol, no per-user ownership), enable RLS, grant + policy `select/insert/update` to `authenticated` only, and add the `updated_at` trigger that doubles as the TTL clock.

**Contract**: Table `public.price_snapshots` with columns:
- `symbol text primary key` (the provider symbol, e.g. `CDR.WA`, `AAPL`)
- `price numeric(20, 8) not null`
- `currency text not null`
- `as_of timestamptz not null` (provider market timestamp)
- `source text not null default 'yahoo'` (provenance for later multi-provider)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Plus the `moddatetime` trigger. The RLS block is load-bearing and **intentionally different from the F-01 template** — pin it exactly:

```sql
alter table public.price_snapshots enable row level security;

grant select, insert, update on public.price_snapshots to authenticated;

create policy "price_snapshots_select_all" on public.price_snapshots
  for select to authenticated using (true);
create policy "price_snapshots_insert_any" on public.price_snapshots
  for insert to authenticated with check (true);
create policy "price_snapshots_update_any" on public.price_snapshots
  for update to authenticated using (true) with check (true);
```

(No grant to `anon`; no `delete` grant. `using (true)` = shared public cache, deliberately not `auth.uid() = user_id`.)

#### 2. Shared-reference access-shape pgTAP test

**File**: `supabase/tests/002-price-snapshots-rls-test.sql`

**Intent**: Assert the deliberate access shape: RLS on; an authenticated user can insert + select + update a snapshot; a *second* authenticated user reads the *same* snapshot (proving shared-reference intent — the inverse of the holdings isolation test); anon is denied at the privilege stage.

**Contract**: A single pgTAP transaction using `supabase_test_helpers`. Must cover, at minimum: `tests.rls_enabled('public','price_snapshots')`; user A upserts a row and sees it; user B `select` returns that **same** row (`results_eq`, not `is_empty` — the key contrast with `001-holdings-rls-test`); anon (`tests.clear_authentication()`) `throws_ok(..., '42501')` on select and insert. Follow the style of `supabase/tests/001-holdings-rls-test_test.sql`.

#### 3. Regenerated types + curated snapshot types

**File**: `src/db/database.types.ts` (regenerated, committed) and `src/types.ts`

**Intent**: Regenerate the committed DB types so the build type-checks against `price_snapshots`, and expose curated `PriceSnapshot`/`PriceSnapshotInsert` types derived from them (never hand-edited).

**Contract**: Run `npm run gen:types`. Add to `src/types.ts`: `PriceSnapshot = Tables<"price_snapshots">` and `PriceSnapshotInsert = TablesInsert<"price_snapshots">`, following the existing `Holding` pattern.

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly: `npx supabase db reset` completes without error
- [ ] RLS enabled with the three `authenticated` policies (visible in Studio / `pg_policies`)
- [ ] Access-shape suite passes: `npx supabase test db` (all pgTAP assertions green)
- [ ] Types regenerate + build type-checks: `npm run gen:types && npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] In Studio, `price_snapshots` shows RLS enabled with exactly three per-operation policies and no `anon` grant
- [ ] Temporarily narrowing a policy to `auth.uid() = symbol::uuid` (nonsense) and re-running `npx supabase test db` makes the shared-read assertion fail — confirming the test detects a broken shared-reference shape (then restore)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes live in the `## Progress` section at the bottom.

---

## Phase 2: Price access contract (service + provider + Vitest)

### Overview

Add Vitest, then build the provider-agnostic price service, the Yahoo provider, and the symbol helper — together with the deterministic unit tests that are the contract's verification path. No live network calls in this phase's automated verification.

### Changes Required:

#### 1. Vitest toolchain

**File**: `package.json` (dep + scripts) and `vitest.config.ts` (new)

**Intent**: Establish the TypeScript test-runner foundation every later service reuses, configured to run offline and to exclude the live smoke file from the default run.

**Contract**: Add `vitest` (dev dependency). Add scripts `"test": "vitest run"` and `"test:smoke": "vitest run --dir src/lib/services --testNamePattern smoke"` (or a dedicated project/glob that targets only `*.smoke.test.ts`). `vitest.config.ts` uses the `node` environment, enables globals, and **excludes `**/*.smoke.test.ts`** from the default run. Ensure test files are covered by the TS project so typed-lint stays green (see Addendum-style note if `eslint.config.js`/`tsconfig` needs a test glob).

#### 2. Provider interface + Yahoo provider

**File**: `src/lib/services/providers/yahoo.ts` (and a small `PriceProvider` interface, co-located or in `src/lib/services/providers/types.ts`)

**Intent**: Isolate all Yahoo-specific knowledge (endpoint, headers, response shape) behind a narrow interface so the source is swappable and independently testable.

**Contract**: `interface PriceProvider { fetchQuote(providerSymbol: string): Promise<RawQuote> }` where `RawQuote = { price: number; currency: string; asOf: Date }`. `yahooProvider` implements it by fetching `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d` with a browser `User-Agent`, reading `chart.result[0].meta.{regularMarketPrice,currency,regularMarketTime}`. Any of non-200 / `chart.error` / missing price → throw a typed provider error (the *service* converts that into degradation; the provider itself may throw). Base URL overridable for tests.

#### 3. Symbol helper

**File**: `src/lib/services/symbols.ts`

**Intent**: Own the provider-symbol formatting (the one piece of provider knowledge S-01 legitimately needs), while leaving market *capture* to S-01.

**Contract**: `type Market = "GPW" | "US"` and `toYahooSymbol(ticker: string, market: Market): string` → GPW appends `.WA` (uppercased base), US returns the bare uppercased ticker. Documented as the mapping S-01 calls once it captures a holding's market.

#### 4. Price service (cache + TTL + degradation orchestration)

**File**: `src/lib/services/prices.ts`

**Intent**: The stable internal contract every price consumer depends on — batch-first, cache-backed, freshness-bounded, outage-resilient, and never-throwing for a source issue.

**Contract**: A factory `createPriceService({ supabase, provider, ttlMs = 15*60*1000, now = () => new Date() })` returning `{ getQuotes, getQuote }`.

- `getQuotes(symbols: string[]): Promise<Map<string, PriceResult>>`
- `getQuote(symbol: string): Promise<PriceResult>` (thin wrapper)

Behavior: one `select … where symbol in (symbols)` reads all snapshots; symbols with a snapshot younger than `ttlMs` return fresh (`stale: false`) without a network call; stale/missing symbols are fetched from `provider` concurrently (`Promise.allSettled`); each success upserts (`on conflict (symbol) do update`) and returns fresh; each failure returns the last-known snapshot as `stale: true`, or `{ status: "unavailable", symbol }` if never cached. **A provider/network failure must never reject the returned promise.**

The result type is a signature contract later phases/slices depend on — pin it (add to `src/types.ts`):

```ts
export interface PriceQuote {
  symbol: string;
  price: number;
  currency: string;
  asOf: Date;      // provider market timestamp
  stale: boolean;  // true when served past TTL / on source failure
  source: string;  // e.g. "yahoo"
}
export type PriceResult =
  | { status: "ok"; quote: PriceQuote }
  | { status: "unavailable"; symbol: string };
```

#### 5. Deterministic unit tests

**File**: `src/lib/services/prices.test.ts`, `src/lib/services/providers/yahoo.test.ts`, `src/lib/services/symbols.test.ts`

**Intent**: Prove the contract's behavior offline with a mocked `fetch` and an injected fake store — the regression net every downstream slice inherits.

**Contract**: Cover, at minimum — fresh cache hit skips the provider; stale snapshot triggers a fetch + upsert and returns fresh; provider failure with a prior snapshot returns `stale: true` (no throw); provider failure with no prior snapshot returns `unavailable`; a batch with one good + one failing symbol returns a mixed map (partial failure); TTL boundary (exactly at `ttlMs`). `yahoo.test.ts` parses a captured `v8/chart` payload and asserts error/missing-field handling. `symbols.test.ts` asserts GPW `.WA` and US bare mapping.

### Success Criteria:

#### Automated Verification:

- [ ] Unit suite passes: `npm run test` (all Vitest assertions green, offline)
- [ ] Tests cover fresh/stale/failure/unavailable/partial-batch/TTL-boundary (grep the suite for each case)
- [ ] Build/type-checks against the contract: `npm run build`
- [ ] Linting passes (including test files): `npm run lint`

#### Manual Verification:

- [ ] In an editor, a consumer calling `getQuotes(["AAPL"])` gets a typed `Map<string, PriceResult>` and the discriminated union narrows correctly on `status`
- [ ] Forcing the provider mock to throw in a test with a seeded stale snapshot yields `stale: true` (not a rejection), confirming the degradation path

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 3: CI enforcement, live smoke & conventions doc

### Overview

Enforce the unit suite on every PR, add an on-demand live smoke that exercises real Yahoo without coupling CI to it, and document the new commands + conventions.

### Changes Required:

#### 1. Wire Vitest into CI

**File**: `.github/workflows/ci.yml`

**Intent**: Fail a PR that breaks the price contract, keeping the existing offline/deterministic CI job (no Supabase secrets, no Docker needed for unit tests).

**Contract**: Add a `- run: npm run test` step to the existing `ci` job (after `npm run build`). No new secrets; the unit suite is fully mocked. (pgTAP continues to run in the separate `database-tests.yml`.)

#### 2. Live smoke test (excluded from CI)

**File**: `src/lib/services/prices.smoke.test.ts`

**Intent**: Give a real-world confidence check + an early-warning for a Yahoo format change, runnable on demand, never in CI.

**Contract**: A Vitest file (matched by the `*.smoke.test.ts` exclude glob so `npm run test`/CI skip it) that runs the real `yahooProvider` against one GPW symbol (`CDR.WA`) and one US symbol (`AAPL`), asserting a positive numeric price and a non-empty currency. Invoked via `npm run test:smoke`.

#### 3. Conventions documentation

**File**: `CLAUDE.md`

**Intent**: Record the workflow and the two non-obvious conventions (the price-adapter contract and the shared-reference-table RLS exception) so future work follows them.

**Contract**: Add to Commands: `npm run test` (Vitest unit suite) and `npm run test:smoke` (live price smoke). Add a short note: prices are consumed only via `src/lib/services/prices.ts` `getQuotes` (cached, 15-min TTL, degrades to `stale`/`unavailable`, never throws); the source lives behind `PriceProvider` (Yahoo default, swappable); `price_snapshots` is a **shared reference table** (public data, `authenticated` read/upsert, no `user_id`) — a deliberate, documented exception to the per-account RLS template.

### Success Criteria:

#### Automated Verification:

- [ ] CI (lint + build + test) runs and passes on a PR
- [ ] `npm run test` in CI does **not** execute the smoke file (CI log shows the smoke test skipped/excluded)
- [ ] `npm run test:smoke` runs the live Yahoo check locally and passes (GPW + US)

#### Manual Verification:

- [ ] CI `test` step appears as a check on the PR and is green
- [ ] Temporarily pointing the smoke's provider base URL at a bad host makes `npm run test:smoke` fail but leaves `npm run test` green — confirming the split holds
- [ ] `CLAUDE.md` Commands + conventions note read correctly and match the shipped module

**Implementation Note**: After automated verification passes, pause for the human to confirm the CI-green + smoke-split checks before considering F-02 complete.

---

## Testing Strategy

### Unit Tests (Vitest, offline):

- Fresh cache hit within TTL returns without calling the provider
- Stale/missing symbol fetches the provider, upserts, returns fresh
- Provider failure with a prior snapshot returns `stale: true` (never rejects)
- Provider failure with no prior snapshot returns `{ status: "unavailable" }`
- Mixed batch (one good, one failing) returns a correct mixed map
- TTL boundary behavior (at exactly `ttlMs`)
- Yahoo provider parses a captured payload; handles non-200 / `chart.error` / missing price
- `toYahooSymbol` maps GPW→`.WA`, US→bare

### Access-shape Tests (pgTAP):

- RLS enabled on `price_snapshots`
- Authenticated user upserts + selects; a second authenticated user reads the **same** row (shared-reference intent)
- Anon denied (`42501`) on select and insert

### Integration / Live:

- `npx supabase db reset` + `npx supabase test db` (DB loop)
- `npm run test:smoke` — real Yahoo, one GPW + one US symbol (on demand, not CI)

### Manual Testing Steps:

1. `npx supabase start && npx supabase db reset` — confirm `price_snapshots` exists with RLS + 3 policies.
2. `npx supabase test db` — confirm the shared-reference suite passes; break the shared-read policy and confirm it fails; restore.
3. `npm run test` — confirm the offline suite is green and the smoke file is excluded.
4. `npm run test:smoke` — confirm live GPW + US quotes return positive prices with currencies.
5. `npm run build` — confirm consumers type-check against `PriceResult`.

## Performance Considerations

Negligible at MVP scale (single user, low QPS, a handful of symbols). The 15-minute TTL means a page view typically costs one indexed `symbol`-keyed `select` and zero external calls; only stale/missing symbols hit Yahoo, fanned out concurrently. The `symbol` primary key covers the batch `in (…)` read. The shared cache warms once for all users. No further tuning warranted; if background refresh is ever added (parked), it slots in behind the same contract.

## Migration Notes

- **Roadmap follow-up:** `context/foundation/roadmap.md` item F-02 still names **stooq.pl** as the price source and folds news into S-04. After this plan lands, F-02's description should be updated to **Yahoo `v8/chart` (provider-agnostic adapter)**, noting stooq remains the S-04 news candidate. `change.md` Notes has been updated with the correction.
- **Local-first**, as F-01: author and verify the migration against local Docker Supabase (`db reset`); applying to the hosted project is the documented manual `supabase db push`.
- **No new secret or Cloudflare binding** is introduced — Yahoo needs no API key, and durability reuses the wired Supabase store. Swapping to a paid provider later would add a `PriceProvider` impl and (if keyed) one `astro:env/server` secret behind the existing interface.

## References

- Roadmap item F-02: `context/foundation/roadmap.md` (Foundations → F-02)
- PRD FR-003 (live price), ~15-min freshness NFR, "usable despite a source outage" guardrail, US-01 acceptance criteria: `context/foundation/prd.md`
- Pattern to reuse (RLS block, trigger, pgTAP style, CI): `supabase/migrations/20260706161102_create_holdings.sql`, `supabase/tests/001-holdings-rls-test_test.sql`, `.github/workflows/ci.yml`
- Typed client + curated types extension point: `src/lib/supabase.ts`, `src/types.ts`
- F-01 plan (three-phase cadence this mirrors): `context/archive/2026-07-06-domain-data-model-and-rls/plan.md`
- Yahoo `v8/finance/chart` (verified live for `CDR.WA` PLN and `AAPL` USD): `https://query1.finance.yahoo.com/v8/finance/chart/CDR.WA`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Durable price-cache table

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` completes without error — e976ffe
- [x] 1.2 RLS enabled with the three `authenticated` policies (Studio / `pg_policies`) — e976ffe
- [x] 1.3 Access-shape suite passes: `npx supabase test db` — e976ffe
- [x] 1.4 Types regenerate + build type-checks: `npm run gen:types && npm run build` — e976ffe
- [x] 1.5 Linting passes: `npm run lint` — e976ffe

#### Manual

- [x] 1.6 Studio shows RLS enabled with exactly three per-operation policies and no `anon` grant — e976ffe
- [x] 1.7 Breaking the shared-read policy makes the shared-read assertion fail (test detects it), then restored — e976ffe

### Phase 2: Price access contract (service + provider + Vitest)

#### Automated

- [x] 2.1 Unit suite passes: `npm run test` (offline)
- [x] 2.2 Tests cover fresh/stale/failure/unavailable/partial-batch/TTL-boundary
- [x] 2.3 Build/type-checks against the contract: `npm run build`
- [x] 2.4 Linting passes including test files: `npm run lint`

#### Manual

- [ ] 2.5 `getQuotes` returns a typed `Map<string, PriceResult>` that narrows on `status`
- [ ] 2.6 Seeded-stale + throwing provider yields `stale: true` (not a rejection)

### Phase 3: CI enforcement, live smoke & conventions doc

#### Automated

- [ ] 3.1 CI (lint + build + test) runs and passes on a PR
- [ ] 3.2 CI `npm run test` excludes the smoke file (log shows it skipped)
- [ ] 3.3 `npm run test:smoke` passes live (GPW + US)

#### Manual

- [ ] 3.4 CI `test` step appears as a green check on the PR
- [ ] 3.5 Pointing the smoke at a bad host fails `test:smoke` but leaves `test` green
- [ ] 3.6 `CLAUDE.md` Commands + conventions note match the shipped module
