---
project: "Investing Dashboard"
version: 1
status: draft
created: 2026-07-06
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# PRD — Investing Dashboard

## Vision & Problem Statement

An individual (retail) investor managing a personal stock portfolio has their
workflow fragmented across three separate worlds: AI-agent research kept in loose
files, news checked through RSS feeds, and portfolio value tracked inside the XTB
broker app. There is no single place to look at and analyse the most important
things together, so decisions are made by mentally stitching three tools rather
than reading one screen. The frustration is not any single tool — it is keeping
everything in one place.

The insight: existing portfolio trackers do not treat the user's own research
workspace (AI agent + notes + conclusions) as a first-class citizen tied to each
company, and none unify owned holdings + watched companies + news + personal
research in one owned place. The bet is a private dashboard where live market data
and the investor's own research sit side by side, under the user's control.

## User & Persona

Primary persona: **the user themselves** — an individual retail investor who runs a
personal stock portfolio (currently via XTB), does company research with AI tools,
and keeps notes in files. They reach for this product when they want to review
portfolio state, monitor both owned and watched companies, and do or record
research — all without switching between broker app, RSS reader, and files.

Persona scope: single user for now. The user may open it to others later, so the
design should not make future multi-user support impossible — but the MVP serves
one person.

View shape: the product has **both** an overview dashboard (the glance: portfolio
value, gains, signals and news across all companies) **and** a per-company
drill-down page (one company in full: position, news, own research, charts).
Overview → drill-down navigation.

## Success Criteria

### Primary

The full end-to-end first session works: the user signs in, adds a stock they own
(ticker, quantity, buy price) and immediately sees its current value and gain/loss
from a live price source; adds a company they don't own to a watchlist; sees an
overview screen combining portfolio value, gains, and the latest news across both
owned and watched companies; opens a single company's drill-down page (position,
price, news, research area); runs an AI research pass on that company whose result
is saved as a note, and can also add their own note manually. If this whole path
works, the product worked.

### Secondary

- Tags / categories for companies (group by sector, "to buy", etc.). Nice to have,
  not sufficient on its own.

### Guardrails

- **Cross-account privacy** — one account's financial data and research never leak
  to another account. Breaking this is a critical regression even if everything
  else works.
- **Manual data outranks automation** — anything the user entered by hand (holdings,
  notes) is never silently overwritten by a scraper, API, or the AI.
- **AI output is always labelled as AI** — model-generated content is clearly
  distinguished from the user's own facts/notes, so a hypothesis is never mistaken
  for a certainty when money is on the line.
- **Usable despite a source outage** — when the data source or AI is temporarily
  unavailable, the app still shows what it already has; it does not fail wholesale.

## User Stories

### US-01: User tracks a holding and reaches the unified view

- **Given** a signed-in user
- **When** they add a stock they own (ticker, quantity, buy price)
- **Then** they see that holding's current value and gain/loss on the company page,
  and the holding contributes to the total portfolio value and gains shown on the
  overview screen alongside the latest news for their owned and watched companies

#### Acceptance Criteria
- Gain/loss is computed from the live price source against the entered buy price.
- A watched (non-owned) company appears in the overview news feed without a position.
- If the price source is unavailable, the last known value is shown rather than an
  error that breaks the whole screen.

### US-02: User runs AI research on a company and keeps it as a note

- **Given** a signed-in user on a company's drill-down page
- **When** they run an AI research pass on that company
- **Then** the result is saved as a note attached to that company, clearly labelled
  as AI-generated, sitting alongside any notes the user wrote by hand

#### Acceptance Criteria
- The AI note is visually distinguishable from user-authored notes.
- The user can add, edit, and delete their own notes independently of the AI note.
- A user-authored note is never silently overwritten by a later AI run.

## Functional Requirements

### Authentication
- FR-001: User can create an account and sign in (email+password or OAuth). Priority: must-have
  > Socrates: Counter considered — "full accounts are over-engineering for one user; a password gate ships faster." Resolution: kept; accounts were chosen in Phase 2 to avoid re-architecting auth when the product opens to others later, and that cost was accepted.

### Portfolio
- FR-002: User can add a stock they own with ticker, quantity, and buy price. Priority: must-have
  > Socrates: Counter considered — "manual entry goes stale without XTB sync, so P/L drifts from reality." Resolution: kept; deliberate scope-down, holdings are few at MVP so update cost is low, XTB sync deferred to v2.
- FR-003: User can see the current value and gain/loss of each holding from a live price source. Priority: must-have
  > Socrates: Counter considered — "live price adds a source dependency and rate-limit risk for a number you could refresh manually." Resolution: kept; live value/gain is the whole reason the portfolio is more than a spreadsheet.
- FR-004: User can edit and delete a holding. Priority: must-have
  > Socrates: Counter considered — "delete destroys history; a 'mark as sold' with realized-gain history may be better." Resolution: kept simple edit/delete for MVP; "mark as sold + realized gains" raised as Open Question 1 for v2.

### Watchlist
- FR-005: User can add a company they don't own to a watchlist. Priority: must-have
  > Socrates: Counter considered — "a watched company is just a holding with quantity 0; a separate watchlist over-complicates the model." Resolution: kept separate; owned vs watched are different intents and read more clearly to the user.
- FR-006: User can remove a company from the watchlist; its accumulated notes and research are preserved (archived), not destroyed. Priority: must-have
  > Socrates: Counter considered — "removing a company wipes accumulated news/notes; archive instead of hard-delete." Resolution: FR revised — removal now archives and preserves research rather than destroying it, consistent with the manual-data-outranks-automation guardrail.

