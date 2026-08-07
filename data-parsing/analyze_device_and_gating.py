#!/usr/bin/env python3
"""Diagnostic (read-only): resolve the device timeline and the wear/recording-gate
split, to settle (1) the calibration window and (2) the wear/cadence model.

Two reports from one streaming pass over the recent 12-month window:

A. DEVICE TIMELINE -- per 28-day block, the `hardware:` and `software:` ids on
   HeartRate records (watch-sourced). Resolves whether the RespiratoryRate/Sleep
   onset was a NEW DEVICE (capability) or a settings/OS change.

B. WEAR vs RECORDING GATE -- per (day, hour) cell, classify:
     not-worn      = no HR, no steps, no HRV
     worn-active   = HR or steps present, but no HRV (HRV gated off by motion)
     worn-still    = HRV present
   Split day (08-22) vs night (23-07), since night wear is a separate process.

Usage: python analyze_device_and_gating.py <export.xml>
"""
import re
import sys
from collections import Counter, defaultdict
from datetime import date

PATH = sys.argv[1] if len(sys.argv) > 1 else "export.xml"
FROM, TO = date(2025, 7, 26), date(2026, 7, 26)
BLOCK = 28
TOTAL = (TO - FROM).days + 1

HR = "HKQuantityTypeIdentifierHeartRate"
STEPS = "HKQuantityTypeIdentifierStepCount"
HRV = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"

HW = re.compile(r"hardware:([^,]+)")
SW = re.compile(r"software:([^,>]+)")

import xml.etree.ElementTree as ET

hw_by_block = defaultdict(Counter)   # block -> hardware -> HR record count
sw_by_block = defaultdict(set)       # block -> {software}
all_hw = Counter()                   # any record -> hardware (to spot phone, etc.)
cell = defaultdict(lambda: [False, False, False])  # (day,hour) -> [hr, steps, hrv]

context = ET.iterparse(PATH, events=("end",))
for _, elem in context:
    if elem.tag == "Record":
        t = elem.get("type")
        if t in (HR, STEPS, HRV):
            sd = elem.get("startDate")
            if sd:
                d = date(int(sd[0:4]), int(sd[5:7]), int(sd[8:10]))
                if FROM <= d <= TO:
                    hour = int(sd[11:13])
                    key = (sd[:10], hour)
                    if t == HR:
                        cell[key][0] = True
                        dev = elem.get("device") or ""
                        m = HW.search(dev)
                        hwid = m.group(1) if m else "?"
                        b = (d - FROM).days // BLOCK
                        hw_by_block[b][hwid] += 1
                        all_hw[hwid] += 1
                        ms = SW.search(dev)
                        if ms:
                            sw_by_block[b].add(ms.group(1))
                    elif t == STEPS:
                        cell[key][1] = True
                    else:
                        cell[key][2] = True
    elem.clear()

# ---- A. device timeline ----
n_blocks = (TOTAL + BLOCK - 1) // BLOCK
print("A. DEVICE TIMELINE (HeartRate records, per 28-day block)\n")
print(f"{'block start':<12}{'hardware (HR record counts)':<40}{'software'}")
for b in range(n_blocks):
    lbl = date.fromordinal(FROM.toordinal() + b * BLOCK).isoformat()
    hw = ", ".join(f"{k}:{v}" for k, v in hw_by_block[b].most_common())
    sw = ",".join(sorted(sw_by_block[b]))
    print(f"{lbl:<12}{hw[:39]:<40}{sw}")
print(f"\nAll hardware ids seen (any HR record): {dict(all_hw)}")

# ---- B. wear vs gate ----
def bucketize(hours):
    n = len(hours)
    worn = [c for c in hours if c[0] or c[1]]
    still = [c for c in worn if c[2]]
    active = [c for c in worn if not c[2]]
    return n, len(worn), len(active), len(still)

day_cells = [c for (dd, h), c in cell.items() if 8 <= h <= 22]
night_cells = [c for (dd, h), c in cell.items() if h >= 23 or h <= 7]

print("\n\nB. WEAR vs RECORDING GATE  (hour-cells that have ANY of HR/steps/HRV)")
print("   Note: 'not-worn' here = cells with no data at all; denominator is only")
print("   cells that appear, so these are shares AMONG active-ish hours, plus the")
print("   raw counts to judge magnitude.\n")
for label, cells in (("DAY (08-22)", day_cells), ("NIGHT (23-07)", night_cells)):
    worn = [c for c in cells if c[0] or c[1]]
    still = [c for c in worn if c[2]]
    active = [c for c in worn if not c[2]]
    wn = len(worn) or 1
    print(f"{label}: worn hour-cells={len(worn)}  worn-still(HRV)={len(still)} ({100*len(still)/wn:.0f}%)  "
          f"worn-active(no HRV)={len(active)} ({100*len(active)/wn:.0f}%)")

# overnight wear as nights with ANY overnight data / total nights
nights = set(dd for (dd, h) in cell if h >= 23 or h <= 7)
print(f"\nNights with ANY overnight (23-07) data: {len(nights)} / {TOTAL} nights "
      f"({100*len(nights)/TOTAL:.0f}%)  <- overnight-wear proxy for the per-night Bernoulli")
