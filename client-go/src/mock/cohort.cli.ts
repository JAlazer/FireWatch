// OFFLINE Node script (run with tsx, NOT part of the RN bundle): generate a
// cohort of synthetic users and serialize them to one Apple Health export XML,
// for the synthetic-vs-real validation diff. The cohort loop is just generate()
// called per profile.
//
//   npx tsx src/mock/cohort.cli.ts [outPath] [nUsers] [days]
//
// Output is written to a .xml path (gitignored under data-parsing/*.xml).

import fs from "node:fs";
import { generate } from "./generate";
import { appleDate, exportFooter, exportHeader, recordLine } from "./serialize";
import type { PhysiologyProfile } from "./profile";

const OUT = process.argv[2] ?? "../data-parsing/synthetic_export.xml";
const N = Number(process.argv[3] ?? 10);
const DAYS = Number(process.argv[4] ?? 90);

// Fixed window + seeds so the artifact is reproducible (no Date.now/random).
const FROM = "2026-01-01T00:00:00Z";
const fromMs = Date.parse(FROM);
const DAY = 86_400_000;
const range = { from: FROM, to: new Date(fromMs + DAYS * DAY).toISOString() };

// A plain healthy cohort (no conditions) with ages/activity spread, so aggregate
// physiology reflects the population centroid — the fair comparison against the
// real (device_behavior-calibrated) summary.
function profile(i: number): PhysiologyProfile {
  return { seed: `cohort-${i}`, age: 25 + Math.round((i / Math.max(1, N - 1)) * 35) }; // 25..60
}

const fd = fs.openSync(OUT, "w");
fs.writeSync(fd, exportHeader(Date.parse(range.to)));

let total = 0;
for (let i = 0; i < N; i++) {
  const store = generate(profile(i), range);
  let buf = "";
  for (const s of store.samples) {
    buf += recordLine(s);
    if (buf.length > 1_000_000) {
      fs.writeSync(fd, buf);
      buf = "";
    }
  }
  fs.writeSync(fd, buf);
  total += store.samples.length;
}

fs.writeSync(fd, exportFooter());
fs.closeSync(fd);
console.log(`Wrote ${total.toLocaleString()} records for ${N} users x ${DAYS} days -> ${OUT}`);
console.log(`ExportDate/window: ${range.from.slice(0, 10)} .. ${range.to.slice(0, 10)}`);
