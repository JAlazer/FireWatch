// The TODAY tab — the daily check-in. Three states driven by DAYS OF HISTORY:
//   1-14   LEARNING    no score; "Learning your baseline", progress, N OF 14 DAYS
//   15-27  PROVISIONAL score + a "Provisional" banner (left rule) above it
//   28+    FULL        score only
//
// The two metric rows BOTH reference the latest day where BOTH have settled data —
// never each metric's own latest, because HRV (arrival lag ~62s) is usually today
// while resting HR (~17.5h, computed end-of-day) is usually yesterday; comparing
// different days hides co-movement. Each row shows DEVIATION from personal baseline
// (σ — a comparable scale; raw values can't show co-movement) plus the raw value
// (for anything reported to a clinician) and a 7-day deviation sparkline.
//
// Data is on-device: persisted profile -> buildProvider -> sample stream -> score.ts.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { REGISTRY } from "@/src/mock/registry";
import { heatWord, scoreSeries, type ScoreResult } from "@/src/mock/score";
import { buildProvider } from "@/src/providers/buildProvider";
import { asyncStorageAdapter } from "@/src/storage/asyncStorage";
import { loadOnboarding } from "@/src/storage/onboardingStore";

const DAY = 86_400_000;
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
const iso = (ms: number) => new Date(ms).toISOString();
const round = (n: number) => Math.round(n);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

const SPECTRUM = ["#3E9E5B", "#63A84C", "#8CB03F", "#B2A63A", "#CE8B39", "#D96F3C", "#D8523E", "#C43C2E"];

const WORD_STYLE: Record<string, { color: string; sentence: string }> = {
  Calm: { color: "#3E9E5B", sentence: "Your heart-rate variability and resting heart rate are at or below your baseline — nothing standing out." },
  Steady: { color: "#B07A3C", sentence: "Your heart-rate variability and resting heart rate have held steady this week — nothing standing out." },
  Warming: { color: "#DE8A3A", sentence: "A mild shift in your heart signals versus your baseline — worth keeping an eye on." },
  Elevated: { color: "#E05A45", sentence: "Both signals are running above your baseline. Consider an easier day." },
  "Running hot": { color: "#C43C2E", sentence: "Your signals are well above baseline. Rest, hydrate, and check in with how you feel." },
};

interface MetricView {
  value: number | null; // raw daily mean at the common settled day (clinician number)
  unit: string;
  devSigma: number | null; // signed deviation from baseline, in σ (natural sign: HRV<0 low, RHR>0 high)
  spark: number[]; // 7-day deviation series (signed σ), oldest -> newest
  concerningSign: -1 | 1; // direction that is concerning (HRV below = -1, RHR above = +1)
}
interface TodayData {
  hasProfile: boolean;
  daysOfHistory: number;
  today: ScoreResult | null;
  hrv: MetricView;
  rhr: MetricView;
}

function dailyMeans(samples: { quantity: number; startDate: Date }[]): Map<number, number> {
  const acc = new Map<number, { s: number; n: number }>();
  for (const x of samples) {
    const d = Math.floor(x.startDate.getTime() / DAY);
    const a = acc.get(d) ?? { s: 0, n: 0 };
    a.s += x.quantity; a.n += 1; acc.set(d, a);
  }
  const out = new Map<number, number>();
  for (const [d, a] of acc) out.set(d, a.s / a.n);
  return out;
}

function metricView(
  daily: Map<number, number>, byDay: Map<number, ScoreResult>, commonDay: number | null,
  ownLatestAllowed: boolean, zOf: (r: ScoreResult) => number | null, naturalMul: 1 | -1, unit: string, concerningSign: -1 | 1,
): MetricView {
  const dayForVal = commonDay ?? (ownLatestAllowed && daily.size ? Math.max(...daily.keys()) : null);
  const value = dayForVal != null ? daily.get(dayForVal) ?? null : null;
  const devAt = (d: number): number | null => { const r = byDay.get(d); const z = r ? zOf(r) : null; return z == null ? null : naturalMul * z; };
  const devSigma = commonDay != null ? devAt(commonDay) : null;
  const spark: number[] = [];
  if (commonDay != null) for (let d = commonDay - 6; d <= commonDay; d++) { const v = devAt(d); if (v != null) spark.push(v); }
  return { value, unit, devSigma, spark, concerningSign };
}

const EMPTY: MetricView = { value: null, unit: "", devSigma: null, spark: [], concerningSign: 1 };

