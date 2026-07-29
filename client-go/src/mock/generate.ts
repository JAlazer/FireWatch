// generate(profile, range) -> the canonical, fully-deterministic sample set for
// one person. This is what MockHealthDataProvider serves from. It never emits
// derived values (no scores, no rolling averages) -- only raw HealthKit-shaped
// samples, exactly what the real binding returns.
//
// Two-stage value model (#7): a per-user LATENT daily series is generated for the
// whole range first, as an AR(1) autocorrelated process (today depends on
// yesterday, per the calibrated lag-1 autocorrelation). The per-day occurrence
// models then read that latent value and add sensor/intra-day variation. Emitting
// day-independent draws would jitter where real physiology trends.

import { CHANGE_LOG, centroidForAge, deviceBehavior, physiology } from "./calibration";
import { REGISTRY } from "./registry";
import { Rng, deterministicUuid } from "./rng";
import { baselineFactor, confoundFactor, type PhysiologyProfile } from "./profile";
import type { DateRange } from "./types";

const DAY_MS = 86_400_000;
const SOURCE = "Mock Apple Watch";

// --- internal representation (provider maps these to public sample shapes) ------
export interface GenSample {
  uuid: string;
  metricKey: string;
  identifier: string;
  unit: string | null;
  value: number; // quantity value (rounded at emission)
  startMs: number;
  endMs: number;
  creationMs: number; // arrival time; may be overridden by a backfill event
  sourceName: string;
  retractedAtMs: number | null; // set on the ~0.5% that get deleted later
}

export interface ChangeEvent {
  tMs: number; // event time (creation for insert, retraction for delete)
  kind: "insert" | "delete";
  index: number; // into GeneratedStore.samples
}

/** Per-user physiology resolved ONCE at profile resolution (not per day). */
export interface UserTraits {
  userHrvMedian: number;
  userRhrLevel: number;
  activityLevel: number;
  /**
   * #8b: whether this user ever produces VO2 max. A per-USER boolean, not a
   * per-day decision -- a substantial fraction of users never trigger it (no
   * outdoor GPS runs). Coupled to activityLevel: sedentary users are far more
   * likely to have none. Consulted by the (disabled) rare-episodic model.
   */
  producesVO2Max: boolean;
}

export interface GeneratedStore {
  profile: PhysiologyProfile;
  range: DateRange;
  traits: UserTraits;
  samples: GenSample[];
  events: ChangeEvent[]; // sorted by tMs; the change log anchored queries walk
}

const utcMidnight = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

/** Arrival-lag draw (seconds): lognormal with median p50, width from p90. */
function lagSeconds(rng: Rng, lag: { p50: number; p90: number; p95: number }): number {
  if (lag.p50 <= 0) return 0;
  const sigma = Math.max(0.05, Math.log(Math.max(lag.p90, lag.p50 + 1) / lag.p50) / 1.2816);
  return Math.max(0, lag.p50 * Math.exp(sigma * rng.normalStd()));
}

/**
 * AR(1) latent daily series. `marginalSigma` is the marginal spread IN THE
 * WORKING SPACE (#17): for logSpace metrics pass the log-space sigma (derived
 * from the calibrated CV, so spread scales with the user's median, not an
 * absolute sd measured at a different median); for linear metrics pass the sd.
 */
function ar1Series(rng: Rng, nDays: number, level: number, marginalSigma: number, phi: number, logSpace: boolean): number[] {
  const mu = logSpace ? Math.log(level) : level;
  const innov = marginalSigma * Math.sqrt(Math.max(0, 1 - phi * phi));
  const out: number[] = [];
  let x = rng.normal(mu, marginalSigma);
  for (let d = 0; d < nDays; d++) {
    if (d > 0) x = mu + phi * (x - mu) + rng.normal(0, innov);
    out.push(logSpace ? Math.exp(x) : x);
  }
  return out;
}

/** Log-space sigma of a lognormal with the given coefficient of variation. */
const cvToLogSigma = (cv: number) => Math.sqrt(Math.log(1 + cv * cv));

