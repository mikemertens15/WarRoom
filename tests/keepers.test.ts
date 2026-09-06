import test from "node:test";
import assert from "node:assert/strict";
import { defaultLeague } from "../src/lib/config";
import {
  availablePlayers,
  configureDraft,
  hasLivePicks,
  keeperAssignments,
  needs,
  newDraft,
  recordPick,
  rosterFor,
  snakeOrder,
  undoPick,
} from "../src/lib/draft";
import { applyCurrentData, currentPlayers } from "../src/lib/current-data";
import { draftCSV, rosterText } from "../src/lib/export";
import { forecastWindow, recommend } from "../src/lib/engine";
import {
  BACKUP_KEY,
  decodeState,
  loadState,
  saveState,
  STORAGE_KEY,
} from "../src/lib/persistence";
import { simulateDraft } from "../src/lib/simulation";
import { samplePlayers } from "../src/lib/sample";
import type { Keeper } from "../src/lib/types";

const pool = samplePlayers();
const keeper = (team = 0, round = 1, playerId = pool[0].id): Keeper => ({
  team,
  round,
  playerId,
});

test("keeper rounds follow stable team identity across odd/even rounds and a new order", () => {
  const initial = newDraft(defaultLeague(), pool, [
    keeper(),
    keeper(0, 2, pool[1].id),
  ]);
  assert.equal(initial.picks[0], pool[0].id);
  assert.equal(initial.picks[11], pool[1].id);
  assert.equal(initial.cursor, 1);
  assert.equal(hasLivePicks(initial), false);
  const league = { ...initial.league, order: [5, 4, 3, 2, 1, 0] };
  const moved = configureDraft(initial, league, pool, initial.keepers, false);
  assert.equal(moved.picks[5], pool[0].id);
  assert.equal(moved.picks[6], pool[1].id);
  assert.equal(moved.picks[0], null);
  assert.equal(moved.started, false);
  assert.deepEqual(
    rosterFor(moved, 0).map((p) => p.id),
    [pool[0].id, pool[1].id],
  );
  assert.equal(decodeState(JSON.stringify(moved)).cursor, 0);
});

test("keeper validation rejects duplicate identities, round collisions, limits and invalid values", () => {
  const check = (ks: Keeper[]) => keeperAssignments(defaultLeague(), pool, ks);
  assert.equal(check([]).size, 0);
  assert.throws(() => check([keeper(), keeper(1, 2)]), /twice/);
  assert.throws(
    () => check([keeper(), keeper(0, 1, pool[1].id)]),
    /same team's round/,
  );
  assert.throws(
    () => check([keeper(), keeper(0, 2, pool[1].id), keeper(0, 3, pool[2].id)]),
    /at most two/,
  );
  for (const k of [
    keeper(6),
    keeper(-1),
    keeper(0, 0),
    keeper(0, 19),
    keeper(0, 1.5),
    keeper(0, 1, "missing"),
  ])
    assert.throws(() => check([k]), /valid/);
});

test("keepers are unavailable immediately, skipped by live entry, frozen and preserved by undo", () => {
  const s = {
    ...newDraft(defaultLeague(), pool, [keeper(), keeper(0, 2, pool[1].id)]),
    started: true,
  };
  assert.equal(rosterFor(s, 0).length, 2);
  assert(!availablePlayers(s).some((p) => p.id === pool[0].id));
  assert(!recommend(s).ranked.some((p) => p.id === pool[0].id));
  assert.equal(forecastWindow(s).target, 12);
  assert.throws(() => recordPick(s, pool[2].id, 0), /keeper/i);
  assert.throws(() => recordPick(s, pool[0].id), /already/);
  const next = recordPick(s, pool[2].id);
  assert.equal(next.picks[1], pool[2].id);
  assert.throws(
    () =>
      configureDraft(
        next,
        { ...s.league, order: [1, 0, 2, 3, 4, 5] },
        pool,
        s.keepers,
        true,
      ),
    /lock/,
  );
  assert.throws(() => configureDraft(next, s.league, pool, [], true), /lock/);
  assert.deepEqual(undoPick(next), s);
  assert.equal(
    configureDraft(undoPick(next), s.league, pool, [], true).picks.filter(
      Boolean,
    ).length,
    0,
  );
});

test("reservations survive refresh, exports, and all history validation", () => {
  const s = recordPick(
    {
      ...newDraft(defaultLeague(), pool, [keeper(0, 10, "demo-wr-1")]),
      started: true,
    },
    "demo-rb-1",
  );
  const updated = applyCurrentData(s);
  const id = currentPlayers().find((p) => p.name === "Ja'Marr Chase")!.id;
  assert.equal(updated.keepers[0].playerId, id);
  assert.equal(
    undoPick(decodeState(JSON.stringify(updated))).picks.filter(Boolean)[0],
    id,
  );
  assert.match(rosterText(updated), /KEEPER · R10/);
  assert.match(draftCSV(updated), /"keeper"/);
  assert.match(draftCSV(updated), /"true"/);
  const index = [...keeperAssignments(s.league, pool, s.keepers).keys()][0];
  for (const history of [false, true]) {
    const bad = structuredClone(s);
    (history ? bad.history[0].picks : bad.picks)[index] = null;
    assert.throws(() => decodeState(JSON.stringify(bad)), /reserved keeper/);
  }
  assert.throws(
    () => decodeState(JSON.stringify({ ...s, cursor: index })),
    /keeper reservation/,
  );
});

test("legacy format-1 saves migrate read-only and survive as recovery on the next write", () => {
  const s = recordPick({ ...newDraft(), started: true }, pool[0].id);
  const { keepers: _, ...legacy } = { ...s, version: 1 };
  const raw = JSON.stringify(legacy),
    data = new Map([[STORAGE_KEY, raw]]);
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const migrated = loadState(storage).state!;
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.keepers, []);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.deepEqual(migrated.picks, s.picks);
  assert.deepEqual(migrated.history, s.history);
  saveState(storage, migrated);
  assert.equal(storage.getItem(BACKUP_KEY), raw);
  assert.throws(
    () => saveState(storage, { ...migrated, keepers: [keeper()] }),
    /reserved keeper/,
  );
  assert.deepEqual(loadState(storage).state, migrated);
  assert.throws(
    () => decodeState(JSON.stringify({ ...legacy, keepers: [] })),
    /Version-1/,
  );
});

for (let seat = 0; seat < 6; seat++)
  test(`full keeper draft completes all rosters from seat ${seat + 1}`, () => {
    // A round-1 reservation for everyone exercises automatic skips; round 18
    // reservations exercise completion without requiring a final live selection.
    const ks = Array.from({ length: 6 }, (_, team) => [
      keeper(team, 1, pool[team].id),
      keeper(team, 18, pool[team + 6].id),
    ]).flat();
    const { state, userSelections } = simulateDraft(seat, 600 + seat, pool, ks);
    assert.equal(state.cursor, 108);
    assert.equal(userSelections, 16);
    assert.equal(new Set(state.picks).size, 108);
    for (let team = 0; team < 6; team++) {
      assert.equal(rosterFor(state, team).length, 18);
      assert.deepEqual(needs(rosterFor(state, team)), []);
    }
    for (const [i, k] of keeperAssignments(state.league, pool, ks))
      assert.equal(state.picks[i], k.playerId);
    assert.equal(decodeState(JSON.stringify(state)).cursor, 108);
    assert.equal(
      snakeOrder(state.league.order)[state.history[0].cursor].round,
      2,
    );
  });
