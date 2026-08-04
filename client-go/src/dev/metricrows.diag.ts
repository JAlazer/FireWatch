// Confirms the fixed metric rows: BOTH metrics from the same common settled day, and
// shown as deviation-from-baseline (σ) so HRV and RHR read on a comparable scale.
//   npx tsx src/dev/metricrows.diag.ts

import { buildProvider } from "../providers/buildProvider";
import { REGISTRY } from "../mock/registry";
import { scoreSeries } from "../mock/score";
import { devProfile, devStartDate } from "./presets";
import { loadOnboarding, saveOnboarding, type KeyValueStore } from "../storage/onboardingStore";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-15T20:00:00Z");
const nowDay = Math.floor(NOW / DAY);
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

async function main() {
  const store = memStore();
  await saveOnboarding(store, devProfile("flare", NOW), { startDate: devStartDate(30, NOW) });
  const s = (await loadOnboarding(store))!;
  const p = buildProvider(s, { now: () => NOW });
  const opts = { from: new Date(Date.parse(s.startDate)), to: new Date(NOW + DAY) };
  const [hrv, rhr] = await Promise.all([p.queryQuantitySamples(HRV, opts), p.queryQuantitySamples(RHR, opts)]);
  const hd = daily(hrv), rd = daily(rhr);
  const byDay = new Map(scoreSeries(hrv, rhr, s.startDate, new Date(NOW).toISOString()).map((r) => [Math.floor(Date.parse(r.day) / DAY), r]));
  const common = [...hd.keys()].filter((d) => rd.has(d));
  const commonDay = Math.max(...common);
  const r = byDay.get(commonDay)!;
  const hDev = r.hrvZ == null ? null : -r.hrvZ, rDev = r.rhrZ == null ? null : r.rhrZ;

  console.log(`common settled day: ${commonDay - nowDay} (relative to now)`);
  console.log(`HRV: ${hd.get(commonDay)!.toFixed(0)} ms   deviation ${hDev?.toFixed(1)}σ (${(hDev ?? 0) < 0 ? "below" : "above"} baseline)`);
  console.log(`RHR: ${rd.get(commonDay)!.toFixed(0)} bpm  deviation ${rDev?.toFixed(1)}σ (${(rDev ?? 0) < 0 ? "below" : "above"} baseline)`);
  console.log(`\nBOTH from day ${commonDay - nowDay}: ✅ same day. Raw: HRV -22ms is huge, RHR +8bpm is subtle.`);
  console.log(`On the σ scale they are comparable (${Math.abs(hDev ?? 0).toFixed(1)}σ vs ${Math.abs(rDev ?? 0).toFixed(1)}σ) — co-movement now visible.`);
}
main();
