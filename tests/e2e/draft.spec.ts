import { test, expect, type Page } from "@playwright/test";
import { currentPlayers } from "../../src/lib/current-data";
const chaseId = currentPlayers().find((p) => p.name === "Ja'Marr Chase")!.id;
const bijanId = currentPlayers().find((p) => p.name === "Bijan Robinson")!.id;
const gibbsId = currentPlayers().find((p) => p.name === "Jahmyr Gibbs")!.id;
import { samplePlayers } from "../../src/lib/sample";
import { STORAGE_KEY } from "../../src/lib/persistence";
import { newDraft, recordPick } from "../../src/lib/draft";
import releases from "../../src/lib/releases.json";
async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Set up draft", exact: true }).click();
  await page.getByRole("button", { name: "Start draft", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Search player to draft" }),
  ).toBeEnabled();
}
async function pick(page: Page, name: string) {
  const search = page.getByRole("combobox", { name: "Search player to draft" });
  await search.fill(name);
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toBeVisible();
  await search.press("Enter");
  await expect(search).toHaveValue("");
}
async function saved(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE_KEY,
  );
}

for (const width of [1440, 390]) {
  test(`release log is readable at ${width}px and leaves the saved draft intact`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await start(page);
    await pick(page, "jamarrchase");
    const before = await saved(page);
    const chip = page.getByRole("button", { name: `Version ${releases[0].version} — open release log`, exact: true });
    await chip.click();
    const log = page.getByRole("dialog", { name: "Release log", exact: true });
    await expect(log).toContainText(releases[0].title);
    await expect(log).toContainText("Draft-night foundation");
    await expect(log).toContainText("another device");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/release-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(log).not.toBeVisible();
    await expect(chip).toBeFocused();
    expect(await saved(page)).toEqual(before);
    await page.screenshot({ path: `artifacts/room-${width}.png` });
  });
}

test("latest data update preserves saved demo picks and undo through reload", async ({
  page,
}) => {
  let previous = { ...newDraft(), started: true };
  previous = recordPick(previous, "demo-wr-1");
  previous = recordPick(previous, "demo-rb-1");
  await page.goto("/");
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key: STORAGE_KEY, state: previous },
  );
  await page.reload();
  await page.getByRole("button", { name: "League setup", exact: true }).first().click();
  await page
    .getByRole("button", { name: "Load latest 2026 data", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("2026 data updated");
  const updated = await saved(page);
  expect(updated.picks.slice(0, 2)).toEqual([chaseId, bijanId]);
  expect(updated.cursor).toBe(previous.cursor);
  expect(updated.history).toHaveLength(previous.history.length);
  expect(updated.players).toHaveLength(currentPlayers().length);
  await page.reload();
  await page.getByRole("button", { name: "Undo Ctrl Z" }).click();
  expect((await saved(page)).picks.slice(0, 2)).toEqual([chaseId, null]);
});

test("untouched demo setup receives current data with league settings preserved", async ({
  page,
}) => {
  const previous = newDraft();
  previous.league.teams[0] = "My draft team";
  previous.league.order = [5, 4, 3, 2, 1, 0];
  await page.goto("/");
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key: STORAGE_KEY, state: previous },
  );
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "Current 2026 data installed",
  );
  const updated = await saved(page);
  expect(updated.league.teams).toEqual(previous.league.teams);
  expect(updated.league.order).toEqual(previous.league.order);
  expect(updated.started).toBe(false);
  expect(updated.players).toHaveLength(currentPlayers().length);
});

test("keyboard draft, next team, undo and refresh preserve exact state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await pick(page, "chase");
  await pick(page, "bijan");
  await pick(page, "jefferson");
  await expect(
    page.getByRole("region", { name: "Draft status" }),
  ).toContainText("Red Zone Club");
  await page.getByRole("button", { name: "Undo Ctrl Z" }).click();
  await expect(
    page.getByRole("region", { name: "Draft status" }),
  ).toContainText("Fourth & Long");
  const before = await saved(page);
  expect(before.picks.filter(Boolean)).toHaveLength(2);
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Draft restored");
  expect((await saved(page)).picks).toEqual(before.picks);
  await page
    .getByRole("combobox", { name: "Search player to draft" })
    .fill("jamarrchase");
  await expect(page.getByRole("listbox")).toContainText("No available players");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Why this pick?" }).click();
  await expect(page.getByRole("dialog")).toContainText("Next-turn urgency");
  expect(errors).toEqual([]);
});

