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

import { CHANGE_LOG, WEAR_MODEL, centroidForAge, deviceBehavior, innovationCorr, physiology, recording } from "./calibration";
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

const AR1_LOOKBACK = 15; // phi^(2(L+1)) <= 2.5e-15 at the worst daily phi (0.35)

/**
 * RANGE-INDEPENDENT AR(1) latent daily series, anchored to the ABSOLUTE epoch day
 * so the same calendar day yields the same value regardless of the requested range
 * (the P5 property). Instead of forward-simulating from the range start, each day's
 * value is a truncated sum over the last AR1_LOOKBACK days:
 *     x_d = mu + sigma*sqrt(1-phi^2) * sum_{k=0..L} phi^k * innov(seed, d-k)
 * where innov(seed, absDay) is a deterministic N(0,1) keyed by the absolute day.
 * The sqrt(1-phi^2) NORMALIZES the sum's variance so the marginal sigma is exactly
 * the calibrated value (without it, variance inflates by 1/(1-phi^2) ~ 14% at
 * phi=0.35, breaking the within-person SD the diff matches).
 * `marginalSigma` is in the working space (#17): log-space sigma for logSpace.
 */
/** Memoized deterministic N(0,1) innovation stream keyed by absolute day. Extracted
 *  so two metrics' innovations can be CORRELATED (see generate()) — the innovation is
 *  the natural place, since correlating it leaves each marginal untouched. */
function makeInnov(base: Rng, metric: string): (absDay: number) => number {
  const cache = new Map<number, number>();
  return (absDay: number): number => {
    let v = cache.get(absDay);
    if (v === undefined) {
      v = base.fork(`innov:${metric}:${absDay}`).normalStd();
      cache.set(absDay, v);
    }
    return v;
  };
}

