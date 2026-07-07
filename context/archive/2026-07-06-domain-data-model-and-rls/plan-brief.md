# Domain Data Model + Per-Account RLS (F-01) — Plan Brief

> Full plan: `context/changes/domain-data-model-and-rls/plan.md`

## What & Why

Stand up the app's database foundation: the migration workflow (there are zero migrations
today), the first domain table (`holdings`) with per-account row-level security, an automated
test proving cross-account isolation, and a typed Supabase client. The real deliverable is the
**pattern** — RLS policy shape, audit columns, isolation test, type generation — that every later
table (watchlist, notes) copies, so the PRD's one "critical regression even if everything else
works" (cross-account privacy) is enforced by default from here on.

## Starting Point

Auth is complete and working (Supabase SSR cookie sessions + middleware gating `/dashboard`), but
there is **no database state**: `supabase/` holds only `config.toml` — no migrations, no tables, no
RLS, no `src/types.ts`, no generated types. The Supabase CLI is installed but unused; CI runs only
lint + build.

## Desired End State

`supabase db reset` cleanly creates a `holdings` table with RLS and four granular per-account
policies; `supabase test db` proves user B cannot read/modify user A's rows (and anon sees nothing)
and runs green on every PR via a new CI job; the Supabase client is typed from a committed
`database.types.ts` with a curated `Holding` type. A later slice adding a table copies the RLS block,
the `updated_at` trigger, and the isolation-test template — and gets privacy isolation for free.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Data-model scope | `holdings` only, ticker as text | Stays true to a foundation slice and avoids pre-deciding the owned-vs-watched entity question the roadmap left to S-04 | Plan |
| RLS verification | pgTAP via `supabase test db` | Tests real Postgres RLS with zero new deps and gives every future table a copy-paste isolation template | Plan |
| Test fixtures | Self-provisioning `supabase_test_helpers` | Tests create their own users in-transaction; installed in a test-only hook, never shipped to prod | Plan |
| Type generation | Generate now + wire `<Database>` client | Every later slice inherits a typed client and compile-time schema/code drift detection | Plan |
| CI reach | Add a database-tests CI job | The critical cross-account guardrail is enforced on every PR, not left to memory | Plan |
| Migration reach | Local-first, document remote push | Fits the after-hours MVP; remote `db push` stays a documented one-liner, not automated | Plan |
| Archive convention | Deferred to S-03 | Holdings hard-deletes, so an archive column here is dead weight; archive semantics belong to the first table that archives | Plan |

## Scope

**In scope:** first migration + `holdings` table; per-account RLS (4 granular policies); `updated_at`
audit trigger; pgTAP isolation test + test-helper hook; database-tests CI job; `gen:types` + typed
client + `Holding` type; DB conventions in CLAUDE.md.

**Out of scope:** `companies`/`watchlist`/`notes` tables; API routes / UI / zod; archive/soft-delete
columns; remote `db push` automation; seed data; any price/news/AI integration.

## Architecture / Approach

One migration defines `holdings` (owner FK to `auth.users`, RLS default-deny, policies keyed on
`auth.uid() = user_id`). A pgTAP suite under `supabase/tests/` self-provisions two users and asserts
isolation across all four operations plus anon; a standalone GitHub Actions job runs it on every PR
against a local Supabase stack (no secrets needed). Generated `Database` types feed
`createServerClient<Database>` and a curated `Holding` DTO. Test helpers live only in the pre-test
hook, so nothing test-related ships to production.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migration + schema + RLS | `holdings` table, 4 policies, audit trigger, clean `db reset` | Wrong RLS policy shape → the critical privacy regression |
| 2. Isolation test + CI | pgTAP suite proving isolation, enforced on every PR | A false-green test that passes even with a broken policy |
| 3. Typed client + types + docs | `gen:types`, typed client, `Holding`, CLAUDE.md conventions | Generated types drifting from schema / not committed |

**Prerequisites:** Docker running + `npx supabase start` (local stack); Supabase CLI (already a dev
dep); Node 22.14.0.
**Estimated effort:** ~1 focused session across 3 phases (small, mostly SQL + config).

## Open Risks & Assumptions

- `supabase_test_helpers` installs via `dbdev` in the pre-test hook; if the local stack's dbdev/pg_tle
  path changes, the exact install lines in `000-setup-tests-hooks.sql` may need adjustment (mechanism,
  not approach).
- The database-tests CI job adds ~1–2 min (Docker + Supabase startup) to PR checks — accepted because
  the guardrail it enforces is the critical one.
- `holdings.ticker` is free text; the GPW-vs-US symbol format and any owned-vs-watched entity
  reconciliation are intentionally left to S-01/S-04.

## Success Criteria (Summary)

- `npx supabase db reset` + `npx supabase test db` both succeed locally, and the isolation suite goes
  **red** if any RLS policy is removed.
- The database-tests CI job passes on a PR and blocks a merge that breaks isolation.
- `npm run build` type-checks against the typed client; a `holdings` query autocompletes `Holding`
  columns.
