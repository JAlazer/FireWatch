// Sleep session construction. The sleep-session metric is defined but DISABLED
// (SleepAnalysis in the registry emits nothing yet). This module exists now, ahead
// of emission, to settle the cross-midnight interface question so it isn't a
// retrofit once sleep is enabled (#8a).
//
// CROSS-MIDNIGHT OWNERSHIP RULE: a sleep session is owned by its WAKE day -- the
// calendar day of its endDate. A session running 23:00 Monday -> 07:00 Tuesday
// belongs to TUESDAY. Any once-nightly sample inside the session (e.g. wrist
// temperature) is attributed to that same day.
//
// Rationale: (1) matches Apple Health, which files last night's sleep under the
// day you wake up; (2) matches the app -- someone opening the daily-story screen
// in the morning expects last night's sleep to be part of TODAY, not yesterday.
//
// INCONSISTENCY TO BE AWARE OF (not a bug): data-parsing/summarize_health_export.py
// groups sleep by ONSET day (its rule: anything before 18:00 belongs to the
// previous calendar day) -- the OPPOSITE label convention from this one. This does
// not corrupt the synthetic-vs-real diff: both group the SAME segments into the
// SAME sessions and differ only in which date LABEL the session carries. Do not
// assume the two conventions agree.

const DAY_MS = 86_400_000;

/** The calendar day (UTC midnight ms) that owns a session ending at `endMs`. */
export function nightOwnerDay(endMs: number): number {
  return Math.floor(endMs / DAY_MS) * DAY_MS;
}
