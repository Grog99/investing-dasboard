---
project: "Investing Dashboard"
version: 1
status: draft
created: 2026-07-06
updated: 2026-07-06
prd_version: 1
main_goal: low-complexity
top_blocker: external
---

# Roadmap: Investing Dashboard

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

A private, single-user investing dashboard that unifies three today-fragmented worlds
— owned holdings, watched companies, and the investor's own AI-assisted research —
onto one screen the user controls. Its **differentiator** (the trait that, if removed,
leaves just another portfolio tracker) is treating AI research and hand-written notes
as first-class, tied to each company, sitting beside live price and news. The user's
manual inputs always outrank automated data, and the app stays usable when an external
source is down.

Two standing constraints apply to every slice below and are not repeated per-item: the
UI must be responsive on desktop and mobile (an NFR), and cross-account data isolation
is a critical guardrail — one account's financial data and research must never reach
another account.

## North star

**S-01: User adds a holding and sees its live value & gain** — the smallest end-to-end
flow (sign in → add a stock with ticker/quantity/buy price → immediately see current
value and gain/loss from a live source) that proves the portfolio is more than a
spreadsheet. It validates the live-price integration every other slice leans on.

> "North star" here means the smallest end-to-end slice whose successful delivery would
> prove the core product hypothesis — placed as early as its prerequisites allow because
> everything else only matters if this works. It sits deliberately *below* the AI-research
> differentiator: the differentiator has nowhere to stand until the portfolio + live-data
> spine works.

## At a glance

| ID   | Change ID                 | Outcome (user can …)                                            | Prerequisites   | PRD refs              | Status   |
| ---- | ------------------------- | --------------------------------------------------------------- | --------------- | --------------------- | -------- |
| F-01 | domain-data-model-and-rls | (foundation) migrations enabled + per-account RLS pattern established | —          | FR-001, Access Control | ready    |
| F-02 | market-data-access-contract | (foundation) stooq.pl price behind a resilient, cached adapter | —              | FR-003                | ready    |
| S-01 | first-holding-live-value  | add a holding and see its live value & gain                     | F-01, F-02      | FR-002, FR-003, US-01 | proposed |
| S-02 | edit-delete-holding       | edit and delete a holding                                       | S-01            | FR-004                | proposed |
| S-03 | watchlist-add-archive     | add a watched company and remove it (research archived)         | F-01            | FR-005, FR-006        | proposed |
| S-04 | company-drilldown-page    | open a per-company page (position, price, news, research area)  | S-01, S-03, F-02 | FR-008, FR-009       | proposed |
| S-05 | manual-company-notes      | add, edit, and delete own notes on a company                    | S-04, F-01      | FR-011                | proposed |
| S-06 | ai-research-note          | run AI research saved as an AI-labelled note                    | S-05            | FR-010, FR-012, US-02 | proposed |
| S-07 | unified-overview          | see the unified overview (portfolio value, gains, latest news)  | S-01, S-03, S-04 | FR-007, US-01        | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                          | Chain                                                        | Note                                                                                                       |
| ------ | ------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A      | Data, portfolio & watchlist    | `F-01` & `F-02` → `S-01` → `S-02` (with `S-03` parallel)    | `F-01` and `F-02` are both ready and independent (parallel); `S-03` runs parallel to `S-01`/`S-02` once `F-01` lands. The price source is now chosen (stooq.pl), so the external blocker is retired for price. |
| B      | Company research (differentiator) | `S-04` → `S-05` → `S-06`                                 | Branches off `S-01` (position/price) + `S-03` (company entity); the AI-research bet lands at `S-06`.         |
| C      | Unified overview               | `S-07`                                                      | Aggregation of everything; joins after `S-04`. Depends on `S-01`, `S-03`, `S-04`, so it validates late.     |

## Baseline

