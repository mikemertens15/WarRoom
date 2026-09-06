<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Draft War Room project guidance

Build for a stressful live physical-board draft. Preserve fast keyboard input, visible clock/next-pick state, and reliable recovery. The six-team draft MVP now supports Vercel hosting as authorized by the user; season management is a future separate domain.

- Use Next.js/React/TypeScript. Keep local operation available alongside Vercel hosting. No application authentication, hosted database, remote fonts or required runtime player APIs. Hosting alone does not add shared saves.
- Six teams, 18 draft rounds, 10 starters, 8 bench, 1 undrafted IR. FLEX is RB/WR only. Keep league shape and all model coefficients in `src/lib/config.ts`.
- `src/lib` is the pure domain boundary. Derive rosters from pick IDs and snake order; do not maintain competing roster state. Keep weekly-management work separate if added later.
- Keep projections provider-neutral and preserve source metadata. Never present the synthetic pool as real 2026 rankings. Aggregate projections are not rescored unless underlying stats are present.
- Score starter VOR plus discounted bench depth. Availability and tier urgency use remaining players and opponent needs. Preserve quantitative explanations when changing the model, including matching UI labels and README formulas.
- Persist before announcing success. Validate imported/restored state. Never overwrite a damaged save silently. Keep undo for corrections, previous-save recovery, stale-tab detection and explicit reset/restore confirmation.
- Use `127.0.0.1:3000` for local dev and production. On Vercel use the stable production domain for real drafts. Storage is per browser and origin; transfer using validated JSON backups. Do not clear a user's actual draft as a test; use isolated browser contexts.
- Run `npm test`, `npm run typecheck`, `npm run test:e2e`, and `npm run build` for changes to draft behavior. Run `npm run simulate` for ranking changes. Inspect desktop/mobile UI after layout changes.
- Read README before changing assumptions. Update its import contract, model explanation and runbook alongside relevant implementation changes.
- Maintain meaningful inline documentation for public domain functions and non-obvious invariants. Keep docs/ and module READMEs aligned with behavior.
- Release version lives in package.json and src/lib/releases.json; generate CHANGELOG.md with npm run release:notes. npm run release:check must pass. App version, save schema and player retrieval date are separate concepts.
