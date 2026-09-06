import { test, expect, type Page } from "@playwright/test";
import { currentPlayers } from "../../src/lib/current-data";
import { STORAGE_KEY } from "../../src/lib/persistence";
import { newDraft, recordPick } from "../../src/lib/draft";

const players = currentPlayers();
const chase = players.find((p) => p.name === "Ja'Marr Chase")!;
const bijan = players.find((p) => p.name === "Bijan Robinson")!;
const gibbs = players.find((p) => p.name === "Jahmyr Gibbs")!;
const saved = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
async function addKeeper(page: Page, id: string, team: number, round: number) {
  await page
    .getByLabel("Keeper team", { exact: true })
    .selectOption(String(team));
  await page.getByLabel("Keeper player", { exact: true }).selectOption(id);
  await page
    .getByLabel("Keeper round", { exact: true })
    .selectOption(String(round));
  await page.getByRole("button", { name: "Add keeper", exact: true }).click();
}

for (const width of [1440, 390])
  test(`keeper preparation, new order, live skips, reset and portable restore at ${width}px`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page
      .getByRole("button", { name: "Set up draft", exact: true })
      .click();
    await addKeeper(page, chase.id, 0, 1);
    await addKeeper(page, bijan.id, 0, 2);
    await addKeeper(page, gibbs.id, 0, 3);
    await expect(
      page.locator(".keeper-editor").getByRole("alert"),
    ).toContainText("at most two");
    await page
      .getByLabel(`Remove keeper ${bijan.name}`, { exact: true })
      .click();
    await addKeeper(page, bijan.id, 1, 18);
    await page.locator(".keeper-editor").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/keepers-setup-${width}.png` });
    await page
      .getByRole("button", { name: "Save preparation", exact: true })
      .click();
    expect((await saved(page)).started).toBe(false);
    await page.reload();
    await expect(page.locator(".progress-box")).toContainText(
      "2 keepers · 0 live picks",
    );
    await page
      .getByRole("button", { name: "Set up draft", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Move My Team down", exact: true })
      .click();
    await expect(page.locator(".keeper-list")).toContainText(
      "Round 1 · Pick #2",
    );
    await page
      .getByRole("button", { name: "Start draft", exact: true })
      .click();
    expect((await saved(page)).picks[1]).toBe(chase.id);
    expect((await saved(page)).keepers[0].team).toBe(0);
    await expect(
      page.getByRole("button", {
        name: `Keeper pick 2, ${chase.name}`,
        exact: true,
      }),
    ).toBeDisabled();
    const search = page.getByRole("combobox", {
      name: "Search player to draft",
    });
    await search.fill("jamarrchase");
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);
    await search.fill("jahmyrgibbs");
    await search.press("Enter");
    await expect(search).toHaveValue("");
    expect((await saved(page)).cursor).toBe(2);
    await page
      .getByRole("button", { name: "League setup", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Add keeper", exact: true }),
    ).toHaveCount(0);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "New / reset draft" }).click();
    expect((await saved(page)).picks.filter(Boolean)).toHaveLength(2);
    expect((await saved(page)).keepers).toHaveLength(2);
    await page
      .getByRole("button", { name: "Set up draft", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start draft", exact: true })
      .click();
    await search.fill("jahmyrgibbs");
    await search.press("Enter");
    await page.getByRole("button", { name: "Undo Ctrl Z" }).click();
    expect((await saved(page)).picks.filter(Boolean)).toHaveLength(2);
    await page
      .getByRole("button", { name: "Export draft", exact: true })
      .click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /^JSON backup/ }).click();
    const file = await (await download).path();
    const other = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      viewport: { width: 390, height: 844 },
    });
    try {
      const destination = await other.newPage();
      await destination.goto("/");
      destination.once("dialog", (d) => d.accept());
      await destination.getByLabel("Restore draft backup").setInputFiles(file!);
      await expect(destination.getByRole("status")).toContainText(
        "Draft backup restored",
      );
      await destination.reload();
      expect((await saved(destination)).keepers).toEqual(
        (await saved(page)).keepers,
      );
      expect((await saved(destination)).picks).toEqual(
        (await saved(page)).picks,
      );
    } finally {
      await other.close();
    }
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

for (const width of [1440, 390])
  test(`two-pick comparison renders without changing draft and keeps keyboard input working at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page
      .getByRole("button", { name: "Set up draft", exact: true })
      .click();
    await addKeeper(page, bijan.id, 0, 10);
    await page
      .getByRole("button", { name: "Start draft", exact: true })
      .click();
    const before = await saved(page);
    await page.locator(".pick-planner summary").click();
    await expect(page.locator(".plan-list li")).toHaveCount(4);
    await expect(page.locator(".planner-content")).toContainText(
      "72 opponent-choice scenarios",
    );
    expect(await saved(page)).toEqual(before);
    await page.locator(".pick-planner").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/planner-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("/");
    const input = page.getByRole("combobox", {
      name: "Search player to draft",
    });
    await expect(input).toBeFocused();
    await input.fill("jamarrchase");
    await input.press("Enter");
    expect((await saved(page)).picks[0]).toBe(chase.id);
    await expect(page.locator(".planner-content")).toContainText(
      "on the clock",
    );
    expect(errors).toEqual([]);
  });

test("format-1 browser save restores and rewrites as format 2 on the next live action", async ({
  page,
}) => {
  const state = recordPick(
    { ...newDraft(undefined, players), started: true },
    chase.id,
  );
  const { keepers: _, ...legacy } = { ...state, version: 1 };
  await page.goto("/");
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: STORAGE_KEY,
    raw: JSON.stringify(legacy),
  });
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Draft restored");
  expect((await saved(page)).version).toBe(1);
  const input = page.getByRole("combobox", { name: "Search player to draft" });
  await input.fill("bijanrobinson");
  await input.press("Enter");
  const migrated = await saved(page);
  expect(migrated.version).toBe(2);
  expect(migrated.keepers).toEqual([]);
  expect(migrated.picks.slice(0, 2)).toEqual([chase.id, bijan.id]);
  await page.getByRole("button", { name: "Undo Ctrl Z" }).click();
  expect((await saved(page)).picks[0]).toBe(chase.id);
});
