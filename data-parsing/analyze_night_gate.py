#!/usr/bin/env python3
"""Diagnostic (read-only): the HRV recording-gate during ACTUAL sleep, not clock
hours. The earlier 23:00-07:00 window gave night HRV presence (12%) BELOW daytime
(17%) -- backwards, because overnight wear was ~0 until recently, so those clock
hours were mostly late-evening / early-morning AWAKE hours.

Redo with real asleep intervals:
  Primary  : SleepAnalysis "Asleep*" segments define asleep hour-cells (only
             ~Jun 2026 onward -- thin, but ground truth).
  Fallback : RespiratoryRate is sleep-gated -> on resp-present dates, treat
             00:00-06:59 as the sleep window.
Report the HRV-present fraction among those asleep hour-cells for each, with the
number of nights each yields, and compare to the daytime gate (~17%).

Usage: python analyze_night_gate.py <export.xml>
"""
import sys
from datetime import datetime, timedelta, date

PATH = sys.argv[1] if len(sys.argv) > 1 else "export.xml"
FROM, TO = date(2025, 7, 26), date(2026, 7, 26)
SLEEP = "HKCategoryTypeIdentifierSleepAnalysis"
HRV = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
RESP = "HKQuantityTypeIdentifierRespiratoryRate"

import xml.etree.ElementTree as ET

def pdt(s):
    return datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")

asleep = []            # (start_dt, end_dt)
resp_dates = set()
hrv_cells = set()      # (YYYY-MM-DD, hour)

context = ET.iterparse(PATH, events=("end",))
for _, elem in context:
    if elem.tag == "Record":
        t = elem.get("type")
        if t in (SLEEP, HRV, RESP):
            sd = elem.get("startDate")
            if sd:
                d = date(int(sd[0:4]), int(sd[5:7]), int(sd[8:10]))
                if FROM <= d <= TO:
                    if t == HRV:
                        hrv_cells.add((sd[:10], int(sd[11:13])))
                    elif t == RESP:
                        resp_dates.add(sd[:10])
                    elif t == SLEEP and "Asleep" in (elem.get("value") or ""):
                        asleep.append((pdt(sd), pdt(elem.get("endDate", sd))))
    elem.clear()

def hours_of(intervals):
    cells = set()
    for st, en in intervals:
        cur = st.replace(minute=0, second=0, microsecond=0)
        while cur < en:
            cells.add((cur.strftime("%Y-%m-%d"), cur.hour))
            cur += timedelta(hours=1)
    return cells

def gate(cells):
    if not cells:
        return 0, 0, 0.0
    n = len(cells)
    h = len([c for c in cells if c in hrv_cells])
    return n, h, 100 * h / n

# Primary: real asleep hours
ap = hours_of(asleep)
nights_p = len(set(c[0] for c in ap))
np_, hp, gp = gate(ap)

# Fallback: 00:00-06:59 on resp-present dates
fb = set((d, h) for d in resp_dates for h in range(0, 7))
nf, hf, gf = gate(fb)

print(f"\nHRV recording-gate during actual sleep (window {FROM}..{TO})\n")
print(f"  DAYTIME (reference, 08-22):             gate ~17%")
print(f"  PRIMARY  (SleepAnalysis asleep hours):  {hp}/{np_} asleep hour-cells have HRV = {gp:.0f}%   ({nights_p} nights w/ sleep data)")
print(f"  FALLBACK (00-06 on resp-present dates): {hf}/{nf} hour-cells have HRV = {gf:.0f}%   ({len(resp_dates)} resp-present dates)")
print(f"\n  asleep segments found: {len(asleep)}")
