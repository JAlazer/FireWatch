#!/usr/bin/env python3
"""
Summarize an Apple Health export.xml into compact statistics, for calibrating
a HealthKit-shaped mock data generator.

Why this exists: a real export.xml is often hundreds of MB to several GB, and
contains every individual reading plus identity fields. A generator doesn't
need any of that -- it needs the *shape* of the data: how often each marker is
sampled, how long the gaps are, what the values look like, when in the day they
occur, and how sleep sessions are structured.

This script streams the file (so multi-MB inputs are fine on modest RAM) and
writes a small JSON summary containing only aggregate statistics. It never
reads the <Me> element, so date of birth, sex, and blood type are ignored.
No individual readings appear in the output.

Requires only the Python standard library.

Usage:
    python summarize_health_export.py /path/to/export.xml
    python summarize_health_export.py /path/to/export.xml -o summary.json
"""

import argparse
import json
import math
import random
import xml.etree.ElementTree as ET
from collections import defaultdict, Counter
from datetime import datetime

# Cap how much we keep in memory. Values are sampled, not stored wholesale.
VALUE_SAMPLE_CAP = 50_000     # per type, for percentile estimation
DURATION_SAMPLE_CAP = 20_000  # per type
GAP_DAYS_CAP = 40             # days retained per type for cadence analysis

random.seed(0)  # deterministic sampling


def parse_dt(s):
    """Apple format: '2026-07-28 10:00:00 -0500'. We use local wall time."""
    return datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")


