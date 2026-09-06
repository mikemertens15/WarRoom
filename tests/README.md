# Verification

`npm test` runs Node/TypeScript domain tests. `core.test.ts` exercises snake order, roster needs, pick correction/undo, scoring, availability, imports, persistence and exports. `current-data.test.ts` verifies the real snapshot's source coverage, point reconstruction, safe historical updates and complete drafts from six seats.

`npm run test:e2e` runs Chromium using Playwright's isolated browser contexts at `127.0.0.1:3000`. The configuration reuses an existing server or starts development automatically. For release verification, stop stale servers first or deliberately run the newly built production server. Tests must never connect to the user's persistent profile or clear a real draft.

Browser coverage includes keyboard entry, corrections, reload/undo, imports, backup restore/reset, stale tabs, damaged storage, quota failure, current-data migration, mobile navigation, seat selection and operation with external requests blocked. Release-log checks exercise open/close, version consistency and preservation of saved state.

`npm run simulate` uses a seeded synthetic opponent model. Successful simulations establish basic invariants and roster completion, not real-world forecast calibration. A change to coefficients also needs review of the explanatory UI and README formulas.

Failure screenshots/traces are in ignored `test-results/`; use `npx playwright show-trace <trace.zip>` for a captured trace. Unit tests do not prove visual quality, so inspect desktop/mobile screens after layout changes.

Keeper tests cover same-round/new-position assignment, collisions and limits, undo protection, identity-safe refresh, schema-1 migration, storage rejection and complete keeper drafts from all six seats. Model-plan tests verify actual starter upgrades, diminishing bench contribution, capped forecast mass, conservative learned factors, deterministic conditional paths and consecutive-pick symmetry. Browser tests exercise setup/reload/reorder, protected keepers, reset, cross-context JSON transfer, legacy migration and keyboard input with the planner open at 1440px and 390px.
