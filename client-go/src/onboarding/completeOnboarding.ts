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
//
// The caller supplies the CANONICAL profile already (see projections.rawToOnboarding)
// and, separately, the fire-and-forget server thunk — this module stays agnostic to
// both the raw answers and the wire format.

import type { OnboardingProfile } from "../mock/mapping";
import { saveOnboarding, type KeyValueStore, type StoredOnboarding } from "../storage/onboardingStore";

export interface CompleteOnboardingOpts {
  userId?: string; // per-user storage key (defaults to the placeholder identity)
  startDate?: string; // history start; defaults to completion time
  /** Fire-and-forget server sync. Runs AFTER local save; a rejection is logged, never thrown. */
  server?: () => Promise<void>;
}

export async function completeOnboarding(
  store: KeyValueStore,
  profile: OnboardingProfile,
  opts?: CompleteOnboardingOpts,
): Promise<StoredOnboarding> {
  const stored = await saveOnboarding(store, profile, { startDate: opts?.startDate, userId: opts?.userId }); // local = source of truth
  if (opts?.server) {
    // NB: intentionally NOT awaited — server failure must not block completion.
    void opts.server().catch((e) =>
      console.warn("[onboarding] server sync failed (non-blocking, local is source of truth):", e instanceof Error ? e.message : e),
    );
  }
  return stored;
}
