// Inflammation scoring — a PURE module: samples in, {score, level} out. No server,
// no API, no DB. Implements PROJECT_VISION's model:
//   - personalized baseline (this user's own history), never population
//   - a 3-day rolling average to smooth day-to-day noise
//   - a robust MEDIAN/MAD baseline over a window that GROWS 28 -> 56 days
//   - the TWO-SIGNAL CONCORDANCE rule, with asymmetric enter/stay/exit hysteresis
//
// Directions: HRV DOWN and resting HR UP are concerning; both z-scored so positive
// directed-z always means "more inflammation". HRV is far noisier (~29% MAPE) than
// resting HR (~6% MAPE), which is why the hysteresis lets the better-measured
// signal carry state through HRV's noisy days.
//
// Cold-start / gaps: fewer than BASELINE_MIN_DAYS of data in the window -> status
// "calibrating", NO score (deliberate: no score until the baseline is trustworthy).

import type { QuantitySample } from "./types";

const DAY_MS = 86_400_000;

export const SCORING = {
  ROLL_DAYS: 3, // rolling-average window
  BASELINE_MAX_DAYS: 56, // baseline window grows toward this as data accumulates
  BASELINE_MIN_DAYS: 28, // this many present days -> full-confidence "scored"
  // SANITY FLOOR only: min rolling points for a usable median/MAD. The PRODUCT
  // boundary "first score on day 15" is enforced by the Today tab via DAYS OF
  // HISTORY, not here — because the baseline lags calendar days by ROLL_DAYS (15
  // calendar days ≈ 11 rolling points), so a calendar-day gate can't live in this
  // sample-only module. Kept low enough that day 15 reliably has a score even with
  // wear gaps; the day-15 gate upstream is what prevents thin-baseline scores from
  // ever being shown.
  BASELINE_PROVISIONAL_DAYS: 8,
  Z_THRESHOLD: 1.0, // per-signal directed-z to count as "concerning"
  EXIT_DAYS: 2, // consecutive days failing STAY before dropping out of elevated
} as const;

export interface ScoreResult {
  day: string;
  // score.ts's own confidence signal, by ROLLING-point count in the baseline:
  // below the sanity floor -> "calibrating" (no score); < BASELINE_MIN_DAYS ->
  // "provisional"; else "scored". NOTE: the Today tab drives its learning/
  // provisional/full states by DAYS OF HISTORY (see dashboard.tsx); this is secondary.
  status: "calibrating" | "provisional" | "scored";
  level: number | null; // 1 (calm) .. 5; null while calibrating
  score: number | null; // continuous severity when elevated, else 0
  // Continuous 0-5 display value, derived from the SAME quantity the concordance
  // rule uses, so number and word can't disagree (see heatOf / heatWord). null while
  // calibrating. Not elevated stays < 3 (Calm/Steady); elevated is >= 3 (Warming+).
  heat: number | null;
  hrvZ: number | null; // directed z (positive = HRV dropped)
  rhrZ: number | null; // directed z (positive = resting HR rose)
  elevated: boolean;
  reason: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * The 0-5 display value — ONE authority, mirroring the concordance rule:
 *   not elevated -> min(z): both signals must move to enter, so the WEAKER one gates
 *   elevated     -> max(z): the asymmetric stay rule lets the stronger one carry
 * heat = 2 + concordZ, so concordZ = threshold (1.0) sits at the 3.0 word boundary.
 * Not elevated is held < 3 (concordance unconfirmed — matters when one signal is
 * missing), elevated is >= 3 by construction. No clamp dead zone: the two ranges
 * meet at 3.0.
 */
export function heatOf(hrvZ: number | null, rhrZ: number | null, elevated: boolean): number | null {
  const present = [hrvZ, rhrZ].filter((z): z is number => z != null);
  if (!present.length) return null;
  const concordZ = elevated ? Math.max(...present) : Math.min(...present);
  const heat = clamp(2 + concordZ, 0, 5);
  return elevated ? Math.max(heat, 3) : Math.min(heat, 2.99);
}

/** The single word for a heat value — derived from heat, so it tracks the number. */
export function heatWord(heat: number): string {
  return heat < 2 ? "Calm" : heat < 3 ? "Steady" : heat < 3.75 ? "Warming" : heat < 4.5 ? "Elevated" : "Running hot";
}

const dayIndex = (iso: string) => Math.floor(Date.parse(iso) / DAY_MS);
const isoOfDay = (d: number) => new Date(d * DAY_MS).toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 100) / 100;

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** One value per day: mean of that day's samples. */
function dailyMeans(samples: QuantitySample[]): Map<number, number> {
  const acc = new Map<number, { sum: number; n: number }>();
  for (const s of samples) {
    const d = Math.floor(s.startDate.getTime() / DAY_MS);
    const a = acc.get(d) ?? { sum: 0, n: 0 };
    a.sum += s.quantity;
    a.n += 1;
    acc.set(d, a);
  }
  const out = new Map<number, number>();
  for (const [d, a] of acc) out.set(d, a.sum / a.n);
  return out;
}

