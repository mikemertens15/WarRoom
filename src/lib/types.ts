/** Shared domain contracts. App release versions do not change the save schema.
 * Season projections are points, ADP is an overall pick number, and risk/upside
 * are optional 0–1 source metrics. Missing optional data is not invented certainty.
 */
export const POSITIONS = ["QB", "RB", "WR", "TE", "DST", "K"] as const;
export type Position = (typeof POSITIONS)[number];
export type Stats = Partial<
  Record<
    | "passYards"
    | "passTD"
    | "interceptions"
    | "rushYards"
    | "rushTD"
    | "receptions"
    | "recYards"
    | "recTD"
    | "fumblesLost"
    | "fgYards"
    | "extraPoints"
    | "dstPoints"
    | "otherPoints",
    number
  >
>;
/** Stable identity plus provider-neutral projected season data. If stats exist,
 * they replace the aggregate projection when scored; omitted stat keys mean zero.
 * dstPoints and otherPoints are fixed points, not counts with configurable weights.
 */
export interface Player {
  id: string;
  name: string;
  team: string;
  position: Position;
  projection: number;
  adp?: number;
  consensusRank?: number;
  positionalRank?: number;
  tier?: number;
  bye?: number;
  status?: string;
  upside?: number;
  risk?: number;
  source?: string;
  season?: number;
  sample?: boolean;
  stats?: Stats;
}
export interface Scoring {
  receptions: number;
  passTD: number;
  rushTD: number;
  recTD: number;
  passYards: number;
  rushYards: number;
  recYards: number;
  interceptions: number;
  fumblesLost: number;
  fgYards: number;
  extraPoints: number;
}
export interface League {
  teams: string[];
  myTeam: number;
  order: number[];
  scoring: Scoring;
  datasetLabel: string;
}
export interface Snapshot {
  picks: (string | null)[];
  cursor: number;
}
/** Persisted schema 1. Picks/cursor use zero-based indexes; cursor 108 is complete.
 * History stores pick actions only. Rosters must be derived, never duplicated here.
 */
export interface DraftState extends Snapshot {
  version: 1;
  league: League;
  players: Player[];
  started: boolean;
  history: Snapshot[];
  updatedAt: string;
  revision: string;
}
/** Display numbers are one-based; team remains a stable zero-based league index. */
export interface PickSlot {
  overall: number;
  round: number;
  seat: number;
  team: number;
}
export interface ValuedPlayer extends Player {
  points: number;
  modelRank: number;
  posRank: number;
  modelTier: number;
  baseline: number;
  vor: number;
  value: number;
  flexValue: number;
  benchBaseline: number;
  depthValue: number;
}
/** Derived and ephemeral. survival is a 0–1 heuristic, score is a model score,
 * alternative is a display name, and alternativeValue is expected league value.
 */
export interface Recommendation extends ValuedPlayer {
  survival: number;
  score: number;
  fit: number;
  need: number;
  urgency: number;
  tierAdjustment: number;
  riskPenalty: number;
  upsideBonus: number;
  alternative?: string;
  alternativeValue: number;
  tierDrop: number;
  peers: number;
  statusLabel: string;
  eligible: boolean;
}
