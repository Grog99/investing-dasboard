<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Domain Data Model + Per-Account RLS Isolation Pattern (F-01)

- **Plan**: context/changes/domain-data-model-and-rls/plan.md
- **Scope**: All 3 phases (full plan)
- **Date**: 2026-07-07
- **Verdict**: APPROVED
- **Triage**: Complete — 5 fixed (F1, F2, F3, F5, F7), 2 skipped (F4, F6)
- **Findings**: 0 critical, 0 warnings, 7 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Independently verified

- `npx supabase db reset` — clean apply
- `npx supabase test db` — 11/11 pgTAP assertions pass
- `npm run lint` / `npm run build` / `npm run gen:types` — all pass; generated types byte-identical to committed file
- Live DB: negative `quantity`/`buy_price` rejected by check constraints; deleting `auth.users` row cascades to `holdings`
- GitHub: `database-tests` and `ci` are both required status checks on `main` per branch protection API; recent runs green

## Findings

### F1 — Three unplanned-but-justified file changes

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .github/workflows/ci.yml, eslint.config.js, .gitattributes
- **Detail**: Three files outside the plan's explicit list changed. `ci.yml`'s branch trigger was fixed from `master` to `main` (commit e5bc4a1, documented: both CI workflows had never fired because the repo's default branch is `main`). `eslint.config.js` gained `{ ignores: ["src/db/database.types.ts"] }` — required, since the generated file would otherwise fail strict-typed lint. `.gitattributes` (LF normalization) was bundled into the root commit that also captured the pre-existing untracked scaffold. All three are disclosed in commit messages and are necessary side effects, not silent scope creep.
- **Fix**: No action needed — rationale is already in the commit history. Optionally add a one-line addendum to plan.md noting these three as Phase 2/3 side effects for future readers of the plan.
- **Decision**: FIXED — added `## Addendum` section to plan.md documenting the three files.

### F2 — Migration grants before enabling RLS

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Security)
- **Location**: supabase/migrations/20260706161102_create_holdings.sql:17-19
- **Detail**: `grant select, insert, update, delete ... to authenticated` runs before `alter table ... enable row level security`. Not exploitable in practice — the whole migration executes as one implicit transaction and the table has no rows yet — but relies on that implicit guarantee rather than being self-evidently safe by ordering.
- **Fix**: Reorder so `enable row level security` precedes the `grant`, as defense-in-depth. Costs nothing; removes reliance on transaction semantics for correctness.
- **Decision**: FIXED — reordered lines 17-19; re-verified `db reset` + `test db` still pass.

### F3 — Public anon key hardcoded in test setup hook

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Security)
- **Location**: supabase/tests/000-setup-tests-hooks_test.sql:29
- **Detail**: A JWT-shaped string is embedded to call database.dev's dbdev registry. Decoded, it's `role: anon` for `database.dev` itself — Supabase's own public key from their official pgTAP-extended testing guide, not a project secret. Shape alone is exactly what secret-scanners (GitHub push protection, gitleaks) flag as a potential leak.
- **Fix**: Add a one-line comment above the key noting it's Supabase's public database.dev anon key (non-sensitive), to preempt false-positive scanner alerts.
- **Decision**: FIXED — added clarifying comment; re-verified `test db` still passes.

### F4 — dbdev package manager fetched unpinned ("latest")

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability / supply-chain)
- **Location**: supabase/tests/000-setup-tests-hooks_test.sql:13-19
- **Detail**: `supabase-dbdev` itself is resolved via `order=version.desc&limit=1` (always latest) while `supabase_test_helpers` is correctly pinned to `0.0.6`. Matches Supabase's official guide pattern exactly, so this is an accepted upstream trust boundary, not a defect introduced here.
- **Fix**: No action needed now; worth revisiting only if CI ever breaks from an upstream dbdev release.
- **Decision**: SKIPPED

### F5 — supabase/setup-cli@v1 pinned to `version: latest`

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: .github/workflows/database-tests.yml:14-16
- **Detail**: CI always installs the newest Supabase CLI. A future CLI release could silently change `test db`/`db start` behavior with no corresponding repo change to catch it.
- **Fix**: Consider pinning to an exact CLI version once this template pattern stabilizes; not urgent for a first-pass template.
- **Decision**: FIXED — pinned to `version: 2.109.1`, matching the `supabase` devDependency in package.json.

### F6 — No ticker format/length or quantity/price upper-bound constraints

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Data-safety)
- **Location**: supabase/migrations/20260706161102_create_holdings.sql:8-10
- **Detail**: Empty-string `ticker` would pass `not null`; `quantity`/`buy_price` have no upper bound. This is explicitly deferred to S-01 per the plan's "What We're NOT Doing" section — not a defect in this migration, purely a forward note.
- **Fix**: No action needed for this change; revisit when S-01 lands.
- **Decision**: SKIPPED

### F7 — Generated types ignored by ESLint but not by Prettier

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: eslint.config.js:73 (no .prettierignore)
- **Detail**: `src/db/database.types.ts` is excluded from lint but not from `npm run format`, so a full-repo format run could reformat the generated file, creating diff noise vs. `supabase gen types`' raw output on next regeneration.
- **Fix**: Add `src/db/database.types.ts` to a `.prettierignore` if this becomes a recurring annoyance.
- **Decision**: FIXED — created `.prettierignore` with the generated types file entry.