async function loadToday(): Promise<TodayData> {
  const profile = await loadOnboarding(asyncStorageAdapter);
  if (!profile) return { hasProfile: false, daysOfHistory: 0, today: null, hrv: EMPTY, rhr: EMPTY };

  const now = Date.now();
  const daysOfHistory = Math.max(1, Math.floor((now - Date.parse(profile.startDate)) / DAY));
  const provider = buildProvider(profile, { now: () => now });
  const opts = { from: new Date(Date.parse(profile.startDate)), to: new Date(now + DAY) };
  const [hrv, rhr] = await Promise.all([provider.queryQuantitySamples(HRV, opts), provider.queryQuantitySamples(RHR, opts)]);

  // Score the FULL history so the concordance hysteresis state is correct at "today".
  const series = scoreSeries(hrv, rhr, profile.startDate, iso(now));
  const today = series[series.length - 1] ?? null;
  const byDay = new Map(series.map((r) => [Math.floor(Date.parse(r.day) / DAY), r]));

  const hrvDaily = dailyMeans(hrv), rhrDaily = dailyMeans(rhr);
  // BOTH rows reference the SAME day: the latest day where both have settled data.
  const common = [...hrvDaily.keys()].filter((d) => rhrDaily.has(d));
  const commonDay = common.length ? Math.max(...common) : null;

  return {
    hasProfile: true, daysOfHistory, today,
    // HRV may show its own latest when there's no common day yet (day 1); RHR does not
    // (so day 1 reads "first reading arrives tonight" rather than a stale value).
    hrv: metricView(hrvDaily, byDay, commonDay, true, (r) => r.hrvZ, -1, "ms", -1),
    rhr: metricView(rhrDaily, byDay, commonDay, false, (r) => r.rhrZ, 1, "bpm", 1),
  };
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<TodayData | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setData(null);
      loadToday().then((d) => alive && setData(d));
      return () => { alive = false; };
    }, []),
  );

  if (!data) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#C43C2E" />
      </View>
    );
  }

  const { daysOfHistory, today, hrv, rhr, hasProfile } = data;
  const phase = daysOfHistory < 15 ? "learning" : daysOfHistory < 28 ? "provisional" : "full";
  const hasScore = today != null && today.heat != null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }}>
      {!hasProfile ? (
        <Text style={styles.muted}>No profile yet. Finish onboarding to begin.</Text>
      ) : phase === "learning" ? (
        <Learning days={daysOfHistory} />
      ) : (
        <>
          {phase === "provisional" && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                <Text style={styles.bannerLead}>Provisional. </Text>
                Day {daysOfHistory} of monitoring. Your score is shown with low confidence while data is limited — 28 days gives a much steadier picture.
              </Text>
            </View>
          )}
          {hasScore ? <Score today={today!} /> : <Text style={styles.muted}>Gathering enough readings to score…</Text>}
        </>
      )}

      <View style={styles.metrics}>
        <Metric icon="pulse" label="Heart rate variability" v={hrv} empty="No readings yet" />
        <Metric icon="heart-outline" label="Resting heart rate" v={rhr} empty="First reading arrives tonight" />
      </View>
    </ScrollView>
  );
}

