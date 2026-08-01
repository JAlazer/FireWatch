// Standalone determinism + behavior check for the mock generator. Run with:
//   npx tsx src/mock/determinism.check.ts
// Asserts the four properties, then prints a working slice. Provider methods are
// async (they match the real binding), so this runs inside an async main().

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
const round = (n: number) => Math.round(n * 100) / 100;

const profile: PhysiologyProfile = { seed: "user-001", age: 34 };
const range = { from: "2026-05-01T00:00:00Z", to: "2026-06-30T00:00:00Z" };
const dates = { from: new Date(range.from), to: new Date(range.to) };
const afterAll = Date.parse(range.to) + 40 * DAY;

async function main() {
  // ---- Property 1: same (profile, range) -> byte-identical, incl. uuids ----
  console.log("\n[1] Determinism — identical output incl. uuids");
  const a = generate(profile, range);
  const b = generate(profile, range);
  const byUuid = new Map(a.samples.map((s) => [s.uuid, s])); // internal, for clip check
  assert(JSON.stringify(a) === JSON.stringify(b), "two generate() calls are byte-identical");
  assert(a.samples[0].uuid === b.samples[0].uuid && a.samples.length === b.samples.length, "uuids match");
  assert(JSON.stringify(generate({ seed: "user-002", age: 34 }, range).samples) !== JSON.stringify(a.samples), "a different seed produces different data");

  // ---- Property 2: anchored replay is stable ----
  console.log("\n[2] Anchored replay — same anchor twice returns the same slice");
  const p2 = new MockHealthDataProvider(profile, range, { now: () => afterAll });
  const r2a = await p2.queryQuantitySamplesWithAnchor(HR, { anchor: "0" });
  const r2b = await p2.queryQuantitySamplesWithAnchor(HR, { anchor: "0" });
  assert(JSON.stringify(r2a) === JSON.stringify(r2b), 'replaying from anchor "0" is identical');
  assert(Number(r2a.newAnchor) === r2a.samples.length + r2a.deletedSamples.length, "newAnchor counts all consumed events");

  // ---- Property 3: retraction timing exercises the sync path ----
  console.log("\n[3] Retraction timing — visible before retractedAt, deleted after");
  const retracted = a.samples.find((s) => s.retractedAtMs != null && s.identifier === HR);
  if (!retracted || retracted.retractedAtMs == null) {
    assert(false, "found a retracted HeartRate sample to test");
  } else {
    const now1 = retracted.retractedAtMs - 1000;
    const now2 = retracted.retractedAtMs + 1000;
    assert(retracted.creationMs <= now1, "sample has already arrived at now1");

    const before = new MockHealthDataProvider(profile, range, { now: () => now1 });
    const r1 = await before.queryQuantitySamplesWithAnchor(HR, { anchor: "0" });
    const inSamples = r1.samples.some((s) => s.uuid === retracted.uuid);
    const notDeleted = !r1.deletedSamples.some((d) => d.uuid === retracted.uuid);
    assert(inSamples && notDeleted, "before retractedAt: returned in samples, not deletedSamples");

    const after = new MockHealthDataProvider(profile, range, { now: () => now2 });
    const r3 = await after.queryQuantitySamplesWithAnchor(HR, { anchor: r1.newAnchor });
    const nowDeleted = r3.deletedSamples.some((d) => d.uuid === retracted.uuid);
    const notReinserted = !r3.samples.some((s) => s.uuid === retracted.uuid);
    assert(nowDeleted && notReinserted, "after retractedAt: appears in deletedSamples, not re-inserted");
  }

  // ---- Property 4: clip-to-now (no public creationDate now -> check via store) ----
  console.log("\n[4] Clip-to-now — no future data leaks (resting HR)");
  const midDay = Math.floor((Date.parse(range.from) + 30 * DAY) / DAY) * DAY;
  const nowClip = midDay + 3600_000; // 01:00; that day's RHR arrives ~17h later
  const clip = new MockHealthDataProvider(profile, range, { now: () => nowClip });
  const rhrSamples = await clip.queryQuantitySamples(RHR, dates);
  const noFuture = rhrSamples.every((s) => (byUuid.get(s.uuid)?.creationMs ?? Infinity) <= nowClip);
  assert(noFuture, "every returned resting-HR sample arrived (creationMs) <= now");
  const todaysRhr = a.samples.find((s) => s.identifier === RHR && s.startMs === midDay);
  const leaked = todaysRhr ? rhrSamples.some((s) => s.uuid === todaysRhr.uuid) : false;
  assert(todaysRhr != null && !leaked && rhrSamples.length > 0, "today's not-yet-arrived RHR is withheld while earlier days are returned");

  // ---- Property 5: RANGE-INDEPENDENCE (absolute-epoch anchoring) ----
  console.log("\n[5] Range-independence — same date, any range, byte-identical");
  const yr = generate(profile, { from: "2026-01-01T00:00:00Z", to: "2026-12-31T00:00:00Z" });
  const nr = generate(profile, { from: "2026-03-01T00:00:00Z", to: "2026-05-01T00:00:00Z" });
  const lo = Date.parse("2026-03-01T00:00:00Z");
  const hi = Date.parse("2026-05-01T00:00:00Z");
  const subset = yr.samples.filter((s) => s.startMs >= lo && s.startMs < hi);
  assert(JSON.stringify(subset) === JSON.stringify(nr.samples), "full-year filtered == sub-range direct (byte-identical incl uuids)");

  // ---- marginal SD preserved by the truncated-lookback normalization ----
  console.log("\n[6] Marginal SD — truncated-lookback normalization preserves calibrated spread");
  const long = generate(profile, { from: "2020-01-01T00:00:00Z", to: "2023-01-01T00:00:00Z" }); // ~3y for a stable estimate
  const rvals = long.samples.filter((s) => s.identifier === RHR).map((s) => s.value);
  const rmean = rvals.reduce((x, y) => x + y, 0) / rvals.length;
  const rsd = Math.sqrt(rvals.reduce((x, y) => x + (y - rmean) ** 2, 0) / (rvals.length - 1));
  assert(Math.abs(rsd - 5.435) < 0.9, `RHR daily marginal SD ${rsd.toFixed(2)} ~= calibrated 5.435 (no variance inflation)`);

  // ---------------------------------------------------------------- slice ----
  console.log("\n================= WORKING SLICE =================");
  console.log("profile:", JSON.stringify(profile), "| range: 60 days");
  console.log("traits:", JSON.stringify({ userHrvMedian: round(a.traits.userHrvMedian), userRhrLevel: round(a.traits.userRhrLevel), activityLevel: round(a.traits.activityLevel), producesVO2Max: a.traits.producesVO2Max }));
  const counts: Record<string, number> = {};
  for (const s of a.samples) counts[s.metricKey] = (counts[s.metricKey] ?? 0) + 1;
  console.log("sample counts:", JSON.stringify(counts));
  console.log("retracted:", a.samples.filter((s) => s.retractedAtMs != null).length, "/", a.samples.length);
  const rhr0 = a.samples.find((s) => s.identifier === RHR);
  if (rhr0) console.log(`resting-HR arrival lag = ${round((rhr0.creationMs - rhr0.startMs) / 3600_000)}h (calibrated ~17.5h)`);
  console.log(`anchored full replay: ${r2a.samples.length} inserts, ${r2a.deletedSamples.length} deletions`);

  console.log("\n" + (failures === 0 ? "ALL PROPERTIES PASS ✅" : `${failures} ASSERTION(S) FAILED ❌`));
  process.exit(failures === 0 ? 0 : 1);
}

main();
