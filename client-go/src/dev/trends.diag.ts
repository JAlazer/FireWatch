// DIAGNOSTIC (report): with raw daily series on independent scales, do HRV and RHR
// move in OPPOSITE directions across a flare, and is it visible at LITERATURE
// magnitude (0.749/1.086), not just the over-driven preset (0.68/1.15)?
//   npx tsx src/dev/trends.diag.ts

import { MockHealthDataProvider } from "../mock/MockHealthDataProvider";
import { toPhysiologyProfile, type OnboardingProfile } from "../mock/mapping";
import { REGISTRY } from "../mock/registry";

const DAY = 86_400_000;
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
const FROM = "2026-01-01T00:00:00Z";
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY).toISOString();

function daily(a: { quantity: number; startDate: Date }[]) {
  const acc = new Map<number, { s: number; n: number }>();
  for (const x of a) { const d = Math.floor(x.startDate.getTime() / DAY); const o = acc.get(d) ?? { s: 0, n: 0 }; o.s += x.quantity; o.n++; acc.set(d, o); }
  const out = new Map<number, number>(); for (const [d, o] of acc) out.set(d, o.s / o.n); return out;
}
const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); const m = Math.floor(a.length / 2); return a.length ? (a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2) : NaN; };
function corr(xs: number[], ys: number[]) {
  const n = xs.length; if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return num / Math.sqrt(dx * dy);
}

async function run(label: string, hrvFactor: number, rhrFactor: number, historyDays: number) {
  const fStart = historyDays - 20, fEnd = fStart + 15; // flare 15d, ends ~5d before "now"
  const onboarding: OnboardingProfile = {
    seed: "trends-diag", birthDate: "1986-01-01", autoimmune: true,
    explicitEpisodes: [{ from: addDays(FROM, fStart), to: addDays(FROM, fEnd), kind: "flare",
      effects: [{ metric: "HeartRateVariabilitySDNN", factor: hrvFactor }, { metric: "RestingHeartRate", factor: rhrFactor }] }],
  };
  const range = { from: FROM, to: addDays(FROM, historyDays) };
  const p = new MockHealthDataProvider(toPhysiologyProfile(onboarding, range), range, { now: () => Date.parse(range.to) + 40 * DAY });
  const opts = { from: new Date(range.from), to: new Date(addDays(range.to, 1)) };
  const [hrv, rhr] = await Promise.all([p.queryQuantitySamples(HRV, opts), p.queryQuantitySamples(RHR, opts)]);
  const hd = daily(hrv), rd = daily(rhr);
  const d0 = Math.floor(Date.parse(FROM) / DAY);
  const pick = (m: Map<number, number>, a: number, b: number) => { const o: number[] = []; for (let d = a; d < b; d++) if (m.has(d0 + d)) o.push(m.get(d0 + d)!); return o; };
  const hBase = median(pick(hd, fStart - 14, fStart)), rBase = median(pick(rd, fStart - 14, fStart));
  const hIn = median(pick(hd, fStart + 1, fEnd)), rIn = median(pick(rd, fStart + 1, fEnd));
  // within-flare daily pairs for co-movement
  const px: number[] = [], py: number[] = [];
  for (let d = fStart; d < fEnd; d++) if (hd.has(d0 + d) && rd.has(d0 + d)) { px.push(hd.get(d0 + d)!); py.push(rd.get(d0 + d)!); }

  console.log(`\n=== ${label} (HRV x${hrvFactor}, RHR x${rhrFactor}), ${historyDays}d history ===`);
  console.log(`HRV baseline ${hBase.toFixed(1)} -> in-flare ${hIn.toFixed(1)} ms  (${(hIn - hBase).toFixed(1)} ms, ${((hIn / hBase - 1) * 100).toFixed(0)}%)  ${hIn < hBase ? "DOWN" : "up"}`);
  console.log(`RHR baseline ${rBase.toFixed(1)} -> in-flare ${rIn.toFixed(1)} bpm (+${(rIn - rBase).toFixed(1)} bpm, +${((rIn / rBase - 1) * 100).toFixed(0)}%)  ${rIn > rBase ? "UP" : "down"}`);
  console.log(`opposite directions: ${hIn < hBase && rIn > rBase ? "YES" : "no"} | within-flare daily corr(HRV,RHR) = ${corr(px, py).toFixed(2)} (${px.length} pairs)`);
}

async function main() {
  for (const days of [30, 60]) {
    await run(`LITERATURE @ day ${days}`, 0.749, 1.086, days);
    await run(`PRESET     @ day ${days}`, 0.68, 1.15, days);
  }
}
main();
