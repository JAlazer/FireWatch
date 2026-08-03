// Verifies the Today-tab STATE logic against the SEAM's gate (getDailyStory):
//   npx tsx src/dev/today.check.ts
// The gate counts DATA-producing days (both signals present), not calendar days — the
// same basis as the scorer's readiness floor. Key invariant (item 1): learning shows no
// score; provisional/full ALWAYS show a score (the gate and scorer can't drift, so
// "provisional but nothing to show" never happens). Plus: day-1 resting-HR empty, and a
// flare reaches elevated on recent settled days.

import { buildProvider } from "../providers/buildProvider";
import { REGISTRY } from "../mock/registry";
import { scoreSeries } from "../mock/score";
import { devProfile, devStartDate, type DevScenario } from "./presets";
import { loadOnboarding, saveOnboarding, type KeyValueStore } from "../storage/onboardingStore";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-15T12:00:00Z");
const now = () => NOW;
const iso = (ms: number) => new Date(ms).toISOString();
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
}
const daySet = (a: { startDate: Date }[]) => new Set(a.map((x) => Math.floor(x.startDate.getTime() / DAY)));

// Mirrors src/data/appData.ts getDailyStory(), minus AsyncStorage/RN.
async function today(scenario: DevScenario, startDate: string) {
  const store = memStore();
  await saveOnboarding(store, devProfile(scenario, NOW), { startDate });
  const profile = (await loadOnboarding(store))!;
  const provider = buildProvider(profile, { now });
  const opts = { from: new Date(Date.parse(profile.startDate)), to: new Date(NOW + DAY) };
  const [hrv, rhr] = await Promise.all([provider.queryQuantitySamples(HRV, opts), provider.queryQuantitySamples(RHR, opts)]);
  const series = scoreSeries(hrv, rhr, profile.startDate, iso(NOW)); // full history (carry hysteresis)
  const t = series[series.length - 1];
  const hd = daySet(hrv), rd = daySet(rhr);
  const dataDays = [...hd].filter((d) => rd.has(d)).length; // GATE = days with both signals
  const phase = dataDays < 15 ? "learning" : dataDays < 28 ? "provisional" : "full";
  const hasScore = phase !== "learning" && t?.heat != null;
  const recentElevated = series.slice(-4, -1).some((r) => r.elevated); // today is clipped
  return { dataDays, phase, hasScore, level: t?.level ?? null, rhrCount: rhr.length, recentElevated };
}

async function main() {
  let ok = true;
  const expect = (name: string, cond: boolean) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`); ok = ok && cond; };

  console.log("=== gate = data-days; non-learning ALWAYS shows a score (no drift) ===");
  for (const d of [1, 7, 15, 20, 30, 60]) {
    const r = await today("calm", devStartDate(d, NOW));
    console.log(`  preset ${String(d).padStart(2)}d -> ${String(r.dataDays).padStart(2)} data-days -> ${r.phase.padEnd(11)} score=${r.hasScore ? "yes" : "no"}`);
    expect(`${d}d preset: ${r.phase === "learning" ? "no score in learning" : "score present when scored"}`, r.phase === "learning" ? !r.hasScore : r.hasScore);
  }

  console.log("\n=== day-1 resting HR empty state ===");
  const d1 = await today("calm", iso(NOW)); // startDate = now -> the true first day
  console.log(`  first day: data-days=${d1.dataDays} rhrCount=${d1.rhrCount}`);
  expect("first day is learning", d1.phase === "learning");
  expect("first day has NO resting-HR reading yet (→ 'arrives tonight')", d1.rhrCount === 0);

  console.log("\n=== flare reaches the elevated state (recent settled days; today is clipped) ===");
  const f = await today("flare", devStartDate(60, NOW));
  console.log(`  flare @60d: phase=${f.phase} clipped-today level=${f.level} recentElevated=${f.recentElevated}`);
  expect("flare @60d is full + elevated on recent settled days", f.phase === "full" && f.recentElevated);

  console.log("\n" + (ok ? "TODAY-TAB LOGIC PASS ✅" : "FAIL ❌"));
  process.exit(ok ? 0 : 1);
}

main();
