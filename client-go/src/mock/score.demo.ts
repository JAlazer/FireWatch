// Validate scoring against GROUND TRUTH (mapping plants a flare at a known window)
// with the asymmetric enter/stay/exit rule and robust baseline.
//   npx tsx src/mock/score.demo.ts

import { MockHealthDataProvider } from "./MockHealthDataProvider";
import { toPhysiologyProfile, type OnboardingProfile } from "./mapping";
import { REGISTRY } from "./registry";
import { scoreSeries } from "./score";

const DAY = 86_400_000;
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY).toISOString();

const FROM = "2026-01-01T00:00:00Z";
const range = { from: FROM, to: addDays(FROM, 160) };
const FLARE_START = 90;
const FLARE_END = 105;
// Birth date that yields ~`age` when derived as-of the range end (mapping resolves
// age from birthDate now, not a stored number).
const bd = (age: number) => `${new Date(Date.parse(range.to)).getUTCFullYear() - age}-01-01`;

async function samples(onboarding: OnboardingProfile) {
  const p = new MockHealthDataProvider(toPhysiologyProfile(onboarding, range), range, { now: () => Date.parse(range.to) + 60 * DAY });
  const opts = { from: new Date(range.from), to: new Date(addDays(range.to, 1)) };
  return { hrv: await p.queryQuantitySamples(HRV, opts), rhr: await p.queryQuantitySamples(RHR, opts) };
}

async function main() {
  // ---- 1. flare detection + level sequence ----
  const flareUser: OnboardingProfile = {
    seed: "score-demo", birthDate: bd(40), autoimmune: true,
    explicitEpisodes: [{ from: addDays(FROM, FLARE_START), to: addDays(FROM, FLARE_END), kind: "flare",
      effects: [{ metric: "HeartRateVariabilitySDNN", factor: 0.749 }, { metric: "RestingHeartRate", factor: 1.086 }] }],
  };
  const { hrv, rhr } = await samples(flareUser);
  const series = scoreSeries(hrv, rhr, addDays(FROM, 40), addDays(FROM, 130));

  const inFlare = (d: number) => d >= FLARE_START && d < FLARE_END;
  console.log(`=== flare days ${FLARE_START}-${FLARE_END} (HRV x0.749, RHR x1.086) ===\n`);
  console.log(`${"day".padStart(4)} lvl hrvZ  rhrZ  elev flare`);
  let flareDays = 0, flareElevated = 0;
  for (const r of series) {
    const dIdx = Math.round((Date.parse(r.day) - Date.parse(FROM)) / DAY);
    const f = inFlare(dIdx);
    if (r.status === "scored" && f) { flareDays++; if (r.elevated) flareElevated++; }
    if (dIdx >= 86 && dIdx <= 112) {
      const z = (x: number | null) => (x == null ? "  - " : (x >= 0 ? "+" : "") + x.toFixed(1)).padStart(5);
      console.log(`${String(dIdx).padStart(4)}  ${String(r.level ?? "-")}  ${z(r.hrvZ)} ${z(r.rhrZ)}  ${r.elevated ? "Y" : " "}   ${f ? "##" : ""}`);
    }
  }
  const levelSeq = series.filter((r) => { const d = Math.round((Date.parse(r.day) - Date.parse(FROM)) / DAY); return d >= 88 && d <= 112; }).map((r) => (r.level ?? "-")).join("");
  console.log(`\nlevel sequence (days 88-112): ${levelSeq}`);
  console.log(`elevated on ${flareElevated}/${flareDays} flare days (vs 5/15 before the fix)`);

  // ---- 2. edge cases ----
  const early = series.find((r) => r.status === "calibrating");
  console.log(`\n[edge] calibrating early: ${early ? early.day + " -> " + early.reason : "none (baseline ready throughout window)"}`);
  const gapDay = 60;
  const hrvGapped = hrv.filter((s) => { const d = Math.floor((s.startDate.getTime() - Date.parse(FROM)) / DAY); return d < gapDay - 2 || d > gapDay; });
  const missing = scoreSeries(hrvGapped, rhr, addDays(FROM, gapDay), addDays(FROM, gapDay))[0];
  console.log(`[edge] HRV missing 3d @day ${gapDay}: level=${missing.level} elevated=${missing.elevated} — ${missing.reason}`);

  // ---- 3. false-alarm rate across many seeds (healthy users, NO flare) ----
  let scoredDays = 0, elevatedDays = 0;
  const N = 25;
  for (let i = 0; i < N; i++) {
    const s = await samples({ seed: `fa-${i}`, birthDate: bd(30 + i) });
    for (const r of scoreSeries(s.hrv, s.rhr, addDays(FROM, 40), addDays(FROM, 150))) {
      if (r.status === "scored") { scoredDays++; if (r.elevated) elevatedDays++; }
    }
  }
  console.log(`\n[false alarms] ${N} healthy users, no flare: ${elevatedDays}/${scoredDays} scored-days elevated = ${(100 * elevatedDays / scoredDays).toFixed(1)}%`);
}

main();
