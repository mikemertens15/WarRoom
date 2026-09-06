/** Keep human-readable release notes and the in-app chip on one release ledger.
 * Use --check in builds; never silently rewrite documentation during deployment.
 */
import { readFile, writeFile } from "node:fs/promises";
import releases from "../src/lib/releases.json";
import pkg from "../package.json";

async function main() {
  if (releases[0]?.version !== pkg.version)
    throw new Error("package.json version must match the newest release.");
  const seen = new Set<string>();
  for (const release of releases) {
    if (!/^\d+\.\d+\.\d+$/.test(release.version) || seen.has(release.version))
      throw new Error("Release versions must be unique semantic versions.");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(release.date) ||
      !release.title ||
      !release.summary ||
      !release.changes.length ||
      !release.compatibility
    )
      throw new Error(`Incomplete release: ${release.version}`);
    seen.add(release.version);
  }
  const output =
    "# Release log\n\nGenerated from `src/lib/releases.json`. Edit that ledger and run `npm run release:notes`. App versions and draft save-format versions are independent.\n\n" +
    releases
      .map(
        (r) =>
          `## ${r.version} — ${r.date} — ${r.title}\n\n${r.summary}\n\n${r.changes.map((c) => `- ${c}`).join("\n")}\n\n**Compatibility:** ${r.compatibility}\n`,
      )
      .join("\n");
  if (process.argv.includes("--check")) {
    if (
      (await readFile("CHANGELOG.md", "utf8")).replaceAll("\r\n", "\n") !==
      output
    )
      throw new Error("CHANGELOG.md is stale. Run npm run release:notes.");
    console.log(`Release v${pkg.version}: package, chip and changelog agree.`);
  } else await writeFile("CHANGELOG.md", output);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
