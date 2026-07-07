# Domain Data Model + Per-Account RLS Isolation Pattern (F-01) — Implementation Plan

## Overview

This is the first foundation slice (F-01). The app has working Supabase auth but **zero
database state** — `supabase/` holds only `config.toml`, there are no migrations, no
domain tables, and no row-level-security (RLS). This plan stands up the migration
workflow and creates the **first domain table (`holdings`)** with a per-account RLS
isolation pattern, proves cross-account isolation with an **automated pgTAP test enforced
in CI**, and wires a **typed Supabase client**. The point is not the `holdings` table
per se — it is establishing the pattern (RLS policy shape, audit columns, isolation test,
type generation) that every later domain table (watchlist, notes) copies, so cross-account
privacy — the PRD's one "critical regression even if everything else works" — is enforced
by default from here on.

## Current State Analysis

- **Auth is done and satisfies FR-001.** `src/lib/supabase.ts` creates an `@supabase/ssr`
  cookie-session server client from `astro:env/server` secrets (returns `null` when
  unconfigured). `src/middleware.ts` resolves `context.locals.user` on every request and
  redirects unauthenticated users away from `PROTECTED_ROUTES = ["/dashboard"]`.
- **Data layer is absent.** No `supabase/migrations/`, no domain tables, no RLS, no
  `src/types.ts`, no generated DB types. `supabase/config.toml` already has
  `[db.migrations] enabled = true` and `major_version = 17`.
- **Tooling present but unused for DB.** `supabase@2.23.4` is a dev dependency, so
  `supabase migration new`, `supabase db reset`, `supabase test db`, and
  `supabase gen types` are all available. There is **no test runner** and CI
  (`.github/workflows/ci.yml`) runs only lint + build.
- **Conventions (CLAUDE.md).** Migrations named `YYYYMMDDHHmmss_short_description.sql`;
  RLS mandatory with **granular per-operation, per-role policies**; shared types
  (entities/DTOs) in `src/types.ts`; `@/*` → `./src/*`.
- **Roadmap intent.** F-01 deliberately does **not** decide the owned-vs-watched "same
  entity or joined by ticker?" question — that is S-04's job. So `holdings` stores the
  ticker as free text and introduces no `companies` entity.

### Key Discoveries:

- Supabase test helpers install into a **pre-test hook file**
  (`supabase/tests/000-setup-tests-hooks.sql`), **not** a shipped migration — so the
  `tests` schema and `supabase_test_helpers` never reach production. This resolves the
  main "how do we self-provision test users without polluting prod?" concern.
  (Supabase Advanced pgTAP Testing guide.)
- `supabase test db` runs every `.sql` in `supabase/tests/` **in alphabetical order**;
  the `000-` prefix guarantees the setup hook runs before test suites.
- CI for DB tests is a standalone job: `actions/checkout` → `supabase/setup-cli@v1`
  (`version: latest`) → `supabase db start` → `supabase test db`. It needs **no**
  `SUPABASE_URL`/`SUPABASE_KEY` secrets (runs against the local stack), so it is
  independent of the existing lint+build workflow.
- RLS is **default-deny**: not granting any policy to the `anon` role is what blocks
  anonymous access; the isolation test must assert this explicitly rather than assume it.

## Desired End State

Running `npx supabase db reset` applies a single migration that creates a `public.holdings`
table with RLS enabled and four granular `authenticated`-role policies keyed on
`auth.uid() = user_id`. `npx supabase test db` passes a pgTAP suite proving that user B
cannot read, update, or delete user A's rows and that anon sees nothing, and that suite runs
green on every PR via a new CI job. `src/lib/supabase.ts` returns a `SupabaseClient<Database>`
typed from a committed `src/db/database.types.ts`, and `src/types.ts` exports a curated
`Holding` type. A later slice adding a new table can copy: the migration's RLS block, the
`updated_at` trigger, and the isolation-test template — and get cross-account privacy for free.

Verify by: `npx supabase db reset` (clean apply) + `npx supabase test db` (green) +
`npm run build` (type-checks against the typed client) + a PR showing the database-tests
CI job passing.

## What We're NOT Doing

- **No `companies`, `watchlist`, or `notes` tables.** Only `holdings`. Those tables land in
  their own slices (S-03, S-05) following this pattern.
- **No API routes, no UI, no zod.** F-01 is schema + RLS + verification + typing only; the
  first data access and input validation arrive in S-01.
- **No archive / soft-delete columns.** Holdings hard-deletes (FR-004); the archive-not-destroy
  convention (FR-006) is deferred to S-03, which owns the first table that archives. F-01 only
  establishes the standard audit columns (`created_at`, `updated_at` + trigger).