/** Ramped, compounded episode factor for a metric on a given day (#1/#10). */
function episodeFactor(profile: PhysiologyProfile, metricKey: string, dayMs: number): number {
  let f = 1;
  for (const ep of profile.episodes ?? []) {
    const eff = ep.effects.find((e) => e.metric === metricKey);
    if (!eff) continue;
    const s = utcMidnight(Date.parse(ep.from));
    const e = utcMidnight(Date.parse(ep.to));
    if (dayMs < s || dayMs >= e) continue;
    const total = Math.max(1, Math.round((e - s) / DAY_MS));
    const idx = Math.round((dayMs - s) / DAY_MS);
    const ramp = Math.max(1, Math.min(2, Math.floor(total / 2)));
    const amp = Math.min(1, Math.min((idx + 1) / (ramp + 1), (total - idx) / (ramp + 1)));
    f *= 1 + (eff.factor - 1) * amp; // linear ramp in/out, not a square wave
  }
  return f;
}

export function generate(profile: PhysiologyProfile, range: DateRange): GeneratedStore {
  const base = new Rng(profile.seed);
  const fromMs = utcMidnight(Date.parse(range.from));
  const toMs = utcMidnight(Date.parse(range.to));
  const days: number[] = [];
  for (let d = fromMs; d < toMs; d += DAY_MS) days.push(d);
  const nDays = days.length;

  // ---- resolve per-user physiology (between-person draws from the population) ----
  const uRng = base.fork("user");
  const hrvP = physiology<{ within_person: { cv: number; lag1_autocorr: number }; between_person_spread: { cv: number } }>("HeartRateVariabilitySDNN");
  const rhrP = physiology<{ within_person: { daily_mean_sd: number; lag1_autocorr: number }; between_person_spread: { sd: number } }>("RestingHeartRate");
  const fitP = physiology<{ fitness_index: { population: { median: number; cv: number }; fitness_effects: { variance_share: number; direction: Record<string, "up" | "down"> } } }>("HeartRate").fitness_index;
  const fitPop = fitP.population;
  const fitEff = fitP.fitness_effects;

  // Fitness is resolved FIRST because it shifts BOTH scored centroids (#16). It is
  // DECOMPOSED out of each metric's total between-person spread (#18): the fitness
  // component and an independent residual sum to exactly the total, rather than
  // stacking a shift on top of the full spread (which would double-count fitness).
  //   per_efold      = sqrt(share) * total_spread / sigma_f   (sign from direction)
  //   residual_spread = sqrt(1 - share) * total_spread
  const activityLevel = profile.activityLevel ?? uRng.fork("activity").lognormalMedianCv(fitPop.median, fitPop.cv);
  const fitF = Math.log(activityLevel / fitPop.median); // >0 = fitter
  const share = fitEff.variance_share;
  const sigmaF = cvToLogSigma(fitPop.cv);
  const dir = (m: string) => (fitEff.direction[m] === "down" ? -1 : 1);

  // Resting HR (normal, linear space)
  const rhrTotalSd = rhrP.between_person_spread.sd;
  const rhrPerEfold = dir("RestingHeartRate") * (Math.sqrt(share) * rhrTotalSd) / sigmaF;
  const rhrResidualSd = Math.sqrt(1 - share) * rhrTotalSd;
  const rhrCentroid = centroidForAge("RestingHeartRate", profile.age) * baselineFactor(profile, "RestingHeartRate") + rhrPerEfold * fitF;
  const userRhrLevel = uRng.fork("rhr").normal(rhrCentroid, rhrResidualSd);

  // HRV (lognormal, log space)
  const hrvTotalSigma = cvToLogSigma(hrvP.between_person_spread.cv);
  const hrvPerEfold = dir("HeartRateVariabilitySDNN") * (Math.sqrt(share) * hrvTotalSigma) / sigmaF;
  const hrvResidualSigma = Math.sqrt(1 - share) * hrvTotalSigma;
  const hrvCentroid = centroidForAge("HeartRateVariabilitySDNN", profile.age) * baselineFactor(profile, "HeartRateVariabilitySDNN") * Math.exp(hrvPerEfold * fitF);
  const userHrvMedian = hrvCentroid * Math.exp(uRng.fork("hrv").normal(0, hrvResidualSigma));

  // #8b: VO2 max presence is a per-USER decision drawn once, coupled to fitness.
  // Sedentary users are far more likely to never trigger it. Absent-fraction is
  // ASSUMED (no published figure for what share of owners never produce VO2 max).
  const VO2_ABSENT_AT_MEDIAN = 0.35; // assumed
  const actRatio = activityLevel / fitPop.median;
  const vo2AbsentProb = Math.min(0.95, Math.max(0.05, VO2_ABSENT_AT_MEDIAN / actRatio));
  const producesVO2Max = uRng.fork("vo2").next() >= vo2AbsentProb;
  const traits = { userHrvMedian, userRhrLevel, activityLevel, producesVO2Max };

  // ---- latent daily series (whole range, before the day loop) ----
  const hrvLatent = ar1Series(base.fork("latent:hrv"), nDays, userHrvMedian, cvToLogSigma(hrvP.within_person.cv), hrvP.within_person.lag1_autocorr, true);
  const rhrLatent = ar1Series(base.fork("latent:rhr"), nDays, userRhrLevel, rhrP.within_person.daily_mean_sd, rhrP.within_person.lag1_autocorr, false);
  for (let d = 0; d < nDays; d++) {
    hrvLatent[d] *= episodeFactor(profile, "HeartRateVariabilitySDNN", days[d]);
    rhrLatent[d] *= episodeFactor(profile, "RestingHeartRate", days[d]);
  }

  // ---- wear: one worn/not-worn decision per day, shared across metrics ----
  const wearCov = deviceBehavior("HeartRate").wear.coverage_pct / 100;
  const wearRng = base.fork("wear");
  const worn = days.map(() => wearRng.next() < wearCov);

  // ---- emission ----
  const samples: GenSample[] = [];
  const idRng = base.fork("uuid");
  const rhrConf = confoundFactor(profile, "RestingHeartRate");
  const hrvConf = confoundFactor(profile, "HeartRateVariabilitySDNN");

  const hrvHours = deviceBehavior("HeartRateVariabilitySDNN").hour_of_day_weights ?? [];
  const hrvRpd = deviceBehavior("HeartRateVariabilitySDNN").records_per_day;
  const emit = (key: string, value: number, startMs: number, endMs: number, r: Rng, lagBucket: { p50: number; p90: number; p95: number }) => {
    const def = REGISTRY[key];
    samples.push({
      uuid: deterministicUuid(idRng),
      metricKey: key, identifier: def.identifier, unit: def.unit,
      value: Math.round(value * 10) / 10,
      startMs, endMs,
      creationMs: startMs + Math.round(lagSeconds(r, lagBucket) * 1000),
      sourceName: SOURCE, retractedAtMs: null,
    });
  };

  const eRhr = base.fork("emit:rhr");
  const eHrv = base.fork("emit:hrv");
  const eHr = base.fork("emit:hr");
  const lagRhr = deviceBehavior("RestingHeartRate").arrival_lag_seconds;
  const lagHrv = deviceBehavior("HeartRateVariabilitySDNN").arrival_lag_seconds;
  const lagHr = deviceBehavior("HeartRate").arrival_lag_seconds;

  for (let d = 0; d < nDays; d++) {
    if (!worn[d]) continue; // unworn day -> empty (no zero-valued samples)
    const day = days[d];

    // Resting HR: one computed daily summary, timestamped at day start, arriving
    // ~17h later (the calibrated once-daily model).
    emit("RestingHeartRate", rhrLatent[d] * rhrConf + eRhr.normal(0, 0.5), day, day + Math.round(13.5 * 3600_000), eRhr, lagRhr);

    // HRV: a few irregular short-window readings, placed by (partly behavioral)
    // hour weights, value around the day's latent HRV.
    const nHrv = Math.max(1, Math.round(eHrv.normal(hrvRpd.p50, 1)));
    for (let i = 0; i < nHrv; i++) {
      const hour = weightedHour(eHrv, hrvHours);
      const t = day + hour * 3600_000 + eHrv.int(0, 3599) * 1000;
      const v = hrvLatent[d] * Math.exp(eHrv.normal(0, 0.08)) * hrvConf; // sensor noise, log space
      emit("HeartRateVariabilitySDNN", v, t, t + 60_000, eHrv, lagHrv);
    }

    // Heart rate: two-mode dense sampling (#8). Background ~5min when still;
    // burst ~6s inside activity windows, HR rising from the resting floor toward
    // resting + activityLevel. Timing is emergent (no stored hour array, #9).
    emitHeartRate(eHr, day, rhrLatent[d], activityLevel, (v, s, e) => emit("HeartRate", v, s, e, eHr, lagHr));
  }

  // ---- backfill event: a batch of old samples arriving at once (#6) ----
  const bfRng = base.fork("backfill");
  if (bfRng.next() < CHANGE_LOG.backfill_event.probability_per_generation && nDays > 5) {
    const restoreMs = days[bfRng.int(Math.floor(nDays / 2), nDays - 1)] + 12 * 3600_000;
    const windowStart = restoreMs - CHANGE_LOG.backfill_event.max_lag_days * DAY_MS;
    for (const s of samples) {
      if (s.startMs >= windowStart && s.startMs < restoreMs) s.creationMs = restoreMs;
    }
  }

  // ---- retractions: a small fraction deleted later, each with its own time (#4) ----
  const rRng = base.fork("retract");
  for (const s of samples) {
    if (rRng.next() < CHANGE_LOG.retraction_rate) {
      s.retractedAtMs = s.creationMs + Math.round(rRng.lognormalMedianCv(DAY_MS, 0.5));
    }
  }

  // ---- change log (insert@creation, delete@retraction), sorted by event time ----
  const events: ChangeEvent[] = [];
  samples.forEach((s, index) => {
    events.push({ tMs: s.creationMs, kind: "insert", index });
    if (s.retractedAtMs != null) events.push({ tMs: s.retractedAtMs, kind: "delete", index });
  });
  events.sort((a, b) => a.tMs - b.tMs || (a.kind === b.kind ? a.index - b.index : a.kind === "insert" ? -1 : 1));

  return { profile, range, traits, samples, events };
}

