// Verifies the Trends SCORE series (mirrors appData.getTrendSeries' score logic):
//   npx tsx src/trends/scoretrend.check.ts
//  - day 7  : no score yet (< 15 data-days) -> empty series -> chart shows the note
//  - day 20 : score present, ALL provisional (days 15-27) -> marked lighter, with a GAP
//             across the pre-day-15 learning days
//  - day 60 flare: a solid FULL region exists (day 28+), and the score rises ABOVE the
//             3.0 elevated line during the flare window

import { buildProvider } from "../providers/buildProvider";
import { REGISTRY } from "../mock/registry";
import { scoreSeries } from "../mock/score";
import { devProfile, devStartDate, type DevScenario } from "../dev/presets";
import { loadOnboarding, saveOnboarding, type KeyValueStore } from "../storage/onboardingStore";
import { bucketize, dailyMeans, type Point } from "./series";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-15T20:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
let ok = true;
const check = (name: string, cond: boolean) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`); ok = ok && cond; };

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
}

// Exactly the seam's score construction, then marked & bucketized over a window.
async function scorePoints(scenario: DevScenario, days: number, win: number | null) {
  const store = memStore();
  await saveOnboarding(store, devProfile(scenario, NOW), { startDate: devStartDate(days, NOW) });
  const s = (await loadOnboarding(store))!;
  const p = buildProvider(s, { now: () => NOW });
  const opts = { from: new Date(Date.parse(s.startDate)), to: new Date(NOW + DAY) };
  const [hrv, rhr] = await Promise.all([p.queryQuantitySamples(HRV, opts), p.queryQuantitySamples(RHR, opts)]);
  const hd = dailyMeans(hrv), rd = dailyMeans(rhr);
  const commonSorted = [...hd.keys()].filter((d) => rd.has(d)).sort((a, b) => a - b);
  const day15 = commonSorted.length >= 15 ? commonSorted[14] : null;
  const day28 = commonSorted.length >= 28 ? commonSorted[27] : Infinity;
  const map = new Map<number, number>();
  if (day15 != null) for (const r of scoreSeries(hrv, rhr, s.startDate, iso(NOW))) {
    const d = Math.floor(Date.parse(r.day) / DAY);
    if (d >= day15 && r.heat != null) map.set(d, r.heat);
  }
  const toDay = Math.floor(NOW / DAY);
  const fromDay = win == null ? Math.floor(Date.parse(s.startDate) / DAY) : toDay - win;
  const isProv = (pt: Point) => pt.value != null && Math.floor(pt.t / DAY) < day28;
  const pts = bucketize(map, fromDay, toDay, "day").map((pt) => (isProv(pt) ? { ...pt, partial: true } : pt));
  return { pts, day15, day28 };
}

async function main() {
  console.log("=== day 7 (calm): no score yet -> empty series (chart shows the note) ===");
  const d7 = await scorePoints("calm", 7, 30);
  check("day 7 score empty (< 15 data-days)", d7.day15 === null && d7.pts.every((p) => p.value == null));

  console.log("=== day 20 (calm, 1M): present, ALL provisional (lighter), leading gap ===");
  const d20 = await scorePoints("calm", 20, 30);
  const present20 = d20.pts.filter((p) => p.value != null);
  const firstIdx = d20.pts.findIndex((p) => p.value != null);
  check("day 20: score present", present20.length > 0 && d20.day28 === Infinity);
  check("day 20: every present bucket is provisional (marked lighter)", present20.every((p) => p.partial));
  check("day 20: leading gap before the score starts (not interpolated)", firstIdx > 0 && d20.pts.slice(0, firstIdx).every((p) => p.value == null));

  console.log("=== day 60 flare (1M): a solid FULL region + score above 3.0 in the flare ===");
  const f = await scorePoints("flare", 60, 30);
  const presentF = f.pts.filter((p) => p.value != null) as (Point & { value: number })[];
  const hasFull = presentF.some((p) => !p.partial);
  const recentMax = Math.max(...presentF.slice(-6, -1).map((p) => p.value));
  console.log(`    day28 reached=${f.day28 !== Infinity}, full(solid) buckets=${presentF.filter((p) => !p.partial).length}, recent peak ${recentMax.toFixed(1)} (line 3.0)`);
  check("day 60: a solid full-confidence region exists (day 28+)", f.day28 !== Infinity && hasFull);
  check("day 60: score rises above 3.0 in the flare window", recentMax >= 3);

  console.log("\n" + (ok ? "SCORE-TREND CHECK PASS ✅" : "FAIL ❌"));
  process.exit(ok ? 0 : 1);
}
main();