### Overview dashboard
- FR-007: User can see an overview combining total portfolio value, gains, and latest news across owned and watched companies. Priority: must-have
  > Socrates: Counter considered — "combining portfolio metrics and a news feed on one screen risks clutter that does neither well." Resolution: kept; the unified glance is the core pain being solved — layout clarity is a design task, not a scope cut.

### Company drill-down
- FR-008: User can open a per-company page showing position (if owned), price, news, and a research area. Priority: must-have
  > Socrates: Counter considered — "the per-company page duplicates the overview; is building both worth it for MVP?" Resolution: kept; drill-down is the only place AI research + notes have a home, so the differentiator needs it.
- FR-009: User can see the latest news for a company from a data source. Priority: must-have
  > Socrates: Counter considered — "one source gives thin news and ticker matching is noisy." Resolution: kept single source; deliberate scope-down — one working source beats five brittle ones; multi-source in v2.

### AI research & notes
- FR-010: User can run an AI research pass on a company and have the result saved as a note. Priority: must-have
  > Socrates: Counter considered — "AI can hallucinate financial facts; saving as a note risks trusting fabrication for money decisions." Resolution: kept; it is the differentiator, and hallucination risk is mitigated by FR-012 (AI labelling) and the AI-labelled guardrail.
- FR-011: User can add, edit, and delete their own notes on a company manually. Priority: must-have
  > Socrates: Counter considered — "you may also need cross-company/global research notes (e.g., a sector thesis), not only per-company." Resolution: kept per-company for MVP; global/cross-company notes raised as Open Question 2 for v2.
- FR-012: AI-generated notes are visibly labelled as AI-generated, distinct from the user's own notes. Priority: must-have
  > Socrates: Counter considered — "a label may be too weak; AI notes should carry source/confidence so they aren't taken as fact." Resolution: kept clear visual labelling for MVP; source/confidence metadata deferred to v2.

### Organisation
- FR-013: User can tag / categorise companies. Priority: nice-to-have
  > Socrates: Counter considered — "as a nice-to-have, should it even sit in MVP shape-notes?" Resolution: kept, explicitly marked nice-to-have / out of core; built only if the foundation finishes early.

## Non-Functional Requirements

- Price and news for owned and watched companies are refreshed automatically and stay
  fresh enough to act on — during market hours a displayed price is no more than
  ~15 minutes stale.
- Research and notes, once saved, are durable: they survive temporary outages of
  external data or AI sources and are never lost because a source failed.
- The product is usable and comfortable on both desktop (latest two major versions of
  the mainstream browsers) and mobile-sized screens (responsive layout).

## Business Logic

For every company the user owns or watches, the app combines the user's own inputs
(holdings and notes), live market data (price and news) and AI-generated research
into a single per-company picture, so the user sees standing, signals, and their own
thinking in one place.

The inputs the rule consumes are, on the user's side: which companies they own or
watch, the holdings they enter by hand (ticker, quantity, buy price), and the notes
and research they write or request; and on the external side: the current price and
recent news for each of those companies. The rule does not ask the user to gather
these from separate tools — pulling them together is the product's job.

Its output is, per company, a combined standing: current value and gain/loss when the
company is owned, the latest news, and the accumulated research (both AI-generated and
hand-written, always distinguishable); and at the portfolio level, the aggregate value
and return across all holdings.

The user encounters this on two surfaces. The overview shows the combined picture
across every owned and watched company at once — value, gains, and the freshest news —
for the glance. Drilling into a single company opens its full picture, where the
research area lives alongside its position and news. The picture updates as prices and
news refresh and as the user adds or requests research; the user's own inputs always
take precedence over automated data.

## Access Control

Multi-user with full login. Users sign up / sign in with an account (email +
password or OAuth). The role model is **flat**: every user sees only their own
data. Portfolio holdings, watched companies, and research/notes are fully isolated
per account — no user can see another user's data. There is no admin or role
hierarchy in the MVP.

Although only the user themselves uses it at first, accounts are built from the
start so opening the product to other people later does not require re-architecting
auth. An unauthenticated visitor hitting a gated route is sent to sign-in.

## Non-Goals

Functional non-goals:

- **No buy/sell recommendations or trade signals.** The app synthesises data and
  research but never tells the user to buy or sell, and generates no transactional
  signals. The user makes the decisions — this is a scope and responsibility boundary.
- **No automatic broker (XTB) sync in the MVP.** Holdings are entered by hand.
  Auto-sync is deferred to v2.
- **No custom per-source web scrapers for news/data in the MVP.** A single API data
  source is used; per-source scrapers are deferred to v2.
- **No full agentic AI research pipeline in the MVP.** AI research is a one-shot pass
  saved as a note; an agentic pipeline is deferred to v2.
- **No charts or image attachments in research notes in the MVP.** Notes are
  text-only; charts / image attachments are deferred to v2.
- **No tax, accounting, or reporting.** No capital-gains tax calculation, tax reports,
  or settlements — this is insight and research, not bookkeeping.

Non-functional non-goals:

- **No realtime / tick-by-tick market data.** Freshness on the order of ~15 minutes is
  enough; this is not a day-trading platform.

## Open Questions

1. **Holding removal: delete vs. "mark as sold"?** — Should removing a holding
   hard-delete it, or mark it sold and preserve realized-gain history? Owner: user.
   Deferred to v2 consideration; does not block MVP.
2. **Global / cross-company research notes?** — Should notes also exist at a global or
   cross-company level (e.g., a sector thesis), not only per-company? Owner: user.
   Deferred to v2 consideration; does not block MVP.
