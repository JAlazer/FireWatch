#!/usr/bin/env python3
"""Diff a synthetic summary against a real/calibration summary for the enabled
metrics. Re-run after any calibration or generator change.

  python diff_synthetic.py <synthetic_summary.json> [real_summary.json]

Default real = johan_summary_12mo.json. Use an n=1 synthetic summary for the
device_behavior / within-person comparison (a pooled cohort corrupts per-day and
gap stats by interleaving multiple people).
"""
import json
import sys

syn = json.load(open(sys.argv[1]))
real = json.load(open(sys.argv[2] if len(sys.argv) > 2 else "johan_summary_12mo.json"))


def T(s, k):
    return s["types"].get("HKQuantityTypeIdentifier" + k)


def get(t, path):
    cur = t
    for p in path.split("."):
        if cur is None:
            return None
        cur = cur.get(p)
    return cur


ROWS = [
    ("records/day p50", "records_per_day.p50"),
    ("intra_gap p50", "intra_day_gap_seconds.p50"),
    ("intra_gap p95", "intra_day_gap_seconds.p95"),
    ("arrival p50", "arrival_lag_seconds.p50"),
    ("arrival p90", "arrival_lag_seconds.p90"),
    ("value p50", "value.p50"),
    ("value mean", "value.mean"),
    ("daily_mean sd", "daily_mean_value.sd"),
    ("daily_mean p50", "daily_mean_value.p50"),
    ("coverage %", "coverage_pct"),
]

print(f"synthetic {syn['window']} ({syn['window_days']}d)  vs  real {real['window']} ({real['window_days']}d)\n")
for m in ["HeartRate", "HeartRateVariabilitySDNN", "RestingHeartRate"]:
    ts, tr = T(syn, m), T(real, m)
    if not ts:
        continue
    print(f"== {m} ==   {'synth':>10}{'real':>10}")
    for lbl, path in ROWS:
        print(f"  {lbl:<16}{str(get(ts, path)):>10}{str(get(tr, path)):>10}")
    acs = (ts.get("daily_mean_lag1_autocorr") or {})
    acr = (tr.get("daily_mean_lag1_autocorr") or {})
    print(f"  {'autocorr':<16}{str(acs.get('coef')):>10}{str(acr.get('coef')):>10}")
    # mean HR over resting is the excursion-scale check (fitness_index territory)
    if m == "HeartRate":
        rhr = T(syn, "RestingHeartRate")
        if rhr:
            print(f"  {'mean-over-resting':<16}{round(get(ts,'value.mean') - get(rhr,'value.mean'), 1):>10}"
                  f"{round(get(real,'types')['HKQuantityTypeIdentifierHeartRate']['value']['mean'] - get(real,'types')['HKQuantityTypeIdentifierRestingHeartRate']['value']['mean'], 1):>10}")
    print()
