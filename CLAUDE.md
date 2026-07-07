# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npx supabase start` — start local Supabase (requires Docker)
- `npx supabase db reset` — apply all migrations to the local database from scratch
- `npm run gen:types` — regenerate `src/db/database.types.ts` from the local database
- `npx supabase test db` — run the pgTAP suite under `supabase/tests/`
- `npm run test` — Vitest unit suite (offline, mocked network + injected store; excludes `*.smoke.test.ts`)
- `npm run test:smoke` — live price smoke test (real Yahoo Finance call; never run in CI)

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **RLS pattern**: per domain table, four separate policies for role `authenticated` — `select`/`insert`/`update`/`delete` on `auth.uid() = user_id` (not one `for all` policy). No grant to `anon`, so anonymous access is denied by default. See `supabase/migrations/20260706161102_create_holdings.sql` for the template.
- **Audit columns**: every domain table gets `created_at`/`updated_at timestamptz` with an `updated_at` trigger via the `moddatetime` extension (`extensions.moddatetime(updated_at)`).
- **DB types**: `src/db/database.types.ts` is generated (never hand-edited) via `npm run gen:types` and committed to git, so builds/CI type-check without a live database. Regenerate it after every migration. `src/lib/supabase.ts`'s client is typed with it (`createServerClient<Database>`).
- **pgTAP tests**: live only under `supabase/tests/` (e.g. `supabase_test_helpers`, `pgtap`), never in `supabase/migrations/` — they must never ship to production.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`, derived from `src/db/database.types.ts` (e.g. `Holding`, `HoldingInsert`) so they can't drift from the schema.
- **Prices**: consume market prices only via `src/lib/services/prices.ts` `getQuotes`/`getQuote` — cached (15-min TTL), degrades to `stale: true` on source failure (or `unavailable` if never cached), and never throws for a source issue. The source lives behind the `PriceProvider` interface (`src/lib/services/providers/`), with Yahoo `v8/finance/chart` as the default, swappable implementation.
- **`price_snapshots` is a shared reference table** (public market data, no `user_id`): `authenticated` gets `select`/`insert`/`update` on all rows, no `delete`, no `anon` grant. This is a deliberate exception to the per-account RLS pattern above — do not copy the `auth.uid() = user_id` template onto it.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## CI

- `.github/workflows/ci.yml` — runs lint + build + test on every push and PR to main. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets for the build step. `npm run test` is fully mocked/offline and excludes `*.smoke.test.ts`.
- `.github/workflows/database-tests.yml` — runs the pgTAP suite (`supabase test db`) against a local Supabase stack on every push and PR to main. No repository secrets required.