/** Mean of up-to-ROLL_DAYS daily values ending at `end` (null if none). */
function rolling(daily: Map<number, number>, end: number): number | null {
  const vals: number[] = [];
  for (let d = end - SCORING.ROLL_DAYS + 1; d <= end; d++) {
    const v = daily.get(d);
    if (v != null) vals.push(v);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/**
 * Robust baseline = median + MAD (scaled to an SD-equivalent) of the 3-day rolling
 * stat across the window ENDING just before the current rolling window (so a
 * current flare can't inflate its own baseline). Window grows to BASELINE_MAX_DAYS;
 * null if fewer than BASELINE_MIN_DAYS days have a rolling value. Flagged days are
 * NOT excluded (that would make the baseline depend on the score).
 */
function robustBaseline(daily: Map<number, number>, end: number): { center: number; scale: number; n: number } | null {
  const hi = end - SCORING.ROLL_DAYS;
  const rolls: number[] = [];
  for (let d = hi - SCORING.BASELINE_MAX_DAYS + 1; d <= hi; d++) {
    const r = rolling(daily, d);
    if (r != null) rolls.push(r);
  }
  if (rolls.length < SCORING.BASELINE_PROVISIONAL_DAYS) return null; // below sanity floor -> no baseline
  const center = median(rolls);
  const mad = median(rolls.map((r) => Math.abs(r - center)));
  return { center, scale: 1.4826 * mad || 1e-9, n: rolls.length };
}

/** Directed z for both signals on a given day. `baselineDays` = min days behind the
 *  two baselines (drives calibrating -> provisional -> scored). */
function directedZ(hrvDaily: Map<number, number>, rhrDaily: Map<number, number>, end: number) {
  const hb = robustBaseline(hrvDaily, end);
  const rb = robustBaseline(rhrDaily, end);
  if (!hb || !rb) return { ready: false as const };
  const hrvNow = rolling(hrvDaily, end);
  const rhrNow = rolling(rhrDaily, end);
  return {
    ready: true as const,
    baselineDays: Math.min(hb.n, rb.n),
    hrvZ: hrvNow == null ? null : (hb.center - hrvNow) / hb.scale, // HRV down -> positive
    rhrZ: rhrNow == null ? null : (rhrNow - rb.center) / rb.scale, // RHR up -> positive
  };
}

function levelFor(elevated: boolean, severity: number): number {
  if (!elevated) return 1;
  if (severity < 1.5) return 2;
  if (severity < 2.25) return 3;
  if (severity < 3) return 4;
  return 5;
}

const T = SCORING.Z_THRESHOLD;
const concern = (z: number | null) => z != null && z >= T;
const contradicts = (z: number | null) => z != null && z < 0;

/**
 * Score a SEQUENCE of days with asymmetric concordance hysteresis:
 *   ENTER elevated: both signals >= threshold (true two-signal concordance)
 *   STAY  elevated: one signal >= threshold AND the other not contradicting (>= 0)
 *   EXIT: STAY fails for EXIT_DAYS consecutive days
 * The stay rule lets the better-measured RHR carry the elevated state through HRV's
 * noisy days without a fixed timer.
 */
export function scoreSeries(hrvSamples: QuantitySample[], rhrSamples: QuantitySample[], fromDay: string, toDay: string): ScoreResult[] {
  const hrvDaily = dailyMeans(hrvSamples);
  const rhrDaily = dailyMeans(rhrSamples);
  const out: ScoreResult[] = [];
  let elevated = false;
  let stale = 0;

  for (let d = dayIndex(fromDay); d <= dayIndex(toDay); d++) {
    const z = directedZ(hrvDaily, rhrDaily, d);
    if (!z.ready) {
      elevated = false;
      stale = 0;
      out.push({ day: isoOfDay(d), status: "calibrating", level: null, score: null, heat: null, hrvZ: null, rhrZ: null, elevated: false, reason: `learning your baseline (need >=${SCORING.BASELINE_PROVISIONAL_DAYS}d for both signals)` });
      continue;
    }
    const { hrvZ, rhrZ, baselineDays } = z;
    const provisional = baselineDays < SCORING.BASELINE_MIN_DAYS; // 14-27 days: low confidence
    const enter = concern(hrvZ) && concern(rhrZ);
    const stay = (concern(hrvZ) && !contradicts(rhrZ)) || (concern(rhrZ) && !contradicts(hrvZ));

    let reason: string;
    if (!elevated) {
      if (enter) { elevated = true; stale = 0; reason = "ENTER: both signals concerning"; }
      else reason = "calm";
    } else if (stay) {
      stale = 0;
      reason = enter ? "STAY: both concerning" : "STAY: one signal carries (other not contradicting)";
    } else {
      stale += 1;
      if (stale >= SCORING.EXIT_DAYS) { elevated = false; reason = `EXIT: stay failed ${stale}d`; }
      else reason = `holding (stay failed ${stale}/${SCORING.EXIT_DAYS}d)`;
    }

    const severity = elevated ? Math.max(hrvZ ?? 0, rhrZ ?? 0) : 0;
    const heat = heatOf(hrvZ, rhrZ, elevated);
    out.push({
      day: isoOfDay(d), status: provisional ? "provisional" : "scored", level: levelFor(elevated, severity), score: round(severity),
      heat: heat == null ? null : round(heat),
      hrvZ: hrvZ == null ? null : round(hrvZ), rhrZ: rhrZ == null ? null : round(rhrZ), elevated,
      reason: `${provisional ? "[provisional, low confidence] " : ""}${reason} (HRV z=${hrvZ == null ? "-" : round(hrvZ)}, RHR z=${rhrZ == null ? "-" : round(rhrZ)}, ${baselineDays}d baseline)`,
    });
  }
  return out;
}

/** Single-day score (stateless; symmetric concordance). For one-off queries. */
export function score(hrvSamples: QuantitySample[], rhrSamples: QuantitySample[], onDay: string): ScoreResult {
  const only = scoreSeries(hrvSamples, rhrSamples, onDay, onDay)[0];
  return only;
}
