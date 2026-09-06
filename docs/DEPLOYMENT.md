# Hosting and release procedure

Production: **[war-room-seven-eosin.vercel.app](https://war-room-seven-eosin.vercel.app)**. Project: `war-room`, scope: `michael-mertens-projects`. See the [deployment record](DEPLOYMENTS.md) for the published release and verification evidence.

## Hosting model

Vercel serves this Next.js app and the bundled public player snapshot. There are no application secrets, runtime player APIs, server-side draft records or database migrations. `vercel.json` selects Next.js, `npm ci` and `npm run build`; Vercel serves the built output. Local `npm run start` retains `127.0.0.1:3000`.

Use the stable production domain. Preview and deployment-specific addresses have separate browser storage. A new device/domain needs a transferred JSON backup; see [operations](OPERATIONS.md). Local mode remains available for disconnected draft rooms.

## Publish

1. Install dependencies with `npm ci` and complete the checks below.
2. Authenticate with `npx vercel login` if needed. Never put tokens in source or documentation.
3. Run `npx vercel link` from the root and select the intended account/team and project. The local association in `.vercel/project.json` is ignored by Git.
4. Run `npx vercel deploy --prod`. Confirm the returned production deployment reaches Ready.
5. Open the production URL without a logged-in Vercel session to verify other-device access. Use an isolated browser context for test picks.

Future releases use the linked project. CLI 59.11.7 was used preparing this release; pin a known working version in automation. See [deployment docs](https://vercel.com/docs/deployments) and [CLI docs](https://vercel.com/docs/cli).

`.vercelignore` excludes raw provider artifacts, environment files, generated test results and build caches. Do not put personal draft backups in deployable source folders. No automatic Git deployment pipeline is assumed.

## Record a release

Use semantic `major.minor.patch`: patches for compatible fixes/documentation, minors for compatible features, majors for intentionally incompatible application changes. State save compatibility separately; the app version does not control `DraftState.version`.

1. Run `npm version <version> --no-git-tag-version` to update package and lockfile versions.
2. Prepend an entry to `src/lib/releases.json` with version, ISO date, title, summary, changes and compatibility. Retain history; label reconstructed baseline notes honestly.
3. Run `npm run release:notes` to generate `CHANGELOG.md`. The chip and in-app log read the same ledger.
4. Run `npm run release:check`; builds also run it through `prebuild`.
5. Test, review the diff and publish. Record the deployment URL and source revision. If tagging Git, tag the actual released commit, not an earlier baseline with uncommitted changes.

Data refresh is explicit and separate. Builds never refresh player data implicitly. Inspect the source/audit timestamp when shipping new data.

## Check before publication

```powershell
npm run release:check
npm test
npm run typecheck
npm run test:e2e
npm run build
```

Run `npm run simulate` for ranking changes. Inspect the version chip/log at desktop/mobile widths and focus return after closing. Confirm old backups restore, source dates are accurate and browser logs are clean.

Stop the local server before replacing its production build; reopen with `npm run start` if needed. In an isolated hosted context, start a draft, record a pick, reload, undo and verify a JSON backup round-trip.

## Rollback

Inspect with `npx vercel inspect <deployment-url>`. Review build logs before retrying failures. For a regression, `npx vercel rollback <known-good-deployment-url>` can restore an earlier deployment where supported by the account's plan/settings. Alternatively redeploy a reviewed known-good source revision. Never guess a prior deployment ID.

Application rollback does not roll back browser saves. Export before trying a rollback on a real draft. Release 1.2.0 reads format 1 and writes format 2 with keeper assignments. Earlier app releases cannot open format-2 saves. Keep a pre-upgrade export if backward compatibility is needed; do not remove the keeper field or relabel the format to force a restore. Migration/recovery tests must pass before publication.

There is no automatic error monitoring or log drain. Current post-deploy checks are explicit: build status, browser/runtime errors and saved-state smoke flow. Add ongoing monitoring when season-management requirements warrant it.
