// Verifies the Today-tab STATE logic (days of history -> phase; score presence;
// day-1 resting-HR empty state):
//   npx tsx src/dev/today.check.ts

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

// Mirrors app/(tabs)/dashboard.tsx loadToday(), minus AsyncStorage/RN.
async function today(scenario: DevScenario, startDate: string) {
  const store = memStore();
  await saveOnboarding(store, devProfile(scenario, NOW), { startDate });
  const profile = (await loadOnboarding(store))!;
  const daysOfHistory = Math.max(1, Math.floor((NOW - Date.parse(profile.startDate)) / DAY));
  const provider = buildProvider(profile, { now });
  const opts = { from: new Date(Date.parse(profile.startDate)), to: new Date(NOW + DAY) };
  const [hrv, rhr] = await Promise.all([provider.queryQuantitySamples(HRV, opts), provider.queryQuantitySamples(RHR, opts)]);
  const series = scoreSeries(hrv, rhr, profile.startDate, iso(NOW)); // full history (carry hysteresis)
  const t = series[series.length - 1];
  const phase = daysOfHistory < 15 ? "learning" : daysOfHistory < 28 ? "provisional" : "full";
  // "today" (NOW) is clipped (resting HR arrives ~17.5h late), so a flare's current
  // day is a noisy signal — check the recent SETTLED days for the elevated state.
  const recentElevated = series.slice(-4, -1).some((r) => r.elevated);
  return { daysOfHistory, phase, hasScore: t?.level != null, level: t?.level ?? null, rhrCount: rhr.length, recentElevated };
}

async function main() {
  let ok = true;
  const expect = (name: string, cond: boolean) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`); ok = ok && cond; };

  console.log("=== phase by days of history (calm) ===");
  for (const d of [1, 7, 15, 20, 30, 60]) {
    const r = await today("calm", devStartDate(d, NOW));
    const wantPhase = d < 15 ? "learning" : d < 28 ? "provisional" : "full";
    console.log(`  ${String(d).padStart(2)}d -> ${r.phase.padEnd(11)} score=${r.hasScore ? "yes" : "no "} (level ${r.level})`);
    expect(`${d}d is ${wantPhase}`, r.phase === wantPhase);
    if (d < 15) expect(`${d}d shows NO score`, r.hasScore === false);
    else expect(`${d}d shows a score`, r.hasScore === true);
  }

  console.log("\n=== day-1 resting HR empty state ===");
  const d1 = await today("calm", iso(NOW)); // startDate = now -> the true first day
  console.log(`  first day: daysOfHistory=${d1.daysOfHistory} rhrCount=${d1.rhrCount}`);
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