What's already in place in the codebase as of `2026-07-06` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 + Tailwind 4, responsive layout wired; shadcn/ui partial (only `src/components/ui/button.tsx`); `dashboard.astro` + auth pages exist.
- **Backend / API:** partial — Cloudflare SSR runtime + three auth API routes (`src/pages/api/auth/{signin,signup,signout}.ts`); zero domain routes and zero external data/AI integration.
- **Data:** absent — Supabase client wired (`src/lib/supabase.ts`), but `supabase/` holds only `config.toml`; no migrations, no domain tables, no RLS.
- **Auth:** present — Supabase SSR cookie sessions; middleware gates `PROTECTED_ROUTES=["/dashboard"]` → `/auth/signin` (`src/middleware.ts`). Satisfies FR-001.
- **Deploy / infra:** present — Cloudflare Workers adapter + `wrangler.jsonc`; CI runs lint+build (`.github/workflows/ci.yml`). Scheduled-job / cron capability: **absent**.
- **Observability:** absent — no logging library, error tracking, metrics, or health endpoint.

## Foundations

### F-01: Domain data model + per-account RLS isolation pattern

- **Outcome:** (foundation) Supabase migrations are enabled and the per-account row-level-security isolation pattern is established and verified on the first domain table (holdings), so every later table inherits cross-account privacy by default.
- **Change ID:** domain-data-model-and-rls
- **PRD refs:** FR-001 (extends the present auth into enforced data isolation), Access Control section, cross-account-privacy guardrail.
- **Unlocks:** S-01, S-02, S-03, S-05, S-07 (every domain table follows this RLS pattern); reduces the "is our per-account isolation correct?" risk; creates the verification path (an isolation test) later slices rely on.
- **Prerequisites:** — (auth is present per Baseline).
- **Parallel with:** F-02.
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because it is ready and every domain table depends on it; the load-bearing risk is getting per-account RLS wrong, which is the critical cross-account-privacy regression — so the isolation pattern is established and verified once, here, rather than re-invented per table.
- **Status:** ready

### F-02: Market-data (price) access contract — stooq.pl adapter

- **Outcome:** (foundation) stooq.pl is wired behind a thin internal price adapter that caches last-known values and degrades gracefully, so slices consume a stable internal price contract and the app survives a source outage.
- **Change ID:** market-data-access-contract
- **PRD refs:** FR-003 (live price), NFR: ~15-min freshness, "usable despite a source outage" guardrail.
- **Unlocks:** S-01 (holding value/gain); the mockable adapter is the verification path that makes every downstream price consumer testable without hitting the live source.
- **Prerequisites:** — (independent of F-01).
- **Parallel with:** F-01.
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Price source decided — **stooq.pl** (free, no API key), which retires the vendor-contracting half of the external blocker and covers GPW + US tickers for an XTB user. Residual risk is that stooq is a free/unofficial source with no SLA, informal rate limits, and a format that can change — exactly why the adapter caches a last-known value and degrades gracefully (the "usable despite outage" guardrail). Scope is the price access contract only; company **news** is a separate, still-open source decision folded into S-04 (see Open Roadmap Question 1).
- **Status:** ready

## Slices

### S-01: User adds a holding and sees its live value & gain

- **Outcome:** User can add a stock they own (ticker, quantity, buy price) and immediately see that holding's current value and gain/loss computed from the live price source (stooq.pl via F-02).
- **Change ID:** first-holding-live-value
- **PRD refs:** FR-002, FR-003, US-01 (portfolio half).
- **Prerequisites:** F-01 (holdings table + RLS), F-02 (price via the stooq.pl adapter).
- **Parallel with:** S-03.
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The validation milestone — proves the live-price integration everything rests on; the risk is ticker/price-source mismatch (stooq symbol format for GPW vs. US tickers) or a stale figure, surfaced here early rather than after more is built on top. Per US-01's acceptance criteria, an unavailable price shows the last-known value (via F-02) rather than breaking the screen.
- **Status:** proposed

### S-02: User edits and deletes a holding

- **Outcome:** User can edit a holding's ticker/quantity/buy price and delete a holding.
- **Change ID:** edit-delete-holding
- **PRD refs:** FR-004.
- **Prerequisites:** S-01.
- **Parallel with:** S-03, S-04.
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low-risk CRUD completion of the portfolio; the one rule that matters is manual-outranks-automation — a user edit must never be silently clobbered by a later price refresh.
- **Status:** proposed

