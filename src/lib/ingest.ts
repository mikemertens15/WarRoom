import { POSITIONS, type Player, type Stats } from "./types";

/** RFC-4180 style CSV parser: supports BOM, CRLF, commas/newlines inside quotes. */
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false; let closed = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) { if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') { quoted = false; closed = true; } else field += ch; }
    else if (ch === '"' && !field && !closed) quoted = true;
    else if (ch === ",") { row.push(field); field = ""; closed = false; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && input[i + 1] === "\n") i++; row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = ""; closed = false; }
    else { if (closed && ch.trim()) throw new Error("Unexpected text after a quoted CSV field."); field += ch; }
  }
  if (quoted) throw new Error("CSV contains an unclosed quote.");
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  const headers = rows.shift()?.map(h => h.trim()) ?? [];
  if (!headers.length || new Set(headers).size !== headers.length) throw new Error("CSV must have unique column headers.");
  return rows.map((r, i) => { if (r.length !== headers.length) throw new Error(`CSV row ${i + 2}: expected ${headers.length} columns, found ${r.length}.`); return Object.fromEntries(headers.map((h, j) => [h, r[j]])); });
}
const statsKeys = new Set(["passYards", "passTD", "interceptions", "rushYards", "rushTD", "receptions", "recYards", "recTD", "fumblesLost", "fgYards", "extraPoints", "dstPoints", "otherPoints"]);
export function normalizePlayers(input: unknown): Player[] {
  if (!Array.isArray(input) || !input.length || input.length > 5000) throw new Error("Provide an array of 1–5,000 players.");
  const ids = new Set<string>();
  return input.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new Error(`Player row ${i + 1} is invalid.`);
    const r = raw as Record<string, unknown>;
    const prefix = `Player row ${i + 1}`;
    const str = (key: string, required = false) => { const v = r[key]; if (v === undefined || v === null || v === "") { if (required) throw new Error(`${prefix}: ${key} is required.`); return undefined; } if (typeof v !== "string" && typeof v !== "number") throw new Error(`${prefix}: ${key} must be text.`); const s = String(v).trim(); if (!s || s.length > 300) throw new Error(`${prefix}: invalid ${key}.`); return s; };
    const num = (key: string, min = 0, max = 10000, integer = false) => { if (r[key] === undefined || r[key] === null || r[key] === "") return undefined; if (typeof r[key] !== "string" && typeof r[key] !== "number") throw new Error(`${prefix}: ${key} must be numeric.`); const n = Number(r[key]); if (!Number.isFinite(n) || n < min || n > max || integer && !Number.isInteger(n)) throw new Error(`${prefix}: invalid ${key} (${min}–${max}${integer ? ", integer" : ""}).`); return n; };
    const id = str("id", true)!;
    if (ids.has(id)) throw new Error(`${prefix}: duplicate player ID ${id}.`); ids.add(id);
    const position = str("position", true)!.toUpperCase().replace("D/ST", "DST").replace("DEF", "DST");
    if (!POSITIONS.includes(position as Player["position"])) throw new Error(`${prefix}: position must be QB, RB, WR, TE, DST or K.`);
    const projection = num("projection", -100, 2000);
    if (projection === undefined) throw new Error(`${prefix}: projection is required.`);
    let stats: Stats | undefined;
    if (r.stats !== undefined && r.stats !== "") {
      const value = typeof r.stats === "string" ? JSON.parse(r.stats) : r.stats;
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) throw new Error(`${prefix}: stats must be a nonempty object.`);
      stats = {};
      for (const [k, v] of Object.entries(value)) { if (!statsKeys.has(k) || typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 100000) throw new Error(`${prefix}: invalid stat ${k}.`); stats[k as keyof Stats] = v; }
    }
    if (r.sample !== undefined && ![true, false, "true", "false", ""].includes(r.sample as boolean | string)) throw new Error(`${prefix}: sample must be true or false.`);
    return { id, name: str("name", true)!, team: str("team", true)!, position: position as Player["position"], projection, adp: num("adp", .01), consensusRank: num("consensusRank", 1, 10000, true), positionalRank: num("positionalRank", 1, 10000, true), tier: num("tier", 1, 1000, true), bye: num("bye", 1, 18, true), status: str("status"), upside: num("upside", 0, 1), risk: num("risk", 0, 1), source: str("source"), season: num("season", 2000, 2100, true), sample: r.sample === true || r.sample === "true", stats };
  });
}
export function importPlayers(text: string, filename: string): Player[] {
  const raw = filename.toLowerCase().endsWith(".csv") ? parseCSV(text) : JSON.parse(text);
  return normalizePlayers(Array.isArray(raw) ? raw : raw.players);
}
export function datasetWarnings(players: Player[]): string[] {
  const warnings: string[] = [];
  if (players.some(p => p.sample)) warnings.push("Contains mock players. Replace this pool before your real draft.");
  if (players.length < 108) warnings.push(`Only ${players.length} players: a complete draft needs 108 unique players.`);
  for (const pos of POSITIONS) { const n = players.filter(p => p.position === pos).length; const min = pos === "RB" || pos === "WR" ? 13 : 7; if (n < min) warnings.push(`${pos}: only ${n} players; replacement estimates and roster coverage may be unreliable.`); }
  if (!players.some(p => p.adp)) warnings.push("No ADP supplied. Availability uses consensus/model rank.");
  if (players.some(p => !p.stats)) warnings.push("Aggregate projections are used as supplied. They must match your scoring; only players with stats are rescored.");
  return warnings;
}