def pct(sorted_vals, p):
    if not sorted_vals:
        return None
    k = (len(sorted_vals) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    if lo == hi:
        return round(sorted_vals[int(k)], 4)
    return round(sorted_vals[lo] * (hi - k) + sorted_vals[hi] * (k - lo), 4)


def dist(vals):
    """Compact distribution summary."""
    if not vals:
        return None
    v = sorted(vals)
    n = len(v)
    mean = sum(v) / n
    sd = math.sqrt(sum((x - mean) ** 2 for x in v) / n) if n > 1 else 0.0
    return {
        "n": n,
        "mean": round(mean, 4),
        "sd": round(sd, 4),
        "min": round(v[0], 4),
        "p5": pct(v, 0.05), "p25": pct(v, 0.25), "p50": pct(v, 0.50),
        "p75": pct(v, 0.75), "p90": pct(v, 0.90), "p95": pct(v, 0.95),
        "max": round(v[-1], 4),
    }


def reservoir_add(store, value, cap, seen_counter, key):
    """Uniform random sample of unbounded stream, capped at `cap` items."""
    seen_counter[key] += 1
    if len(store) < cap:
        store.append(value)
    else:
        j = random.randint(0, seen_counter[key] - 1)
        if j < cap:
            store[j] = value


def lag1_autocorr(series):
    """Day-to-day persistence of the daily mean, over GENUINELY adjacent days.

    `series` has one slot per calendar day with None for missing days. Only
    pairs where day d and day d+1 are BOTH present count as adjacent -- a gap
    breaks adjacency rather than being silently closed up (the old bug, which
    treated readings weeks apart as consecutive and understated persistence).
    Returns {"coef", "n_pairs"} so the estimate's support is visible.
    """
    present = [v for v in series if v is not None]
    if len(present) < 10:
        return {"coef": None, "n_pairs": 0}
    m = sum(present) / len(present)
    pairs = [(series[i], series[i + 1]) for i in range(len(series) - 1)
             if series[i] is not None and series[i + 1] is not None]
    den = sum((x - m) ** 2 for x in present)
    if len(pairs) < 10 or not den:
        return {"coef": None, "n_pairs": len(pairs)}
    num = sum((a - m) * (b - m) for a, b in pairs)
    return {"coef": round(num / den, 4), "n_pairs": len(pairs)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xml_path")
    ap.add_argument("-o", "--out", default="health_summary.json")
    ap.add_argument("--from", dest="from_date", default=None,
                    help="YYYY-MM-DD inclusive lower bound on startDate")
    ap.add_argument("--to", dest="to_date", default=None,
                    help="YYYY-MM-DD inclusive upper bound on startDate")
    args = ap.parse_args()
    # Restrict to a recent window so device_behavior (cadence, gaps, coverage) is
    # calibrated from one watch era, not a 7-year blend of several. Comparison is
    # lexicographic on the YYYY-MM-DD prefix, which is date-correct.
    from_date, to_date = args.from_date, args.to_date

    # Per-type accumulators
    counts = Counter()
    units = defaultdict(Counter)
    sources = defaultdict(Counter)
    hour_hist = defaultdict(lambda: [0] * 24)
    value_samples = defaultdict(list)
    value_seen = Counter()
    duration_samples = defaultdict(list)
    duration_seen = Counter()
    lag_samples = defaultdict(list)   # creationDate - startDate, seconds (arrival lag)
    lag_seen = Counter()
    daily = defaultdict(lambda: defaultdict(lambda: {"n": 0, "sum": 0.0}))
    gap_days = defaultdict(lambda: defaultdict(list))  # type -> day -> [epoch]
    first_date, last_date = {}, {}

    sleep_values = Counter()
    sleep_nights = defaultdict(list)  # night key -> [(start, end, value)]

    print("Streaming XML (this can take a few minutes on a large export)...")

    context = ET.iterparse(args.xml_path, events=("start", "end"))
    _, root = next(context)
    export_date = None
    processed = 0

    for event, elem in context:
        if event != "end":
            continue

        if elem.tag == "ExportDate":
            export_date = elem.get("value")

        elif elem.tag == "Record":
            t = elem.get("type", "")
            start_s = elem.get("startDate")
            if not t or not start_s:
                root.clear()
                continue

            day = start_s[:10]
            if (from_date and day < from_date) or (to_date and day > to_date):
                root.clear()
                continue
            hour = int(start_s[11:13])
            counts[t] += 1
            hour_hist[t][hour] += 1
            if elem.get("unit"):
                units[t][elem.get("unit")] += 1
            if elem.get("sourceName"):
                sources[t][elem.get("sourceName")] += 1

            if t not in first_date or day < first_date[t]:
                first_date[t] = day
            if t not in last_date or day > last_date[t]:
                last_date[t] = day

            # Arrival lag: how long after a sample's startDate it actually landed
            # in the store. Drives the change-log behavior of the mock generator
            # (out-of-order anchored delivery), so calibrate it from real data.
            creation_s = elem.get("creationDate")
            if creation_s:
                try:
                    lag = (parse_dt(creation_s) - parse_dt(start_s)).total_seconds()
                except ValueError:
                    lag = None
                if lag is not None and lag >= 0:
                    reservoir_add(lag_samples[t], lag, DURATION_SAMPLE_CAP,
                                  lag_seen, t)

            raw_val = elem.get("value")

            if t == "HKCategoryTypeIdentifierSleepAnalysis":
                sleep_values[raw_val] += 1
                # Assign to a "night" -- anything before 6pm belongs to the
                # night that started on the previous calendar day.
                st = parse_dt(start_s)
                en = parse_dt(elem.get("endDate", start_s))
                night = day if hour >= 18 else (
                    (st.replace(hour=12) - __import__("datetime").timedelta(days=1)).strftime("%Y-%m-%d")
                )
                # Keep every night, not the first N. Sleep records are few
                # (thousands total even over years), and the old first-N cap
                # captured only the oldest InBed-only era, hiding all staged
                # nights. Sampling across the full range is both cheap and correct.
                sleep_nights[night].append(
                    (st.timestamp(), en.timestamp(), raw_val)
                )
            else:
                try:
                    v = float(raw_val)
                except (TypeError, ValueError):
                    root.clear()
                    continue
                reservoir_add(value_samples[t], v, VALUE_SAMPLE_CAP, value_seen, t)
                d = daily[t][day]
                d["n"] += 1
                d["sum"] += v

                end_s = elem.get("endDate")
                if end_s:
                    dur = (parse_dt(end_s) - parse_dt(start_s)).total_seconds()
                    if dur >= 0:
                        reservoir_add(duration_samples[t], dur,
                                      DURATION_SAMPLE_CAP, duration_seen, t)

                # Cadence: keep timestamps for a bounded set of days
                gd = gap_days[t]
                if day in gd or len(gd) < GAP_DAYS_CAP:
                    gd[day].append(parse_dt(start_s).timestamp())

            processed += 1
            if processed % 500_000 == 0:
                print(f"  ...{processed:,} records")

        root.clear()

    print(f"Done reading. {processed:,} records total.\n")

    # ---- build summary ----
    # Coverage is measured against the analysis window, not each metric's own
    # active span -- otherwise a metric present on 1 day out of a 365-day window
    # would misleadingly report 100%. Window defaults to observed data extent
    # when --from/--to aren't given.
    if first_date:
        win_lo = from_date or min(first_date.values())
        win_hi = to_date or max(last_date.values())
        win_span = (datetime.strptime(win_hi, "%Y-%m-%d")
                    - datetime.strptime(win_lo, "%Y-%m-%d")).days + 1
    else:
        win_lo = win_hi = None
        win_span = 0

    out = {
        "export_date": export_date,
        "record_total": processed,
        "window": [win_lo, win_hi],
        "window_days": win_span,
        "types": {},
    }

    for t, n in counts.most_common():
        if t == "HKCategoryTypeIdentifierSleepAnalysis":
            continue

        days = daily[t]
        day_counts = [d["n"] for d in days.values()]
        day_means = []
        if days:
            lo = datetime.strptime(first_date[t], "%Y-%m-%d")
            hi = datetime.strptime(last_date[t], "%Y-%m-%d")
            span = (hi - lo).days + 1
            for i in range(span):
                key = (lo + __import__("datetime").timedelta(days=i)).strftime("%Y-%m-%d")
                d = days.get(key)
                day_means.append(d["sum"] / d["n"] if d and d["n"] else None)
        else:
            span = 0

        # intra-day gaps between consecutive samples
        gaps = []
        for day, ts in gap_days[t].items():
            ts.sort()
            gaps.extend(ts[i + 1] - ts[i] for i in range(len(ts) - 1))

        out["types"][t] = {
            "record_count": n,
            "units": dict(units[t]),
            "sources": dict(sources[t].most_common(5)),
            "date_range": [first_date.get(t), last_date.get(t)],
            "days_in_range": span,
            "days_with_data": len(days),
            "coverage_pct": round(100 * len(days) / win_span, 1) if win_span else None,
            "records_per_day": dist(day_counts),
            "value": dist(value_samples[t]),
            # Distribution of per-day means: its sd is the within-person
            # day-to-day variability (the `calibrated` physiology cornerstone),
            # separated from intra-day scatter which `value` above still blends in.
            "daily_mean_value": dist([m for m in day_means if m is not None]),
            "daily_mean_lag1_autocorr": lag1_autocorr(day_means),
            "hour_of_day_counts": hour_hist[t],
            "sample_duration_seconds": dist(duration_samples[t]),
            "arrival_lag_seconds": dist(lag_samples[t]),
            "intra_day_gap_seconds": dist(gaps),
            "_gap_days_sampled": len(gap_days[t]),
        }

    # ---- sleep ----
    if sleep_nights:
        seg_per_night, asleep_min, stage_durs = [], [], defaultdict(list)
        staged_nights = 0
        for night, segs in sleep_nights.items():
            segs.sort()
            seg_per_night.append(len(segs))
            total = 0.0
            night_has_stage = False
            for st, en, val in segs:
                dur = en - st
                stage_durs[val].append(dur)
                if val and "Asleep" in val:
                    total += dur
                    night_has_stage = True
            # Only nights with real stage segments contribute an asleep total;
            # InBed-only nights (older devices) would otherwise dilute it to ~0.
            if night_has_stage:
                staged_nights += 1
                asleep_min.append(total / 60.0)

        out["sleep"] = {
            "stage_value_counts": dict(sleep_values),
            "nights_analyzed": len(sleep_nights),
            "nights_with_stage_data": staged_nights,
            "segments_per_night": dist(seg_per_night),
            "total_asleep_minutes_per_staged_night": dist(asleep_min),
            "segment_duration_seconds_by_stage": {
                k: dist(v) for k, v in stage_durs.items()
            },
        }

    with open(args.out, "w") as f:
        json.dump(out, f, indent=2)

    print(f"Wrote {args.out}")
    print(f"Window: {win_lo} .. {win_hi} ({win_span} days)")
    print(f"Types summarized: {len(out['types'])}")
    if "sleep" in out:
        print(f"Sleep nights: {out['sleep']['nights_analyzed']} "
              f"({out['sleep']['nights_with_stage_data']} with stage data)")


if __name__ == "__main__":
    main()