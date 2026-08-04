// Verifies the Trends series shaping:  npx tsx src/trends/series.check.ts
//  - gaps preserved as null (never interpolated)
//  - weekly/monthly averaging + resolution drops for short accounts
//  - real flare data: HRV daily buckets dip while RHR rise over the flare window

import { buildProvider } from "../providers/buildProvider";
import { REGISTRY } from "../mock/registry";
import { devProfile, devStartDate } from "../dev/presets";
import { loadOnboarding, saveOnboarding, type KeyValueStore } from "../storage/onboardingStore";
import { bucketize, dailyMeans, presentCount, resolveRes } from "./series";

const DAY = 86_400_000;
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
let ok = true;
const check = (name: string, cond: boolean) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`); ok = ok && cond; };

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
}

function main2() {
  console.log("=== bucketize: gaps + averaging ===");
  const daily = new Map<number, number>([[100, 10], [101, 20], [103, 40]]); // day 102 missing
  const dayB = bucketize(daily, 100, 103, "day");
  check("daily has a null at the missing day (gap, not interpolated)", dayB.length === 4 && dayB[2].value === null);
  check("present days keep their values", dayB[0].value === 10 && dayB[3].value === 40);
  const wk = bucketize(daily, 98, 104, "week"); // one epoch-aligned block [98..104] (98 = 14*7)
  check("weekly bucket = mean of present days", wk.length === 1 && Math.abs(wk[0].value! - (10 + 20 + 40) / 3) < 1e-9);

  console.log("=== resolution drops for short history ===");
  check("1Y on 200-day account -> week", resolveRes("1Y", 200) === "week");
  check("1Y on 10-day account -> day", resolveRes("1Y", 10) === "day");
  check("ALL on 200-day account -> month", resolveRes("ALL", 200) === "month");
  check("ALL on 3-day account -> day", resolveRes("ALL", 3) === "day");

  console.log("=== partial buckets flagged (shown, marked) ===");
  const wkP = bucketize(new Map([[700, 1], [708, 2]]), 700, 712, "week"); // last week [707..713] ends past toDay 712
  check("trailing in-progress week is partial; a full week isn't", wkP.length === 2 && wkP[0].partial === false && wkP[1].partial === true);
  const may1 = Math.floor(Date.UTC(2026, 4, 1) / 86_400_000), jun15 = Math.floor(Date.UTC(2026, 5, 15) / 86_400_000);
  const moP = bucketize(new Map([[may1, 1], [jun15, 2]]), may1, jun15, "month");
  check("current in-progress month is partial; a full month isn't", moP.length === 2 && moP[0].partial === false && moP[1].partial === true);
  check("daily buckets are never partial", bucketize(new Map([[700, 1]]), 700, 703, "day").every((p) => !p.partial));
}

async function flareShape() {
  console.log("=== real flare (day 60 preset): HRV buckets dip, RHR rise ===");
  const NOW = Date.parse("2026-06-15T20:00:00Z");
  const store = memStore();
  await saveOnboarding(store, devProfile("flare", NOW), { startDate: devStartDate(60, NOW) });
  const s = (await loadOnboarding(store))!;
  const p = buildProvider(s, { now: () => NOW });
  const opts = { from: new Date(Date.parse(s.startDate)), to: new Date(NOW + DAY) };
  const [hrv, rhr] = await Promise.all([p.queryQuantitySamples(HRV, opts), p.queryQuantitySamples(RHR, opts)]);
  const hd = dailyMeans(hrv), rd = dailyMeans(rhr);
  const toDay = Math.floor(NOW / DAY), fromDay = toDay - 30;
  const hb = bucketize(hd, fromDay, toDay, "day"), rb = bucketize(rd, fromDay, toDay, "day");
  check("HRV has real daily points (with some gaps)", presentCount(hb) > 15 && presentCount(hb) < 31);
  // flare window is the last ~6 days; compare its mean to the pre-flare mean
  const meanOf = (b: typeof hb, lo: number, hi: number) => { const v = b.slice(lo, hi).map((x) => x.value).filter((x): x is number => x != null); return v.reduce((a, c) => a + c, 0) / v.length; };
  const hPre = meanOf(hb, 0, 20), hFlare = meanOf(hb, 24, 30);
  const rPre = meanOf(rb, 0, 20), rFlare = meanOf(rb, 24, 30);
  console.log(`  1M daily : HRV pre ${hPre.toFixed(0)} -> flare ${hFlare.toFixed(0)} ms | RHR pre ${rPre.toFixed(0)} -> flare ${rFlare.toFixed(0)} bpm`);
  check("flare visible on 1M (daily): HRV dips, RHR rises", hFlare < hPre && rFlare > rPre);

  // 1Y weekly: does weekly averaging still show the flare? (the whole reason we chose
  // weekly over monthly). Compare the last weekly bucket to the median of the earlier ones.
  const startDay = Math.floor(Date.parse(s.startDate) / DAY);
  const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
  const present = (b: ReturnType<typeof bucketize>) => b.filter((x): x is (typeof b)[number] & { value: number } => x.value != null);
  const hw = present(bucketize(hd, startDay, toDay, "week")), rw = present(bucketize(rd, startDay, toDay, "week"));
  const hLast = hw[hw.length - 1].value, rLast = rw[rw.length - 1].value;
  const hBase = median(hw.slice(0, -1).map((x) => x.value)), rBase = median(rw.slice(0, -1).map((x) => x.value));
  console.log(`  1Y weekly: HRV last-week ${hLast.toFixed(0)} vs base ${hBase.toFixed(0)} ms | RHR last-week ${rLast.toFixed(0)} vs base ${rBase.toFixed(0)} bpm`);
  check("flare STILL visible on 1Y (weekly): last week HRV down, RHR up", hLast < hBase && rLast > rBase);
}

async function main() {
  main2();
  await flareShape();
  console.log("\n" + (ok ? "TRENDS SERIES PASS ✅" : "FAIL ❌"));
  process.exit(ok ? 0 : 1);
}
main();
