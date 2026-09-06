# Maintainer scripts

Run commands from the repository root.

| Command | Purpose | Network / output |
| --- | --- | --- |
| `npm run refresh:data` | Fetch and validate the 2026 full-season snapshot | Explicit online provider requests; writes `data/players-2026*.json`, caches raw responses under ignored `artifacts/` |
| `npm run simulate [-- seed]` | Six-seat deterministic draft sanity harness | No network; prints completion and heuristic forecast summaries |
| `npm run release:notes` | Generate `CHANGELOG.md` from the release ledger | No network; checks current package version agrees |
| `npm run release:check` | Reject a stale ledger/changelog/package combination | No writes; also runs before production build |

Refresh never runs automatically during a build or browser session. Review [source mapping](../docs/DATA.md) before altering stat IDs, ADP cutoffs or joins. Raw fetch timestamps must never be relabeled as projection publication dates. See [release procedure](../docs/DEPLOYMENT.md) for version updates and publishing.
