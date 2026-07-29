#!/usr/bin/env python3
"""Diagnostic (read-only): is the calibration source's wear behavior stationary
over the recent 12-month window, or trending -- especially OVERNIGHT wear?

Pooling the whole window (as the summarizer does) hides any trend. This buckets
the window into 28-day blocks and reports, per block:
  1. RespiratoryRate day-coverage   -- cleanest overnight-wear proxy (sleep-gated)
  2. SleepAnalysis day-coverage
  3. HRV records timestamped 02:00-07:00 -- day-coverage + raw count
  4. any-enabled-metric day-coverage -- CONTROL (overall wear, not overnight)

If (1)-(3) rise while (4) is flat -> an overnight-specific behavior change.
If all rise together -> general engagement. Step vs gradual is noted at the end.

Usage: python analyze_wear_trend.py <export.xml>
"""
import sys
from collections import defaultdict
from datetime import date

PATH = sys.argv[1] if len(sys.argv) > 1 else "export.xml"
FROM = date(2025, 7, 26)
TO = date(2026, 7, 26)          # inclusive
BLOCK = 28                      # days per bucket
TOTAL = (TO - FROM).days + 1

RESP = "HKQuantityTypeIdentifierRespiratoryRate"
SLEEP = "HKCategoryTypeIdentifierSleepAnalysis"
HRV = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
HR = "HKQuantityTypeIdentifierHeartRate"
RHR = "HKQuantityTypeIdentifierRestingHeartRate"
ENABLED = {HR, HRV, RHR}
WATCHED = ENABLED | {RESP, SLEEP}

import xml.etree.ElementTree as ET

resp_days = defaultdict(set)
sleep_days = defaultdict(set)
hrv_night_days = defaultdict(set)
hrv_night_count = defaultdict(int)
any_days = defaultdict(set)

context = ET.iterparse(PATH, events=("end",))
for _, elem in context:
    if elem.tag == "Record":
        t = elem.get("type")
        if t in WATCHED:
            sd = elem.get("startDate")
            if sd:
                d = date(int(sd[0:4]), int(sd[5:7]), int(sd[8:10]))
                if FROM <= d <= TO:
                    b = (d - FROM).days // BLOCK
                    day = sd[:10]
                    if t in ENABLED:
                        any_days[b].add(day)
                    if t == RESP:
                        resp_days[b].add(day)
                    elif t == SLEEP:
                        sleep_days[b].add(day)
                    if t == HRV and 2 <= int(sd[11:13]) < 7:
                        hrv_night_days[b].add(day)
                        hrv_night_count[b] += 1
    elem.clear()

n_blocks = (TOTAL + BLOCK - 1) // BLOCK
def denom(b):
    return min(BLOCK, TOTAL - b * BLOCK)

def pct(num, den):
    return f"{100*num/den:4.0f}%" if den else "   -"

print(f"\nWindow {FROM}..{TO} ({TOTAL} days), {BLOCK}-day blocks\n")
print(f"{'block start':<12}{'days':>5}{'resp%':>7}{'sleep%':>8}{'hrvNite%':>10}{'hrvNiteN':>9}{'anyData%':>10}")
for b in range(n_blocks):
    d0 = (FROM.toordinal() + b * BLOCK)
    lbl = date.fromordinal(d0).isoformat()
    dn = denom(b)
    print(f"{lbl:<12}{dn:>5}{pct(len(resp_days[b]),dn):>7}{pct(len(sleep_days[b]),dn):>8}"
          f"{pct(len(hrv_night_days[b]),dn):>10}{hrv_night_count[b]:>9}{pct(len(any_days[b]),dn):>10}")

# totals
tot = lambda dd: sum(len(v) for v in dd.values())
print(f"\n{'POOLED':<12}{TOTAL:>5}{pct(tot(resp_days),TOTAL):>7}{pct(tot(sleep_days),TOTAL):>8}"
      f"{pct(tot(hrv_night_days),TOTAL):>10}{sum(hrv_night_count.values()):>9}{pct(tot(any_days),TOTAL):>10}")
