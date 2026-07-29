#!/usr/bin/env python3
"""
Author healthkit-calibration.json from a summarizer output.

Design intent (per spec): calibration is DATA, not code. A new export means
re-running the summarizer and re-running this script -- no generator changes.
This is the single place where:
  - `calibrated` numbers are copied from a real export summary, and
  - `synthesized` numbers (literature / assumed) are declared with their basis.

The file holds ONLY measured-or-assumed PARAMETERS. The metric registry
(identifiers, units, occurrence models, enabled flags) does NOT live here -- it
describes what the generator supports, derives from no one's export, and lives in
the TS core config. This script keeps a REGISTRY table only to know which metrics
to author and how to find them in the summary; it is not written to the output.

Two sections, different pooling behavior when more people are added:
  device_behavior -- the Watch's own algorithms; wearer-independent; POOLS.
                     Calibrated from a RECENT window only (one device era).
  physiology      -- per-person values; does NOT pool. Central tendency +
                     explicit between-person spread, so each user is drawn from a
                     population. The calibration source is ONE point, never the
                     center: centroids are age-conditioned from literature.

Usage:
    python build_calibration.py <summary_12mo>.json -o healthkit-calibration.json
"""

import argparse
import json

BUILD_DATE = "2026-07-28"  # authored on; not a wall-clock read
HK = "HKQuantityTypeIdentifier"

# --- HRV SDNN age model (SYNTHESIZED / assumed) --------------------------------
# Named constants so slope and device offset are trivial to revise. Two scales
# are in play and MUST NOT be mixed:
#   ECG scale   -- what the age-norm literature reports (chest strap / Holter)
#   Apple scale -- what an Apple Watch actually writes (underestimates SDNN)
# Age norms are ECG-scale; the generator produces Apple-scale data, so the device
# offset is SUBTRACTED from the ECG centroid before it's emitted.
SDNN_REF_AGE = 25               # representative age of the youngest band
SDNN_REF_VALUE_MS_ECG = 55      # assumed ECG-scale short-window SDNN at ref age
SDNN_AGE_SLOPE_PCT_PER_YEAR = 0.8
SDNN_PLATEAU_AGE = 65           # decline flattens after this age
APPLE_SDNN_ECG_OFFSET_MS = 8.3  # Apple Watch underestimates SDNN vs ECG by ~this
SDNN_AGE_BASIS = (
    "ASSUMED, not drawn from literature. Two corrections stacked on ECG-scale age "
    "norms: (1) SLOPE -- published SDNN norms (Umetani 1998, 24h Holter) are driven "
    "by circadian amplitude a ~60s Apple window cannot capture, so the 24h slope "
    "overstates decline; use 0.8%/yr, plateau after 65 (NOT RMSSD's ~1.3%/yr). "
    "(2) DEVICE SCALE -- Apple Watch underestimates SDNN by ~8.3ms vs a chest-strap "
    "reference (O'Grady et al. 2024, Sensors; Series 9/Ultra 2 vs Polar H10+Kubios), "
    "so that offset is subtracted from ECG centroids to reach Apple scale. Offset is "
    "APPROXIMATE: measured on newer devices than this export and possibly proportional "
    "rather than absolute -- direction certain, magnitude not."
)

# Representative age per band; plateau applies past SDNN_PLATEAU_AGE.
_AGE_BANDS = [("20-29", 25), ("30-39", 35), ("40-49", 45),
              ("50-59", 55), ("60-69", 65), ("70+", 75)]


SDNN_SLOPE_APPLICATION = "multiplicative"  # compounding decay, not linear


def sdnn_centroid_ecg(age):
    # Multiplicative (exponential) decay: the age curve is closer to compounding
    # than straight-line. Modest difference vs linear (~1ms Apple-scale in the
    # oldest band) but a deliberate choice, recorded via SDNN_SLOPE_APPLICATION.
    a = min(age, SDNN_PLATEAU_AGE)
    return SDNN_REF_VALUE_MS_ECG * (1 - SDNN_AGE_SLOPE_PCT_PER_YEAR / 100) ** (a - SDNN_REF_AGE)


def sdnn_centroid_apple(age):
    """ECG-scale centroid with the device offset removed -> Apple Watch scale."""
    return round(sdnn_centroid_ecg(age) - APPLE_SDNN_ECG_OFFSET_MS, 1)