### S-03: User adds a watched company and removes it (research archived)

- **Outcome:** User can add a company they don't own to a watchlist and remove it; on removal the company's accumulated notes/research are archived, not destroyed.
- **Change ID:** watchlist-add-archive
- **PRD refs:** FR-005, FR-006.
- **Prerequisites:** F-01 (company/watchlist table + RLS).
- **Parallel with:** S-01, S-02.
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Runs parallel to the portfolio track (independent of price), which makes it a good pick-off item; the load-bearing rule is archive-not-destroy on removal — preserved research must survive a watchlist removal, per the manual-data-outranks-automation guardrail.
- **Status:** proposed

### S-04: User opens a per-company drill-down page

- **Outcome:** User can open a per-company page showing position (if owned), price, latest news, and a research area (the shell that S-05/S-06 fill).
- **Change ID:** company-drilldown-page
- **PRD refs:** FR-008, FR-009.
- **Prerequisites:** S-01 (position/price), S-03 (company entity), F-02 (price on the company page).
- **Parallel with:** S-02.
- **Blockers:** —
- **Unknowns:**
  - How does a per-company page reconcile a holding (owned) and a watched company under one company view — same entity or joined by ticker? — Owner: TBD (resolve in `/10x-plan`). Block: no.
  - Which source supplies company **news** (FR-009)? stooq.pl is quotes, not news. — Owner: user. Block: no (must be decided before this slice is planned; does not gate the north star). See Open Roadmap Question 1.
- **Risk:** First per-company surface and the only home for AI research + notes; the risk is reconciling owned vs watched under one company view. Introduces per-company news from a source still to be chosen (ORQ 1) — kept to a single source per the PRD non-goal (no multi-source scrapers in the MVP).
- **Status:** proposed

### S-05: User adds, edits, and deletes own notes on a company

- **Outcome:** User can add, edit, and delete their own hand-written notes on a company, stored durably alongside the drill-down page.
- **Change ID:** manual-company-notes
- **PRD refs:** FR-011.
- **Prerequisites:** S-04 (host page), F-01 (notes table + RLS pattern).
- **Parallel with:** S-07.
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Notes must be durable (survive source outages per NFR) and cleanly separated by authorship; the risk is a notes model that doesn't distinguish user-authored from AI-authored content — getting that separation right here is what makes S-06's AI-labelling honest.
- **Status:** proposed

### S-06: User runs an AI research pass saved as an AI-labelled note

- **Outcome:** User can run a one-shot AI research pass on a company; the result is saved as a note clearly labelled AI-generated, sitting alongside hand-written notes and never silently overwriting them.
- **Change ID:** ai-research-note
- **PRD refs:** FR-010, FR-012, US-02.
- **Prerequisites:** S-05 (notes infrastructure + authorship separation).
- **Parallel with:** S-07.
- **Blockers:** —
- **Unknowns:**
  - Which AI research provider/model, and the prompt/output shape for a one-shot pass? — Owner: user. Block: no (a sensible default can be proposed in `/10x-plan`; confirm before implementing this slice). See Open Roadmap Question 2.
- **Risk:** The differentiator; the risk is AI output being mistaken for fact when money is on the line — mitigated by clear AI-labelling (FR-012) and the deliberately one-shot (non-agentic) scope per PRD non-goals. A user-authored note is never overwritten by a later AI run (US-02 acceptance criteria).
- **Status:** proposed

### S-07: User sees the unified overview

