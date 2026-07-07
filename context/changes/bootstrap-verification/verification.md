---
bootstrapped_at: 2026-07-06T14:22:46Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: investing-dashboard
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md` (frontmatter + body), so this log is self-contained.

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: investing-dashboard
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: true
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: true
```

**Why this stack** (verbatim from hand-off body):

> A solo developer shipping a private investing dashboard in a 3-week after-hours
> MVP needs a battery-included, agent-friendly starter so the foundation isn't the
> bottleneck. The 10x Astro Starter (Astro + React + TypeScript + Supabase +
> Cloudflare) ships auth, a Postgres database with per-account isolation, and edge
> deploy out of the box — directly covering FR-001 auth, the durable store for
> holdings, watchlists, and AI/manual notes, and the cross-account privacy
> guardrail via Supabase row-level security. It clears all four agent-friendly
> gates and is TypeScript-first, so an agent can reason about contracts from the
> source. Chosen on the custom path after weighing T3, plain Next.js, and React
> Router; the pre-wired Supabase auth+DB was the deciding factor for the short
> timeline. Scheduled price/news refresh maps to Cloudflare Cron Triggers and the
> one-shot AI research pass to a Worker/API route — both need manual wiring, the
> main friction point on this JS stack. Payments and realtime are out of scope per
> PRD non-goals. Bootstrapper confidence is first-class: expect mostly-smooth
> scaffolding with occasional manual steps.

## Pre-scaffold verification

| Signal      | Value                                                        | Severity | Notes                                                        |
| ----------- | ----------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| npm package | not run                                                     | n/a      | `cmd_template` starts with `git clone`; no `create-*` CLI to resolve |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17   | fresh    | from card `docs_url`; pushed ~7 weeks before bootstrap      |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (absent in cwd)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` removed before move-up so upstream history did not leak)

Top-level entries moved into cwd: `.env.example`, `.github/`, `.gitignore`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `CLAUDE.md`, `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package-lock.json`, `package.json`, `public/`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`.

The scaffold contained no `context/` and no `.claude/`, so nothing collided with the pre-existing cwd directories; `context/` was preserved verbatim.

## Post-scaffold audit

**Tool**: `npm audit --json` (exit code 1 — informational; npm exits non-zero when advisories exist; bootstrapper does not halt)
**Summary**: 0 CRITICAL, 6 HIGH, 9 MODERATE, 2 LOW (17 total across 895 dependencies)
**Direct vs transitive**: 0/1/2/0 direct of total 0/6/9/2 (CRITICAL/HIGH/MODERATE/LOW). Only `astro` (high), `supabase` (moderate), and `wrangler` (moderate) are direct dependencies; all other findings are transitive. Every finding reports `fixAvailable: true`.

#### CRITICAL findings

None.

#### HIGH findings

