# Domain library

This directory holds provider-neutral types and draft calculations. Modules return derived data or candidate state; the client coordinator performs persistence. The deliberate exception is `persistence.ts`, a small storage adapter with injected storage methods for isolated tests. `newDraft` creates its initial timestamp, while seeded simulation supplies repeatable opponent choices.

| Module | Responsibility and contract |
| --- | --- |
| `types.ts` | Shared player, score, state and recommendation shapes; indexes and point units are documented inline |
| `config.ts` | League dimensions, scoring and every recommendation coefficient |
| `draft.ts` | Snake slots, derived rosters/needs, immutable pick actions and league validation |
| `engine.ts` | Rescoring, stable replacement baselines, survival approximation and explanatory ranking |
| `ingest.ts` | CSV parsing, normalization, field validation and soft coverage warnings |
| `persistence.ts` | Save keys, decoded-save validation, previous-save retention and recovery |
| `current-data.ts` | Bundled player snapshot, current default draft and safe historical ID remapping |
| `export.ts` | Human-readable rosters and spreadsheet-safe CSV; full backup JSON is serialized by the UI |
| `sample.ts` | Explicit synthetic practice/test pool, never real rankings |
| `simulation.ts` | Seeded complete-draft sanity harness |
| `releases.json` | Newest-first application release ledger; unrelated to save schema 1 |

See [architecture](../../docs/ARCHITECTURE.md), [scoring/model formulas](../../README.md#how-the-recommendation-works) and [data provenance](../../docs/DATA.md). Do not store competing roster state or mix weekly-management transactions into draft pick history.
