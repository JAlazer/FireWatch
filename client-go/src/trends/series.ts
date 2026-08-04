// Pure series shaping for the Trends charts — no RN, no I/O, so it's testable.
// Turns a per-day value map into fixed-resolution buckets with GAPS PRESERVED
// (missing days/weeks/months -> null, never interpolated), and picks the resolution
// from the range + how much history actually exists (so a young account isn't
// over-aggregated into a single meaningless point).

export type Res = "day" | "week" | "month";
export type RangeKey = "7D" | "1M" | "1Y" | "ALL";

const DAY = 86_400_000;

export interface Point {
  i: number; // index (shared x position across both charts)
  t: number; // bucket centre of the covered data, epoch ms (for date labels)
  value: number | null; // null = gap (no data in this bucket)
  partial: boolean; // week/month bucket whose full period isn't fully within the window
  // (the in-progress current week/month, or a range-edge bucket) — fewer days, noisier.
}

/** One value per day: mean of that day's samples. */
export function dailyMeans(samples: { quantity: number; startDate: Date }[]): Map<number, number> {
  const acc = new Map<number, { s: number; n: number }>();
  for (const x of samples) {
    const d = Math.floor(x.startDate.getTime() / DAY);
    const a = acc.get(d) ?? { s: 0, n: 0 };
    a.s += x.quantity; a.n += 1; acc.set(d, a);
  }
  const out = new Map<number, number>();
  for (const [d, a] of acc) out.set(d, a.s / a.n);
  return out;
}

/** Window length in days for a range (null = "ALL" -> use the account span). */
export function windowDays(key: RangeKey): number | null {
  return key === "7D" ? 7 : key === "1M" ? 30 : key === "1Y" ? 365 : null;
}

// Resolution per range. Deliberate — do NOT "simplify" 1Y to monthly or ALL to yearly:
//   7D / 1M -> daily.
//   1Y -> WEEKLY, not monthly. 57% of flares last under a week (BRASS registry), so
//     weekly is about the coarsest resolution at which a typical flare still registers;
//     monthly would dilute a one-week flare to a ~25%-weighted blip.
//   ALL -> MONTHLY, not yearly. Yearly destroys the two things the chart exists to show:
//     seasonality is real (resting HR peaks in winter, troughs in July — Scripps cohort,
//     n=92,457), and a one-week flare becomes ~2% of a yearly bucket (invisible). It's
//     also arithmetically broken — a two-year user gets TWO yearly points; monthly gives
//     24, which is readable and keeps seasonal shape.
// Adaptive only for short histories: drop to daily under ~21 days (an interim weekly
// tier keeps ALL from collapsing to 1-2 points on young-but-not-tiny accounts).
export function resolveRes(key: RangeKey, spanDays: number): Res {
  if (key === "7D" || key === "1M") return "day";
  if (key === "1Y") return spanDays < 21 ? "day" : "week";
  return spanDays < 21 ? "day" : spanDays < 75 ? "week" : "month"; // ALL
}

const monthStartDay = (d: number) => { const t = new Date(d * DAY); return Math.floor(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) / DAY); };
const monthEndDay = (d: number) => { const t = new Date(d * DAY); return Math.floor(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0) / DAY); };

/** Bucket a daily map over [fromDay, toDay] (inclusive day indices) at `res`. Weeks are
 *  epoch-aligned 7-day blocks; months are calendar months. A week/month bucket whose
 *  full period isn't entirely inside [fromDay, toDay] (the in-progress current period,
 *  or a range-edge bucket) is flagged `partial` — shown but marked. Empty -> value null. */
export function bucketize(daily: Map<number, number>, fromDay: number, toDay: number, res: Res): Point[] {
  const out: Point[] = [];
  const add = (start: number, end: number) => {
    const lo = Math.max(start, fromDay), hi = Math.min(end, toDay);
    const vals: number[] = [];
    for (let d = lo; d <= hi; d++) { const v = daily.get(d); if (v != null) vals.push(v); }
    const value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const partial = res !== "day" && (start < fromDay || end > toDay);
    out.push({ i: out.length, t: ((lo + hi) / 2) * DAY, value, partial });
  };
  if (res === "day") {
    for (let d = fromDay; d <= toDay; d++) add(d, d);
  } else if (res === "week") {
    for (let k = Math.floor(fromDay / 7); k <= Math.floor(toDay / 7); k++) add(k * 7, k * 7 + 6);
  } else {
    for (let m = monthStartDay(fromDay); m <= toDay; m = monthEndDay(m) + 1) add(m, monthEndDay(m));
  }
  return out;
}

/** Current baseline = median of present daily values over the last `days` (default 28).
 *  null if fewer than a handful of present days. Shown as the reference line on short ranges. */
export function baselineMedian(daily: Map<number, number>, toDay: number, days = 28): number | null {
  const vals: number[] = [];
  for (let d = toDay - days + 1; d <= toDay; d++) if (daily.has(d)) vals.push(daily.get(d)!);
  if (vals.length < 5) return null;
  const a = vals.sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export const presentCount = (pts: Point[]) => pts.filter((p) => p.value != null).length;
