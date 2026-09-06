import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCORING, defaultLeague } from "../src/lib/config";
import {
  availablePlayers,
  counts,
  needs,
  newDraft,
  nextPick,
  recordPick,
  rosterFor,
  rosterSlots,
  snakeOrder,
  undoPick,
} from "../src/lib/draft";
import {
  forecastWindow,
  projectedPoints,
  recommend,
  survivalForecast,
  valuePlayers,
} from "../src/lib/engine";
import {
  datasetWarnings,
  importPlayers,
  normalizePlayers,
  parseCSV,
} from "../src/lib/ingest";
import {
  BACKUP_KEY,
  decodeState,
  loadState,
  saveState,
  STORAGE_KEY,
} from "../src/lib/persistence";
import { csvCell, draftCSV, rosterText } from "../src/lib/export";
import { simulateDraft } from "../src/lib/simulation";
import { samplePlayers } from "../src/lib/sample";
import type { Player } from "../src/lib/types";
const started = () => ({ ...newDraft(), started: true });
const player = (
  id: string,
  position: Player["position"],
  projection: number,
  extra: Partial<Player> = {},
): Player => ({ id, name: id, team: "TEST", position, projection, ...extra });

test("snake alternates correctly for 18 rounds and every team gets 18 picks", () => {
  const order = snakeOrder([3, 1, 5, 0, 4, 2]);
  assert.deepEqual(
    order.slice(0, 18).map((p) => p.team),
    [3, 1, 5, 0, 4, 2, 2, 4, 0, 5, 1, 3, 3, 1, 5, 0, 4, 2],
  );
  assert.equal(order.length, 108);
  for (let team = 0; team < 6; team++)
    assert.equal(order.filter((p) => p.team === team).length, 18);
  assert.throws(() => snakeOrder([0, 0, 1, 2, 3, 4]));
});
test("all six next-pick positions match an independent round formula", () => {
  const order = snakeOrder([0, 1, 2, 3, 4, 5]);
  for (let seat = 0; seat < 6; seat++) {
    const expected = Array.from(
      { length: 18 },
      (_, r) => r * 6 + (r % 2 ? 5 - seat : seat),
    );
    for (let cursor = 0; cursor <= 108; cursor++) {
      assert.equal(
        nextPick(order, cursor, seat),
        expected.find((i) => i >= cursor) ?? null,
      );
      assert.equal(
        nextPick(order, cursor, seat, true),
        expected.find((i) => i > cursor) ?? null,
      );
    }
  }
});
test("forecast excludes the current user pick and includes the current opponent", () => {
  const s = started();
  assert.equal(forecastWindow(s).selections, 10);
  s.league.myTeam = 5;
  assert.equal(forecastWindow(s).selections, 5);
  s.cursor = 5;
  assert.equal(forecastWindow(s).selections, 0);
  assert.equal(forecastWindow(s).target, 6);
  s.cursor = 107;
  s.league.myTeam = 0;
  assert.equal(forecastWindow(s).target, null);
});
test("picks advance, assign the correct roster and remove availability without mutation", () => {
  const old = started();
  const next = recordPick(old, old.players[0].id);
  assert.equal(old.picks[0], null);
  assert.equal(next.cursor, 1);
  assert.equal(rosterFor(next, 0)[0].id, old.players[0].id);
  assert.equal(availablePlayers(next).length, old.players.length - 1);
  assert.throws(() => recordPick(next, old.players[0].id), /already/);
  assert.throws(() => recordPick(next, "unknown"), /not found/);
  assert.throws(() => recordPick(newDraft(), old.players[0].id), /Start/);
});
test("undo reverses a correction and restores player availability and cursor", () => {
  const s = started();
  const first = recordPick(s, s.players[0].id);
  const second = recordPick(first, s.players[1].id);
  const edited = recordPick(second, s.players[2].id, 0);
  assert(availablePlayers(edited).some((p) => p.id === s.players[0].id));
  assert.deepEqual(undoPick(edited), second);
  assert.deepEqual(undoPick(undoPick(second)), s);
});
test("jumping creates recoverable gaps and forecast skips already populated future picks", () => {
  const s = started();
  const jumped = recordPick({ ...s, cursor: 107 }, s.players[0].id);
  assert.equal(jumped.cursor, 0);
  const order = snakeOrder(s.league.order);
  assert.equal(nextPick(order, 100, 0, false, jumped.picks), null);
});
test("FLEX rebalances to best remaining skill players, IR is not drafted", () => {
  const roster = [
    player("rb1", "RB", 200),
    player("rb2", "RB", 190),
    player("rb3", "RB", 180),
    player("wr1", "WR", 220),
    player("wr2", "WR", 210),
    player("wr3", "WR", 205),
    player("wr4", "WR", 170),
  ];
  const slots = rosterSlots(roster);
  assert.deepEqual(
    slots.filter((s) => s.slot === "FLEX").map((s) => s.player?.id),
    ["wr3", "rb3"],
  );
  assert.equal(slots.find((s) => s.slot === "BN")?.player?.id, "wr4");
  assert.equal(slots.length, 18);
  assert.equal(counts(roster).WR, 4);
  assert.deepEqual(needs(roster), ["QB", "TE", "DST", "K"]);
});
test("replacement reserves 24 RB/WR starters and allocates 12 additional FLEX starters", () => {
  const players = ["RB", "WR", "QB", "TE", "DST", "K"].flatMap((pos) =>
    Array.from({ length: 30 }, (_, i) =>
      player(`${pos}${i + 1}`, pos as Player["position"], 300 - i * 10),
    ),
  );
  const v = valuePlayers(players, DEFAULT_SCORING);
  assert.equal(v.replacementRank.RB + v.replacementRank.WR - 2, 36);
  assert.equal(v.replacementRank.QB, 7);
  assert.equal(v.replacement.QB, 240);
  assert.equal(v.flexBaseline, 120);
  assert.equal(v.replacement.RB, 120);
  assert.equal(v.replacement.WR, 120);
  assert.equal(v.players.find((p) => p.id === "RB1")?.vor, 180);
});
test("thin pools use conservative last-known baseline and report coverage warnings", () => {
  const p = [player("one", "QB", 300)];
  assert.equal(valuePlayers(p, DEFAULT_SCORING).players[0].vor, 0);
  assert(datasetWarnings(p).some((w) => w.includes("108")));
});