/** Pick an hour 0..23 by weight; falls back to uniform if weights absent. */
function weightedHour(rng: Rng, weights: number[]): number {
  if (weights.length !== 24) return rng.int(0, 23);
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rng.next() * total;
  for (let h = 0; h < 24; h++) {
    x -= weights[h];
    if (x <= 0) return h;
  }
  return 23;
}

/** One day of heart rate as a two-mode process; `push(value, startMs, endMs)`. */
function emitHeartRate(rng: Rng, day: number, restingFloor: number, activityLevel: number, push: (v: number, s: number, e: number) => void): void {
  const wake = day + 7 * 3600_000;
  const sleep = day + 23 * 3600_000;
  // 0..2 activity windows, more likely for higher activity levels.
  const nWin = rng.next() < 0.5 ? 1 : rng.next() < 0.4 ? 2 : 0;
  const windows: { s: number; e: number; peak: number }[] = [];
  for (let i = 0; i < nWin; i++) {
    const s = wake + rng.uniform(0, sleep - wake - 45 * 60_000);
    const dur = rng.uniform(25, 50) * 60_000;
    windows.push({ s, e: s + dur, peak: restingFloor + activityLevel * rng.uniform(0.7, 1) });
  }
  windows.sort((a, b) => a.s - b.s);
  let t = wake;
  while (t < sleep) {
    const w = windows.find((win) => t >= win.s && t < win.e);
    let hr: number;
    let step: number;
    if (w) {
      const frac = (t - w.s) / (w.e - w.s);
      hr = restingFloor + (w.peak - restingFloor) * Math.sin(Math.PI * frac) + rng.normal(0, 3);
      step = 6_000;
    } else {
      hr = restingFloor + Math.max(0, rng.normal(18, 9)); // awake background
      step = 300_000;
    }
    push(Math.max(restingFloor - 2, hr), t, t);
    t += step + rng.int(-2000, 2000);
  }
}