- **astro** (**direct**, installed `<=7.0.0-alpha.1`, fix available) — Reflected XSS via unescaped slot name ([GHSA-8hv8-536x-4wqp](https://github.com/advisories/GHSA-8hv8-536x-4wqp), CVSS 7.1) and Host-header SSRF in the prerendered error-page fetch ([GHSA-2pvr-wf23-7pc7](https://github.com/advisories/GHSA-2pvr-wf23-7pc7), CVSS 7.5). Also carries a moderate XSS via unescaped attribute names in spread props ([GHSA-jrpj-wcv7-9fh9](https://github.com/advisories/GHSA-jrpj-wcv7-9fh9)).
- **devalue** (transitive `5.6.3 - 5.8.0`, fix available) — DoS via sparse-array deserialization ([GHSA-77vg-94rm-hx3p](https://github.com/advisories/GHSA-77vg-94rm-hx3p), CVSS 7.5).
- **miniflare** (transitive, fix available) — high via `undici` and `ws`; effects `@cloudflare/vite-plugin`, `wrangler`.
- **undici** (transitive `7.0.0 - 7.27.2`, fix available) — TLS certificate-validation bypass via dropped `requestTls` in SOCKS5 ProxyAgent ([GHSA-vmh5-mc38-953g](https://github.com/advisories/GHSA-vmh5-mc38-953g), CVSS 7.4), WebSocket DoS via fragment-count bypass ([GHSA-vxpw-j846-p89q](https://github.com/advisories/GHSA-vxpw-j846-p89q), CVSS 7.5), cross-origin request routing via SOCKS5 proxy-pool reuse ([GHSA-hm92-r4w5-c3mj](https://github.com/advisories/GHSA-hm92-r4w5-c3mj), CVSS 7.5), plus moderate/low advisories; effects `miniflare`.
- **vite** (transitive `7.0.0 - 7.3.3`, fix available) — `server.fs.deny` bypass on Windows alternate paths ([GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff), high) plus a moderate launch-editor NTLMv2 hash disclosure ([GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)).
- **ws** (transitive `8.0.0 - 8.20.1`, fix available) — memory-exhaustion DoS from tiny fragments/data chunks ([GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), CVSS 7.5) plus a moderate uninitialized-memory disclosure ([GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx)); effects `@cloudflare/vite-plugin`, `miniflare`.

#### MODERATE findings

- **supabase** (**direct**, fix available) — moderate via `tar`.
- **wrangler** (**direct**, fix available) — moderate via `esbuild`, `miniflare`; effects `@cloudflare/vite-plugin`.
- **@astrojs/language-server** (transitive) — moderate via `volar-service-yaml`.
- **@cloudflare/vite-plugin** (transitive) — moderate via `miniflare`, `wrangler`, `ws`.
- **js-yaml** (transitive `4.0.0 - 4.1.1`) — quadratic-complexity DoS in merge-key handling ([GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68), CVSS 5.3).
- **tar** (transitive) — PAX size-override header interpretation differential / file smuggling ([GHSA-vmf3-w455-68vh](https://github.com/advisories/GHSA-vmf3-w455-68vh)); effects `supabase`.
- **volar-service-yaml** (transitive) — moderate via `yaml-language-server`.
- **yaml** (transitive `2.0.0 - 2.8.2`) — stack overflow via deeply nested collections ([GHSA-48c2-rrv3-qjmp](https://github.com/advisories/GHSA-48c2-rrv3-qjmp), CVSS 4.3).
- **yaml-language-server** (transitive) — moderate via `yaml`.

#### LOW / INFO findings

- **@babel/core** (transitive `<=7.29.0`) — arbitrary file read via `sourceMappingURL` comment ([GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8), CVSS 3.2).
- **esbuild** (transitive `0.27.3 - 0.28.0`) — arbitrary file read when running the dev server on Windows ([GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr), CVSS 2.5); effects `astro`, `wrangler`.

## Hints recorded but not acted on

Bootstrapper v1 reads these hints and preserves them here for the audit trail, but takes no automated action on them. A future skill (M1L4, "Memory Architecture") or a later bootstrapper version may act on them without a schema bump.

| Hint                    | Value                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| bootstrapper_confidence | first-class                                                                                    |
| quality_override        | false                                                                                          |
| path_taken              | custom                                                                                         |
| self_check_answers      | typed: true, from_official_starter: true, conventions: true, docs_current: true, can_judge_agent: true |
| team_size               | solo                                                                                           |
| deployment_target       | cloudflare-pages                                                                               |
| ci_provider             | github-actions                                                                                 |
| ci_default_flow         | auto-deploy-on-merge                                                                           |
| has_auth                | true                                                                                           |
| has_payments            | false                                                                                          |
| has_realtime            | false                                                                                          |
| has_ai                  | true                                                                                           |
| has_background_jobs     | true                                                                                           |

Note: no CI/CD workflow files, `AGENTS.md`, or `CLAUDE.md` were generated by bootstrapper v1 (the starter ships its own `CLAUDE.md` and `.github/`, which were moved in as-is). The `has_ai` and `has_background_jobs` flags — the AI research pass and scheduled price/news refresh — map to a Worker/API route and Cloudflare Cron Triggers per the hand-off, and require manual wiring; bootstrapper does not scaffold them in v1.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep. (This run created none.)
- Address audit findings per your project's risk tolerance — the full breakdown is in this log. All 17 findings report a fix as available; `npm audit fix` addresses most, and updating the direct `astro` dependency clears the only direct HIGH.
- Copy `.env.example` to `.env` and fill in your Supabase and Cloudflare credentials before running the dev server.
