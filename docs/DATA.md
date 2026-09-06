# Player data and scoring provenance

The exact import schema and configurable scoring are in the root [README](../README.md#importing-real-2026-data). This guide explains the bundled adapter and audit trail.

## Sources and dates

`scripts/refresh-data.ts` fetches ESPN's anonymous season projection/player endpoint, ESPN team schedules/settings, and the public [FantasyPros PPR draft rankings page](https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php). ESPN endpoint URLs are recorded in the snapshot metadata. The script parses embedded consensus JSON; it does not execute provider JavaScript or access gated projection tables.

The current bundle was retrieved September 6, 2026 at 08:01 Central. It contains 534 players/defenses, with all source consensus top-250 identities represented, 473 matched consensus ranks and 191 usable ADPs. Provider retrieval time, consensus update time and available ADP timestamps are separate metadata. ESPN does not publish a full-season projection revision time in this response; `espnProjectionUpdatedAt` is deliberately null.

The snapshot is public player information bundled in application assets. A person's drafted players and team settings are browser data, not part of the public deployment. Injury labels reproduce the source snapshot and do not independently verify current news or drive an inferred risk penalty.

## Projection selection and scoring

Only 2026 full-season projected stat records are used: source ID 1, split type 0 and scoring period 0. Missing season projections are omitted and recorded. Explicit published zero projections with consensus ranks can remain, including injured players; absence of a projection is not turned into an invented zero.

| ESPN stat ID | Normalized field |
| --- | --- |
| 3 / 4 / 20 | passYards / passTD / interceptions |
| 24 / 25 | rushYards / rushTD |
| 53 / 42 / 43 | receptions / recYards / recTD |
| 72 | fumblesLost |
| 214 / 86 | made field-goal yards / made extra points |

For offensive players, core stats reproduce configurable league points. The remainder of ESPN's original applied total is retained as `otherPoints`, covering source scoring outside these fields. A residual magnitude above 25 fails the refresh for review. The default offensive total is therefore reconstructed exactly, rather than guessed from an incompatible aggregate.

For kickers, subtract ESPN's 3/4/5-point field-goal buckets and extra points from the source total to isolate other adjustments. Add exact projected made-field-goal yards × 0.1 and made extra points under the league settings. The adapter rejects a projected kicker with made field goals but no made-yardage statistic. It does not estimate yards from bucket midpoints. DST remains the source's default-scoring aggregate as `dstPoints`.

`otherPoints` and `dstPoints` remain fixed when core scoring changes. They are not raw stat counts and do not make every possible custom scoring system configurable. UI totals use the underlying stats; the normalized `projection` records the default-scoring result rounded to two decimals.

## Identity and market data

IDs are namespaced as `espn-<player ID>`. Consensus joins require matching position plus normalized name (punctuation/suffix removal); defenses match team code. Multiple name matches are narrowed by team and remaining ambiguity fails the refresh. No fuzzy-name or fabricated mapping is used.

ESPN values at or above 169 sit near its undrafted ADP ceiling and are omitted. The model falls back to consensus rank, then model rank. Overall FantasyPros tiers are not imported as positional tiers. The app infers positional tiers from scored projection gaps. No synthetic upside/risk metrics are supplied.

## Refresh and audit

Run `npm run refresh:data` explicitly while online. It checks season/scoring, freshness of consensus, pool/query-limit coverage, normalized field validation, positional minimums and unmatched top-250 players. It writes a temporary player file and renames it only after validating the complete result. Audit output is then written separately; the two files are not one atomic filesystem transaction. Inspect failures and rerun before publishing if audit writing fails after player replacement.

Raw provider responses stay in ignored `artifacts/data-refresh/`; player and audit JSON are durable release inputs. The audit records original totals, source IDs, omissions, source dates and hashes. Builds use the existing snapshot and never refresh data implicitly, making a release reproducible without live provider availability.

A deployed release with new player files does not silently overwrite an active browser draft. Use **Load latest 2026 data** to opt into the bundled snapshot. Every referenced pick and undo-history ID must map safely. Versioning the app is separate from the data date; always inspect the dataset label when updating.