function Learning({ days }: { days: number }) {
  const shown = Math.min(days, 14);
  const sentence =
    days <= 1
      ? "Wear your watch to bed tonight — overnight is where the clearest signal is, and your first full reading lands in the morning."
      : "We're learning what's normal for you. Your first estimate appears on day 15.";
  return (
    <View>
      <Text style={styles.kicker}>TODAY</Text>
      <Text style={styles.learnTitle}>Learning your baseline</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(shown / 14) * 100}%` }]} />
      </View>
      <Text style={styles.progressLabel}>{shown} OF 14 DAYS</Text>
      <Text style={styles.sentence}>{sentence}</Text>
    </View>
  );
}

function Score({ today }: { today: ScoreResult }) {
  const heat = today.heat ?? 0;
  const word = heatWord(heat);
  const style = WORD_STYLE[word];
  const tickPct = clamp((heat / 5) * 100, 1, 99);
  return (
    <View>
      <Text style={styles.kicker}>TODAY · THREE-DAY AVERAGE</Text>
      <Text style={[styles.word, { color: style.color }]}>{word}</Text>
      <Text style={styles.outOf}>{heat.toFixed(1)} out of 5</Text>
      <View style={styles.barRow}>
        {SPECTRUM.map((c, i) => (
          <View key={i} style={[styles.seg, { backgroundColor: c }, i === 0 && styles.segStart, i === SPECTRUM.length - 1 && styles.segEnd]} />
        ))}
        <View style={[styles.tick, { left: `${tickPct}%` }]} />
      </View>
      <View style={styles.barLabels}>
        <Text style={styles.barLabel}>CALM</Text>
        <Text style={styles.barLabel}>RUNNING HOT</Text>
      </View>
      <Text style={styles.sentence}>{style.sentence}</Text>
    </View>
  );
}

// A tiny bar sparkline of the deviation series (no chart dependency). Bars rise above
// / fall below a faint centre line by |σ|; fixed 7-day window from the caller.
function Spark({ series }: { series: number[] }) {
  const H = 26, W = 3, GAP = 3, MAX = 2.5;
  return (
    <View style={{ width: series.length * (W + GAP), height: H, justifyContent: "center" }}>
      <View style={{ position: "absolute", left: 0, right: 0, top: H / 2, height: StyleSheet.hairlineWidth, backgroundColor: "#E4E4E4" }} />
      <View style={{ flexDirection: "row", gap: GAP }}>
        {series.map((v, i) => {
          const h = clamp(Math.abs(v) / MAX, 0.06, 1) * (H / 2);
          const up = v >= 0;
          return (
            <View key={i} style={{ width: W, height: H }}>
              <View style={{ position: "absolute", left: 0, width: W, height: h, borderRadius: 1, backgroundColor: "#C4C4C4", top: up ? H / 2 - h : H / 2 }} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Metric({ icon, label, v, empty }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; v: MetricView; empty: string }) {
  const valueStr = v.value != null ? `${round(v.value)} ${v.unit}` : null;
  const concerning = v.devSigma != null && Math.sign(v.devSigma) === v.concerningSign && Math.abs(v.devSigma) >= 1;
  const devStr = v.devSigma != null ? `${Math.abs(v.devSigma).toFixed(1)}σ ${v.devSigma < 0 ? "below" : "above"} baseline` : null;
  return (
    <View style={styles.metric}>
      <MaterialCommunityIcons name={icon} size={22} color="#555" style={styles.metricIcon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.metricLabel}>{label}</Text>
        {valueStr == null ? (
          <Text style={styles.metricEmpty}>{empty}</Text>
        ) : (
          <View style={styles.metricRow}>
            <View>
              {devStr != null ? (
                <>
                  <Text style={[styles.dev, { color: concerning ? "#C4603C" : "#777" }]}>{devStr}</Text>
                  <Text style={styles.metricRaw}>{valueStr}</Text>
                </>
              ) : (
                <Text style={styles.metricValueOnly}>{valueStr}</Text>
              )}
            </View>
            {v.spark.length >= 5 && <Spark series={v.spark} />}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { alignItems: "center", justifyContent: "center" },
  muted: { fontSize: 15, color: "#888", marginVertical: 24, fontFamily: SERIF },
  kicker: { fontSize: 13, letterSpacing: 2, color: "#9A9A9A", fontWeight: "600", marginBottom: 10 },
  sentence: { fontSize: 18, color: "#333", lineHeight: 27, marginTop: 22, fontFamily: SERIF },

  banner: { borderLeftWidth: 3, borderLeftColor: "#222", paddingLeft: 16, marginBottom: 30 },
  bannerText: { fontSize: 17, color: "#444", lineHeight: 25, fontFamily: SERIF },
  bannerLead: { fontWeight: "700", color: "#111" },

  word: { fontSize: 52, fontFamily: SERIF, fontWeight: "700" },
  outOf: { fontSize: 20, color: "#333", fontFamily: SERIF, marginTop: 2 },

  barRow: { flexDirection: "row", height: 10, marginTop: 22, position: "relative" },
  seg: { flex: 1, height: 10 },
  segStart: { borderTopLeftRadius: 5, borderBottomLeftRadius: 5 },
  segEnd: { borderTopRightRadius: 5, borderBottomRightRadius: 5 },
  tick: { position: "absolute", top: -3, width: 3, height: 16, backgroundColor: "#111", borderRadius: 1, marginLeft: -1.5 },
  barLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  barLabel: { fontSize: 12, letterSpacing: 1.5, color: "#9A9A9A", fontWeight: "600" },

  learnTitle: { fontSize: 34, fontWeight: "700", color: "#222", fontFamily: SERIF, marginBottom: 20 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: "#F0F0F0", overflow: "hidden" },
  // Neutral ink — NOT a spectrum colour: green/red would imply a score during a state
  // that deliberately has none. Ink reads as progress, not status.
  progressFill: { height: 8, borderRadius: 4, backgroundColor: "#3A3A3A" },
  progressLabel: { fontSize: 13, letterSpacing: 1, color: "#999", fontWeight: "600", marginTop: 8 },

  metrics: { marginTop: 40 },
  metric: { flexDirection: "row", alignItems: "center", paddingVertical: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E6E6E6" },
  metricIcon: { marginRight: 16 },
  metricLabel: { fontSize: 19, fontWeight: "600", color: "#1A1A1A", fontFamily: SERIF, marginBottom: 4 },
  metricRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dev: { fontSize: 16, fontWeight: "600", fontFamily: SERIF },
  metricRaw: { fontSize: 14, color: "#999", marginTop: 2, fontFamily: SERIF },
  metricValueOnly: { fontSize: 20, fontWeight: "700", color: "#222", fontFamily: SERIF },
  metricEmpty: { fontSize: 16, color: "#BBB", fontStyle: "italic", fontFamily: SERIF },
});