- **No remote `db push` automation.** Migrations are authored and verified against local Docker
  Supabase; applying to the hosted project is a documented manual step, not wired into CI/deploy.
- **No seed data.** The isolation test self-provisions its users via `supabase_test_helpers`;
  no persistent `seed.sql`.
- **No price/news/AI integration.** Live price is F-02; ticker format reconciliation (GPW vs US)
  is an S-01 concern. `holdings.ticker` is free text here.

## Implementation Approach

Three phases in deliberate risk order: **build the model → prove isolation before investing in
DX → then typing and docs.** The load-bearing risk is getting per-account RLS wrong, so the
automated isolation test (Phase 2) comes immediately after the schema (Phase 1) and gates
everything via CI before any developer-experience wiring (Phase 3). Each phase is independently
verifiable.

## Critical Implementation Details

- **Test helpers must NOT go in a migration.** Install `supabase_test_helpers` (and its deps:
  `pgtap`, `pg_tle`, `dbdev`, `http`) only inside `supabase/tests/000-setup-tests-hooks.sql`.
  Putting the `create extension "basejump-supabase_test_helpers"` in `supabase/migrations/`
  would ship the `tests` schema to production. This is the one non-obvious ordering fact.
- **Commit the generated types.** `src/db/database.types.ts` must be committed so `npm run build`
  and the lint+build CI job type-check without a live database. It is regenerated (never
  hand-edited) after every migration via `npm run gen:types`.
- **Split policies per operation.** Per CLAUDE.md, create four separate policies
  (`select`/`insert`/`update`/`delete`) for role `authenticated` — not one `for all` policy.
  `insert` uses `with check`, `update` uses both `using` and `with check`. This is the template
  later tables copy.

---

## Phase 1: Migration workflow + `holdings` schema with RLS

### Overview

Create the first migration ever: the `holdings` table with per-account RLS and the standard
audit-column convention, and verify it applies cleanly against local Supabase.

### Changes Required:

#### 1. First domain migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_holdings.sql` (generate the timestamped
file with `npx supabase migration new create_holdings`)

**Intent**: Create the `holdings` table, enable RLS, and add the four granular per-account
policies plus the `updated_at` audit trigger — the exact block every later domain table copies.

**Contract**: Table `public.holdings` with columns:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `ticker text not null` (free-text symbol; format reconciliation deferred to S-01)
- `quantity numeric(20,8) not null check (quantity > 0)`
- `buy_price numeric(20,8) not null check (buy_price >= 0)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Plus: index on `(user_id)`; explicit `grant select, insert, update, delete on public.holdings
to authenticated` (and **no** grant to `anon`); `alter table ... enable row level security`;
an `updated_at` trigger via the `moddatetime` extension (establishes the audit convention).

The RLS block is load-bearing and non-obvious enough to pin exactly — this is the pattern
being established:

```sql
alter table public.holdings enable row level security;

create policy "holdings_select_own" on public.holdings
  for select to authenticated using (auth.uid() = user_id);
create policy "holdings_insert_own" on public.holdings
  for insert to authenticated with check (auth.uid() = user_id);
create policy "holdings_update_own" on public.holdings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "holdings_delete_own" on public.holdings
  for delete to authenticated using (auth.uid() = user_id);
```

```sql
create extension if not exists moddatetime schema extensions;
create trigger handle_holdings_updated_at
  before update on public.holdings
  for each row execute function extensions.moddatetime(updated_at);
```

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset` completes without error
- RLS is enabled and four policies exist (visible after reset in Studio / `pg_policies`)
- No lint regression: `npm run lint`

#### Manual Verification:

- In Supabase Studio, `holdings` shows RLS enabled with exactly four per-operation policies
- Inserting a row with `quantity <= 0` or `buy_price < 0` is rejected by the check constraints
- Deleting the owning `auth.users` row cascades and removes the holding

**Implementation Note**: After completing this phase and all automated verification passes,
pause for the human to confirm manual testing before proceeding. Phase blocks use plain
bullets; the `- [ ]` checkboxes live in the `## Progress` section.

---

## Phase 2: Automated cross-account isolation test + CI enforcement

### Overview

Prove per-account isolation with a pgTAP suite that self-provisions two users, and enforce it
on every PR — the reusable verification path later slices depend on.

### Changes Required:

#### 1. Pre-test setup hook (test-only, never shipped)

**File**: `supabase/tests/000-setup-tests-hooks.sql` (create via
`npx supabase test new 000-setup-tests-hooks`)

