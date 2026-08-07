// The provider chain: persisted onboarding -> mapping layer -> generate() -> a
// MockHealthDataProvider serving the query methods. This is where the app turns
// stored answers into a live (mock) HealthKit provider.
//
// Because generation is now range-independent and deterministic, generating on
// demand is safe and fast (a full year ~200ms) -- no cache needed. History runs
// from the user's startDate to "now" (+1 day so today is included), so a brand-new
// user has little history and the dashboard sits in the calibrating state until
// ~28 days accrue.

import { MockHealthDataProvider } from "../mock/MockHealthDataProvider";
import { toPhysiologyProfile } from "../mock/mapping";
import type { StoredOnboarding } from "../storage/onboardingStore";
import type { HealthDataProvider } from "./HealthDataProvider";

const DAY = 86_400_000;

export function buildProvider(onboarding: StoredOnboarding, opts?: { now?: () => number }): HealthDataProvider {
  const now = opts?.now ?? (() => Date.now());
  const range = {
    from: new Date(Date.parse(onboarding.startDate)).toISOString(),
    to: new Date(now() + DAY).toISOString(), // +1 day so "today" is in-window
  };
  const physiology = toPhysiologyProfile(onboarding, range, now()); // age as-of the injected clock
  return new MockHealthDataProvider(physiology, range, { now });
}
