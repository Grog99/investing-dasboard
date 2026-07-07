---
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
---

## Why this stack

A solo developer shipping a private investing dashboard in a 3-week after-hours
MVP needs a battery-included, agent-friendly starter so the foundation isn't the
bottleneck. The 10x Astro Starter (Astro + React + TypeScript + Supabase +
Cloudflare) ships auth, a Postgres database with per-account isolation, and edge
deploy out of the box — directly covering FR-001 auth, the durable store for
holdings, watchlists, and AI/manual notes, and the cross-account privacy
guardrail via Supabase row-level security. It clears all four agent-friendly
gates and is TypeScript-first, so an agent can reason about contracts from the
source. Chosen on the custom path after weighing T3, plain Next.js, and React
Router; the pre-wired Supabase auth+DB was the deciding factor for the short
timeline. Scheduled price/news refresh maps to Cloudflare Cron Triggers and the
one-shot AI research pass to a Worker/API route — both need manual wiring, the
main friction point on this JS stack. Payments and realtime are out of scope per
PRD non-goals. Bootstrapper confidence is first-class: expect mostly-smooth
scaffolding with occasional manual steps.
