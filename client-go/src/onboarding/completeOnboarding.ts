// Onboarding completion: LOCAL persistence is the SOURCE OF TRUTH; the server POST
// is fire-and-forget.
//
// WHY local-first: the generator runs ON-DEVICE and needs the profile to produce
// anything, so the app must not depend on the dev server being up just to launch.
// And because the server uses in-memory repositories, its copy evaporates on
// restart — a userId in AsyncStorage would then dangle. So local wins, always.
//
// The server call still runs, but non-blocking: its rejection is logged, never
// thrown, so a server-down dev machine still completes onboarding (and dev presets
// + console verification still work).
//
// MOCK-SPECIFIC: the profile-on-device requirement exists only because the
// generator runs on-device. With real HealthKit the client wouldn't need the
// profile locally (HealthKit supplies data regardless; the profile matters only
// server-side for scoring). This dependency disappears when real HealthKit lands.

import type { LifestyleProfileCreate } from "@/types/api";
import { lifestyleToOnboarding } from "./lifestyleAdapter";
import { saveOnboarding, type KeyValueStore, type StoredOnboarding } from "../storage/onboardingStore";

export interface CompleteOnboardingOpts {
  seed: string; // stable per-user seed (generate once with newSeed())
  age?: number;
  nowMs?: number;
  startDate?: string; // history start; defaults to completion time
  /** Fire-and-forget server sync. Runs AFTER local save; a rejection is logged, never thrown. */
  server?: () => Promise<void>;
}

export async function completeOnboarding(
  store: KeyValueStore,
  lifestyle: LifestyleProfileCreate,
  opts: CompleteOnboardingOpts,
): Promise<StoredOnboarding> {
  const profile = lifestyleToOnboarding(lifestyle, { seed: opts.seed, age: opts.age, nowMs: opts.nowMs });
  const stored = await saveOnboarding(store, profile, { startDate: opts.startDate }); // local = source of truth
  if (opts.server) {
    // NB: intentionally NOT awaited — server failure must not block completion.
    void opts.server().catch((e) =>
      console.warn("[onboarding] server sync failed (non-blocking, local is source of truth):", e instanceof Error ? e.message : e),
    );
  }
  return stored;
}
