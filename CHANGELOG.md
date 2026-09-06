# Release log

Generated from `src/lib/releases.json`. Edit that ledger and run `npm run release:notes`. App versions and draft save-format versions are independent.

## 1.1.0 — 2026-09-06 — Release tracking and device access

A documented foundation for taking the draft room from a local laptop to other devices, and eventually into season management.

- Added a version chip with an in-app release log and a matching repository changelog.
- Documented architecture, data contracts, recovery, deployment, release procedures and the season-management roadmap.
- Prepared Vercel hosting while keeping draft saves in the browser and preserving local operation.
- Clarified JSON backup and restore for moving a draft between devices or website addresses.

**Compatibility:** Existing version-1 draft backups remain supported. Hosting does not add automatic cross-device sync.

## 1.0.0 — 2026-09-06 — Draft-night foundation

The initial six-team, 18-round local-first draft room. This entry records the baseline that existed before release tracking was added.

- Built keyboard pick entry, snake draft order, derived rosters, corrections, undo and next-pick tracking.
- Added starter value over replacement, discounted bench depth, opponent-aware availability and quantitative explanations.
- Added validated imports, autosave, previous-save recovery, stale-tab protection and portable backups.
- Bundled 534 real 2026 players and defenses with ESPN season projections and FantasyPros PPR consensus ranks, retrieved September 6.
- Verified fractional field-goal scoring, complete-draft simulations, desktop/mobile layouts and offline local runtime.

**Compatibility:** Draft save format 1. Six teams, 108 picks, RB/WR-only FLEX and one undrafted IR spot.