function latentSeries(days: number[], level: number, marginalSigma: number, phi: number, logSpace: boolean, innov: (absDay: number) => number, episode: (dayMs: number) => number): number[] {
  const mu = logSpace ? Math.log(level) : level;
  const norm = marginalSigma * Math.sqrt(Math.max(0, 1 - phi * phi));
  return days.map((dayMs) => {
    const d = Math.floor(dayMs / DAY_MS);
    let sum = 0;
    let pk = 1;
    for (let k = 0; k <= AR1_LOOKBACK; k++) {
      sum += pk * innov(d - k);
      pk *= phi;
    }
    const x = mu + norm * sum;
    return (logSpace ? Math.exp(x) : x) * episode(dayMs);
  });
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

/** Fail loudly on effect metric keys that don't match the registry: a mismatch
 *  (e.g. passing a full HK identifier instead of the short key) would otherwise
 *  silently no-op, which is exactly the bug that's hard to notice. */
function validateEffectKeys(profile: PhysiologyProfile): void {
  const keys = new Set<string>();
  for (const s of profile.baselineShifts ?? []) keys.add(s.metric);
  for (const c of profile.confounds ?? []) keys.add(c.metric);
  for (const e of profile.episodes ?? []) for (const ef of e.effects) keys.add(ef.metric);
  const unknown = [...keys].filter((k) => !(k in REGISTRY));
  if (unknown.length) throw new Error(`Unknown effect metric key(s): ${unknown.join(", ")}. Use short registry keys (e.g. "HeartRateVariabilitySDNN"), not HK identifiers.`);
}

export function generate(profile: PhysiologyProfile, range: DateRange): GeneratedStore {
  validateEffectKeys(profile);
  const base = new Rng(profile.seed);
  const fromMs = utcMidnight(Date.parse(range.from));
  const toMs = utcMidnight(Date.parse(range.to));
  // Emit one day BEFORE the range too: a day's night crosses midnight (23:00 ->
  // 07:00), so the morning samples in [from, from+7h) are produced by the previous
  // day's emission. We generate [from-1day, to) and filter to [from, to) at the end,
  // so which morning samples appear never depends on the requested range (P5).
  const days: number[] = [];
  for (let d = fromMs - DAY_MS; d < toMs; d += DAY_MS) days.push(d);
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

  // ---- latent daily series: ABSOLUTE-EPOCH, range-independent (property P5) ----
  // HRV and RHR co-move (shared parasympathetic drive; HRV is derived from RR
  // intervals). Correlate their latent AR(1) INNOVATIONS with the calibrated negative
  // rho: RHR's innovation = rho*z_hrv + sqrt(1-rho^2)*z_rhr, which stays N(0,1) so
  // both marginals are untouched, but a low-HRV day now tends to be a high-RHR day.
  const rho = innovationCorr("HeartRateVariabilitySDNN", "RestingHeartRate");
  const innovHrv = makeInnov(base, "hrv");
  const innovRhrOwn = makeInnov(base, "rhr");
  const co = Math.sqrt(Math.max(0, 1 - rho * rho));
  const innovRhr = (absDay: number) => rho * innovHrv(absDay) + co * innovRhrOwn(absDay);
  const hrvLatent = latentSeries(days, userHrvMedian, cvToLogSigma(hrvP.within_person.cv), hrvP.within_person.lag1_autocorr, true, innovHrv, (dm) => episodeFactor(profile, "HeartRateVariabilitySDNN", dm));
  const rhrLatent = latentSeries(days, userRhrLevel, rhrP.within_person.daily_mean_sd, rhrP.within_person.lag1_autocorr, false, innovRhr, (dm) => episodeFactor(profile, "RestingHeartRate", dm));

  // ---- wear: night vs day, per ABSOLUTE day so it's range-independent ----
  // TODO(streakiness): independent per-day/night draws can't reproduce the ~2-month
  // outage; a 2-state run-length model is deferred (see wear_model.streakiness).
  const wm = WEAR_MODEL;
  const dayWorn = days.map((dm) => base.fork(`wear:day:${Math.floor(dm / DAY_MS)}`).next() < wm.day.wear_prob);
  const nightWorn = days.map((dm) => base.fork(`wear:night:${Math.floor(dm / DAY_MS)}`).next() < wm.night.wear_prob);

  // ---- emission: every per-day rng (uuids, values, lags) is keyed to the ABSOLUTE
  // day, so a given calendar day's samples are byte-identical across any range. ----
  const emitted: GenSample[] = []; // filtered to [from, to) after the loop
  const rhrConf = confoundFactor(profile, "RestingHeartRate");
  const hrvConf = confoundFactor(profile, "HeartRateVariabilitySDNN");
  const hrvRec = recording("HeartRateVariabilitySDNN");
  const hrRec = recording("HeartRate");
  const lagRhr = deviceBehavior("RestingHeartRate").arrival_lag_seconds;
  const lagHrv = deviceBehavior("HeartRateVariabilitySDNN").arrival_lag_seconds;
  const lagHr = deviceBehavior("HeartRate").arrival_lag_seconds;

  for (let d = 0; d < nDays; d++) {
    const day = days[d];
    const dOn = dayWorn[d];
    const nOn = nightWorn[d];
    if (!dOn && !nOn) continue; // fully unworn -> empty (no zero-valued samples)

    const ad = Math.floor(day / DAY_MS);
    const idRng = base.fork(`uuid:${ad}`); // consumed in a fixed per-day emission order
    const eHr = base.fork(`emit:hr:${ad}`);
    const eHrv = base.fork(`emit:hrv:${ad}`);
    const eRhr = base.fork(`emit:rhr:${ad}`);
    const emit = (key: string, value: number, startMs: number, endMs: number, r: Rng, lagBucket: { p50: number; p90: number; p95: number }) => {
      const def = REGISTRY[key];
      emitted.push({
        uuid: deterministicUuid(idRng),
        metricKey: key, identifier: def.identifier, unit: def.unit,
        value: Math.round(value * 10) / 10,
        startMs, endMs,
        creationMs: startMs + Math.round(lagSeconds(r, lagBucket) * 1000),
        sourceName: SOURCE, retractedAtMs: null,
      });
    };
    const emitHr = (v: number, s: number, e: number) => emit("HeartRate", v, s, e, eHr, lagHr);
    const emitHrvAt = (t: number, latent: number) => emit("HeartRateVariabilitySDNN", latent * Math.exp(eHrv.normal(0, 0.08)) * hrvConf, t, t + 60_000, eHrv, lagHrv);

    // HR records whenever WORN. Day = two-regime; night = background (asleep). The
    // intraday OU is anchored per absolute day; the cross-midnight discontinuity is
    // exp(-5)=0.007 at the 300s background cadence with tau=60s -- below the noise
    // floor, so restarting the OU each day/night is fine, not an oversight.
    if (dOn) emitHeartRateDay(eHr, day, rhrLatent[d], activityLevel, hrRec, emitHr);
    if (nOn) emitHeartRateNight(eHr, day, rhrLatent[d], hrRec, emitHr);
    if (dOn) emitHrvPoisson(eHrv, day, wm.day.hours[0], wm.day.hours[1], hrvRec.day_gate_per_hour!, (t) => emitHrvAt(t, hrvLatent[d]));
    if (nOn) emitHrvPoisson(eHrv, day, wm.night.hours[0], wm.night.hours[1] + 24, hrvRec.night_gate_per_hour!, (t) => emitHrvAt(t, hrvLatent[d]));
    if (dOn || nOn) emit("RestingHeartRate", rhrLatent[d] * rhrConf + eRhr.normal(0, 0.5), day, day + Math.round(13.5 * 3600_000), eRhr, lagRhr);
  }

  // Keep only samples whose startDate is in the requested window; the extra
  // pre-range day contributed morning samples, and the last day's night may have
  // spilled past `to` -- both are trimmed here so the result is exactly [from, to).
  const samples = emitted.filter((s) => s.startMs >= fromMs && s.startMs < toMs);

  // ---- backfill: keyed to ABSOLUTE dates (range-independent). A rare device-restore
  // re-stamps a window of already-recorded samples' arrival to one instant. Evaluated
  // per absolute day from the seed. We scan a max_lag_days buffer on BOTH sides of the
  // range: a restore just AFTER the range still re-stamps late in-range samples (a
  // restore delivers PAST data), and events with no overlapping window are no-ops. ----
  const bf = CHANGE_LOG.backfill_event;
  const perDay = bf.events_per_year / 365;
  const minAd = Math.floor(fromMs / DAY_MS);
  const maxAd = Math.floor((toMs - DAY_MS) / DAY_MS);
  for (let ad = minAd - bf.max_lag_days; ad <= maxAd + bf.max_lag_days; ad++) {
    if (base.fork(`backfill:${ad}`).next() < perDay) {
      const restoreMs = ad * DAY_MS + 12 * 3600_000;
      const winStart = restoreMs - bf.max_lag_days * DAY_MS;
      for (const s of samples) if (s.startMs >= winStart && s.startMs < restoreMs) s.creationMs = restoreMs;
    }
  }

  // ---- retractions: per-sample, keyed by UUID (range-independent) (#4) ----
  for (const s of samples) {
    const rr = base.fork(`retract:${s.uuid}`);
    if (rr.next() < CHANGE_LOG.retraction_rate) {
      s.retractedAtMs = s.creationMs + Math.round(rr.lognormalMedianCv(DAY_MS, 0.5));
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

/** Knuth Poisson sampler (small means). */
function poissonInt(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L);
  return k - 1;
}

/** HRV via a Poisson process (exponential gaps) over [hStart, hEnd) hours of a day. */
function emitHrvPoisson(rng: Rng, dayMs: number, hStart: number, hEnd: number, ratePerHour: number, onTime: (t: number) => void): void {
  const end = dayMs + hEnd * 3600_000;
  let t = dayMs + hStart * 3600_000;
  for (;;) {
    t += (-Math.log(1 - rng.next()) / ratePerHour) * 3600_000; // exponential gap
    if (t >= end) break;
    onTime(t);
  }
}

interface HrValueModel { hr_latent_tau_seconds: number; hr_within_workout_latent_sd: number; hr_still_latent_sd: number; hr_sensor_noise_sd_bpm: number }
interface HrRec { dense_gap_s?: number; background_attempt_s?: number; background_still_prob?: number; value_model?: HrValueModel }
interface DenseWindow { s: number; e: number; frac: number }

const DEFAULT_HR_VM: HrValueModel = { hr_latent_tau_seconds: 60, hr_within_workout_latent_sd: 12, hr_still_latent_sd: 6, hr_sensor_noise_sd_bpm: 5.4 };
/** Slow circadian component (bpm), peaks ~16:00 -> background isn't white (point 6). */
const circadian = (ms: number) => 4 * Math.sin((2 * Math.PI * (new Date(ms).getUTCHours() - 4)) / 24);

/**
 * Emit HR over [start, end] as ONE Ornstein-Uhlenbeck latent process sampled at
 * regime cadence, plus INDEPENDENT sensor noise (two-stage). The exact discrete OU
 * transition X <- mu + (X-mu)*e^{-dt/tau} + N(0, sigmaL^2(1-e^{-2dt/tau})) is
 * applied at each sample time, so dense (5s) samples come out smooth (rho~0.92
 * latent, ~0.81 observed) while background (300s) samples are ~independent -- both
 * from ONE tau. mu tracks the regime (still vs workout) plus slow circadian drift.
 * Excursion peak = resting + activityLevel*frac -> fitness_index UNTOUCHED.
 */
function emitHrOU(rng: Rng, start: number, end: number, restingFloor: number, activityLevel: number, stillOffset: number, windows: DenseWindow[], rec: HrRec, push: (v: number, s: number, e: number) => void): void {
  const vm = rec.value_model ?? DEFAULT_HR_VM;
  const dense = (rec.dense_gap_s ?? 5) * 1000;
  const attempt = (rec.background_attempt_s ?? 300) * 1000;
  const stillP = rec.background_still_prob ?? 0.65;
  const winAt = (t: number) => windows.find((w) => t >= w.s && t < w.e);

  // Sample times: dense 5s inside workout windows; 300s still-gated attempts elsewhere.
  const times: number[] = [];
  for (const w of windows) for (let t = w.s; t < w.e; t += dense + rng.int(-1000, 1000)) times.push(t);
  for (let t = start; t < end; t += attempt + rng.int(-30_000, 30_000)) if (!winAt(t) && rng.next() < stillP) times.push(t);
  times.sort((a, b) => a - b);

  let x: number | null = null;
  let prev = 0;
  for (const t of times) {
    const w = winAt(t);
    const mu = restingFloor + circadian(t) + (w ? activityLevel * w.frac : stillOffset);
    const sigmaL = w ? vm.hr_within_workout_latent_sd : vm.hr_still_latent_sd;
    if (x === null) {
      x = mu + rng.normal(0, sigmaL);
    } else {
      const a = Math.exp(-((t - prev) / 1000) / vm.hr_latent_tau_seconds);
      x = mu + (x - mu) * a + rng.normal(0, sigmaL * Math.sqrt(Math.max(0, 1 - a * a)));
    }
    prev = t;
    push(Math.max(restingFloor - 6, x + rng.normal(0, vm.hr_sensor_noise_sd_bpm)), t, t); // + independent sensor noise
  }
}

/** Daytime HR: still (awake, +10) with brief workout windows (freq from activity). */
function emitHeartRateDay(rng: Rng, day: number, restingFloor: number, activityLevel: number, rec: HrRec, push: (v: number, s: number, e: number) => void): void {
  const wake = day + 7 * 3600_000;
  const sleep = day + 23 * 3600_000;
  const nWin = poissonInt(rng, Math.max(0, activityLevel / 55));
  const windows: DenseWindow[] = [];
  for (let i = 0; i < nWin; i++) {
    const s = wake + rng.uniform(0, sleep - wake - 18 * 60_000);
    windows.push({ s, e: s + rng.uniform(6, 18) * 60_000, frac: rng.uniform(0.6, 0.95) });
  }
  windows.sort((a, b) => a.s - b.s);
  emitHrOU(rng, wake, sleep, restingFloor, activityLevel, 10, windows, rec, push);
}

/** Overnight HR: asleep (still ~resting+1), no workouts. Supplies the low p5 tail. */
function emitHeartRateNight(rng: Rng, day: number, restingFloor: number, rec: HrRec, push: (v: number, s: number, e: number) => void): void {
  emitHrOU(rng, day + 23 * 3600_000, day + (24 + 7) * 3600_000, restingFloor, 0, 1, [], rec, push);
}
