// DEV-ONLY presets: reach any dashboard state on demand. Guard usage with __DEV__
// and keep this module easily strippable. Names align with the dashboard prototype's
// five simulator states so we test what the screens were designed around.
//
// Exploits that generation is range-independent + deterministic: each preset just
// backdates startDate (and, for elevated, plants a flare ending near "now") so the
// same state reproduces every launch. A RESET clears the profile back to onboarding
// (otherwise, once the completion gate exists, a finished onboarding can never be
// re-entered to test Screen 1/2 changes without reinstalling the app).

import type { OnboardingProfile } from "../mock/mapping";

export type PresetName = "learning" | "provisional" | "steady" | "elevated" | "confounded";

export interface PresetResult {
  profile: OnboardingProfile;
  startDate: string; // ISO — passed to saveOnboarding({ startDate })
  note: string;
}

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Build a preset relative to a "now" (defaults to real now). */
export function preset(name: PresetName, nowMs: number = Date.now()): PresetResult {
  const seed = `dev-${name}`; // fixed so the preset is reproducible
  const base: OnboardingProfile = { seed, age: 40 };
  const backdate = (days: number) => iso(nowMs - days * DAY);

  switch (name) {
    case "learning":
      return { profile: base, startDate: backdate(6), note: "~day 6 of 28 — no estimate shown yet" };
    case "provisional":
      // ~21 days so the baseline (which lags 3 days and drops ~10% to wear gaps)
      // reliably clears the 14-day provisional floor without reaching 28 (scored).
      return { profile: base, startDate: backdate(21), note: "~day 21 — provisional estimate, low confidence" };
    case "steady":
      return { profile: base, startDate: backdate(60), note: "28+ days, nothing elevated" };
    case "elevated":
      return {
        profile: {
          ...base, autoimmune: true,
          // A deliberately STRONG, ongoing flare so the elevated state is reliably
          // reachable for UI testing. A real literature-magnitude flare (RHR x1.086
          // ~ 1 SD) plus clip-to-now (today's RHR arrives ~17h late) plus wear gaps
          // sits right at the concordance threshold -- i.e. it's intermittently
          // elevated, exactly the behavior documented in the scoring analysis. This
          // dev fixture over-drives it (HRV x0.68, RHR x1.15) to force a clean state.
          explicitEpisodes: [{
            from: backdate(6), to: backdate(-20), kind: "flare",
            effects: [{ metric: "HeartRateVariabilitySDNN", factor: 0.68 }, { metric: "RestingHeartRate", factor: 1.15 }],
          }],
        },
        startDate: backdate(60),
        note: "steady baseline + a flare ending near now",
      };
    case "confounded":
      return {
        profile: { ...base, medications: ["beta_blocker"] },
        startDate: backdate(60),
        note: "steady + beta-blocker confound (HRV up, RHR down; state unchanged)",
      };
  }
}

export const PRESET_NAMES: PresetName[] = ["learning", "provisional", "steady", "elevated", "confounded"];
