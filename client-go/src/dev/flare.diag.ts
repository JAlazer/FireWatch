// DIAGNOSTIC (report-only): why does HRV visibly drop in a flare but resting HR not
// visibly rise?  npx tsx src/dev/flare.diag.ts
// Prints, for the flare preset at day 30 and 60: the episode effects actually
// applied, baseline medians, daily HRV/RHR + hrvZ/rhrZ across the flare window and
// the 14 days before it, the flare window vs "now", and the latest displayed values.

import { buildProvider } from "../providers/buildProvider";
import { REGISTRY } from "../mock/registry";
import { scoreSeries } from "../mock/score";
import { devProfile, devStartDate } from "./presets";
import { loadOnboarding, saveOnboarding, type KeyValueStore } from "../storage/onboardingStore";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-15T12:00:00Z");
const now = () => NOW;
const iso = (ms: number) => new Date(ms).toISOString();
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
const nowDay = Math.floor(NOW / DAY);

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
}

function dailyMeans(samples: { quantity: number; startDate: Date }[]): Map<number, number> {
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
const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const f1 = (n: number | undefined | null) => (n == null ? "  -  " : n.toFixed(1).padStart(5));

async function run(days: number) {
  const store = memStore();
  const profile = devProfile("flare", NOW);
  await saveOnboarding(store, profile, { startDate: devStartDate(days, NOW) });
  const s = (await loadOnboarding(store))!;
  const provider = buildProvider(s, { now });
  const opts = { from: new Date(Date.parse(s.startDate)), to: new Date(NOW + DAY) };
  const [hrv, rhr] = await Promise.all([provider.queryQuantitySamples(HRV, opts), provider.queryQuantitySamples(RHR, opts)]);
  const hd = dailyMeans(hrv), rd = dailyMeans(rhr);

  const ep = profile.explicitEpisodes![0];
  const fStart = Math.floor(Date.parse(ep.from) / DAY), fEnd = Math.floor(Date.parse(ep.to) / DAY);

  console.log(`\n================= FLARE @ day ${days} =================`);
  console.log(`episode effects applied: ${JSON.stringify(ep.effects)}`);
  console.log(`flare window: day ${fStart - nowDay}..${fEnd - nowDay} relative to now (now = day 0); ends ${fEnd - nowDay} days AFTER now (still ongoing, no ramp-out yet)`);

  // baselines = median of daily means BEFORE the flare (the 14 days before fStart)
  const preHrv: number[] = [], preRhr: number[] = [];
  for (let d = fStart - 14; d < fStart; d++) { if (hd.has(d)) preHrv.push(hd.get(d)!); if (rd.has(d)) preRhr.push(rd.get(d)!); }
  const hBase = median(preHrv), rBase = median(preRhr);
  console.log(`baseline median (14d pre-flare): HRV ${hBase.toFixed(1)} ms | RHR ${rBase.toFixed(1)} bpm`);

  // in-flare core means (settled days, skip the clipped "today")
  const coreHrv: number[] = [], coreRhr: number[] = [];
  for (let d = fStart + 1; d <= nowDay - 1; d++) { if (hd.has(d)) coreHrv.push(hd.get(d)!); if (rd.has(d)) coreRhr.push(rd.get(d)!); }
  const hCore = median(coreHrv), rCore = median(coreRhr);
  console.log(`in-flare median:                HRV ${hCore.toFixed(1)} ms (${((hCore / hBase - 1) * 100).toFixed(0)}%) | RHR ${rCore.toFixed(1)} bpm (+${((rCore / rBase - 1) * 100).toFixed(0)}%)`);
  console.log(`absolute change:                HRV ${(hCore - hBase).toFixed(1)} ms      | RHR +${(rCore - rBase).toFixed(1)} bpm`);

  // per-day table with z
  const series = scoreSeries(hrv, rhr, s.startDate, iso(NOW));
  const zByDay = new Map(series.map((r) => [Math.floor(Date.parse(r.day) / DAY), r]));
  console.log(`\n  rel-day  HRV ms  RHR bpm   hrvZ   rhrZ  flare`);
  for (let d = fStart - 14; d <= nowDay; d++) {
    const r = zByDay.get(d);
    const mark = d >= fStart && d < fEnd ? (d === nowDay ? "## today(clipped)" : "##") : "";
    console.log(`  ${String(d - nowDay).padStart(6)}  ${f1(hd.get(d))}  ${f1(rd.get(d))}   ${f1(r?.hrvZ)}  ${f1(r?.rhrZ)}   ${mark}`);
  }

  // what the metric rows actually show (latest sample of each)
  const latest = (a: { quantity: number; startDate: Date }[]) => (a.length ? a.reduce((m, x) => (x.startDate > m.startDate ? x : m)) : null);
  const lh = latest(hrv), lr = latest(rhr);
  console.log(`\nmetric rows show (latest sample):`);
  console.log(`  HRV ${lh ? lh.quantity.toFixed(0) + " ms @ day " + (Math.floor(lh.startDate.getTime() / DAY) - nowDay) : "—"}  (baseline ${hBase.toFixed(0)}, so reads ${lh ? (lh.quantity - hBase).toFixed(0) : "?"} vs baseline)`);
  console.log(`  RHR ${lr ? lr.quantity.toFixed(0) + " bpm @ day " + (Math.floor(lr.startDate.getTime() / DAY) - nowDay) : "—"} (baseline ${rBase.toFixed(0)}, so reads +${lr ? (lr.quantity - rBase).toFixed(0) : "?"} vs baseline)`);
}

async function main() {
  await run(30);
  await run(60);
}
main();
