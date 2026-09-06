import type { Player, Position } from "./types";
/** Demonstration only. These are NOT 2026 projections, team assignments or ADPs.
 * Recognizable names demonstrate search; the remainder are fictional test players.
 */
const names: Record<Position, string[]> = {
  WR: ["Ja'Marr Chase", "Justin Jefferson", "CeeDee Lamb", "Amon-Ra St. Brown", "Puka Nacua", "A.J. Brown", "Nico Collins", "Malik Nabers"],
  RB: ["Bijan Robinson", "Jahmyr Gibbs", "Saquon Barkley", "Christian McCaffrey", "De'Von Achane", "Jonathan Taylor", "Ashton Jeanty", "Derrick Henry"],
  QB: ["Josh Allen", "Lamar Jackson", "Jayden Daniels", "Jalen Hurts", "Joe Burrow", "Patrick Mahomes"],
  TE: ["Brock Bowers", "Trey McBride", "George Kittle", "Sam LaPorta"], DST: [], K: [],
};
export function samplePlayers(): Player[] {
  const rows: Player[] = [];
  const sizes: Record<Position, number> = { WR: 60, RB: 54, QB: 24, TE: 24, DST: 18, K: 18 };
  const tops: Record<Position, number> = { WR: 345, RB: 325, QB: 355, TE: 245, DST: 145, K: 150 };
  const drops: Record<Position, number> = { WR: 4.2, RB: 4.8, QB: 6, TE: 5.5, DST: 3, K: 2.3 };
  for (const pos of Object.keys(sizes) as Position[]) {
    for (let i = 0; i < sizes[pos]; i++) {
      const projection = Math.round((tops[pos] - drops[pos] * i - Math.floor(i / 6) * 9) * 10) / 10;
      rows.push({ id: `demo-${pos.toLowerCase()}-${i + 1}`, name: names[pos][i] ?? `Demo ${pos} ${String(i + 1).padStart(2, "0")}`, team: "DEMO", position: pos, projection, positionalRank: i + 1, tier: Math.floor(i / 6) + 1, bye: 5 + i % 10, risk: (i % 5) / 10, upside: (i % 4) / 6, source: "Synthetic demonstration data — not current rankings", season: 2026, sample: true });
    }
  }
  const offset: Record<Position, number> = { RB: 0, WR: 0, QB: 115, TE: 45, DST: 130, K: 140 };
  rows.sort((a, b) => (b.projection - offset[b.position]) - (a.projection - offset[a.position]));
  return rows.map((p, i) => ({ ...p, adp: i + 1, consensusRank: i + 1 }));
}
