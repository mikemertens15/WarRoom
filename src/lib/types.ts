export const POSITIONS = ["QB", "RB", "WR", "TE", "DST", "K"] as const;
export type Position = typeof POSITIONS[number];
export type Stats = Partial<Record<"passYards" | "passTD" | "interceptions" | "rushYards" | "rushTD" | "receptions" | "recYards" | "recTD" | "fumblesLost" | "fgYards" | "extraPoints" | "dstPoints" | "otherPoints", number>>;
export interface Player {
  id: string; name: string; team: string; position: Position; projection: number;
  adp?: number; consensusRank?: number; positionalRank?: number; tier?: number;
  bye?: number; status?: string; upside?: number; risk?: number;
  source?: string; season?: number; sample?: boolean; stats?: Stats;
}
export interface Scoring {
  receptions: number; passTD: number; rushTD: number; recTD: number;
  passYards: number; rushYards: number; recYards: number; interceptions: number;
  fumblesLost: number; fgYards: number; extraPoints: number;
}
export interface League { teams: string[]; myTeam: number; order: number[]; scoring: Scoring; datasetLabel: string; }
export interface Snapshot { picks: (string | null)[]; cursor: number; }
export interface DraftState extends Snapshot {
  version: 1; league: League; players: Player[]; started: boolean;
  history: Snapshot[]; updatedAt: string; revision: string;
}
export interface PickSlot { overall: number; round: number; seat: number; team: number; }
export interface ValuedPlayer extends Player {
  points: number; modelRank: number; posRank: number; modelTier: number;
  baseline: number; vor: number; value: number; flexValue: number; benchBaseline: number; depthValue: number;
}
export interface Recommendation extends ValuedPlayer {
  survival: number; score: number; fit: number; need: number; urgency: number;
  tierAdjustment: number; riskPenalty: number; upsideBonus: number;
  alternative?: string; alternativeValue: number; tierDrop: number;
  peers: number; statusLabel: string; eligible: boolean;
}