**Intent**: Install pgTAP and `supabase_test_helpers` into the local/CI test database so tests
can create users and assert RLS — without adding anything to production migrations.

**Contract**: Installs the test dependencies and helper extension. Per the Supabase Advanced
pgTAP guide:

```sql
select dbdev.install('basejump-supabase_test_helpers');
create extension if not exists "basejump-supabase_test_helpers" version '0.0.6';
```

(Along with ensuring `pgtap`, `pg_tle`, `dbdev`, and `http` are available, per the guide's
setup-hook recipe.)

#### 2. Holdings isolation test suite

**File**: `supabase/tests/001-holdings-rls-test.sql`

**Intent**: Assert the cross-account guardrail concretely: RLS is on, an owner has full CRUD on
their own rows, another authenticated user is fully blind to and cannot mutate those rows, and
anon sees nothing. This file is the template later tables copy.

**Contract**: A single pgTAP transaction using the helpers. Must cover, at minimum:
`tests.rls_enabled('public','holdings')`; owner sees own row; user B `is_empty` on
`select * from public.holdings`; user B `update`/`delete` of A's row affects zero rows; anon
(`tests.clear_authentication()`) `is_empty`. Sketch:

```sql
begin;
select plan(6);
select tests.rls_enabled('public', 'holdings');

select tests.create_supabase_user('user_a');
select tests.create_supabase_user('user_b');

select tests.authenticate_as('user_a');
insert into public.holdings (user_id, ticker, quantity, buy_price)
  values (tests.get_supabase_uid('user_a'), 'CDR', 10, 100);
select results_eq('select count(*)::int from public.holdings', ARRAY[1],
  'owner sees own holding');

select tests.authenticate_as('user_b');
select is_empty('select * from public.holdings', 'user B is blind to user A rows');

select tests.clear_authentication();
select is_empty('select * from public.holdings', 'anon sees nothing');
select * from finish();
rollback;
```

#### 3. Database-tests CI workflow

**File**: `.github/workflows/database-tests.yml`

**Intent**: Run the pgTAP suite on every PR so a future slice that breaks isolation fails CI
rather than reaching production.

**Contract**: A standalone workflow triggered on `pull_request` (and pushes to `master`, to match
the existing ci.yml triggers): `actions/checkout@v4` → `supabase/setup-cli@v1` with
`version: latest` → `supabase db start` → `supabase test db`. No repository secrets required.

### Success Criteria:

#### Automated Verification:

- Isolation suite passes locally: `npx supabase test db` (all pgTAP assertions green)
- The database-tests CI job runs and passes on a PR
- Test asserts all four operations + anon denial (grep the test for select/insert/update/delete/anon coverage)

#### Manual Verification:

- Temporarily commenting out one RLS policy and re-running `npx supabase test db` makes the
  suite fail (confirms the test actually detects a broken policy, not a false green)
- CI job appears as a required check on the PR

**Implementation Note**: After automated verification passes, pause for the human to confirm the
"break a policy → test goes red" check before proceeding.

---

## Phase 3: Typed Supabase client + domain types + conventions doc

### Overview

Generate typed `Database` bindings, thread them through the client, expose a curated `Holding`
type, and document the DB/migration/RLS conventions later slices follow.

### Changes Required:

#### 1. Type-generation script + generated types

**File**: `package.json` (script) and `src/db/database.types.ts` (generated, committed)

**Intent**: Make a repeatable `gen:types` command the source of truth for DB types, and commit
the output so builds/CI type-check without a live DB.

**Contract**: Add `"gen:types": "supabase gen types typescript --local > src/db/database.types.ts"`
to `scripts`. Run it to produce `src/db/database.types.ts` exporting the `Database` type. The
file is regenerated after every migration, never hand-edited, and is committed to git.

#### 2. Typed server client

**File**: `src/lib/supabase.ts`

**Intent**: Parameterize the SSR client with the generated schema so every query is typed.

**Contract**: `createServerClient<Database>(...)` using `import type { Database } from
"@/db/database.types"`; the function's return type becomes `SupabaseClient<Database> | null`.
No behavioral change — the `null`-when-unconfigured guard and cookie wiring stay identical.

#### 3. Curated domain types

**File**: `src/types.ts` (new)

**Intent**: Give the app a stable `Holding` entity/DTO surface per CLAUDE.md, derived from the
generated types so it can never drift from the schema.

**Contract**: Export `Holding` (Row) and `HoldingInsert` (Insert) derived from
`Database["public"]["Tables"]["holdings"]`. This is the shared-types entry point later slices extend.

