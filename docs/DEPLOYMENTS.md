# Deployment record

## 1.2.0 — September 6, 2026

| Field | Value |
| --- | --- |
| Stable production URL | https://war-room-seven-eosin.vercel.app |
| Immutable deployment | https://war-room-jdlxo5dal-michael-mertens-projects.vercel.app |
| Deployment ID | `dpl_D3AEv6kdEPsUQgfEg7SeV3FSnfaP` |
| Status / target | READY / production |
| Framework / CLI | Next.js 16.3.4 / Vercel CLI 59.11.7 |
| Vercel build duration | 16 seconds reported by build output |
| Source | Working tree based on `2a2bd57`, including the 1.2.0 keeper, model, documentation and test changes; no new commit or tag created |
| Verified | September 6, 2026, approximately 14:24 America/Chicago |

This release adds optional same-round/new-position keepers, preparation saves, protected reservations, marginal roster gain, diminishing bench value, bounded opponent learning and deterministic two-pick scenario comparisons. Data remains the 534-player September 6 snapshot; no new player-source claims accompany this modeling release.

Validation passed: 59 unit/data tests, all 20 browser tests, typecheck, six-seat simulation command, release consistency and production build. The unit suite includes six complete keeper drafts plus six real-data drafts and six standard synthetic drafts. Desktop/mobile keeper setup and scenario layouts were visually inspected at 1440px and 390px.

An unauthenticated hosted Chromium check received HTTP 200 and verified v1.2.0, all 534 players, saving keeper preparation before starting, reload, the two-pick scenario panel, live pick entry, undo and JSON export. A separate 390px context restored the backup and retained exact keeper assignments and picks after reload. Browser error collection was empty. The deployment-scoped Vercel error-log query returned no logs; this is a point-in-time check, with no new monitoring or log drains configured.

Format-1 saves migrate in memory and retain picks/history. New writes and exports use format 2; app 1.2.0 or later is required to read them. The existing browser storage keys and stable production domain are retained. Older application rollback cannot read new format-2 backups; preserve pre-upgrade exports when backward compatibility is needed.


## 1.1.0 — September 6, 2026

| Field | Value |
| --- | --- |
| Stable production URL | https://war-room-seven-eosin.vercel.app |
| Deployment URL | https://war-room-37p7genqn-michael-mertens-projects.vercel.app |
| Deployment ID | `dpl_Ego8ppKwteAwU1epekw99hZ59Ajh` |
| Project / scope | `war-room` / `michael-mertens-projects` |
| Status / target | READY / production |
| Framework / CLI | Next.js 16.3.4 / Vercel CLI 59.11.7 |
| Build | Vercel remote build completed in 17 seconds |
| Source | Working tree based on `569c4db`, including the 1.1.0 release/documentation changes; no release commit or tag was created |
| Player snapshot | 534 players, retrieved September 6, 2026 at 08:01 Central |
| Draft save compatibility | Schema 1 retained |

[Vercel inspection page](https://vercel.com/michael-mertens-projects/war-room/Ego8ppKwteAwU1epekw99hZ59Ajh).

Verification: 40 domain/data tests, 15 local production browser tests, TypeScript check, release consistency check and production build passed. Desktop and 390px mobile release-log/room screenshots were inspected. Documentation relative links were checked.

An unauthenticated request to the stable production URL returned HTTP 200. A fresh isolated Chromium session verified version 1.1.0, all 534 players, starting a draft, saving a pick, reloading, undo and exporting JSON. A second isolated 390px context restored that JSON and retained the same pick after reload. No browser errors were observed. The Vercel production error-log query returned no logs; no ongoing monitoring or log drains are configured by this release.

This is application hosting only. Drafts remain local to each browser. Keep using the stable production URL; transfer JSON backups when moving from the local app or another device. This record and the README production link were added after deployment verification and do not change application assets.
