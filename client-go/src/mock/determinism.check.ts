// Standalone determinism + behavior check for the mock generator. Run with:
//   npx tsx src/mock/determinism.check.ts
// Asserts the four properties from the spec, then prints a working slice.

import { generate } from "./generate";
import { MockHealthDataProvider } from "./MockHealthDataProvider";
import { REGISTRY } from "./registry";
import type { PhysiologyProfile } from "./profile";

const DAY = 86_400_000;
const HR = REGISTRY.HeartRate.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;

let failures = 0;
function assert(cond: boolean, msg: string) {
  console.log(`${cond ? "  PASS" : "  FAIL"}  ${msg}`);
  if (!cond) failures++;
}

const profile: PhysiologyProfile = { seed: "user-001", age: 34 };
const range = { from: "2026-05-01T00:00:00Z", to: "2026-06-30T00:00:00Z" };
const afterAll = Date.parse(range.to) + 40 * DAY; // a "now" past every arrival

// ---- Property 1: same (profile, range) -> byte-identical, incl. uuids ----
console.log("\n[1] Determinism — identical output incl. uuids");
const a = generate(profile, range);
const b = generate(profile, range);
assert(JSON.stringify(a) === JSON.stringify(b), "two generate() calls are byte-identical");
assert(a.samples[0].uuid === b.samples[0].uuid && a.samples.length === b.samples.length, "uuids match");
const different = generate({ seed: "user-002", age: 34 }, range);
assert(JSON.stringify(different.samples) !== JSON.stringify(a.samples), "a different seed produces different data");

// ---- Property 2: anchored replay is stable ----
console.log("\n[2] Anchored replay — same anchor twice returns the same slice");
const p2 = new MockHealthDataProvider(profile, range, { now: () => afterAll });
const r2a = p2.queryQuantitySamplesWithAnchor(HR, { anchor: { delivered: 0 } });
const r2b = p2.queryQuantitySamplesWithAnchor(HR, { anchor: { delivered: 0 } });
assert(JSON.stringify(r2a) === JSON.stringify(r2b), "replaying from anchor {delivered:0} is identical");
assert(r2a.newAnchor.delivered === r2a.samples.length + r2a.deletedSamples.length, "newAnchor counts all consumed events");

// ---- Property 3: retraction timing exercises the sync path ----
console.log("\n[3] Retraction timing — visible before retractedAt, deleted after");
const retracted = a.samples.find((s) => s.retractedAtMs != null && s.identifier === HR);
if (!retracted || retracted.retractedAtMs == null) {
  assert(false, "found a retracted HeartRate sample to test");
} else {
  const now1 = retracted.retractedAtMs - 1000; // before retraction, after arrival
  const now2 = retracted.retractedAtMs + 1000; // after retraction
  assert(retracted.creationMs <= now1, "sample has already arrived at now1");

  const before = new MockHealthDataProvider(profile, range, { now: () => now1 });
  const r1 = before.queryQuantitySamplesWithAnchor(HR, { anchor: { delivered: 0 } });
  const inSamples = r1.samples.some((s) => s.uuid === retracted.uuid);
  const notDeleted = !r1.deletedSamples.some((d) => d.uuid === retracted.uuid);
  assert(inSamples && notDeleted, "before retractedAt: returned in samples, not deletedSamples");

  const after = new MockHealthDataProvider(profile, range, { now: () => now2 });
  const r3 = after.queryQuantitySamplesWithAnchor(HR, { anchor: r1.newAnchor });
  const nowDeleted = r3.deletedSamples.some((d) => d.uuid === retracted.uuid);
  const notReinserted = !r3.samples.some((s) => s.uuid === retracted.uuid);
  assert(nowDeleted && notReinserted, "after retractedAt: appears in deletedSamples, not re-inserted");
}

// ---- Property 4: clip-to-now, tested on resting HR (~17h lag) ----
console.log("\n[4] Clip-to-now — no future data leaks (resting HR)");
const midDay = Math.floor((Date.parse(range.from) + 30 * DAY) / DAY) * DAY;
const nowClip = midDay + 3600_000; // 01:00 that day; that day's RHR arrives ~17h later
const clip = new MockHealthDataProvider(profile, range, { now: () => nowClip });
const rhrSamples = clip.queryQuantitySamples(RHR, range);
const noFuture = rhrSamples.every((s) => Date.parse(s.creationDate) <= nowClip);
assert(noFuture, "every returned resting-HR sample has creationDate <= now");
const todaysRhr = a.samples.find((s) => s.identifier === RHR && s.startMs === midDay);
const leaked = todaysRhr ? rhrSamples.some((s) => s.uuid === todaysRhr.uuid) : false;
assert(todaysRhr != null && !leaked && rhrSamples.length > 0, "today's not-yet-arrived RHR is withheld while earlier days are returned");

// ---------------------------------------------------------------- slice ----
console.log("\n================= WORKING SLICE =================");
console.log("profile:", JSON.stringify(profile), "| range: 60 days");
console.log("traits:", JSON.stringify({
  userHrvMedian: round(a.traits.userHrvMedian),
  userRhrLevel: round(a.traits.userRhrLevel),
  activityLevel: round(a.traits.activityLevel),
  producesVO2Max: a.traits.producesVO2Max,
}));
const counts: Record<string, number> = {};
for (const s of a.samples) counts[s.metricKey] = (counts[s.metricKey] ?? 0) + 1;
console.log("sample counts:", JSON.stringify(counts));
console.log("retracted:", a.samples.filter((s) => s.retractedAtMs != null).length, "/", a.samples.length);

const day0 = Math.floor(Date.parse(range.from) / DAY) * DAY;
const hrDay = a.samples.filter((s) => s.identifier === HR && s.startMs >= day0 && s.startMs < day0 + DAY);
console.log(`\nHeart rate, day 1: ${hrDay.length} samples. First 6 gaps (s) — note bimodal (burst ~6s / background ~300s):`);
console.log(" ", hrDay.slice(1, 7).map((s, i) => Math.round((s.startMs - hrDay[i].startMs) / 1000)).join(", "));
console.log("  value range:", Math.min(...hrDay.map((s) => s.value)), "..", Math.max(...hrDay.map((s) => s.value)));

const rhr0 = a.samples.find((s) => s.identifier === RHR);
if (rhr0) console.log(`\nResting HR sample — arrival lag = ${round((rhr0.creationMs - rhr0.startMs) / 3600_000)}h (calibrated ~17.5h):`,
  `value ${rhr0.value}, start ${new Date(rhr0.startMs).toISOString()}, created ${new Date(rhr0.creationMs).toISOString()}`);

const hrvDay = a.samples.filter((s) => s.identifier === HRV && s.startMs >= day0 && s.startMs < day0 + DAY);
console.log(`\nHRV, day 1: ${hrvDay.length} readings, values ${hrvDay.map((s) => s.value).join(", ")} ms (user median ~${round(a.traits.userHrvMedian)})`);

console.log(`\nAnchored full replay (now past all arrivals): ${r2a.samples.length} inserts, ${r2a.deletedSamples.length} deletions`);
console.log("\n" + (failures === 0 ? "ALL PROPERTIES PASS ✅" : `${failures} ASSERTION(S) FAILED ❌`));
process.exit(failures === 0 ? 0 : 1);

function round(n: number) { return Math.round(n * 100) / 100; }
