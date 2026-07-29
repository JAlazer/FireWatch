#!/usr/bin/env python3
"""One-off: are HeartRate's 6-second intra-day gaps genuine burst sampling, or
near-duplicate writes from multiple sourceNames? (calibration finding #8)

Streams the export once, restricted to the 12-month window, HeartRate only.
Reports, per sourceName: record count and intra-day consecutive-gap p50/p95.
Also reports the POOLED (all-sources-interleaved) gap p50/p95 -- if pooled p50 is
tiny but every single source's p50 is large, the small gaps come from interleaving
distinct sources (duplicates), not bursts.
"""
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict, Counter
from datetime import datetime

PATH = sys.argv[1] if len(sys.argv) > 1 else "export.xml"  # pass the (gitignored) export path as arg1
FROM, TO = "2025-07-26", "2026-07-26"
TYPE = "HKQuantityTypeIdentifierHeartRate"


def parse_ts(s):
    return datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S").timestamp()


def pct(v, p):
    if not v:
        return None
    v = sorted(v)
    k = (len(v) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(v) - 1)
    return round(v[lo] + (v[hi] - v[lo]) * (k - lo), 1)


src_day_ts = defaultdict(lambda: defaultdict(list))   # source -> day -> [ts]
pooled_day_ts = defaultdict(list)                      # day -> [ts] (all sources)
src_count = Counter()

context = ET.iterparse(PATH, events=("end",))
for _, elem in context:
    if elem.tag == "Record" and elem.get("type") == TYPE:
        sd = elem.get("startDate")
        if sd:
            day = sd[:10]
            if FROM <= day <= TO:
                src = elem.get("sourceName", "?")
                ts = parse_ts(sd)
                src_count[src] += 1
                src_day_ts[src][day].append(ts)
                pooled_day_ts[day].append(ts)
    elem.clear()


def gaps_from(day_ts):
    g = []
    for day, ts in day_ts.items():
        ts.sort()
        g.extend(ts[i + 1] - ts[i] for i in range(len(ts) - 1))
    return g


print(f"HeartRate records in window {FROM}..{TO}: {sum(src_count.values()):,}")
print(f"Distinct sourceNames: {len(src_count)}\n")
print(f"{'sourceName':<34}{'records':>10}{'gap_p50':>10}{'gap_p95':>10}")
for src, cnt in src_count.most_common():
    g = gaps_from(src_day_ts[src])
    print(f"{src[:33]:<34}{cnt:>10}{str(pct(g, 0.5)):>10}{str(pct(g, 0.95)):>10}")

pg = gaps_from(pooled_day_ts)
print(f"\n{'POOLED (interleaved)':<34}{sum(src_count.values()):>10}{str(pct(pg, 0.5)):>10}{str(pct(pg, 0.95)):>10}")
