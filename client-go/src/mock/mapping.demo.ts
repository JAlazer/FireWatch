// Demo: a 90-day series for a user with the autoimmune condition checked and ONE
// explicit flare placed mid-window. Shows HRV and resting HR moving TOGETHER
// across the flare -- the two-signal concordance the dashboard rule depends on.
//   npx tsx src/mock/mapping.demo.ts

import { generate } from "./generate";
import { toPhysiologyProfile, type OnboardingProfile } from "./mapping";
import { REGISTRY } from "./registry";

const DAY = 86_400_000;
// Episode effects use the SHORT registry keys (what the generator matches on);
// sample filtering uses the full HK identifiers (what samples carry).
const HRV_KEY = "HeartRateVariabilitySDNN";
const RHR_KEY = "RestingHeartRate";
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY).toISOString();

const range = { from: "2026-01-01T00:00:00Z", to: "2026-04-01T00:00:00Z" }; // 90 days
const FLARE_START = 40;
const FLARE_END = 52;

const onboarding: OnboardingProfile = {
  seed: "ra-demo",
  birthDate: "1986-01-01", // ~age 40 as-of the range end
  autoimmune: true,
  explicitEpisodes: [{
    from: addDays(range.from, FLARE_START),
    to: addDays(range.from, FLARE_END),
    kind: "flare(explicit)",
    effects: [{ metric: HRV_KEY, factor: 0.749 }, { metric: RHR_KEY, factor: 1.086 }],
  }],
};

const phys = toPhysiologyProfile(onboarding, range);
const store = generate(phys, range);

console.log("=== resolved PhysiologyProfile (from mapping) ===");
console.log("baselineShifts:", JSON.stringify(phys.baselineShifts));
console.log("confounds:", JSON.stringify(phys.confounds));
console.log("episodes:");
for (const e of phys.episodes ?? []) console.log(`   ${e.kind}: ${e.from.slice(0, 10)} -> ${e.to.slice(0, 10)}  ${JSON.stringify(e.effects)}`);

// aggregate per day
const fromMs = Date.parse(range.from);
const dayIdx = (ms: number) => Math.floor((ms - fromMs) / DAY);
const hrvByDay = new Map<number, number[]>();
const rhrByDay = new Map<number, number>();
for (const s of store.samples) {
  const d = dayIdx(s.startMs);
  if (s.identifier === HRV) (hrvByDay.get(d) ?? hrvByDay.set(d, []).get(d)!).push(s.value);
  else if (s.identifier === RHR) rhrByDay.set(d, s.value);
}
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

// baseline (non-episode) vs flare-window means
const inFlare = (d: number) => d >= FLARE_START && d < FLARE_END;
const baseHrv: number[] = [];
const baseRhr: number[] = [];
const flrHrv: number[] = [];
const flrRhr: number[] = [];
for (let d = 0; d < 90; d++) {
  const h = hrvByDay.has(d) ? mean(hrvByDay.get(d)!) : NaN;
  const r = rhrByDay.get(d);
  if (inFlare(d)) { if (!isNaN(h)) flrHrv.push(h); if (r != null) flrRhr.push(r); }
  else if (d < FLARE_START - 5 || d > FLARE_END + 8) { if (!isNaN(h)) baseHrv.push(h); if (r != null) baseRhr.push(r); }
}
const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length);
console.log("\n=== concordance: baseline vs flare-window means ===");
console.log(`HRV: baseline ${avg(baseHrv).toFixed(1)} ms  ->  flare ${avg(flrHrv).toFixed(1)} ms   (x${(avg(flrHrv) / avg(baseHrv)).toFixed(3)}, expect ~0.749)`);
console.log(`RHR: baseline ${avg(baseRhr).toFixed(1)} bpm ->  flare ${avg(flrRhr).toFixed(1)} bpm  (x${(avg(flrRhr) / avg(baseRhr)).toFixed(3)}, expect ~1.086)`);

console.log("\n=== per-day around the flare (days 34-60) — HRV down AND RHR up together ===");
console.log(`${"day".padStart(4)}${"HRV".padStart(8)}${"RHR".padStart(7)}   ${"flare".padStart(6)}`);
for (let d = 34; d <= 60; d++) {
  const h = hrvByDay.has(d) ? mean(hrvByDay.get(d)!) : NaN;
  const r = rhrByDay.get(d);
  const hs = isNaN(h) ? "  -" : h.toFixed(1);
  const rs = r == null ? "  -" : r.toFixed(0);
  console.log(`${String(d).padStart(4)}${hs.padStart(8)}${rs.padStart(7)}   ${inFlare(d) ? "  ####" : ""}`);
}
