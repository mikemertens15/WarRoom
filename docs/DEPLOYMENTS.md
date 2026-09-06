# Deployment record

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