def sdnn_by_age_band():
    return {label: sdnn_centroid_apple(mid) for label, mid in _AGE_BANDS}


# --- Registry (drives authoring only; NOT emitted to the calibration file) ------
REGISTRY = {
    "HeartRate":                    {"identifier": HK + "HeartRate",                    "enabled": True},
    "HeartRateVariabilitySDNN":     {"identifier": HK + "HeartRateVariabilitySDNN",     "enabled": True},
    "RestingHeartRate":             {"identifier": HK + "RestingHeartRate",             "enabled": True},
    "RespiratoryRate":              {"identifier": HK + "RespiratoryRate",              "enabled": False, "reason": "sparse in the 12mo window (~10% of days) purely because it is OVERNIGHT-WEAR gated -- Watch4/watchOS 10.6 supported respiratory rate the whole time, so feature availability was never the cause; not enabled initially"},
    "OxygenSaturation":             {"identifier": HK + "OxygenSaturation",             "enabled": False, "reason": "absent from export (needs Series 6+)"},
    "AppleSleepingWristTemperature":{"identifier": HK + "AppleSleepingWristTemperature","enabled": False, "reason": "absent from export (needs Series 8+)"},
    "StepCount":                    {"identifier": HK + "StepCount",                    "enabled": False, "reason": "disabled; parameters not yet authored"},
    "ActiveEnergyBurned":           {"identifier": HK + "ActiveEnergyBurned",           "enabled": False, "reason": "disabled; parameters not yet authored"},
    "VO2Max":                       {"identifier": HK + "VO2Max",                       "enabled": False, "reason": "disabled; parameters not yet authored"},
    "SleepAnalysis":                {"identifier": "HKCategoryTypeIdentifierSleepAnalysis", "enabled": False, "reason": "only ~14-25 staged nights ever; too few to calibrate"},
}

# --- Synthesized physiology (population centroids + between-person spread) -------
# Age-conditioned; the source individual is never the center. Every draw states
# its `distribution` explicitly (finding #11) so the core never has to guess.
PHYSIOLOGY_SYNTH = {
    "HeartRateVariabilitySDNN": {
        "population_centroid": {
            "source": "synthesized", "tag": "assumed", "age_conditioned": True, "unit": "ms",
            # HRV is strongly right-skewed (full-span mean 58.1 vs median 48.6), and a
            # Gaussian at centroid 46.7 / sd 18 is only 2.6 SD from zero -> negative
            # draws. Draw LOGNORMAL with median = the age-band centroid.
            "distribution": "lognormal",
            "distribution_note": "median of the lognormal equals by_age_band; between-person width from between_person_spread.cv.",
            "model": {"ref_age": SDNN_REF_AGE, "ref_value_ms_ecg": SDNN_REF_VALUE_MS_ECG,
                      "slope_pct_per_year": SDNN_AGE_SLOPE_PCT_PER_YEAR,
                      "slope_application": SDNN_SLOPE_APPLICATION, "plateau_age": SDNN_PLATEAU_AGE,
                      "apple_sdnn_ecg_offset_ms": APPLE_SDNN_ECG_OFFSET_MS, "emitted_scale": "apple"},
            "by_age_band": sdnn_by_age_band(),
            "_basis": SDNN_AGE_BASIS,
        },
        # Parameterised as CV (not sd): with a per-band centroid, one absolute sd
        # can't be right for every band. CV 0.35 pairs with the lognormal centroid.
        "between_person_spread": {"source": "synthesized", "tag": "assumed", "distribution": "lognormal",
                                   "cv": 0.35,
                                   "_basis": "assumed between-person CV ~35% (geometric). Expressed as CV so it scales with the age-band centroid; placeholder until >1 export."},
    },
    "RestingHeartRate": {
        "population_centroid": {
            "source": "synthesized", "tag": "assumed", "age_conditioned": True, "unit": "count/min",
            "distribution": "normal",
            "by_age_band": {"20-29": 70, "30-39": 70, "40-49": 69, "50-59": 69, "60-69": 68, "70+": 67},
            "_basis": "ASSUMED (no specific citation to hand -> `assumed`, not `literature`): adult resting HR mean ~70 bpm. Shape is a GENTLE MONOTONIC decline with age, consistent with Umetani 1998 (HR declines slowly with age); the earlier 70->72->70 mid-life hump had no cited basis and was removed. Population values, NOT from the source. NOTE: unlike HRV, RHR has no continuous model block -- the age curve is band-interpolated (avoids the discontinuity problem) but is therefore NOT revisable by changing one constant the way HRV's ref_age/slope are; edit the bands directly.",
        },
        "between_person_spread": {"source": "synthesized", "tag": "assumed", "distribution": "normal", "sd": 10,
                                   "_basis": "assumed; population RHR SD ~9-11 bpm. Uncited -> `assumed`."},
        "_consistency_check": "source's calibrated RHR median 61 vs 20-29 centroid 70 is ~0.9 between-person SD below the mean. Plausible: a lower resting HR is consistent with a fit young adult. Noted for parity with the HRV check; NOT used to anchor the centroid.",
    },
}


