// Verifies the Today metric-row fixes: charts present during LEARNING (raw mode),
// deviation mode once scored, and the direction-aware sentence.
//   npx tsx src/dev/todayrows.diag.ts

import { buildProvider } from "../providers/buildProvider";
import { REGISTRY } from "../mock/registry";
import { scoreSeries, type ScoreResult } from "../mock/score";
import { devProfile, devStartDate } from "./presets";
import { loadOnboarding, saveOnboarding, type KeyValueStore } from "../storage/onboardingStore";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-15T20:00:00Z");
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
}
function daily(a: { quantity: number; startDate: Date }[]) {
  const acc = new Map<number, { s: number; n: number }>();
  for (const x of a) { const d = Math.floor(x.startDate.getTime() / DAY); const o = acc.get(d) ?? { s: 0, n: 0 }; o.s += x.quantity; o.n++; acc.set(d, o); }
  const out = new Map<number, number>(); for (const [d, o] of acc) out.set(d, o.s / o.n); return out;
}

// Mirror of dashboard.metricView's chart logic.
function chartFor(dailyMap: Map<number, number>, byDay: Map<number, ScoreResult>, commonDay: number | null, zOf: (r: ScoreResult) => number | null, mul: number) {
  const dayForVal = commonDay;
  const devAt = (d: number) => { const r = byDay.get(d); const z = r ? zOf(r) : null; return z == null ? null : mul * z; };
  const useDeviation = dayForVal != null && devAt(dayForVal) != null;
  const pts: number[] = [];
  if (dayForVal != null) for (let d = dayForVal - 6; d <= dayForVal; d++) { const v = useDeviation ? devAt(d) : dailyMap.has(d) ? dailyMap.get(d)! : null; if (v != null) pts.push(v); }
  return { mode: useDeviation ? "deviation" : "raw", n: pts.length };
}

// Mirror of dashboard.stateSentence — takes the ROW deviations (natural sign).
function stateSentence(hrvDev: number | null, rhrDev: number | null): string {
  const hrvLow = hrvDev != null && hrvDev <= -1, rhrHigh = rhrDev != null && rhrDev >= 1;
  if (hrvLow && rhrHigh) return "both strain";
  if (rhrHigh) return "RHR up, HRV holding";
  if (hrvLow) return "HRV down, RHR steady";
  return "both close to usual";
}

async function at(days: number, scenario: "calm" | "flare") {
  const store = memStore();
  await saveOnboarding(store, devProfile(scenario, NOW), { startDate: devStartDate(days, NOW) });
  const s = (await loadOnboarding(store))!;
  const p = buildProvider(s, { now: () => NOW });
  const opts = { from: new Date(Date.parse(s.startDate)), to: new Date(NOW + DAY) };
  const [hrv, rhr] = await Promise.all([p.queryQuantitySamples(HRV, opts), p.queryQuantitySamples(RHR, opts)]);
  const byDay = new Map(scoreSeries(hrv, rhr, s.startDate, new Date(NOW).toISOString()).map((r) => [Math.floor(Date.parse(r.day) / DAY), r]));
  const hd = daily(hrv), rd = daily(rhr);
  const common = [...hd.keys()].filter((d) => rd.has(d));
  const commonDay = common.length ? Math.max(...common) : null;
  const h = chartFor(hd, byDay, commonDay, (r) => r.hrvZ, -1);
  const r = chartFor(rd, byDay, commonDay, (r) => r.rhrZ, 1);
  // Row deviations at the common settled day (natural sign) — what the sentence uses.
  const cd = commonDay != null ? byDay.get(commonDay) : undefined;
  const hrvDev = cd && cd.hrvZ != null ? -cd.hrvZ : null;
  const rhrDev = cd && cd.rhrZ != null ? cd.rhrZ : null;
  console.log(`day ${String(days).padStart(2)} ${scenario.padEnd(5)}: HRV chart ${h.n}pts (${h.mode}) | RHR ${r.n}pts (${r.mode}) | sentence: "${stateSentence(hrvDev, rhrDev)}"`);
}

async function main() {
  await at(7, "calm");   // learning -> raw charts, non-empty
  await at(12, "calm");  // baseline forming -> deviation
  await at(30, "calm");  // scored calm -> "both close to usual"
  await at(30, "flare"); // scored flare -> "both strain" (HRV down + RHR up)
}
main();
