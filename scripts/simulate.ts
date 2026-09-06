import { needs, rosterFor } from "../src/lib/draft";
import { simulateDraft } from "../src/lib/simulation";
const seed = Number(process.argv[2] ?? 42);
for (let seat = 0; seat < 6; seat++) {
  const result = simulateDraft(seat, seed + seat);
  const actual =
    result.forecasts.filter((f) => f.survived).length / result.forecasts.length;
  const expected =
    result.forecasts.reduce((s, f) => s + f.chance, 0) /
    result.forecasts.length;
  console.log(
    `Seat ${seat + 1}: ${result.state.picks.filter(Boolean).length} picks, ${result.userSelections} user picks, ${needs(rosterFor(result.state, seat)).length} empty starter slots. Forecast mean ${Math.round(expected * 100)}%; observed ${Math.round(actual * 100)}%.`,
  );
}
console.log(
  "Synthetic opponents and data: this is an invariants/sanity harness, not real-world probability calibration.",
);
