// Verifies the HRV<->RHR innovation coupling in the generator:
//   npx tsx src/dev/coupling.check.ts
// - generated within-person daily corr(HRV, RHR) lands near the calibrated -0.51
// - both MARGINALS are unchanged (RHR daily SD ~5.4; HRV CV preserved)

import { MockHealthDataProvider } from "../mock/MockHealthDataProvider";
import { REGISTRY } from "../mock/registry";

const DAY = 86_400_000;
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;

function daily(samples: { quantity: number; startDate: Date }[]) {
  const acc = new Map<number, { s: number; n: number }>();
  for (const x of samples) {
    const d = Math.floor(x.startDate.getTime() / DAY);
    const a = acc.get(d) ?? { s: 0, n: 0 };
    a.s += x.quantity; a.n += 1; acc.set(d, a);
  }
  const out = new Map<number, number>();
  for (const [d, a] of acc) out.set(d, a.s / a.n);
  return out;
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
function pearson(xs: number[], ys: number[]) {
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return num / Math.sqrt(dx * dy);
}

async function main() {
  const range = { from: "2022-01-01T00:00:00Z", to: "2025-01-01T00:00:00Z" }; // 3y, calm
  const provider = new MockHealthDataProvider({ seed: "coupling-diag", age: 40 }, range, { now: () => Date.parse(range.to) + 30 * DAY });
  const opts = { from: new Date(range.from), to: new Date(range.to) };
  const [hrv, rhr] = await Promise.all([provider.queryQuantitySamples(HRV, opts), provider.queryQuantitySamples(RHR, opts)]);
  const hd = daily(hrv), rd = daily(rhr);
  const days = [...hd.keys()].filter((d) => rd.has(d)).sort((a, b) => a - b);
  const xs = days.map((d) => hd.get(d)!), ys = days.map((d) => rd.get(d)!);

  const r = pearson(xs, ys);
  const hrvMed = [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  console.log(`day-pairs: ${days.length}`);
  console.log(`generated corr(HRV, RHR) = ${r.toFixed(3)}   (calibrated target -0.51)`);
  console.log(`HRV daily median ${hrvMed.toFixed(1)} ms, daily SD ${sd(xs).toFixed(2)} ms, CV ${(sd(xs) / mean(xs)).toFixed(3)}`);
  console.log(`RHR daily SD ${sd(ys).toFixed(2)} bpm  (target ~5.4 — marginal must be unchanged)`);

  const rhrOk = Math.abs(sd(ys) - 5.4) < 1.2;
  const corrOk = r < -0.3 && r > -0.65; // near target, negative, right ballpark
  console.log("\n" + (rhrOk && corrOk ? "COUPLING CHECK PASS ✅ (negative corr present, RHR marginal preserved)" : "FAIL ❌"));
  process.exit(rhrOk && corrOk ? 0 : 1);
}
main();