#### 4. Conventions documentation

**File**: `CLAUDE.md` (Commands + a short DB conventions note)

**Intent**: Record the workflow so future work (human or agent) follows the established pattern.

**Contract**: Add to the Commands list: `npx supabase start`, `npx supabase db reset`,
`npm run gen:types`, `npx supabase test db`. Add a brief note stating the RLS policy pattern
(four per-operation `authenticated` policies on `auth.uid() = user_id`), the `updated_at`
trigger convention, that generated types are committed and regenerated after migrations, and
that test helpers live only under `supabase/tests/`.

### Success Criteria:

#### Automated Verification:

- Types generate without error: `npm run gen:types` produces a non-empty `src/db/database.types.ts`
- Build/type-check passes against the typed client: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- In an editor, a `supabase.from("holdings").select()` call autocompletes `Holding` columns and
  flags a non-existent column at compile time
- `CLAUDE.md` Commands + conventions note read correctly and match the shipped workflow

**Implementation Note**: After automated verification passes, pause for the human to confirm the
typed-autocomplete check before considering F-01 complete.

---

## Testing Strategy

### Unit Tests (pgTAP):

- RLS enabled on `holdings` (`tests.rls_enabled`)
- Owner can select/insert/update/delete own rows
- A second authenticated user cannot select/update/delete the owner's rows
- Anonymous role sees nothing
- Check constraints reject `quantity <= 0` and `buy_price < 0`

### Integration Tests:

- `npx supabase db reset` (migration applies) followed by `npx supabase test db` (suite green) —
  the full local loop, mirrored by the database-tests CI job.

### Manual Testing Steps:

1. `npx supabase start`, then `npx supabase db reset` — confirm `holdings` exists with RLS + 4 policies in Studio.
2. `npx supabase test db` — confirm all assertions pass.
3. Comment out one policy, re-run `npx supabase test db` — confirm it fails; restore the policy.
4. `npm run gen:types && npm run build` — confirm typed client compiles.

## Performance Considerations

Negligible at MVP scale (single user, small data volume). The `(user_id)` index supports the
per-account filter that every RLS policy and query applies. No further tuning warranted.

## Migration Notes

- Local-first: author and verify against local Docker Supabase (`supabase db reset`). Applying to
  the hosted project later is a manual `supabase link` + `supabase db push` — documented, not automated.
- This is the first migration; the workflow it establishes (generate with `migration new`, verify
  with `db reset`, regenerate types) is the convention for all subsequent slices.

## References

- Roadmap item F-01: `context/foundation/roadmap.md` (Foundations → F-01)
- PRD Access Control + cross-account-privacy guardrail: `context/foundation/prd.md`
- Auth baseline this builds on: `src/lib/supabase.ts`, `src/middleware.ts`
- Supabase Advanced pgTAP Testing (setup-hook install path): https://supabase.com/docs/guides/local-development/testing/pgtap-extended
- Supabase CI database testing (workflow YAML): https://supabase.com/docs/guides/deployment/ci/testing
- supabase_test_helpers: https://github.com/usebasejump/supabase-test-helpers

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration workflow + holdings schema with RLS

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` completes without error
- [x] 1.2 RLS enabled and four per-operation policies exist
- [x] 1.3 No lint regression: `npm run lint`

#### Manual

- [x] 1.4 Studio shows RLS enabled with exactly four per-operation policies
- [x] 1.5 Check constraints reject `quantity <= 0` / `buy_price < 0`
- [x] 1.6 Deleting the owning `auth.users` row cascades to the holding

### Phase 2: Automated cross-account isolation test + CI enforcement

#### Automated

- [ ] 2.1 Isolation suite passes locally: `npx supabase test db`
- [ ] 2.2 The database-tests CI job runs and passes on a PR
- [ ] 2.3 Test covers all four operations + anon denial

#### Manual

- [ ] 2.4 Commenting out one RLS policy makes the suite fail (no false green)
- [ ] 2.5 CI job appears as a required check on the PR

### Phase 3: Typed Supabase client + domain types + conventions doc

#### Automated

- [ ] 3.1 `npm run gen:types` produces a non-empty `src/db/database.types.ts`
- [ ] 3.2 Build/type-check passes: `npm run build`
- [ ] 3.3 Linting passes: `npm run lint`

#### Manual

- [ ] 3.4 Typed `holdings` query autocompletes columns and flags a bad column at compile time
- [ ] 3.5 CLAUDE.md Commands + conventions note match the shipped workflow
