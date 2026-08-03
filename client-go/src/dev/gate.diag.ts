// Item-1 check: does the GATE (now data-producing days, not calendar days) shift any
// dev preset across a phase boundary?  npx tsx src/dev/gate.diag.ts
// Prints calendar days vs data-days (both signals present) vs the resulting phase, and
// whether a score would show — so we can see exactly what changes on the presets.

import { buildProvider } from "../providers/buildProvider";
import { REGISTRY } from "../mock/registry";
import { scoreSeries } from "../mock/score";
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
function daily(a: { startDate: Date }[]) { const s = new Set<number>(); for (const x of a) s.add(Math.floor(x.startDate.getTime() / DAY)); return s; }
const phase = (n: number) => (n < 15 ? "learning" : n < 28 ? "provisional" : "full");

async function at(days: number, scenario: "calm" | "flare") {
  const store = memStore();
  await saveOnboarding(store, devProfile(scenario, NOW), { startDate: devStartDate(days, NOW) });
  const s = (await loadOnboarding(store))!;
  const p = buildProvider(s, { now: () => NOW });
  const opts = { from: new Date(Date.parse(s.startDate)), to: new Date(NOW + DAY) };
  const [hrv, rhr] = await Promise.all([p.queryQuantitySamples(HRV, opts), p.queryQuantitySamples(RHR, opts)]);
  const hd = daily(hrv), rd = daily(rhr);
  const common = [...hd].filter((d) => rd.has(d)).length; // data-days = both present
  const calendar = Math.max(1, Math.floor((NOW - Date.parse(s.startDate)) / DAY));
  const series = scoreSeries(hrv, rhr, s.startDate, new Date(NOW).toISOString());
  const heat = series[series.length - 1]?.heat ?? null;
  const oldPhase = phase(calendar), newPhase = phase(common);
  const scoreShown = newPhase !== "learning" && heat != null;
  const flag = oldPhase !== newPhase ? "  <-- PHASE CHANGED" : "";
  console.log(`preset ${String(days).padStart(2)} ${scenario.padEnd(5)}: calendar ${String(calendar).padStart(2)}d (${oldPhase}) -> data ${String(common).padStart(2)}d (${newPhase}), score=${scoreShown ? "shown" : "none"}${flag}`);
}

async function main() {
  for (const scenario of ["calm", "flare"] as const) for (const d of [1, 7, 15, 20, 30, 60]) await at(d, scenario);
}
main();
