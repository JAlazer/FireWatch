// 6a console verification (the provider plumbing, no UI):
//   npx tsx src/mock/appflow.check.ts
// Completes onboarding -> persists -> "relaunches" (reloads + rebuilds provider) ->
// logs samples per metric + score/level -> force-quit/relaunch gives IDENTICAL
// output -> reset returns to onboarding. Uses an in-memory store (AsyncStorage is
// native); the storage logic is adapter-agnostic so this exercises the real path.

import { buildProvider } from "../providers/buildProvider";
import { preset } from "../dev/presets";
import { clearOnboarding, isOnboardingComplete, loadOnboarding, saveOnboarding, type KeyValueStore } from "../storage/onboardingStore";
import { REGISTRY } from "./registry";
import { scoreSeries } from "./score";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-15T12:00:00Z"); // fixed dev clock (also exercises clip-to-now)
const now = () => NOW;
const iso = (ms: number) => new Date(ms).toISOString();
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
const HR = REGISTRY.HeartRate.identifier;

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
}

async function main() {
  const store = memStore();

  // 1. complete onboarding — use the "steady" preset so there's enough history to score
  const p = preset("steady", NOW);
  const stored = await saveOnboarding(store, p.profile, { startDate: p.startDate });
  console.log(`[complete] seed=${stored.seed} start=${stored.startDate.slice(0, 10)} isComplete=${await isOnboardingComplete(store)}`);

  // a "launch": reload from storage, build the provider, query 30d + score today
  async function launch() {
    const s = await loadOnboarding(store);
    if (!s) throw new Error("no persisted onboarding");
    const provider = buildProvider(s, { now });
    // Fetch full history (scoring needs ~56d for the baseline), report last-30d counts.
    const opts = { from: new Date(Date.parse(s.startDate)), to: new Date(NOW + DAY) };
    const [hrv, rhr, hr] = await Promise.all([
      provider.queryQuantitySamples(HRV, opts),
      provider.queryQuantitySamples(RHR, opts),
      provider.queryQuantitySamples(HR, opts),
    ]);
    const cut = NOW - 30 * DAY;
    const last30 = (a: { startDate: Date }[]) => a.filter((x) => x.startDate.getTime() >= cut).length;
    const series = scoreSeries(hrv, rhr, iso(NOW - 2 * DAY), iso(NOW));
    const today = series[series.length - 1];
    return { counts: { HR: last30(hr), HRV: last30(hrv), RHR: last30(rhr) }, today };
  }

  const a = await launch();
  console.log(`[launch 1] last-30d samples: ${JSON.stringify(a.counts)}`);
  console.log(`[launch 1] today: status=${a.today.status} level=${a.today.level} score=${a.today.score} — ${a.today.reason}`);

  // 2. force-quit + relaunch -> byte-identical
  const b = await launch();
  const identical = JSON.stringify(a) === JSON.stringify(b);
  console.log(`[relaunch] identical to launch 1: ${identical}`);

  // 3. dev RESET -> back to onboarding
  await clearOnboarding(store);
  console.log(`[reset] isComplete=${await isOnboardingComplete(store)}`);

  console.log("\n" + (identical ? "6a CONSOLE VERIFICATION PASS ✅" : "FAIL ❌"));
  process.exit(identical ? 0 : 1);
}

main();