- **Outcome:** User can see an overview combining total portfolio value, gains, and the latest news across both owned and watched companies, with navigation into each company's drill-down.
- **Change ID:** unified-overview
- **PRD refs:** FR-007, US-01 (overview half).
- **Prerequisites:** S-01 (holdings + value), S-03 (watchlist), S-04 (news integration to aggregate).
- **Parallel with:** S-05, S-06.
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The unified glance is the core pain being solved, but it aggregates holdings, watchlist, and news that must all exist first, so it is sequenced last; the risk is layout clutter combining metrics and a news feed — a design task, not a scope cut.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                   | Ready for `/10x-plan` | Notes                                                        |
| ---------- | --------------------------- | ------------------------------------------------------ | --------------------- | ----------------------------------------------------------- |
| F-01       | domain-data-model-and-rls   | Data model + per-account RLS isolation pattern         | yes                   | Run `/10x-plan domain-data-model-and-rls`                    |
| F-02       | market-data-access-contract | Market-data (price) access contract — stooq.pl adapter | yes                   | Run `/10x-plan market-data-access-contract`                 |
| S-01       | first-holding-live-value    | Add a holding and see its live value & gain            | no                    | Needs F-01 + F-02 done (both ready)                         |
| S-02       | edit-delete-holding         | Edit and delete a holding                              | no                    | Needs S-01                                                  |
| S-03       | watchlist-add-archive       | Add/remove a watched company (archive on remove)       | no                    | Needs F-01                                                  |
| S-04       | company-drilldown-page      | Per-company drill-down page                            | no                    | Needs S-01, S-03, F-02; news source open (ORQ 1)           |
| S-05       | manual-company-notes        | Manual company notes (add/edit/delete)                 | no                    | Needs S-04, F-01                                            |
| S-06       | ai-research-note            | AI research pass saved as an AI-labelled note          | no                    | Needs S-05; confirm AI provider (ORQ 2)                     |
| S-07       | unified-overview            | Unified overview (value, gains, news)                  | no                    | Needs S-01, S-03, S-04                                      |

## Open Roadmap Questions

1. **Which source supplies company news (FR-009)?** — Price is resolved (stooq.pl), but stooq is quotes, not news. Owner: user. Block: S-04, S-07 (not the north star). Decide before planning S-04.
2. **Which AI research provider/model for the one-shot pass?** — Owner: user. Block: S-06. Non-blocking near-term; a default can be proposed in `/10x-plan` and confirmed before S-06.
3. **Holding removal: delete vs. "mark as sold"?** — Should removing a holding hard-delete it, or mark it sold and preserve realized-gain history? Owner: user. Deferred to v2 consideration; does not block MVP.
4. **Global / cross-company research notes?** — Should notes also exist at a global or cross-company level (e.g., a sector thesis), not only per-company? Owner: user. Deferred to v2 consideration; does not block MVP.

## Parked

- **Tags / categories for companies (FR-013)** — Why parked: PRD marks it nice-to-have / out of core; built only if the foundation finishes early.
- **Automatic broker (XTB) sync** — Why parked: PRD §Non-Goals; holdings are entered by hand in the MVP, auto-sync deferred to v2.
- **Multi-source / custom per-site scrapers for news & data** — Why parked: PRD §Non-Goals; the MVP uses a single data source (stooq.pl for price; one news source TBD). Additional sites/scrapers — the "first site" implying more — are the v2 path.
- **Full agentic AI research pipeline** — Why parked: PRD §Non-Goals; AI research is a one-shot pass saved as a note in the MVP.
- **Charts / image attachments in research notes** — Why parked: PRD §Non-Goals; notes are text-only in the MVP.
- **Tax, accounting, or reporting** — Why parked: PRD §Non-Goals; this is insight and research, not bookkeeping.
- **Realtime / tick-by-tick market data** — Why parked: PRD §Non-Goals; ~15-min freshness is enough.
- **Buy/sell recommendations or trade signals** — Why parked: PRD §Non-Goals; a scope and responsibility boundary — the user makes the decisions.
- **Background scheduled refresh (Cloudflare Cron Triggers)** — Why parked: cron is absent in the baseline; under the low-complexity goal the MVP fetches on view with cached last-known values (via F-02), which meets the ~15-min freshness bound for a single active user. Promote to a foundation if/when background refresh is needed.
- **Observability stack (structured logging, error tracking, metrics)** — Why parked: absent in the baseline; not invested for a single-user MVP under the low-complexity goal.

## Done

(Empty on first generation. `/10x-archive` appends here — and flips the item's `Status` to `done` — when a change whose `Change ID` matches a roadmap item is archived.)
