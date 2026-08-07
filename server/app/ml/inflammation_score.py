"""
Personalized inflammation scoring — Python port of src/mock/score.ts.

REPLACES the earlier version of this file (population reference-range
heuristic + lifestyle weighting). That approach is gone; this is a faithful
port of the client generator's real scorer, kept in lockstep with score.ts
on purpose: same constants (SCORING), same function boundaries
(robust_baseline / directed_z / score_series), same algorithm. If you change
one side, check the other — and re-run the equivalent of score_demo.ts's
planted-flare scenario against both to confirm they still agree.

Personalized (per-user median/MAD baseline), NOT population-referenced.
Cold-start: fewer than BASELINE_MIN_DAYS of history -> status "calibrating",
score is None. Deliberate — no score until the baseline is trustworthy, not
a lower-confidence score (same reasoning as score.ts's own comment).
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from statistics import median as _median
from typing import Any, Literal

DAY_SECONDS = 86_400
_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


class Scoring:
    ROLL_DAYS = 3
    BASELINE_MAX_DAYS = 56
    BASELINE_MIN_DAYS = 28
    Z_THRESHOLD = 1.0
    EXIT_DAYS = 2


@dataclass
class ScoreResult:
    day: date
    status: Literal["calibrating", "scored"]
    level: int | None  # 1 (calm) .. 5; None while calibrating
    score: float | None  # continuous severity when elevated, else 0
    hrv_z: float | None  # directed z (positive = HRV dropped)
    rhr_z: float | None  # directed z (positive = resting HR rose)
    elevated: bool
    reason: str


def _day_index(dt: datetime) -> int:
    """Epoch day index in UTC — matches score.ts's Math.floor(Date.parse(iso)/DAY_MS)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int((dt.astimezone(timezone.utc) - _EPOCH).total_seconds() // DAY_SECONDS)


def _date_of_day(d: int) -> date:
    return (_EPOCH + timedelta(days=d)).date()


def _median_val(xs: list[float]) -> float:
    return _median(sorted(xs))


def daily_means(samples: list[dict[str, Any]]) -> dict[int, float]:
    """One value per day: mean of that day's samples.
    Each sample dict needs "start_at" (datetime) and "value" (float) — map
    BIOMETRICS.value_numeric -> "value" when pulling from the repository."""
    acc: dict[int, list[float]] = {}
    for s in samples:
        d = _day_index(s["start_at"])
        acc.setdefault(d, []).append(s["value"])
    return {d: sum(vs) / len(vs) for d, vs in acc.items()}


def rolling(daily: dict[int, float], end: int) -> float | None:
    """Mean of up to ROLL_DAYS daily values ending at `end` (None if none)."""
    vals = [daily[d] for d in range(end - Scoring.ROLL_DAYS + 1, end + 1) if d in daily]
    return sum(vals) / len(vals) if vals else None


def robust_baseline(daily: dict[int, float], end: int) -> tuple[float, float] | None:
    """Robust baseline = median + MAD (scaled to an SD-equivalent) of the
    3-day rolling stat across the window ENDING just before the current
    rolling window (so a current flare can't inflate its own baseline).
    Window grows toward BASELINE_MAX_DAYS; None if fewer than
    BASELINE_MIN_DAYS days have a rolling value. Flagged days are NOT
    excluded (that would make the baseline depend on the score)."""
    hi = end - Scoring.ROLL_DAYS
    rolls = [
        r for d in range(hi - Scoring.BASELINE_MAX_DAYS + 1, hi + 1)
        if (r := rolling(daily, d)) is not None
    ]
    if len(rolls) < Scoring.BASELINE_MIN_DAYS:
        return None
    center = _median_val(rolls)
    mad = _median_val([abs(r - center) for r in rolls])
    scale = 1.4826 * mad or 1e-9
    return center, scale