test("bench depth differentiates useful backups below starter replacement", () => {
  const players = Array.from({ length: 60 }, (_, i) =>
    player(`rb${i}`, "RB", 300 - i * 4),
  );
  const valued = valuePlayers(players, DEFAULT_SCORING).players;
  const backup = valued.find((p) => p.id === "rb27")!;
  const fringe = valued.find((p) => p.id === "rb50")!;
  assert(backup.vor < 0 && fringe.vor < 0);
  assert(backup.depthValue > 0);
  assert(backup.value > fringe.value);
});
test("stat scoring supports PPR, four-point passing TD and fractional kicker points", () => {
  assert(
    Math.abs(
      projectedPoints(
        player("k", "K", 99, { stats: { fgYards: 38 } }),
        DEFAULT_SCORING,
      ) - 3.8,
    ) < 1e-10,
  );
  assert.equal(
    projectedPoints(
      player("q", "QB", 99, {
        stats: { passYards: 100, passTD: 2, interceptions: 1 },
      }),
      DEFAULT_SCORING,
    ),
    10,
  );
  assert.equal(
    projectedPoints(
      player("w", "WR", 99, {
        stats: { receptions: 5, recYards: 50, recTD: 1 },
      }),
      DEFAULT_SCORING,
    ),
    16,
  );
  assert.equal(
    projectedPoints(player("a", "WR", 255), {
      ...DEFAULT_SCORING,
      receptions: 2,
    }),
    255,
  );
});
test("survival stays in bounds, is 100% for consecutive picks, and decreases with horizon", () => {
  const s = started();
  const av = valuePlayers(s.players, s.league.scoring).players;
  const order = snakeOrder(s.league.order);
  const zero = survivalForecast(s, av, []),
    short = survivalForecast(s, av, order.slice(1, 3)),
    long = survivalForecast(s, av, order.slice(1, 11));
  for (const p of av) {
    assert.equal(zero.get(p.id), 1);
    assert(long.get(p.id)! >= 0 && long.get(p.id)! <= short.get(p.id)!);
  }
  assert(long.get(av[0].id)! < long.get(av.at(-1)!.id)!);
});
test("opponents with filled QB slots reduce QB selection pressure", () => {
  const s = started();
  s.league.myTeam = 0;
  s.cursor = 6;
  const qbs = s.players.filter((p) => p.position === "QB");
  const wrs = s.players.filter((p) => p.position === "WR");
  const filled = { ...s, picks: [...s.picks] },
    empty = { ...s, picks: [...s.picks] };
  for (let i = 1; i < 6; i++) {
    filled.picks[i] = qbs[i].id;
    empty.picks[i] = wrs[i].id;
  }
  const excluded = new Set([...filled.picks, ...empty.picks]);
  const av = valuePlayers(s.players, s.league.scoring).players.filter(
    (p) => !excluded.has(p.id),
  );
  assert(
    survivalForecast(filled, av).get(qbs[0].id)! >
      survivalForecast(empty, av).get(qbs[0].id)!,
  );
});
test("opportunity cost can promote a scarce RB over a slightly higher-value WR", () => {
  const s = started();
  s.players = [
    ...Array.from({ length: 35 }, (_, i) =>
      player(`r${i}`, "RB", i === 0 ? 302 : 200 - i, {
        adp: i === 0 ? 1 : 100 + i,
      }),
    ),
    ...Array.from({ length: 35 }, (_, i) =>
      player(`w${i}`, "WR", i < 5 ? 310 - i : 200 - i, { adp: 60 + i }),
    ),
    ...samplePlayers().filter((p) => !["RB", "WR"].includes(p.position)),
  ];
  const model = recommend(s);
  const r = model.ranked.find((p) => p.id === "r0")!,
    w = model.ranked.find((p) => p.id === "w0")!;
  assert(w.value > r.value);
  assert(r.urgency > w.urgency);
  assert(r.score > w.score);
});
test("recommendations explain finite quantitative components", () => {
  const model = recommend(started());
  for (const p of model.ranked)
    assert(
      Math.abs(
        p.score -
          (p.value * p.fit +
            p.urgency +
            p.tierAdjustment +
            p.need +
            p.upsideBonus -
            p.riskPenalty),
      ) < 0.0001,
    );
  assert.equal(model.ranked[0].statusLabel, "TAKE");
});
test("CSV handles quoted names, escaped quotes, BOM and embedded newlines", () => {
  assert.deepEqual(
    parseCSV('\uFEFFa,b\r\n"hello, world","a""b"\r\n"two\nlines",ok'),
    [
      { a: "hello, world", b: 'a"b' },
      { a: "two\nlines", b: "ok" },
    ],
  );
  assert.throws(() => parseCSV('a,b\n"bad,b'), /unclosed/);
  assert.throws(() => parseCSV("a,a\nx,y"), /unique/);
  assert.throws(() => parseCSV("a,b\nx"), /columns/);
});
test("ingestion validates duplicates, positions, numbers and optional metric bounds", () => {
  const p = player("a", "WR", 250);
  assert.throws(() => normalizePlayers([p, p]), /duplicate/);
  assert.throws(() => normalizePlayers([{ ...p, position: "FB" }]), /position/);
  assert.throws(
    () => normalizePlayers([{ ...p, projection: "NaN" }]),
    /projection/,
  );
  assert.throws(() => normalizePlayers([{ ...p, risk: 2 }]), /risk/);
  assert.throws(
    () => normalizePlayers([{ ...p, stats: { arbitrary: 1 } }]),
    /stat/,
  );
  assert.equal(
    importPlayers(
      "id,name,team,position,projection\nx,Example,TEST,D/ST,99",
      "players.csv",
    )[0].position,
    "DST",
  );
  assert.equal(
    importPlayers(JSON.stringify({ players: [p] }), "players.json")[0].id,
    "a",
  );
});
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}
test("every saved draft reloads with complete settings, dataset, cursor and undo", () => {
  const storage = memoryStorage();
  const s = started();
  const next = recordPick(s, s.players[0].id);
  saveState(storage, next);
  const loaded = loadState(storage).state!;
  assert.equal(loaded.picks[0], s.players[0].id);
  assert.equal(loaded.cursor, 1);
  assert.equal(loaded.players.length, s.players.length);
  assert.equal(undoPick(loaded).picks[0], null);
});
test("damaged primary save recovers backup; total corruption does not start new draft", () => {
  const storage = memoryStorage();
  const s = started();
  saveState(storage, s);
  saveState(storage, recordPick(s, s.players[0].id));
  storage.setItem(STORAGE_KEY, "broken");
  assert.equal(loadState(storage).recovered, true);
  storage.setItem(BACKUP_KEY, "also broken");
  assert.throws(() => loadState(storage));
  assert.equal(storage.getItem(STORAGE_KEY), "broken");
});
test("backup validation rejects duplicate, unknown, malformed picks and incomplete end cursor", () => {
  const s = started();
  s.picks[0] = s.players[0].id;
  s.picks[1] = s.players[0].id;
  assert.throws(() => decodeState(JSON.stringify(s)), /invalid picks/);
  assert.throws(
    () => decodeState(JSON.stringify({ ...started(), cursor: 108 })),
    /invalid picks/,
  );
  assert.throws(
    () => decodeState(JSON.stringify({ ...started(), picks: [] })),
    /invalid picks/,
  );
});
test("quota errors surface instead of claiming an unsaved pick succeeded", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException("Full", "QuotaExceededError");
    },
  };
  assert.throws(() => saveState(storage, started()), /Full/);
});
test("exports include team assignment and protect CSV from formula injection", () => {
  const s = started();
  const next = recordPick(s, s.players[0].id);
  assert(draftCSV(next).includes(s.players[0].name));
  assert(rosterText(next, true).includes("MY TEAM"));
  assert(!rosterText(next, true).includes("Sunday Scaries"));
  assert.equal(csvCell("=HYPERLINK(1)"), '"\'=HYPERLINK(1)"');
});
for (let seat = 0; seat < 6; seat++)
  test(`complete probabilistic draft from seat ${seat + 1} preserves invariants and completes rosters`, () => {
    const { state, userSelections, forecasts } = simulateDraft(seat, 50 + seat);
    assert.equal(new Set(state.picks).size, 108);
    assert.equal(state.cursor, 108);
    assert.equal(userSelections, 18);
    for (let team = 0; team < 6; team++) {
      assert.equal(rosterFor(state, team).length, 18);
      assert.equal(needs(rosterFor(state, team)).length, 0);
    }
    assert(forecasts.length > 0);
    assert(forecasts.every((f) => f.chance >= 0 && f.chance <= 1));
    assert.deepEqual(
      recommend(state).ranked.filter((p) => p.eligible),
      [],
    );
  });
