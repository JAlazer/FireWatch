// Verifies the heat invariant: number and word can't disagree.
//   npx tsx src/dev/heat.check.ts
// For every scored day across calm + flare histories: heat in [0,5], and
// (heat >= 3) iff elevated — i.e. Warming+ words only ever appear when the
// concordance rule says elevated, and never during calm.

import { buildProvider } from "../providers/buildProvider";
import { REGISTRY } from "../mock/registry";
import { heatWord, scoreSeries } from "../mock/score";
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

async function main() {
  let ok = true, scored = 0;
  for (const scenario of ["calm", "flare"] as DevScenario[]) {
    const store = memStore();
    await saveOnboarding(store, devProfile(scenario, NOW), { startDate: devStartDate(60, NOW) });
    const s = (await loadOnboarding(store))!;
    const p = buildProvider(s, { now });
    const opts = { from: new Date(Date.parse(s.startDate)), to: new Date(NOW + DAY) };
    const [hrv, rhr] = await Promise.all([p.queryQuantitySamples(HRV, opts), p.queryQuantitySamples(RHR, opts)]);
    const words = new Set<string>();
    for (const r of scoreSeries(hrv, rhr, s.startDate, iso(NOW))) {
      if (r.heat == null) continue;
      scored++;
      words.add(heatWord(r.heat));
      const inRange = r.heat >= 0 && r.heat <= 5;
      const consistent = r.heat >= 3 === r.elevated; // Warming+ iff elevated
      if (!inRange || !consistent) { ok = false; console.log(`  ✗ ${scenario} ${r.day}: heat=${r.heat} elevated=${r.elevated} word=${heatWord(r.heat)}`); }
    }
    console.log(`  ${scenario.padEnd(6)} words seen: ${[...words].join(", ")}`);
  }
  console.log(`\nchecked ${scored} scored days`);
  console.log(ok ? "HEAT INVARIANT PASS ✅ (heat>=3 iff elevated, all in [0,5])" : "FAIL ❌");
  process.exit(ok ? 0 : 1);
}
main();
