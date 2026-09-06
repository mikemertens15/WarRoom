import test from "node:test";
import assert from "node:assert/strict";
import audit from "../data/players-2026-audit.json";
import {
  applyCurrentData,
  currentPlayers,
  CURRENT_DATA,
  newCurrentDraft,
} from "../src/lib/current-data";
import { newDraft, recordPick, rosterFor, undoPick } from "../src/lib/draft";
import { DEFAULT_SCORING } from "../src/lib/config";
import { projectedPoints, recommend } from "../src/lib/engine";
import { decodeState } from "../src/lib/persistence";
import { simulateDraft } from "../src/lib/simulation";

test("2026 snapshot is complete, real, source-attributed and free of duplicate identities", () => {
  const players = currentPlayers();
  assert(players.length >= 300);
  assert.equal(new Set(players.map((p) => p.id)).size, players.length);
  assert(
    players.every(
      (p) =>
        p.season === 2026 &&
        p.sample === false &&
        p.source?.includes("ESPN") &&
        p.stats,
    ),
  );
  assert.equal(players.filter((p) => p.position === "DST").length, 32);
  assert(players.filter((p) => p.position === "K").length >= 32);
  assert(
    players.every(
      (p) =>
        p.tier === undefined && p.risk === undefined && p.upside === undefined,
    ),
  );
  assert.deepEqual(CURRENT_DATA.missingTop250, []);
  assert(players.filter((p) => p.adp).every((p) => p.adp! < 169));
  assert(
    players.every((p) => p.bye === undefined || (p.bye >= 1 && p.bye <= 18)),
  );
});
test("offensive projections reconstruct ESPN totals including miscellaneous points", () => {
  const source = audit.details as Record<string, { espnProjection: number }>;
  for (const p of currentPlayers().filter((p) => p.position !== "K")) {
    const points = projectedPoints(p, DEFAULT_SCORING);
    assert(Math.abs(points - source[p.id].espnProjection) < 0.0001, p.name);
    assert(Math.abs(points - p.projection) <= 0.00501, p.name);
  }
});
test("fractional kicker projection uses source made FG yards and retained adjustments", () => {
  for (const p of currentPlayers().filter((p) => p.position === "K")) {
    assert.equal(
      projectedPoints(p, DEFAULT_SCORING),
      p.stats!.fgYards! * 0.1 + p.stats!.extraPoints! + p.stats!.otherPoints!,
    );
  }
});
test("current snapshot update preserves recognizable demo picks, order, cursor and undo", () => {
  let s = { ...newDraft(), started: true };
  s.league.order = [5, 2, 0, 1, 4, 3];
  s = recordPick(s, "demo-wr-1");
  s = recordPick(s, "demo-rb-1");
  const updated = applyCurrentData(s);
  assert.deepEqual(updated.league.order, s.league.order);
  assert.equal(updated.cursor, 2);
  assert.equal(rosterFor(updated, 5)[0].name, "Ja'Marr Chase");
  assert.equal(rosterFor(updated, 2)[0].name, "Bijan Robinson");
  assert.equal(undoPick(updated).picks.filter(Boolean).length, 1);
  assert.equal(decodeState(JSON.stringify(updated)).picks[0], updated.picks[0]);
  assert.deepEqual(s.picks.slice(0, 2), ["demo-wr-1", "demo-rb-1"]);
});
test("unmatchable historical players stop the update without deleting picks", () => {
  const s = recordPick({ ...newDraft(), started: true }, "demo-wr-60");
  assert.throws(() => applyCurrentData(s), /Cannot safely match/);
  assert.equal(s.picks[0], "demo-wr-60");
});
test("fresh draft uses real data and yields finite actionable recommendations", () => {
  const s = newCurrentDraft();
  const model = recommend(s);
  assert(s.players.every((p) => !p.sample));
  assert.equal(model.ranked[0].statusLabel, "TAKE");
  assert(
    model.ranked.every(
      (p) => Number.isFinite(p.score) && p.survival >= 0 && p.survival <= 1,
    ),
  );
});
for (let seat = 0; seat < 6; seat++)
  test(`current 2026 data completes a full simulated draft at seat ${seat + 1}`, () => {
    const result = simulateDraft(seat, 150 + seat, currentPlayers());
    assert.equal(result.state.cursor, 108);
    assert.equal(new Set(result.state.picks).size, 108);
    assert.equal(result.userSelections, 18);
  });
