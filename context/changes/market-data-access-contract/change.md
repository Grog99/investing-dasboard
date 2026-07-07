---
change_id: market-data-access-contract
title: Market data access contract
status: implemented
created: 2026-07-07
updated: 2026-07-07
archived_at: null
---

## Notes

- **Source correction (2026-07-07):** The roadmap/this change originally recorded **stooq.pl** as the price source. Corrected during planning: stooq is earmarked for the **news** feed (an S-04 concern), and research confirmed no *free official* API covers GPW/Warsaw (Twelve Data, Finnhub, EODHD paywall it; Alpha Vantage undocumented). Price source is now **Yahoo `v8/finance/chart`** (free, keyless, covers GPW `.WA` + US), wired behind a swappable `PriceProvider` interface. Roadmap F-02 description still needs updating to match — see `plan.md` → Migration Notes.
