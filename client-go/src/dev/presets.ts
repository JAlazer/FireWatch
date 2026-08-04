// DEV-ONLY fixtures for the dev screen (app/dev.tsx). TWO INDEPENDENT axes:
//   - days of history -> backdate the profile's startDate, so buildProvider yields
//     that much REAL generated history (not a faked UI state)
//   - scenario        -> calm | flare | flare+beta_blocker
// Guard usage with __DEV__ and keep this easily strippable.
//
// Exploits range-independent + deterministic generation: a fixed per-scenario seed
// plus a backdated startDate reproduces the same history every launch.

import type { OnboardingProfile } from "../mock/mapping";

export type DevScenario = "calm" | "flare" | "flare+beta_blocker";

export const DAY_BUTTONS = [1, 7, 15, 20, 30, 60] as const;
export const SCENARIOS: DevScenario[] = ["calm", "flare", "flare+beta_blocker"];

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const birthDateForAge = (age: number, nowMs: number) =>
  new Date(Date.UTC(new Date(nowMs).getUTCFullYear() - age, 0, 1)).toISOString().slice(0, 10);

// A deliberately STRONG, ongoing flare so the elevated state is reliably reachable
// for UI testing. A literature-magnitude flare (RHR ~1 SD) plus clip-to-now (today's
// RHR arrives ~17h late) plus wear gaps sits right at the concordance threshold — so
// it's only intermittently elevated. This over-drives it (HRV x0.68, RHR x1.15) and
// spans "now" with margin, so recent days are solidly in-flare. HRV down + RHR up is
// the inflammation direction.
const FLARE_EFFECTS = [
  { metric: "HeartRateVariabilitySDNN", factor: 0.68 },
  { metric: "RestingHeartRate", factor: 1.15 },
];
const flareEpisode = (nowMs: number) => ({
  from: iso(nowMs - 6 * DAY),
  to: iso(nowMs + 20 * DAY),
  kind: "flare",
  effects: FLARE_EFFECTS,
});

/** ISO start date giving `days` of history as-of nowMs. */
export function devStartDate(days: number, nowMs: number): string {
  return iso(nowMs - days * DAY);
}

/** Build the profile for a scenario (seed fixed per scenario -> reproducible). */
export function devProfile(scenario: DevScenario, nowMs: number): OnboardingProfile {
  const base: OnboardingProfile = { seed: `dev-${scenario}`, birthDate: birthDateForAge(40, nowMs) };
  if (scenario === "calm") return base;
  const profile: OnboardingProfile = { ...base, explicitEpisodes: [flareEpisode(nowMs)] };
  // beta-blocker (HRV UP, RHR DOWN) is a CONFOUND opposing the flare direction, so it
  // can MASK a genuine flare — the app quietly reads "calm". The dangerous case.
  if (scenario === "flare+beta_blocker") profile.medications = ["beta_blocker"];
  return profile;
}

/** Infer the active scenario from a persisted profile (for the dev screen status). */
export function scenarioOf(p: { explicitEpisodes?: unknown[]; medications?: string[] }): DevScenario {
  if (!p.explicitEpisodes?.length) return "calm";
  return p.medications?.includes("beta_blocker") ? "flare+beta_blocker" : "flare";
}