def dev_behavior_from_summary(t, hour_mode="device"):
    """Copy CALIBRATED device-behavior params from a summary type block.

    hour_mode controls how hour-of-day placement is treated (finding #9):
      "device"    -- genuinely device-driven (e.g. daily-summary timestamp); keep
                     the per-hour weights.
      "emergent"  -- activity-driven (heart rate); a fixed per-hour array would
                     bake in one person's schedule, so DROP it and let the
                     activity model produce timing.
      "partly"    -- device-ish but reflects when the wearer was still enough for
                     a reading (HRV); keep weights but flag as partly behavioral.
    """
    rpd = t.get("records_per_day") or {}
    gap = t.get("intra_day_gap_seconds") or {}
    lag = t.get("arrival_lag_seconds") or {}
    dur = t.get("sample_duration_seconds") or {}
    db = {
        "source": "calibrated",
        "wear": {"coverage_pct": t.get("coverage_pct"), "model": "per-day-bernoulli",
                 "_note": "days present / window days (recent 12mo); refine to run-length missing-day model later."},
        "records_per_day": {"p50": rpd.get("p50"), "p95": rpd.get("p95"), "mean": rpd.get("mean")},
        "intra_day_gap_seconds": {"p50": gap.get("p50"), "p95": gap.get("p95")},
        "sample_duration_seconds": {"p50": dur.get("p50"), "p95": dur.get("p95")},
        "arrival_lag_seconds": {"p50": lag.get("p50"), "p90": lag.get("p90"), "p95": lag.get("p95")},
    }
    if hour_mode == "emergent":
        db["hour_of_day"] = "EMERGENT: not a fixed per-hour array. Activity-driven; a stored weight array would bake in the source's personal schedule (his morning-workout spike + evening activity). Timing comes from the activity model instead."
    else:
        counts = t.get("hour_of_day_counts") or []
        tot = sum(counts) or 1
        db["hour_of_day_weights"] = [round(c / tot, 5) for c in counts]
        if hour_mode == "partly":
            db["_hour_of_day_note"] = "kept in device_behavior, but partly BEHAVIORAL: reflects when the wearer was still enough for a reading, not purely the Watch's schedule."
    return db


def within_person_from_summary(t, distribution):
    """CALIBRATED within-person day-to-day variability + persistence.

    Scale handling differs by distribution (finding #17):
      lognormal (HRV) -> parameterise by CV and run AR(1) in LOG space. An
        absolute sd measured at one median becomes the wrong CV for a user with a
        different median (18.5 at median 47 = 39% CV, but 57% at median 32). CV
        scales correctly; the absolute sd is kept only as measured provenance.
      normal (RHR)    -> use the absolute sd directly, AR(1) in linear space.
        Deliberate: RHR is normal and its level range is narrow, so CV-vs-absolute
        barely matters. The asymmetry with HRV is intentional, not an oversight.
    """
    dm = t.get("daily_mean_value") or {}
    ac = t.get("daily_mean_lag1_autocorr") or {}
    out = {
        "source": "calibrated",
        "distribution": distribution,
        "daily_mean_sd": dm.get("sd"),   # measured absolute value (provenance)
        "daily_mean_p50": dm.get("p50"),
        "lag1_autocorr": ac.get("coef"),
        "lag1_autocorr_n_pairs": ac.get("n_pairs"),
        "_note": "day-to-day scatter of per-day means (intra-day scatter excluded), recent 12mo window.",
        "_caveat": "source is not a healthy-baseline reference; these may include state-driven excursions and likely OVERSTATE day-to-day variability for an unaffected individual.",
    }
    if distribution == "lognormal":
        out["cv"] = round(dm.get("sd") / dm.get("p50"), 3)
        out["ar1_space"] = "log"
        out["_scale_note"] = "USE cv (geometric), not daily_mean_sd, so within-person spread scales with each user's median. AR(1) runs in log space."
    else:
        out["ar1_space"] = "linear"
        out["_scale_note"] = "Absolute daily_mean_sd used directly (AR(1) in linear space). Deliberate for RHR: normal, narrow level range; CV scaling would barely differ."
    return out


