# Repository Guidelines

An Astro 6 SSR app (React 19 islands, Tailwind 4, Supabase cookie-based auth, shadcn/ui "new-york") deployed to Cloudflare Workers. See @CLAUDE.md for full architecture notes.

## Hard rules

- **API routes must export `const prerender = false`.** Rendering is `output: "server"` (@astro.config.mjs); an endpoint without it gets prerendered and breaks at runtime.
- **New Supabase tables: enable RLS** with granular per-operation, per-role policies. Migrations live in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`.
- **No Next.js directives** — never write `"use client"` / `"use server"`. React islands are plain components; extract hooks to `src/components/hooks/`.
- **Merge classes with `cn()`** from `@/lib/utils` (clsx + tailwind-merge). Do not concatenate class strings.
- **Server secrets via `astro:env/server`**, declared in @astro.config.mjs `env.schema` — never read `SUPABASE_URL` / `SUPABASE_KEY` from `import.meta.env`.

## Project structure

- `src/pages/` — routes; `src/pages/api/` — endpoints (uppercase `GET` / `POST` exports, validate request bodies with zod).
- `src/components/` — `.astro` for static/layout, React only when interactive; `ui/` holds shadcn components.
- `src/lib/` — services and helpers (`supabase.ts`, `utils.ts`); extracted business logic in `src/lib/services/`.
- `src/middleware.ts` — resolves `locals.user`, redirects `PROTECTED_ROUTES` to `/auth/signin` (@src/middleware.ts).
- `src/types.ts` — shared entities/DTOs. `@/*` aliases `./src/*` (@tsconfig.json).

## Commands

- `npm run dev` — dev server (Cloudflare workerd runtime).
- `npm run build` — SSR production build (`@astrojs/cloudflare`).
- `npm run lint` / `npm run lint:fix` — type-checked ESLint (@eslint.config.js).
- `npm run format` — Prettier (astro + tailwindcss plugins).
- `npx shadcn@latest add <name>` — add a UI component.

## Style & conventions

TypeScript strict (`astro/tsconfigs/strict`), 2-space indent, Node 22 (@.nvmrc). Pre-commit husky runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`; run `npm run lint` before pushing.

## Testing, commits & CI

No test suite is configured yet. CI (@.github/workflows/ci.yml) runs on `master`: `npm ci` → `astro sync` → `npm run lint` → `npm run build`, using `SUPABASE_URL` / `SUPABASE_KEY` repo secrets. No commit history exists yet — adopt Conventional Commits prefixes (`feat:`, `fix:`) and target PRs at `master`.
