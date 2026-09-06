/** Explicit, build-time refresh. The app itself never calls provider APIs. */
import { mkdir, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { normalizePlayers } from "../src/lib/ingest";
import { DEFAULT_SCORING } from "../src/lib/config";
import { projectedPoints } from "../src/lib/engine";
import type { Player, Position, Stats } from "../src/lib/types";

const SEASON = 2026;
const ROOT = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}`;
const sources = {
  projections: `${ROOT}/segments/0/leaguedefaults/3?view=kona_player_info`,
  teams: `${ROOT}?view=proTeamSchedules_wl`,
  consensus: "https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php",
};
type ESPNPlayer = {
  id: number;
  fullName: string;
  defaultPositionId: number;
  proTeamId: number;
  injuryStatus?: string;
  active?: boolean;
  ownership?: {
    averageDraftPosition?: number;
    date?: number;
    percentOwned?: number;
  };
  draftRanksByRankType?: { PPR?: { rank?: number } };
  stats?: {
    seasonId: number;
    statSourceId: number;
    statSplitTypeId: number;
    scoringPeriodId: number;
    appliedTotal: number;
    stats: Record<string, number>;
  }[];
};
type ConsensusPlayer = {
  player_id: number;
  player_name: string;
  player_position_id: string;
  player_team_id: string;
  rank_ecr: number;
  pos_rank: string;
};
const positionMap: Record<number, Position> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DST",
};
const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/g, "")
    .replace(/[^a-z0-9]/g, "");
const normalizeTeam = (team: string) =>
  ({ JAC: "JAX", WSH: "WAS", LA: "LAR" })[team] ?? team;

async function main() {
  const fetchedAt = new Date().toISOString();
  const cacheDir = "artifacts/data-refresh";
  await mkdir(cacheDir, { recursive: true });
  await mkdir("data", { recursive: true });
  async function get(
    name: string,
    url: string,
    headers?: Record<string, string>,
  ) {
    const path = `${cacheDir}/${name}`;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const text = await response.text();
    await writeFile(path, text);
    return text;
  }
  const filter = {
    players: {
      limit: 2000,
      filterSlotIds: { value: [0, 2, 4, 6, 16, 17] },
      filterStatsForSourceIds: { value: [1] },
      filterStatsForExternalIds: { value: [SEASON] },
      sortDraftRanks: { sortPriority: 1, sortAsc: true, value: "PPR" },
    },
  };
  const [rawPlayers, rawTeams, rawConsensus] = await Promise.all([
    get("espn-full.json", sources.projections, {
      "x-fantasy-filter": JSON.stringify(filter),
    }),
    get("espn-teams.txt", sources.teams),
    get("rankings.html", sources.consensus),
  ]);
  const espn = JSON.parse(rawPlayers) as { players: { player: ESPNPlayer }[] };
  const teamData = JSON.parse(rawTeams) as {
    settings: {
      defaultDraftPosition: number;
      proTeams: { id: number; abbrev: string; byeWeek: number }[];
    };
  };
  // Parse data already embedded in the public page; never execute provider scripts.
  const match = rawConsensus.match(/var ecrData = (.+?);\s*\n/);
  if (!match)
    throw new Error("FantasyPros public consensus data changed shape.");
  const ecr = JSON.parse(match[1]) as {
    year: string;
    scoring: string;
    ranking_type_name: string;
    week: string;
    last_updated_ts: number;
    players: ConsensusPlayer[];
  };
  if (
    Number(ecr.year) !== SEASON ||
    ecr.scoring !== "PPR" ||
    ecr.ranking_type_name !== "draft" ||
    Number(ecr.week) !== 0
  )
    throw new Error("Consensus must be 2026 full-season PPR draft ranks.");
  if (Date.now() - ecr.last_updated_ts * 1000 > 7 * 86400000)
    throw new Error(
      "Consensus is more than seven days old; review before replacing snapshot.",
    );
  if (
    !Array.isArray(espn.players) ||
    espn.players.length < 300 ||
    espn.players.length >= 2000
  )
    throw new Error("ESPN pool is incomplete or hit the query limit.");
  const teams = new Map(teamData.settings.proTeams.map((t) => [t.id, t]));
  const defaultAdp = teamData.settings.defaultDraftPosition;
  if (!Number.isFinite(defaultAdp))
    throw new Error("Missing ESPN un-drafted ADP ceiling.");
  const matchedRanks = new Set<number>();
  const players: Player[] = [];
  const omitted: { name: string; reason: string }[] = [];
  const adpDates: number[] = [];
  const details: Record<
    string,
    {
      espnId: number;
      fantasyProsId?: number;
      espnProjection: number;
      adpSource?: string;
      adpUpdatedAt?: string;
      scoringNote: string;
    }
  > = {};
  for (const { player: p } of espn.players) {
    const position = positionMap[p.defaultPositionId];
    if (!position) continue;
    const season = p.stats?.find(
      (s) =>
        s.seasonId === SEASON &&
        s.statSourceId === 1 &&
        s.statSplitTypeId === 0 &&
        s.scoringPeriodId === 0,
    );
    if (!season || !Number.isFinite(season.appliedTotal)) {
      omitted.push({
        name: p.fullName,
        reason: "No published 2026 season projection",
      });
      continue;
    }
    const team = teams.get(p.proTeamId);
    const teamCode = normalizeTeam(team?.abbrev ?? "FA");
    let matches = ecr.players.filter(
      (c) =>
        c.player_position_id === position &&
        (position === "DST"
          ? normalizeTeam(c.player_team_id) === teamCode
          : normalizeName(c.player_name) === normalizeName(p.fullName)),
    );
    if (matches.length > 1)
      matches = matches.filter(
        (c) => normalizeTeam(c.player_team_id) === teamCode,
      );
    if (matches.length > 1)
      throw new Error(`Ambiguous consensus identity: ${p.fullName}`);
    const consensus = matches[0];
    if (consensus) matchedRanks.add(consensus.player_id);
    const v = (id: number) => {
      const n = season.stats[id] ?? 0;
      if (!Number.isFinite(n)) throw new Error(`Bad stat ${id}: ${p.fullName}`);
      return n;
    };
    let stats: Stats;
    let scoringNote: string;
    if (position === "DST") {
      stats = { dstPoints: season.appliedTotal };
      scoringNote = "ESPN default D/ST scoring, aggregate season points.";
    } else if (position === "K") {
      if (v(83) > 0 && v(214) <= 0)
        throw new Error(
          `No made-FG yardage for ${p.fullName}; cannot calculate fractional scoring.`,
        );
      // Replace only ESPN's 3/4/5 point FG bucket contribution with exact made yards / 10.
      // Keep ESPN's remaining adjustments (e.g. missed field goal penalties) as published.
      const otherPoints =
        season.appliedTotal - (v(80) * 3 + v(77) * 4 + v(74) * 5 + v(86));
      stats = { fgYards: v(214), extraPoints: v(86), otherPoints };
      scoringNote =
        "Made FG yards × 0.1 + XP; ESPN remaining kicker adjustments retained.";
    } else {
      stats = {
        passYards: v(3),
        passTD: v(4),
        interceptions: v(20),
        rushYards: v(24),
        rushTD: v(25),
        receptions: v(53),
        recYards: v(42),
        recTD: v(43),
        fumblesLost: v(72),
      };
      const basic = projectedPoints(
        {
          id: "temp",
          name: p.fullName,
          team: teamCode,
          position,
          projection: 0,
          stats,
        },
        DEFAULT_SCORING,
      );
      stats.otherPoints = season.appliedTotal - basic;
      if (Math.abs(stats.otherPoints) > 25)
        throw new Error(
          `Unexpected ESPN miscellaneous scoring adjustment for ${p.fullName}: ${stats.otherPoints}`,
        );
      scoringNote =
        "ESPN season stat line; otherPoints retains two-point, return and miscellaneous scoring.";
    }
    // ESPN values near its undrafted ceiling are censored, not meaningful late ADP.
    const rawAdp = p.ownership?.averageDraftPosition;
    const adp =
      rawAdp && rawAdp > 0 && rawAdp < defaultAdp - 1 ? rawAdp : undefined;
    if (adp && p.ownership?.date) adpDates.push(p.ownership.date);
    const id = `espn-${p.id}`;
    const row: Player = {
      id,
      name: p.fullName,
      team: teamCode,
      position,
      projection: season.appliedTotal,
      stats,
      adp,
      consensusRank: consensus?.rank_ecr,
      positionalRank: consensus
        ? Number(consensus.pos_rank.replace(/\D/g, "")) || undefined
        : undefined,
      bye: team?.byeWeek || undefined,
      status:
        p.injuryStatus && p.injuryStatus !== "ACTIVE"
          ? p.injuryStatus.replaceAll("_", " ")
          : undefined,
      source: `ESPN 2026 season projections/ADP/status; ${consensus ? "FantasyPros PPR ECR; " : ""}retrieved ${fetchedAt}`,
      season: SEASON,
      sample: false,
    };
    row.projection =
      Math.round(projectedPoints(row, DEFAULT_SCORING) * 100) / 100;
    if (row.projection <= 0 && !consensus) {
      omitted.push({
        name: p.fullName,
        reason: "Nonpositive season projection and no consensus rank",
      });
      continue;
    }
    players.push(row);
    details[id] = {
      espnId: p.id,
      fantasyProsId: consensus?.player_id,
      espnProjection: season.appliedTotal,
      adpSource: adp ? "ESPN platform ADP" : undefined,
      adpUpdatedAt:
        adp && p.ownership?.date
          ? new Date(p.ownership.date).toISOString()
          : undefined,
      scoringNote,
    };
  }
  const normalized = normalizePlayers(players);
  const counts = Object.fromEntries(
    ["QB", "RB", "WR", "TE", "DST", "K"].map((pos) => [
      pos,
      normalized.filter((p) => p.position === pos).length,
    ]),
  );
  if (
    normalized.length < 300 ||
    Object.entries(counts).some(
      ([pos, n]) => n < (["RB", "WR"].includes(pos) ? 50 : 20),
    )
  )
    throw new Error(`Insufficient coverage: ${JSON.stringify(counts)}`);
  const missingTop250 = ecr.players
    .filter((p) => p.rank_ecr <= 250 && !matchedRanks.has(p.player_id))
    .map((p) => ({
      name: p.player_name,
      rank: p.rank_ecr,
      position: p.player_position_id,
    }));
  if (missingTop250.length)
    throw new Error(
      `Missing consensus top-250 players: ${JSON.stringify(missingTop250)}`,
    );
  normalized.sort(
    (a, b) =>
      (a.consensusRank ?? 9999) - (b.consensusRank ?? 9999) ||
      b.projection - a.projection,
  );
  const localDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(fetchedAt));
  const snapshot = {
    metadata: {
      id: `espn-fp-2026-${fetchedAt}`,
      season: SEASON,
      fetchedAt,
      label: `2026 ESPN + FantasyPros · ${localDate}`,
      sources,
      consensusUpdatedAt: new Date(ecr.last_updated_ts * 1000).toISOString(),
      espnProjectionUpdatedAt: null, // ESPN does not supply a projection publication timestamp here.
      adpUpdatedRange: adpDates.length
        ? [
            new Date(Math.min(...adpDates)).toISOString(),
            new Date(Math.max(...adpDates)).toISOString(),
          ]
        : [],
      counts,
      playerCount: normalized.length,
      withAdp: normalized.filter((p) => p.adp).length,
      withConsensus: normalized.filter((p) => p.consensusRank).length,
      withStatus: normalized.filter((p) => p.status).length,
      notes: [
        "Full-season 2026 projections, not Week 1.",
        "Source projections are ESPN; consensus rank is FantasyPros where identity matches. No synthetic upside/risk or tier fields are supplied.",
        "ESPN ADP at or above 169 is treated as censored/missing; forecast falls back to consensus/model rank.",
        "Kickers use exact projected made-field-goal yards with ESPN other adjustments retained. DST retains ESPN default scoring.",
        "otherPoints preserves source scoring outside the configurable core stats, including two-point conversions and return scores. It is a fixed points adjustment when custom scoring changes.",
        "Injury/status designations are ESPN's snapshot, not medical judgments or independent news verification.",
        "ESPN does not expose a full-season projection update timestamp; fetchedAt is retrieval time, not publication time.",
      ],
      rawHashes: {
        espn: createHash("sha256").update(rawPlayers).digest("hex"),
        consensus: createHash("sha256").update(rawConsensus).digest("hex"),
      },
      omittedCount: omitted.length,
      missingTop250,
    },
    players: normalized,
  };
  // Validate the whole output before replacing the known-good snapshot.
  const output = JSON.stringify(snapshot, null, 2) + "\n";
  await writeFile("data/players-2026.json.tmp", output);
  await rename("data/players-2026.json.tmp", "data/players-2026.json");
  await writeFile(
    "data/players-2026-audit.json",
    JSON.stringify({ ...snapshot.metadata, details, omitted }, null, 2) + "\n",
  );
  console.log(JSON.stringify(snapshot.metadata, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
