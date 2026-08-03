// Quick eyeball generator: make one synthetic person and write an Apple Health
// export XML you can inspect/plot. Run from client-go/:
//   npx tsx src/mock/test_generator.ts

import fs from "node:fs";
import { generate } from "./generate";
import { exportFooter, exportHeader, recordLine } from "./serialize";
// import { toPhysiologyProfile } from "./mapping"; // uncomment for the flare version

// 1. choose who + how long
const range = { from: "2026-01-01T00:00:00Z", to: "2026-01-15T00:00:00Z" }; // 14 days
const store = generate({ seed: "eyeball-1", age: 34 }, range); // try activityLevel: 25 (sedentary) or 110 (athlete)

// --- OR: a user with a flare mid-window (HRV dips, resting HR rises) ---
// const store = generate(
//   toPhysiologyProfile(
//     { seed: "eyeball-1", age: 34, autoimmune: true,
//       explicitEpisodes: [{ from: "2026-01-06T00:00:00Z", to: "2026-01-10T00:00:00Z",
//         effects: [{ metric: "HeartRateVariabilitySDNN", factor: 0.749 }, { metric: "RestingHeartRate", factor: 1.086 }] }] },
//     range),
//   range);

// 2. write Apple-Health XML
// Filename from the command line (optional). A bare name goes into data-parsing/;
// a path with a "/" is used as-is. Defaults to eyeball.xml.
const arg = process.argv[2];
const OUT = arg ? (arg.includes("/") ? arg : `../data-parsing/${arg}`) : "../data-parsing/eyeball.xml";
const fd = fs.openSync(OUT, "w");
fs.writeSync(fd, exportHeader(Date.parse(range.to)));
for (const s of store.samples) fs.writeSync(fd, recordLine(s));
fs.writeSync(fd, exportFooter());
fs.closeSync(fd);

console.log(`wrote ${store.samples.length} records -> ${OUT}`);