def _directed_z(
    hrv_daily: dict[int, float], rhr_daily: dict[int, float], end: int
) -> tuple[bool, float | None, float | None]:
    """Directed z for both signals on a given day. Returns (ready, hrv_z, rhr_z)."""
    hb = robust_baseline(hrv_daily, end)
    rb = robust_baseline(rhr_daily, end)
    if hb is None or rb is None:
        return False, None, None
    hrv_now = rolling(hrv_daily, end)
    rhr_now = rolling(rhr_daily, end)
    h_center, h_scale = hb
    r_center, r_scale = rb
    hrv_z = None if hrv_now is None else (h_center - hrv_now) / h_scale  # HRV down -> positive
    rhr_z = None if rhr_now is None else (rhr_now - r_center) / r_scale  # RHR up -> positive
    return True, hrv_z, rhr_z


def _level_for(elevated: bool, severity: float) -> int:
    if not elevated:
        return 1
    if severity < 1.5:
        return 2
    if severity < 2.25:
        return 3
    if severity < 3:
        return 4
    return 5


def _concern(z: float | None) -> bool:
    return z is not None and z >= Scoring.Z_THRESHOLD


def _contradicts(z: float | None) -> bool:
    return z is not None and z < 0


def score_series(
    hrv_samples: list[dict[str, Any]],
    rhr_samples: list[dict[str, Any]],
    from_day: date,
    to_day: date,
) -> list[ScoreResult]:
    """Score a SEQUENCE of days with asymmetric concordance hysteresis:
      ENTER elevated: both signals >= threshold (true two-signal concordance)
      STAY  elevated: one signal >= threshold AND the other not contradicting
      EXIT: STAY fails for EXIT_DAYS consecutive days
    Lets the better-measured RHR carry the elevated state through HRV's
    noisy days without a fixed timer."""
    hrv_daily = daily_means(hrv_samples)
    rhr_daily = daily_means(rhr_samples)
    out: list[ScoreResult] = []
    elevated = False
    stale = 0

    from_idx = _day_index(datetime.combine(from_day, datetime.min.time(), tzinfo=timezone.utc))
    to_idx = _day_index(datetime.combine(to_day, datetime.min.time(), tzinfo=timezone.utc))

    for d in range(from_idx, to_idx + 1):
        ready, hrv_z, rhr_z = _directed_z(hrv_daily, rhr_daily, d)
        if not ready:
            elevated = False
            stale = 0
            out.append(ScoreResult(
                day=_date_of_day(d), status="calibrating", level=None, score=None,
                hrv_z=None, rhr_z=None, elevated=False,
                reason=f"baseline not ready (need >={Scoring.BASELINE_MIN_DAYS}d for both signals)",
            ))
            continue

        enter = _concern(hrv_z) and _concern(rhr_z)
        stay = (_concern(hrv_z) and not _contradicts(rhr_z)) or (_concern(rhr_z) and not _contradicts(hrv_z))

        if not elevated:
            if enter:
                elevated = True
                stale = 0
                reason = "ENTER: both signals concerning"
            else:
                reason = "calm"
        elif stay:
            stale = 0
            reason = "STAY: both concerning" if enter else "STAY: one signal carries (other not contradicting)"
        else:
            stale += 1
            if stale >= Scoring.EXIT_DAYS:
                elevated = False
                reason = f"EXIT: stay failed {stale}d"
            else:
                reason = f"holding (stay failed {stale}/{Scoring.EXIT_DAYS}d)"

        severity = max(hrv_z if hrv_z is not None else 0, rhr_z if rhr_z is not None else 0) if elevated else 0
        out.append(ScoreResult(
            day=_date_of_day(d), status="scored",
            level=_level_for(elevated, severity), score=round(severity, 2),
            hrv_z=None if hrv_z is None else round(hrv_z, 2),
            rhr_z=None if rhr_z is None else round(rhr_z, 2),
            elevated=elevated,
            reason=f"{reason} (HRV z={'-' if hrv_z is None else round(hrv_z, 2)}, "
                   f"RHR z={'-' if rhr_z is None else round(rhr_z, 2)})",
        ))
    return out


def score(
    hrv_samples: list[dict[str, Any]], rhr_samples: list[dict[str, Any]], on_day: date
) -> ScoreResult:
    """Single-day score (stateless; symmetric concordance). For one-off queries."""
    return score_series(hrv_samples, rhr_samples, on_day, on_day)[0]