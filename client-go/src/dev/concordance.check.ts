// Isolates the coupling's MECHANISM: does correlating the innovations make HRV and
// RHR clear threshold on the SAME day more often (concordant ENTER-eligible days)?
//   npx tsx src/dev/concordance.check.ts
// Uses the literature flare (0.749/1.086). Run once per innovation_corr setting.

import { MockHealthDataProvider } from "../mock/MockHealthDataProvider";
import { toPhysiologyProfile, type OnboardingProfile } from "../mock/mapping";
import { REGISTRY } from "../mock/registry";
import { scoreSeries } from "../mock/score";
import { innovationCorr } from "../mock/calibration";

const DAY = 86_400_000;
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
const FROM = "2026-01-01T00:00:00Z";
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY).toISOString();
const range = { from: FROM, to: addDays(FROM, 160) };
const F0 = 90, F1 = 105;

async function main() {
  const seeds = 20;
  let concordant = 0, rhrOnly = 0, hrvOnly = 0, flareDays = 0;
  for (let i = 0; i < seeds; i++) {
    const onboarding: OnboardingProfile = {
      seed: `conc-${i}`, birthDate: "1986-01-01", autoimmune: true,
      explicitEpisodes: [{ from: addDays(FROM, F0), to: addDays(FROM, F1), kind: "flare",
        effects: [{ metric: "HeartRateVariabilitySDNN", factor: 0.749 }, { metric: "RestingHeartRate", factor: 1.086 }] }],
    };
    const p = new MockHealthDataProvider(toPhysiologyProfile(onboarding, range), range, { now: () => Date.parse(range.to) + 60 * DAY });
    const opts = { from: new Date(range.from), to: new Date(addDays(range.to, 1)) };
    const [hrv, rhr] = await Promise.all([p.queryQuantitySamples(HRV, opts), p.queryQuantitySamples(RHR, opts)]);
    for (const r of scoreSeries(hrv, rhr, addDays(FROM, F0), addDays(FROM, F1 - 1))) {
      if (r.hrvZ == null || r.rhrZ == null) continue;
      flareDays++;
      const h = r.hrvZ >= 1, rr = r.rhrZ >= 1;
      if (h && rr) concordant++;
      else if (rr) rhrOnly++;
      else if (h) hrvOnly++;
    }
  }
  console.log(`innovation_corr = ${innovationCorr("HeartRateVariabilitySDNN", "RestingHeartRate")}`);
  console.log(`flare-days scored: ${flareDays} across ${seeds} seeds`);
  console.log(`  BOTH clear threshold (ENTER-eligible): ${concordant} (${(100 * concordant / flareDays).toFixed(0)}%)`);
  console.log(`  RHR only: ${rhrOnly} | HRV only: ${hrvOnly}`);
}
main();
