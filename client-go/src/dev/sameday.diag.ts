// DIAGNOSTIC: do the two metric rows show the SAME day?  npx tsx src/dev/sameday.diag.ts
// Replicates the dashboard's per-metric "latest visible sample" logic (each metric's
// own latest) for the flare preset, sweeping "now" across many days (evening) to
// measure how often HRV-latest-day != RHR-latest-day. RHR's ~17.5h lag means today's
// RHR is never visible during today; HRV's ~62s lag means today's is visible whenever
// worn — so on worn days the two rows show DIFFERENT days.

import { buildProvider } from "../providers/buildProvider";
import { REGISTRY } from "../mock/registry";
import { devProfile, devStartDate } from "./presets";
import { loadOnboarding, saveOnboarding, type KeyValueStore } from "../storage/onboardingStore";

const DAY = 86_400_000;
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
}
const latestDay = (a: { startDate: Date }[]) => (a.length ? Math.floor(a.reduce((m, x) => (x.startDate > m.startDate ? x : m)).startDate.getTime() / DAY) : null);

async function main() {
  let mismatch = 0, both = 0;
  console.log("relNow  HRV-day  RHR-day  same?");
  for (let off = 0; off < 14; off++) {
    const now = Date.parse("2026-06-15T20:00:00Z") - off * DAY; // evening, HRV worn -> today visible
    const nowDay = Math.floor(now / DAY);
    const store = memStore();
    await saveOnboarding(store, devProfile("flare", now), { startDate: devStartDate(60, now) });
    const s = (await loadOnboarding(store))!;
    const provider = buildProvider(s, { now: () => now });
    const opts = { from: new Date(Date.parse(s.startDate)), to: new Date(now + DAY) };
    const [hrv, rhr] = await Promise.all([provider.queryQuantitySamples(HRV, opts), provider.queryQuantitySamples(RHR, opts)]);
    const hd = latestDay(hrv), rd = latestDay(rhr);
    if (hd == null || rd == null) continue;
    both++;
    const same = hd === rd;
    if (!same) mismatch++;
    console.log(`  ${String(-off).padStart(4)}   ${String(hd - nowDay).padStart(5)}    ${String(rd - nowDay).padStart(5)}     ${same ? "yes" : "NO <-"}`);
  }
  console.log(`\ndifferent-day comparisons: ${mismatch}/${both} of days ${(100 * mismatch / both).toFixed(0)}%`);
}
main();
