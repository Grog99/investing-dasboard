<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Market-Data (Price) Access Contract

- **Plan**: context/changes/market-data-access-contract/plan.md
- **Scope**: Phase 1-3 of 3 (full plan)
- **Date**: 2026-07-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS (3 observations) |
| Success Criteria | PASS |

## Findings

### F1 — Initial cache read can throw, defeating the outage-resilience guarantee for reads

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/prices.ts:54-57
- **Detail**: `createPriceService`'s `getQuotes` does one batched `select` before anything else; if it errors, the code does `throw error` — rejecting the whole call. The plan's guarantee is scoped to "never throws for a source issue" (Yahoo), and this is a Supabase read, so it's not literal plan drift — but it undercuts the feature's actual point: a transient DB blip means zero results for symbols that may have a perfectly good cached row sitting in the table, unreadable only due to the glitch. This path is also completely untested (see F6).
- **Fix A ⭐ Recommended**: Fold a truthy read error into the same per-symbol degrade path (treat as "no snapshot known" and let the fetch/degrade pipeline run for all requested symbols).
  - Strength: Extends the same "usable despite an outage" guarantee to cache-read failures, not just provider failures — the thing this foundation was actually built to guarantee. Reuses the existing `degrade(symbol, undefined)` branch.
  - Tradeoff: A systemic Supabase outage would silently look like "everything came fresh from Yahoo" unless separately logged/monitored.
  - Confidence: HIGH — small, contained change; no new failure surface.
  - Blind spot: Doesn't address F2 (upsert Promise.all) or F6 (missing test) — those need separate follow-up either way.
- **Fix B**: Leave as-is; document it as an intentional carve-out ("a durable-store outage is a harder failure than a source outage") and add a test pinning the throw.
  - Strength: Zero code risk; matches the plan's literal wording ("source issue" = Yahoo, not the cache).
  - Tradeoff: A DB blip can still fail a whole page render even when a good cached price exists — conflicts with the PRD's broader "usable despite a source outage" framing.
  - Confidence: MED — defensible reading, but a future reviewer could reasonably disagree.
  - Blind spot: Haven't checked whether any future caller (S-01 UI) will catch a rejected `getQuotes` promise.
- **Decision**: FIXED via Fix A

### F3 — Yahoo fetch has no timeout; a stalled connection can block the whole batch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/providers/yahoo.ts:33-35
- **Detail**: `fetch()` has no `AbortController`/timeout. Since `getQuotes` awaits `Promise.allSettled` over all fetches before returning anything, one hung connection stalls the entire batch, relying only on the platform's outer Workers subrequest timeout.
- **Fix**: Wrap the fetch in an `AbortController` with a short timeout (e.g. 8s) so a stalled request degrades that symbol instead of blocking the whole batch.
- **Decision**: FIXED

### F2 — Upsert stage less resilient than fetch stage

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/prices.ts:75-103
- **Detail**: Fetches use `Promise.allSettled` (resilient); upserts use `Promise.all`, so a thrown (not just error-returning) upsert would reject the whole batch and lose already-computed cache-hit results. Low likelihood (supabase-js generally resolves rather than throws) but asymmetric.
- **Fix**: Use `Promise.allSettled` for the upsert stage too, routing any rejection through `degrade()` like the fetch stage does.
- **Decision**: FIXED

### F4 — Non-JSON 200 response surfaces as an untyped SyntaxError

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/providers/yahoo.ts:43
- **Detail**: `response.json()` isn't try/caught. A 200-status but non-JSON body (e.g. a captcha/soft-block page) throws a raw `SyntaxError` instead of the typed `YahooProviderError` used for every other failure mode. Harmless functionally (allSettled/degrade treats any rejection the same) but breaks the "always a typed provider error" contract.
- **Fix**: Wrap `response.json()` in try/catch and rethrow as `YahooProviderError`.
- **Decision**: FIXED

### F5 — No test for the non-JSON-body case

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/providers/yahoo.test.ts
- **Detail**: Existing tests cover valid payload / non-200 / chart.error / missing field, but not a JSON-parse failure (ties to F4).
- **Fix**: Add a case resolving a 200 response with a non-JSON body and assert it rejects.
- **Decision**: FIXED

### F6 — FakePriceStore never exercises Supabase-error paths

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/prices.test.ts
- **Detail**: Neither the `select()` nor `upsert()` fake ever returns a truthy error, so the exact paths in F1/F2 are untested.
- **Fix**: Add two cases — a failing `select()` (pins current throw/degrade behavior) and a failing `upsert()` (confirms it degrades).
- **Decision**: FIXED

### F7 — No pgTAP assertion that authenticated delete is denied

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/tests/002-price-snapshots-rls-test.sql
- **Detail**: The migration grants only select/insert/update (no delete), but nothing asserts an authenticated user's delete attempt actually 42501s.
- **Fix**: Add a `throws_ok(..., '42501')` assertion for authenticated delete, matching the existing anon-denial style.
- **Decision**: FIXED

## Non-findings (verified clean)

- RLS/grants on `price_snapshots` exactly match the plan's pinned block; no `anon` grant, no `delete` grant, `using(true)`/`with check(true)` deliberate and documented.
- Migration is purely additive, no destructive/rollback-requiring operations.
- pgTAP suite correctly inverts the holdings isolation test (`results_eq` for user B, not `is_empty`).
- `database.types.ts` `price_snapshots` section matches the migration columns exactly; regenerating produces no diff.
- `PriceSnapshot`/`PriceSnapshotInsert`/`PriceQuote`/`PriceResult` co-located in `src/types.ts` following the existing `Holding`/`HoldingInsert` style.
- DI factory pattern in `prices.ts` followed consistently — no global/singleton Supabase client imported.
- No hardcoded secrets anywhere; CI's `test` step needs no secrets (fully mocked/offline).
- `vitest.config.ts`/`vitest.smoke.config.ts` correctly split default vs. smoke runs; `ci.yml` runs `npm run test` after `build`.
- `CLAUDE.md` matches the shipped module.
- All 13 planned changes across 3 phases verified MATCH — no drift, no scope creep.
- All automated success criteria pass: `npx supabase db reset`, `npx supabase test db` (17/17), `npm run test` (14/14), `npm run gen:types` (no diff), `npm run build`, `npm run lint`, `npm run test:smoke` (2/2 live), both CI runs green on PR #2 and on `main`.
