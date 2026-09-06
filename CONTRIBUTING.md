# Maintaining Draft War Room

Read [AGENTS.md](AGENTS.md), the root [README](README.md), and the [architecture guide](docs/ARCHITECTURE.md) before changing behavior. For this installed Next.js version, consult `node_modules/next/dist/docs/`; version-specific APIs can differ from older examples.

## Make a change

1. Identify whether it affects draft rules, data mapping, browser persistence, presentation or hosting.
2. Keep rule changes in the domain library and coefficients in `config.ts`. Keep browser/network side effects out of recommendation calculations.
3. Add comments explaining units, invariants, trust boundaries and surprising choices. Avoid comments that only repeat a function name or syntax.
4. Update the relevant README/guide alongside the implementation. Update model formulas and UI labels together.
5. Use isolated browser contexts for verification. Never erase the user's real saved draft to test reset or recovery.

## Verification by change

| Change | Required evidence |
| --- | --- |
| Draft, scoring, import or persistence behavior | `npm test`, `npm run typecheck`, `npm run test:e2e`, `npm run build` |
| Recommendation coefficients or ranking behavior | Above plus `npm run simulate`; review numerical explanations |
| Player snapshot | Refresh validations, data/scoring tests, full real-pool simulations; inspect source dates and audit |
| UI layout or navigation | Typecheck/build, relevant browser flows, desktop and 390px mobile inspection |
| Release metadata | `npm run release:notes`, `npm run release:check`, build |
| Documentation | Check statements against implementation, links and commands; avoid claiming proposed behavior works |

`npm test` includes six full drafts using the bundled real pool as well as deterministic sample-pool tests. The simulation command's synthetic-opponent statistics are sanity checks, not calibrated football predictions.

## Release discipline

Follow [deployment and release procedures](docs/DEPLOYMENT.md). Increment the app version for released changes, retain old release entries and document save compatibility. Data refresh dates do not substitute for app versions. Do not introduce a save-format bump without migration and recovery tests.

Keep tokens, `.env` files, local browser backups, raw data artifacts and generated build output out of source control and deployment uploads. The public player snapshot and public release history are intended release assets. Publishing a website does not authorize emailing people or adding unrelated services.
