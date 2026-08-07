#!/usr/bin/env python3
"""Within-person correlation between daily-mean HRV (SDNN) and daily RestingHeartRate,
over the recent 12-month window, on days where BOTH exist. Reports raw and detrended
r plus the usable pair count, so we can calibrate the innovation coupling in the
generator (measure, don't assume). Streams the export (iterparse + clear)."""
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta
from statistics import mean, pstdev

EXPORT = sys.argv[1] if len(sys.argv) > 1 else "Johan_Jul_26.xml"
HRV = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
RHR = "HKQuantityTypeIdentifierRestingHeartRate"

daily = {HRV: defaultdict(lambda: [0.0, 0]), RHR: defaultdict(lambda: [0.0, 0])}  # day -> [sum, n]

n = 0
for _, elem in ET.iterparse(EXPORT, events=("end",)):
    if elem.tag == "Record":
        t = elem.get("type")
        if t == HRV or t == RHR:
            s = elem.get("startDate")
            v = elem.get("value")
            if s and v:
                day = s[:10]
                try:
                    acc = daily[t][day]
                    acc[0] += float(v); acc[1] += 1
                except ValueError:
                    pass
        n += 1
    elem.clear()

def means(store):
    return {d: s / c for d, (s, c) in store.items() if c > 0}

hrv = means(daily[HRV])
rhr = means(daily[RHR])
if not hrv or not rhr:
    print("no data"); sys.exit(1)

# recent 12-month window off the latest day that has EITHER metric
last = max(max(hrv), max(rhr))
last_d = datetime.strptime(last, "%Y-%m-%d")
lo = (last_d - timedelta(days=364)).strftime("%Y-%m-%d")
hrv = {d: v for d, v in hrv.items() if lo <= d <= last}
rhr = {d: v for d, v in rhr.items() if lo <= d <= last}

def pearson(xs, ys):
    mx, my = mean(xs), mean(ys)
    num = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    dx = sum((a - mx) ** 2 for a in xs) ** 0.5
    dy = sum((b - my) ** 2 for b in ys) ** 0.5
    return num / (dx * dy) if dx and dy else float("nan")

pairs = sorted(set(hrv) & set(rhr))
import math
xs = [hrv[d] for d in pairs]
ys = [rhr[d] for d in pairs]
lxs = [math.log(v) for v in xs]

print(f"window: {lo} .. {last}")
print(f"usable day-pairs (both HRV & RHR present): {len(pairs)}")
print(f"HRV daily-mean SD: {pstdev(xs):.2f} ms  (target ~18.5)")
print(f"RHR daily-mean SD: {pstdev(ys):.2f} bpm (target ~5.4)")
print(f"raw  corr(HRV, RHR)      = {pearson(xs, ys):+.3f}")
print(f"raw  corr(log HRV, RHR)  = {pearson(lxs, ys):+.3f}   (log-space matches the HRV latent)")

# detrend: subtract a 28-day centred rolling mean (over available days) from each
# series, so a slow common trend can't manufacture the correlation.
def detrend(series, day):
    d0 = datetime.strptime(day, "%Y-%m-%d")
    win = [series[(d0 + timedelta(days=k)).strftime("%Y-%m-%d")]
           for k in range(-14, 15)
           if (d0 + timedelta(days=k)).strftime("%Y-%m-%d") in series]
    return series[day] - mean(win)

dxs = [detrend(hrv, d) for d in pairs]
dys = [detrend(rhr, d) for d in pairs]
dlxs = [detrend({k: math.log(v) for k, v in hrv.items()}, d) for d in pairs]
print(f"detrended corr(HRV, RHR)     = {pearson(dxs, dys):+.3f}")
print(f"detrended corr(log HRV, RHR) = {pearson(dlxs, dys):+.3f}")