def heart_rate_physiology(t):
    """HR is emergent, not a physiological parameter -- no centroid/spread.

    Activity level is a PER-USER parameter drawn from a population (finding #12):
    how high HR rises is fitness/activity, not a device property. Baking the
    source's quantiles in as a fixed constant would give every synthetic user his
    fitness -- and would make cardiovascular fitness (a confounder that shifts RHR
    and HRV independently of inflammation) impossible to vary. So the source's
    numbers are ONE population sample point, not the population default.
    """
    val = t.get("value") or {}
    dm = t.get("daily_mean_value") or {}
    ac = t.get("daily_mean_lag1_autocorr") or {}
    return {
        "_model": "emergent-from-resting-plus-activity",
        "_note": ("Daily-mean HR is not a physiological trait; it mostly measures how much "
                  "the person moved that day. HR has NO population centroid and NO "
                  "between-person spread. Each HR reading emerges from the resting floor "
                  "(RestingHeartRate) plus activity excursions. Raw-data view only, not a "
                  "scored marker -- it just needs to look plausible."),
        "resting_floor_from": "RestingHeartRate",
        # #19: within-person day-to-day DRIFT of activity, distinct from the
        # between-person sample point below. Matches the other two metrics' shape.
        "within_person": {
            "source": "calibrated",
            "distribution": "normal",
            "ar1_space": "linear",
            "daily_activity_level_sd": dm.get("sd"),
            "daily_activity_lag1_autocorr": ac.get("coef"),
            "daily_activity_lag1_autocorr_n_pairs": ac.get("n_pairs"),
            "_scale_note": "absolute sd, linear AR(1). HR daily-mean CV is small (~0.14), so absolute vs cv barely differs -- same rationale as RHR.",
            "_note": "how much one person's activity varies day to day; the only measured source for HR drift. Consumed when the HR model gains daily activity drift (v2).",
        },
        "fitness_index": {
            "_note": ("Per-user fitness proxy. Named for what it drives, not measured directly. "
                      "In v1 it stands in for BOTH cardiorespiratory fitness (HR headroom) and "
                      "activity volume -- distinct concepts collapsed for now. It is the "
                      "cardiovascular-FITNESS confounder: it moves resting HR and HRV (see "
                      "fitness_effects), not only HR excursions. It ALSO sets the HR excursion "
                      "PEAK; note that in v1 the intra-day burst FREQUENCY and DURATION are NOT "
                      "yet fitness-tied (a v1 simplification -- see "
                      "device_behavior.HeartRate.intra_day_gap_seconds._regime, which references "
                      "back here; reconcile in step 5)."),
            "population": {
                "source": "synthesized", "tag": "assumed", "distribution": "lognormal",
                "parameter": "peak_hr_excursion_bpm_over_resting",  # proxy scale for the index
                "median": 55, "cv": 0.35,
                "_basis": "assumed range sedentary->athletic; placeholder until multi-user data.",
            },
            # #18: DECOMPOSE fitness out of the total between-person spread rather
            # than stacking a shift on top (which would double-count, since
            # between_person_spread already includes fitness variation) and was too
            # weak to test the confounder. The core derives the per-efold magnitude
            # and the residual spread from variance_share so the two components sum
            # to exactly the literature total.
            "fitness_effects": {
                "source": "synthesized", "tag": "assumed",
                "variance_share": 0.4,
                "direction": {"RestingHeartRate": "down", "HeartRateVariabilitySDNN": "up"},
                "_note": ("variance_share = fraction of each metric's TOTAL between-person VARIANCE "
                          "attributed to fitness (residual = 1 - share). Core derives, with "
                          "sigma_f = log-sigma of fitness_index and f = ln(index/median): "
                          "per_efold = sqrt(share)*total_spread / sigma_f (sign from direction), "
                          "residual_spread = sqrt(1-share)*total_spread. So fitness_var + "
                          "residual_var = total_var exactly -- no double count. share=0.4 sized so "
                          "a sedentary user and an athlete are DISTINGUISHABLE, not lost in the "
                          "residual draw; ASSUMED (no decomposition study to hand)."),
            },
            "calibrated_sample_point": {
                "source": "calibrated",
                "_note": "ONE between-person population sample (the source), NOT the default. p95(123) - resting(~61) approx 62 bpm over resting.",
                "reading_quantiles_bpm": {"p5": val.get("p5"), "p50": val.get("p50"), "p95": val.get("p95")},
                "peak_excursion_bpm_over_resting_approx": 62,
            },
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("summary_json")
    ap.add_argument("-o", "--out", default="healthkit-calibration.json")
    args = ap.parse_args()

    s = json.load(open(args.summary_json))
    types = s["types"]
    enabled = [k for k, v in REGISTRY.items() if v["enabled"]]

    out = {
        "schema_version": "0.6.0",
        "_schema": {
            "source": "'calibrated' = measured from a real export summary; 'synthesized' = not measured (literature or assumption).",
            "tag": "only on synthesized values: 'literature' = a specific published figure/citation is given in _basis; 'assumed' = an engineering judgment or placeholder, not a cited number.",
            "distribution": "the family a physiology parameter is drawn from ('lognormal', 'normal', ...). Present on every physiology draw so the core never guesses.",
            "_note_fields": "keys beginning with '_' are human documentation, not machine parameters.",
        },
        "provenance": {
            "built": BUILD_DATE,
            "builder": "build_calibration.py",
            "sources": [{
                # Source identified by a fake id only -- the real export/summary
                # filenames (which carry the donor's name) are gitignored and never
                # echoed into this committed artifact.
                "source_id": "subject-001",
                "export_date": s.get("export_date"),
                "analysis_window": s.get("window"),
                "window_days": s.get("window_days"),
                "records_in_window": s.get("record_total"),
                "n_individuals": 1,
                "reference_age": 21,
                "device_hardware": "Watch4 (Apple Watch Series 4, 2018)",
                "device_software": "watchOS 10.6.1 -> 10.6.2",
                "reference_status": "NOT a healthy-baseline reference",
            }],
            "_device_era_caveat": (
                "device_behavior is calibrated from a Watch4 (2018 hardware) on watchOS 10.6 -- "
                "a device capped at watchOS 10, i.e. OLD hardware running recent software. Our "
                "users will largely be on NEWER watches whose sampling algorithms (cadence, "
                "gating, arrival timing) differ. This is a LARGER extrapolation than the window "
                "question below and the biggest single caveat on device_behavior. Re-calibrate "
                "when a newer-device export is available."
            ),
            "_window_decision": (
                "KEEP POOLED 12-month window. Evidence: a single hardware id (Watch4) appears "
                "throughout the window (the Jan-Feb 2026 gap is the same watch not worn, then "
                "resumed) -- so there is NO device era to separate. The HR intra-day cadence "
                "shift (6s->159s pooled vs post-gap) is ACTIVITY-driven on one device (workout "
                "bursts, more exercise pre-gap), not a device blend; pooling actually preserves "
                "the burst regime a post-gap-only basis would under-represent. The "
                "RespiratoryRate/Sleep onsets (Mar/Jun 2026) are a settings/overnight-wear "
                "change on the same capable device, not new capability."
            ),
            "_calibration_caveat": (
                "n=1. device_behavior is CALIBRATED from one person's Watch (its algorithms, "
                "wearer-independent). physiology population centroids/spreads are "
                "literature/assumed and are NOT anchored on this individual -- two independent "
                "reasons: the source is a single ~21yo, AND is not a healthy-baseline reference. "
                "On the APPLE (device) scale, the source's calibrated HRV daily median (~47ms) "
                "lands almost exactly on his own age band (~47). The earlier 'sits below his "
                "band' reading was an artifact of comparing Apple-scale data to ECG-scale norms "
                "(~8.3ms offset), not evidence about him -- he is unremarkable on device-scale "
                "norms, NOT high and NOT low. within-person daily sd and lag-1 autocorrelation "
                "stay `calibrated` but may include state-driven excursions and likely overstate "
                "variability for an unaffected individual. No flare/episode periods were "
                "identified or extracted (no labels; inferring them from the signal we model "
                "would be circular). Adding exports: POOL device_behavior, WIDEN physiology."
            ),
            "_privacy": "Source described technically only; no clinical detail recorded in this committed file.",
        },
        "change_log": {
            "source": "synthesized",
            "retraction_rate": 0.005,
            "_retraction_basis": "assumed ~0.5% of samples later deleted (HealthKit deletes/duplicates happen). Placeholder.",
            "backfill_event": {
                "probability_per_generation": 0.05, "max_lag_days": 30,
                "_basis": "assumed: a rare device-restore backfill delivers old records at once. Bounded on purpose -- the export's 5.6yr max lag is an outlier we do NOT size from; sync code must merely survive one.",
            },
        },
        # Wear is night-vs-day, then a per-metric recording gate conditional on
        # wear (see device_behavior[m].recording). Night is binary per NIGHT (nobody
        # removes the watch at 3am); day is a wear state plus gates.
        "wear_model": {
            "day": {"source": "assumed", "hours": [7, 23], "wear_prob": 0.90,
                    "_basis": "assumed; recent steady daytime wear ~90%. The pooled 75% coverage is a ~2-month-outage (Dec2025-Feb2026) artifact, not the typical rate."},
            "night": {"source": "assumed", "model": "per-night-bernoulli", "hours": [23, 7], "wear_prob": 0.40,
                      "_basis": "assumed and UNSTABLE -- NOT a measured rate. Overnight-wear proxy (RespiratoryRate presence) by block is 0,0,0,0,0,0,0,0,46,29,0,0,43,100 (%); the last is a 2-day stub and two May blocks are 0 between 29 and 43. ~0.40 is a rough recent central value. Whole sleep window covered or none."},
            "streakiness": {"todo": True,
                            "_note": "TODO: a 2-state (worn/not) run-length model to reproduce the Dec2025-Feb2026 ~2-month outage. Independent per-night/day Bernoulli scatters missing days evenly and cannot produce a multi-week gap. Deferred as the largest change."},
        },
        "device_behavior": {},
        "physiology": {},
    }

    # Hour-of-day placement is not one category (finding #9): device-driven for a
    # daily-summary timestamp, activity-emergent for heart rate, partly-behavioral
    # for HRV (when the wearer was still enough to read).
    HOUR_MODE = {"RestingHeartRate": "device", "HeartRate": "emergent", "HeartRateVariabilitySDNN": "partly"}

    # Per-metric RECORDING gate (conditional on wear -- see wear_model). What makes
    # a sample get written once the watch is on.
    RECORDING = {
        "HeartRate": {
            "gate": "wear-only", "cadence": "two-regime",
            "background_gap_s": 300, "burst_gap_s": 6,
            "_note": "HR records whenever worn (no stillness gate). Burst CADENCE (~6s) is a DEVICE property (calibrated); burst FREQUENCY/how-often-active is a PERSON property from the activity model / fitness_index -- kept SEPARATE so the pooled window doesn't bake in this individual's exercise frequency as device behavior.",
        },
        "HeartRateVariabilitySDNN": {
            "gate": "still-periods", "cadence": "poisson",
            "day_gate_per_hour": 0.17, "night_gate_per_hour": 0.27,
            "_basis": "day 0.17 = HRV present in 17% of worn day-hours (worn-active split). night 0.27 = HRV present in 27% of ACTUAL asleep hour-cells (SleepAnalysis, 14 nights -- thin, assumed); ABOVE daytime as expected since sleep is stillest. Poisson/exponential gaps; observed p95/p50=3.85 is slightly lighter-tailed than exponential (4.32), so Poisson marginally over-produces long gaps.",
        },
        "RestingHeartRate": {
            "gate": "daily-summary", "cadence": "none",
            "_note": "NOT a sampling process. Present iff the day had sufficient quiet coverage (i.e. worn); emitted once end-of-day at arrival_lag. No intraday cadence.",
        },
    }

    # Enabled metrics: calibrated device_behavior + physiology.
    for k in enabled:
        t = types.get(REGISTRY[k]["identifier"])
        if not t:
            out["device_behavior"][k] = {"source": "synthesized", "_stub": True, "_note": "enabled but absent from summary"}
            continue
        db = dev_behavior_from_summary(t, HOUR_MODE.get(k, "device"))
        if k == "HeartRate":
            # Finding #8: single sourceName, so the ~6s median gap alongside a
            # multi-minute p95 is genuine BIMODAL burst sampling, not near-duplicate
            # writes from multiple sources. The dense-intraday model needs two modes.
            db["intra_day_gap_seconds"]["_regime"] = (
                "BIMODAL, single source (verified: one sourceName). p50 ~6-7s is workout burst "
                "sampling; p95 ~7min is the still/background regime. Model as two modes "
                "(background ~5min when still + burst seconds during activity), burst driven by "
                "the activity model (see physiology.HeartRate), NOT one distribution.")
            out["physiology"][k] = heart_rate_physiology(t)
        else:
            within_dist = {"HeartRateVariabilitySDNN": "lognormal", "RestingHeartRate": "normal"}[k]
            phys = {"within_person": within_person_from_summary(t, within_dist)}
            phys.update(PHYSIOLOGY_SYNTH.get(k, {}))
            out["physiology"][k] = phys
        db["recording"] = RECORDING[k]
        out["device_behavior"][k] = db

    # Disabled metrics: present but stubbed, so enabling later is fill-in not add.
    for k, reg in REGISTRY.items():
        if reg["enabled"] or k == "SleepAnalysis":
            continue
        stub = {"source": "synthesized", "enabled": False, "_stub": True, "_reason": reg["reason"]}
        out["device_behavior"][k] = dict(stub)
        out["physiology"][k] = dict(stub)

    # Sleep: split across the two sections by provenance principle, not code kind.
    #   device_behavior -> segmentation granularity + recording cadence
    #   physiology       -> stage fractions + total duration
    sl = s.get("sleep") or {}
    seg = sl.get("segments_per_night") or {}
    out["device_behavior"]["SleepAnalysis"] = {
        "source": "synthesized", "enabled": False,
        "_reason": "only %s staged nights observed; insufficient to calibrate" % sl.get("nights_with_stage_data"),
        "segmentation": {"_note": "segments-per-night distribution NOT yet authored (synthesized-pending). The observed values are in observed_sanity_check; too few staged nights to adopt as calibrated."},
        "recording_cadence": {"_note": "one sleep session per night, segmented by stage; cadence authored when enabled."},
        "observed_sanity_check": {
            "staged_nights": sl.get("nights_with_stage_data"),
            "observed_segments_per_night": {"p50": seg.get("p50"), "p95": seg.get("p95"),
                                             "_note": "OBSERVED from the staged nights (not synthesized); not adopted as a parameter because n is too small."},
        },
    }
    out["physiology"]["SleepAnalysis"] = {
        "source": "synthesized", "enabled": False,
        "stage_fractions_of_asleep": {"distribution": "dirichlet", "core": 0.50, "deep": 0.18, "rem": 0.22, "awake_in_bed": 0.10,
                                       "_basis": "literature: adult architecture ~50% N1-N2(core), ~15-20% deep(N3), ~20-25% REM. Dirichlet keeps the four fractions summing to 1 when drawn per night."},
        "total_asleep_minutes": {"distribution": "normal", "mean": 420, "sd": 55,
                                  "_basis": "literature: adult ~7h; observed p50 here is a consistency check."},
        "observed_sanity_check": {"asleep_min_per_staged_night_p50": (sl.get("total_asleep_minutes_per_staged_night") or {}).get("p50")},
    }

    with open(args.out, "w") as f:
        json.dump(out, f, indent=2)
    print("Wrote %s" % args.out)
    print("Enabled metrics: %s" % ", ".join(enabled))


if __name__ == "__main__":
    main()
