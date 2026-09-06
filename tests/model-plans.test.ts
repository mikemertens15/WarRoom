import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCORING, MODEL, defaultLeague } from "../src/lib/config";
import { newDraft, recordPick } from "../src/lib/draft";
import {
  expectedRemoval,
  opponentTendencies,
  recommend,
  rosterGains,
  rosterUtility,
  valuePlayers,
} from "../src/lib/engine";
import { comparePickPlans } from "../src/lib/planner";
import { currentPlayers } from "../src/lib/current-data";
import { samplePlayers } from "../src/lib/sample";
import type { Player } from "../src/lib/types";

const pool: Player[] = ["QB", "RB", "WR", "TE", "DST", "K"].flatMap((pos) =>
  Array.from({ length: 40 }, (_, i) => ({
    id: `${pos}${i}`,
    name: `${pos}${i}`,
    team: "TEST",
    position: pos as Player["position"],
    projection: 400 - i * 10,
    adp: i * 6 + 1,
  })),
);
const valuation = valuePlayers(pool, DEFAULT_SCORING);
const p = (id: string) => valuation.players.find((p) => p.id === id)!;

test("an elite QB upgrade earns its starter improvement and displaced starter depth", () => {
  const gains = rosterGains([p("QB3")], [p("QB0")], valuation).get("QB0")!;
  assert.equal(gains.starterGain, 30);
  assert.equal(gains.benchGain, 18);
  assert.equal(gains.rosterGain, 48);
  const s = {
    ...newDraft(defaultLeague(), pool, [
      { team: 0, round: 10, playerId: "QB3" },
    ]),
    started: true,
  };
  const ranked = recommend(s).ranked.find((p) => p.id === "QB0")!;
  assert.equal(ranked.rosterGain, 48);
  assert(ranked.fit > 0.14);
});

test("bench reserves use deep-pool value with diminishing same-position returns", () => {
  const first = rosterGains([p("QB0")], [p("QB7")], valuation).get("QB7")!;
  const second = rosterGains([p("QB0"), p("QB6")], [p("QB7")], valuation).get(
    "QB7",
  )!;
  assert.equal(first.starterGain, 0);
  assert.equal(first.rosterGain, 10);
  assert.equal(second.rosterGain, 10 * MODEL.benchDecay);
  assert.equal(
    rosterGains([p("QB0")], [p("QB39")], valuation).get("QB39")!.rosterGain,
    0,
  );
});

test("a skill-player upgrade rebalances FLEX and adds the displaced player's bench contribution", () => {
  const roster = [p("RB1"), p("RB2"), p("WR1"), p("WR2"), p("RB3"), p("WR3")];
  const before = rosterUtility(roster, valuation);
  const after = rosterUtility([...roster, p("WR0")], valuation);
  assert.equal(after.starter - before.starter, 30);
  assert(after.bench > before.bench);
  assert.equal(
    rosterGains(roster, [p("WR0")], valuation).get("WR0")!.rosterGain,
    after.total - before.total,
  );
});

test("expected-choice mass is conserved when a heavily weighted player hits capacity", () => {
  const result = expectedRemoval([0.05, 0.5, 0.8], [100, 10, 1]);
  assert(Math.abs(result.reduce((a, b) => a + b, 0) - 1) < 1e-10);
  assert.equal(result[0], 0.05);
  assert.equal(result[1], 0.5);
  assert(result[2] <= 0.8);
  assert.deepEqual(expectedRemoval([0.1, 0.2], [1, 1]), [0.1, 0.2]);
});

test("learning stays neutral for keepers and short samples, then remains bounded and undoable", () => {
  let s = {
    ...newDraft(defaultLeague(), pool, [
      { team: 1, round: 10, playerId: "QB0" },
      { team: 1, round: 11, playerId: "QB1" },
    ]),
    started: true,
  };
  const neutral = opponentTendencies(s, valuation.players)[1];
  assert.equal(neutral.livePicks, 0);
  assert(Object.values(neutral.factors).every((f) => f === 1));
  s = recordPick(s, "QB2", 1);
  s = recordPick(s, "QB3", 10);
  assert(
    Object.values(opponentTendencies(s, valuation.players)[1].factors).every(
      (f) => f === 1,
    ),
  );
  s = recordPick(s, "QB4", 13);
  const learned = opponentTendencies(s, valuation.players)[1];
  assert.equal(learned.livePicks, 3);
  assert(learned.factors.QB > 1);
  assert(
    Object.values(learned.factors).every(
      (f) => f >= MODEL.opponentBiasMin && f <= MODEL.opponentBiasMax,
    ),
  );
});

test("two-pick scenarios are deterministic, finite, non-mutating, and exclude every keeper", () => {
  const players = currentPlayers(),
    ks = [
      { team: 0, round: 2, playerId: players[0].id },
      { team: 1, round: 5, playerId: players[1].id },
    ];
  const s = { ...newDraft(defaultLeague(), players, ks), started: true },
    raw = JSON.stringify(s),
    model = recommend(s);
  const comparison = comparePickPlans(s, model);
  assert.deepEqual(comparison, comparePickPlans(s, model));
  assert.equal(JSON.stringify(s), raw);
  assert.equal(comparison.target, 12);
  assert(comparison.plans.length >= 6);
  for (const plan of comparison.plans) {
    assert(!ks.some((k) => k.playerId === plan.playerId));
    assert(!players.slice(0, 2).some((p) => p.name === plan.nextName));
    assert(Number.isFinite(plan.meanGain));
    assert(plan.lowGain <= plan.highGain);
    assert(plan.bestShare >= 0 && plan.bestShare <= 1);
    assert(plan.nextShare > 0 && plan.nextShare <= 1);
  }
});

test("consecutive picks have identical scenario outcomes and order-independent best pair", () => {
  let s = {
    ...newDraft({ ...defaultLeague(), myTeam: 5 }, pool),
    started: true,
  };
  for (let i = 0; i < 5; i++) s = recordPick(s, `K${i + 20}`);
  const result = comparePickPlans(s, recommend(s));
  assert.equal(result.target, 6);
  for (const plan of result.plans) {
    assert.equal(plan.lowGain, plan.highGain);
    assert.equal(plan.nextShare, 1);
  }
  assert.equal(result.plans[0].meanGain, result.plans[1].meanGain);
  assert.match(result.verdict, /Close call/);
});

test("planner waits off-clock and refuses misleading scenarios across earlier gaps", () => {
  const s = { ...newDraft(defaultLeague(), samplePlayers()), started: true };
  assert.match(
    comparePickPlans({ ...s, cursor: 1 }, recommend({ ...s, cursor: 1 }))
      .reason!,
    /on the clock/,
  );
  assert.match(
    comparePickPlans({ ...s, cursor: 11 }, recommend({ ...s, cursor: 11 }))
      .reason!,
    /earlier draft gaps/,
  );
  assert.match(
    comparePickPlans({ ...s, cursor: 107 }, recommend({ ...s, cursor: 107 }))
      .reason!,
    /No later live pick/,
  );
});