test("earlier pick correction releases the old player and can be undone", async ({
  page,
}) => {
  await start(page);
  await pick(page, "chase");
  await pick(page, "bijan");
  await page
    .getByRole("button", { name: "Edit pick 1, Ja'Marr Chase", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search replacement player" })
    .fill("gibbs");
  await page
    .getByRole("textbox", { name: "Search replacement player" })
    .press("Enter");
  const corrected = await saved(page);
  expect(corrected.picks[0]).toBe(gibbsId);
  expect(corrected.cursor).toBe(2);
  await page
    .getByRole("combobox", { name: "Search player to draft" })
    .fill("chase");
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toContainText("Ja'Marr Chase");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo Ctrl Z" }).click();
  expect((await saved(page)).picks[0]).toBe(chaseId);
});

test("jump warns about gaps and returns to first unfilled pick", async ({
  page,
}) => {
  await start(page);
  await pick(page, "chase");
  await page.getByRole("button", { name: "Go to pick", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Overall pick (1–108)" })
    .fill("8");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Go to pick", exact: true })
    .click();
  await expect(
    page.getByText("6 earlier picks are empty.", { exact: false }),
  ).toBeVisible();
  await pick(page, "bijan");
  expect((await saved(page)).picks[7]).toBe(bijanId);
  await page
    .getByRole("button", { name: "Return to first empty pick" })
    .click();
  expect((await saved(page)).cursor).toBe(1);
});

test("JSON dataset import previews coverage, rejects invalid data, and starts valid data", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Set up draft", exact: true }).click();
  const input = page.getByLabel("Import player dataset");
  await input.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([{ id: "x" }])),
  });
  await expect(page.locator(".alert[role=alert]")).toContainText("required");
  const data = samplePlayers().map((p) => ({
    ...p,
    sample: false,
    source: "Automated test fixture",
  }));
  await input.setInputFiles({
    name: "test-pool.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByText("198 players · Imported data")).toBeVisible();
  await page.getByRole("button", { name: "Start draft", exact: true }).click();
  expect((await saved(page)).league.datasetLabel).toBe("test-pool.json");
  await expect(page.locator(".sample-banner")).toHaveCount(0);
});

test("export backup can restore picks after a confirmed reset", async ({
  page,
}) => {
  await start(page);
  await pick(page, "chase");
  const backup = await saved(page);
  await page.getByRole("button", { name: "Export draft", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /^JSON backup/ }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "war-room-draft-backup.json",
  );
  await expect(
    page.getByRole("textbox", { name: "All team rosters" }),
  ).toHaveValue(/Ja'Marr Chase/);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "League setup", exact: true })
    .first()
    .click();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "New / reset draft" }).click();
  expect((await saved(page)).picks[0]).toBe(chaseId);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "New / reset draft" }).click();
  expect((await saved(page)).picks.filter(Boolean)).toHaveLength(0);
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Restore draft backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole("status")).toContainText("Draft backup restored");
  expect((await saved(page)).picks[0]).toBe(chaseId);
});

test("simultaneous tabs do not silently overwrite the live draft", async ({
  page,
  context,
}) => {
  await start(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("status")).toContainText("Draft restored");
  await pick(page, "chase");
  await expect(other.locator(".alert[role=alert]")).toContainText(
    "another tab",
  );
  await other
    .getByRole("combobox", { name: "Search player to draft" })
    .fill("bijan");
  await other
    .getByRole("combobox", { name: "Search player to draft" })
    .press("Enter");
  await expect(other.locator(".alert[role=alert]")).toContainText(
    "Change was not recorded",
  );
  expect((await saved(other)).picks.filter(Boolean)).toEqual([chaseId]);
});

test("mobile layout has no page overflow and supports board and model navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await pick(page, "chase");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("navigation", { name: "Draft views" })
    .getByRole("button", { name: "Draft board", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Every pick. The full picture." }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Draft views" })
    .getByRole("button", { name: "Model lab", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Know what’s behind the pick." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("all six configurable seats recalculate the next-pick display", async ({
  page,
}) => {
  await page.goto("/");
  const teamNames = [
    "My Team",
    "Sunday Scaries",
    "Fourth & Long",
    "Red Zone Club",
    "The Underdogs",
    "Bye Week Bandits",
  ];
  for (let seat = 0; seat < 6; seat++) {
    await page
      .getByRole("button", { name: "League setup", exact: true })
      .first()
      .click();
    await page
      .getByRole("radio", {
        name: `This is my team: ${teamNames[seat]}`,
        exact: true,
      })
      .check();
    await page
      .getByRole("button", {
        name: seat === 0 ? "Start draft" : "Save settings",
        exact: true,
      })
      .click();
    await expect(page.locator(".next-stat")).toContainText(
      seat === 0 ? "You’re up" : `#${seat + 1}`,
    );
  }
});

test("damaged primary save recovers the prior save with a visible notice", async ({
  page,
}) => {
  await start(page);
  await pick(page, "chase");
  await pick(page, "bijan");
  await page.evaluate(
    (key) => localStorage.setItem(key, "broken JSON"),
    STORAGE_KEY,
  );
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "Recovered the previous valid save",
  );
  await expect(page.locator(".clock-strip")).toContainText("1 of 108 recorded");
  await pick(page, "jefferson");
  expect((await saved(page)).picks.filter(Boolean)).toHaveLength(2);
});

test("storage failure rejects a pick visibly without advancing the clock", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });
  const search = page.getByRole("combobox", { name: "Search player to draft" });
  await search.fill("chase");
  await search.press("Enter");
  await expect(page.locator(".alert[role=alert]")).toContainText(
    "Change was not recorded",
  );
  expect((await saved(page)).picks.filter(Boolean)).toHaveLength(0);
  await expect(page.locator(".clock-strip")).toContainText("0 of 108 recorded");
});

test("local runtime works when external network requests are blocked", async ({
  page,
}) => {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname === "127.0.0.1")
      return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await start(page);
  await pick(page, "chase");
  await page.reload();
  await expect(page.locator(".clock-strip")).toContainText("1 of 108 recorded");
  expect(external).toEqual([]);
});
