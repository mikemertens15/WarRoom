# From draft to season management

## Implemented foundation

The current release supports six-team drafting with optional round-cost keepers, marginal roster value, two-pick scenario comparisons, bounded opponent learning, validated player/scoring contracts, stable provider IDs, derived rosters, portable backups, transparent recommendations and versioned application releases. It is prepared for Vercel access while retaining local operation. Browser-local persistence remains the storage model.

## Proposed next stages

These are design directions, not completed features or promised dates.

1. **Freeze the completed draft.** Preserve a final versioned draft export as the audit baseline. Derive opening rosters from its pick IDs and team order; validate completion before importing to season mode.
2. **Add a separate season model.** Represent season, weeks, current roster ownership and transactions separately from draft history. Waivers, drops, trades and IR moves should be dated events with explicit before/after ownership, not edits to old draft picks.
3. **Add weekly data contracts.** Full-season draft projections are not weekly lineup projections. Introduce week-specific projections, opponents, schedules, status timestamps and scoring breakdowns with source metadata. Missing weekly data should remain visibly missing.
4. **Build lineup and transaction workflows.** Add weekly starter validation, RB/WR FLEX rules, bye/inactive checks and explicit transaction review. Define league-specific waiver, trade and IR rules before implementing them.
5. **Choose shared storage deliberately.** If automatic cross-device continuity is required, decide identity, access permissions, conflict handling, offline edits and migrations together. Hosting alone supplies none of these. Keep export/recovery even after shared persistence is introduced.

## Acceptance criteria for the transition

- Original draft history and its backup stay recoverable after season initialization.
- A player's opening roster is derived once from validated draft ownership; subsequent ownership follows explicit transactions.
- App release, save schema, season/week and projection timestamp remain separately visible concepts.
- Old backups have migration fixtures and clear failure messages; failed migrations never silently destroy the original.
- Any network or shared-storage feature has clear loading/error behavior and an export/recovery path.
- The existing draft flow and keyboard shortcuts remain usable when season features are added.

This release adds documentation and release tracking so those changes can be reviewed incrementally. It does not implement weekly lineups, waivers, trades, synchronization or a hosted fantasy database.
