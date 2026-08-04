// Verifies the dev-screen LOGIC end-to-end (fixtures -> buildProvider -> scoring):
//   npx tsx src/dev/devscreen.check.ts
// 1. each DAY button yields that much REAL history through the provider (monotonic)
// 2. flare reaches the ELEVATED state; calm does not
// 3. REGRESSION GUARD: flare+beta_blocker is STILL detected (a chronic multiplicative
//    confound must NOT break detection — it cancels in personal median/MAD z-scoring)

import { buildProvider } from "../providers/buildProvider";
import { REGISTRY } from "../mock/registry";
import { scoreSeries } from "../mock/score";
import { DAY_BUTTONS, SCENARIOS, devProfile, devStartDate, type DevScenario } from "./presets";
import { loadOnboarding, saveOnboarding, type KeyValueStore } from "../storage/onboardingStore";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-15T12:00:00Z"); // fixed dev clock
const now = () => NOW;
const iso = (ms: number) => new Date(ms).toISOString();
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
}

async function build(scenario: DevScenario, days: number) {
  const store = memStore();
  await saveOnboarding(store, devProfile(scenario, NOW), { startDate: devStartDate(days, NOW) });
  const s = await loadOnboarding(store);
  const provider = buildProvider(s!, { now });
  const opts = { from: new Date(Date.parse(s!.startDate)), to: new Date(NOW + DAY) };
  const [hrv, rhr] = await Promise.all([provider.queryQuantitySamples(HRV, opts), provider.queryQuantitySamples(RHR, opts)]);
  return { hrv, rhr };
}

async function main() {
  let ok = true;

  // 1. history scales with the day buttons (calm) --------------------------------
  console.log("=== 1. days button -> real history (calm) ===");
  let prevRhr = -1;
  for (const d of DAY_BUTTONS) {
    const { hrv, rhr } = await build("calm", d);
    console.log(`  ${String(d).padStart(2)}d -> HRV ${String(hrv.length).padStart(4)}  RHR ${String(rhr.length).padStart(3)}`);
    if (rhr.length < prevRhr) { ok = false; console.log(`    ✗ RHR count dropped vs previous`); }
    prevRhr = rhr.length;
  }

  // 2 + 3. scenarios at 60d: elevated? distinguishable? --------------------------
  console.log("\n=== 2+3. scenarios at 60d (recent-day state) ===");
  const summary: Record<DevScenario, { elevated: boolean; hrvZ: number | null; rhrZ: number | null }> = {} as never;
  for (const scenario of SCENARIOS) {
    const { hrv, rhr } = await build(scenario, 60);
    // Look at the last few settled days (skip today, which clips on arrival lag).
    const series = scoreSeries(hrv, rhr, iso(NOW - 4 * DAY), iso(NOW - 1 * DAY));
    const anyElevated = series.some((r) => r.elevated);
    const peak = series.reduce((best, r) => ((r.rhrZ ?? -9) + (r.hrvZ ?? -9) > (best.rhrZ ?? -9) + (best.hrvZ ?? -9) ? r : best), series[0]);
    summary[scenario] = { elevated: anyElevated, hrvZ: peak.hrvZ, rhrZ: peak.rhrZ };
    console.log(`  ${scenario.padEnd(20)} elevated=${anyElevated ? "YES" : "no "}  peak HRV z=${peak.hrvZ}  RHR z=${peak.rhrZ}`);
  }

  console.log("\n=== assertions ===");
  const calmOk = summary.calm.elevated === false;
  const flareOk = summary.flare.elevated === true;
  // REGRESSION GUARD: a chronic multiplicative confound (beta-blocker) must NOT break
  // detection — it shifts the flare days AND the personal baseline by the same factor,
  // so it cancels in the z-score. (A real masking path exists — response-amplitude
  // blunting — but it's an unmodelled open item; see mapping.ts betaBlocker.)
  const guardOk = summary["flare+beta_blocker"].elevated === true;
  for (const [name, pass] of [["calm not elevated", calmOk], ["flare elevated", flareOk], ["flare + chronic beta-blocker still detected (not masked)", guardOk]] as const) {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
    ok = ok && pass;
  }

  console.log("\n" + (ok ? "DEV-SCREEN LOGIC PASS ✅" : "FAIL ❌"));
  process.exit(ok ? 0 : 1);
}

main();
