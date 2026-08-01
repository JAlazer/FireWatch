// 6a console verification (the provider plumbing, no UI):
//   npx tsx src/mock/appflow.check.ts
// Drives the REAL completion path (completeOnboarding: local save + fire-and-forget
// server) WITH THE SERVER DOWN, then "relaunches" (reload + rebuild provider) and
// checks the output is byte-identical, then resets. Uses an in-memory store
// (AsyncStorage is native); the storage/completion logic is adapter-agnostic so
// this exercises the real path.
//
// The server-DOWN case is the point: onboarding must complete locally even when the
// dev server is unreachable (otherwise dev presets + this check couldn't run).

import type { LifestyleProfileCreate } from "@/types/api";
import { buildProvider } from "../providers/buildProvider";
import { completeOnboarding } from "../onboarding/completeOnboarding";
import { clearOnboarding, isOnboardingComplete, loadOnboarding, type KeyValueStore } from "../storage/onboardingStore";
import { REGISTRY } from "./registry";
import { scoreSeries } from "./score";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-15T12:00:00Z"); // fixed dev clock (also exercises clip-to-now)
const now = () => NOW;
const iso = (ms: number) => new Date(ms).toISOString();
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
const HR = REGISTRY.HeartRate.identifier;

// A healthy, steady survey answer set (server wire shape). 60d of history -> scored.
const STEADY_LIFESTYLE: LifestyleProfileCreate = {
  diet: "healthy",
  has_autoimmune_condition: false,
  smoking_status: "never",
  alcohol_consumption: "light",
  medications: [],
  activity_level: "moderate",
  perceived_stress_level: 3,
  works_shift_work: false,
  family_history_autoimmune: false,
  currently_in_flare: false,
};

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
}

async function main() {
  const store = memStore();

  // 1. complete onboarding WITH THE SERVER DOWN. The server callback throws (as a
  //    real ECONNREFUSED would); completion must still succeed via local save.
  let serverAttempted = false;
  const stored = await completeOnboarding(store, STEADY_LIFESTYLE, {
    seed: "u-appflow-fixed", // fixed so relaunch is byte-identical (real app uses newSeed())
    nowMs: NOW,
    startDate: iso(NOW - 60 * DAY),
    server: async () => {
      serverAttempted = true;
      throw new Error("ECONNREFUSED (dev server down)");
    },
  });
  const completedDespiteServerDown = (await isOnboardingComplete(store)) && !!stored.seed;
  console.log(`[complete] server attempted=${serverAttempted}, server FAILED, onboarding still complete=${completedDespiteServerDown}`);
  console.log(`[complete] seed=${stored.seed} start=${stored.startDate.slice(0, 10)}`);
  await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget rejection log settle

  // a "launch": reload from storage, build the provider, query history + score today
  async function launch() {
    const s = await loadOnboarding(store);
    if (!s) throw new Error("no persisted onboarding");
    const provider = buildProvider(s, { now });
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

  const pass = completedDespiteServerDown && identical;
  console.log("\n" + (pass ? "6a CONSOLE VERIFICATION PASS ✅ (completed with server DOWN, deterministic across relaunch)" : "FAIL ❌"));
  process.exit(pass ? 0 : 1);
}

main();
