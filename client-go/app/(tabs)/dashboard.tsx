// The TODAY tab — the daily check-in. Three states driven by DAYS OF HISTORY:
//   1-14   LEARNING    no score; "Learning your baseline", progress, N OF 14 DAYS
//   15-27  PROVISIONAL score + a "Provisional" banner (left rule) above it
//   28+    FULL        score only
//
// The two metric rows BOTH reference the latest day where BOTH have settled data
// (HRV lags ~62s, resting HR ~17.5h, so each metric's own latest is a different day).
// Each row shows a chart: DEVIATION from personal baseline (σ) once a baseline exists,
// or the RAW daily values during the early learning period (real data, no baseline
// yet). The window is fit to the DATA — earliest present point at the left edge — so
// it fills the width; day spacing stays truthful, so wear gaps read as gaps.
//
// Data is on-device: persisted profile -> buildProvider -> sample stream -> score.ts.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Dimensions, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
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
const CHART_W = Dimensions.get("window").width - 48; // screen minus the 24px page padding
const DEV_H = 82;

const SPECTRUM = ["#3E9E5B", "#63A84C", "#8CB03F", "#B2A63A", "#CE8B39", "#D96F3C", "#D8523E", "#C43C2E"];
const WORD_COLOR: Record<string, string> = { Calm: "#3E9E5B", Steady: "#B07A3C", Warming: "#DE8A3A", Elevated: "#E05A45", "Running hot": "#C43C2E" };

// Direction-aware read. HRV: LOWER is the concerning direction (a drop). Resting HR:
// HIGHER is concerning. Takes the SAME natural-sign deviations shown in the metric
// rows (HRV<0 = below, RHR>0 = above) so the sentence can never contradict them.
// Template for now — LLM later.
function stateSentence(hrvDev: number | null, rhrDev: number | null): string {
  const hrvLow = hrvDev != null && hrvDev <= -1; // HRV below its baseline (concerning)
  const rhrHigh = rhrDev != null && rhrDev >= 1; // resting HR above its baseline (concerning)
  if (hrvLow && rhrHigh) return "Your heart-rate variability is below your usual and your resting heart rate is above it — both point toward more strain. Consider an easier day.";
  if (rhrHigh) return "Your resting heart rate is running above your usual, while your heart-rate variability is holding. Worth keeping an eye on.";
  if (hrvLow) return "Your heart-rate variability has dipped below your usual, while your resting heart rate is steady. Worth a glance.";
  return "Your heart-rate variability and resting heart rate are both close to your usual — nothing standing out.";
}

interface MetricView {
  value: number | null; // raw daily mean at the shown day (clinician number)
  unit: string;
  devSigma: number | null; // signed deviation from baseline, σ (natural sign: HRV<0 low, RHR>0 high)
  concerningSign: -1 | 1; // direction that is concerning (HRV below = -1, RHR above = +1)
  color: string;
  chart: { t: number; v: number }[]; // present points only; t = day index (honest spacing), v = deviation or raw
  mode: "deviation" | "raw"; // raw during early learning (no baseline yet)
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
  ownLatestAllowed: boolean, zOf: (r: ScoreResult) => number | null, naturalMul: 1 | -1, unit: string, concerningSign: -1 | 1, color: string,
): MetricView {
  const dayForVal = commonDay ?? (ownLatestAllowed && daily.size ? Math.max(...daily.keys()) : null);
  const value = dayForVal != null ? daily.get(dayForVal) ?? null : null;
  const devAt = (d: number): number | null => { const r = byDay.get(d); const z = r ? zOf(r) : null; return z == null ? null : naturalMul * z; };
  const devSigma = dayForVal != null ? devAt(dayForVal) : null;

  // Deviation once a baseline exists; raw daily values during early learning.
  const useDeviation = devSigma != null;
  const chart: { t: number; v: number }[] = [];
  if (dayForVal != null) {
    for (let d = dayForVal - 6; d <= dayForVal; d++) {
      const v = useDeviation ? devAt(d) : daily.has(d) ? daily.get(d)! : null;
      if (v != null) chart.push({ t: d, v });
    }
  }
  return { value, unit, devSigma, concerningSign, color, chart, mode: useDeviation ? "deviation" : "raw" };
}

const EMPTY: MetricView = { value: null, unit: "", devSigma: null, concerningSign: 1, color: "#999", chart: [], mode: "raw" };

interface TodayData {
  hasProfile: boolean;
  daysOfHistory: number;
  today: ScoreResult | null;
  hrv: MetricView;
  rhr: MetricView;
}

async function loadToday(): Promise<TodayData> {
  const profile = await loadOnboarding(asyncStorageAdapter);
  if (!profile) return { hasProfile: false, daysOfHistory: 0, today: null, hrv: EMPTY, rhr: EMPTY };

  const now = Date.now();
  const daysOfHistory = Math.max(1, Math.floor((now - Date.parse(profile.startDate)) / DAY));
  const provider = buildProvider(profile, { now: () => now });
  const opts = { from: new Date(Date.parse(profile.startDate)), to: new Date(now + DAY) };
  const [hrv, rhr] = await Promise.all([provider.queryQuantitySamples(HRV, opts), provider.queryQuantitySamples(RHR, opts)]);

  const series = scoreSeries(hrv, rhr, profile.startDate, iso(now)); // full history -> correct hysteresis at today
  const today = series[series.length - 1] ?? null;
  const byDay = new Map(series.map((r) => [Math.floor(Date.parse(r.day) / DAY), r]));

  const hrvDaily = dailyMeans(hrv), rhrDaily = dailyMeans(rhr);
  const common = [...hrvDaily.keys()].filter((d) => rhrDaily.has(d));
  const commonDay = common.length ? Math.max(...common) : null;

  return {
    hasProfile: true, daysOfHistory, today,
    hrv: metricView(hrvDaily, byDay, commonDay, true, (r) => r.hrvZ, -1, "ms", -1, "#3E7CB0"),
    rhr: metricView(rhrDaily, byDay, commonDay, false, (r) => r.rhrZ, 1, "bpm", 1, "#C4603C"),
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

  return (
    <View style={styles.container}>
      {!data ? (
        <View style={styles.center}><ActivityIndicator color="#C43C2E" /></View>
      ) : (
        <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }}>
          <Body data={data} />
        </ScrollView>
      )}
      {/* Opaque cover over the status-bar strip so scrolled content can't collide with it. */}
      <View style={[styles.statusCover, { height: insets.top }]} />
    </View>
  );
}

function Body({ data }: { data: TodayData }) {
  const { daysOfHistory, today, hrv, rhr, hasProfile } = data;
  const phase = daysOfHistory < 15 ? "learning" : daysOfHistory < 28 ? "provisional" : "full";
  const hasScore = today != null && today.heat != null;
  return (
    <>
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
          {hasScore ? <Score today={today!} sentence={stateSentence(hrv.devSigma, rhr.devSigma)} /> : <Text style={styles.muted}>Gathering enough readings to score…</Text>}
        </>
      )}

      <View style={styles.metrics}>
        <Metric icon="pulse" label="Heart rate variability" v={hrv} empty="No readings yet" />
        <Metric icon="heart-outline" label="Resting heart rate" v={rhr} empty="First reading arrives tonight" />
      </View>
    </>
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

function Score({ today, sentence }: { today: ScoreResult; sentence: string }) {
  const heat = today.heat ?? 0;
  const word = heatWord(heat);
  const color = WORD_COLOR[word];
  const tickPct = clamp((heat / 5) * 100, 1, 99);
  return (
    <View>
      <Text style={styles.kicker}>TODAY · THREE-DAY AVERAGE</Text>
      <Text style={[styles.word, { color }]}>{word}</Text>
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
      <Text style={styles.sentence}>{sentence}</Text>
    </View>
  );
}

// The chart carries the row. DEVIATION mode centres on a zero (baseline) line; RAW mode
// autoscales to the values (no zero line — 0 isn't meaningful for raw HRV/HR). x is fit
// to the data span (earliest present point at the left edge), spacing by day so a gap
// reads as a gap. >=2 points -> line; 1 point -> dot; 0 -> nothing (header shows value).
function MetricChart({ points, mode, color }: { points: { t: number; v: number }[]; mode: "deviation" | "raw"; color: string }) {
  if (points.length === 0) return null;
  const padY = 12, edge = 4;
  const plotH = DEV_H - padY * 2;
  const ts = points.map((p) => p.t);
  const minT = Math.min(...ts), maxT = Math.max(...ts);
  const X = (t: number) => (minT === maxT ? CHART_W / 2 : edge + ((t - minT) / (maxT - minT)) * (CHART_W - edge * 2));
  let Y: (v: number) => number;
  let zeroY: number | null = null;
  if (mode === "deviation") {
    const MAX = Math.max(2.5, ...points.map((p) => Math.abs(p.v)));
    Y = (v) => padY + (1 - (v + MAX) / (2 * MAX)) * plotH;
    zeroY = Y(0);
  } else {
    const vs = points.map((p) => p.v);
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (hi - lo < 1) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.18; lo -= pad; hi += pad;
    Y = (v) => padY + (1 - (v - lo) / (hi - lo)) * plotH;
  }
  const line = points.length >= 2 ? points.map((p) => `${X(p.t)},${Y(p.v)}`).join(" ") : null;
  return (
    <Svg width={CHART_W} height={DEV_H} style={{ marginTop: 8 }}>
      {zeroY != null && <Line x1={0} x2={CHART_W} y1={zeroY} y2={zeroY} stroke="#EAEAEA" strokeWidth={1} />}
      {line && <Polyline points={line} fill="none" stroke={color} strokeWidth={2.5} />}
      {points.map((p, i) => <Circle key={i} cx={X(p.t)} cy={Y(p.v)} r={points.length === 1 ? 3.5 : 2.5} fill={color} />)}
    </Svg>
  );
}

function Metric({ icon, label, v, empty }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; v: MetricView; empty: string }) {
  // No numeric σ label (jargon). The chart plots DEVIATION and its zero line IS the
  // baseline, so above/below reads visually. Header is just label + raw value, stacked
  // and left-aligned above the full-width chart.
  const valueStr = v.value != null ? `${round(v.value)} ${v.unit}` : null;
  return (
    <View style={styles.metric}>
      <View style={styles.metricHeadLeft}>
        <MaterialCommunityIcons name={icon} size={16} color="#666" style={{ marginRight: 7 }} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={valueStr == null ? styles.metricEmpty : styles.metricValueHead}>{valueStr ?? empty}</Text>
      <MetricChart points={v.chart} mode={v.mode} color={v.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statusCover: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "#FFFFFF" },
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
  // Neutral ink — NOT a spectrum colour: green/red would imply a score during a state that has none.
  progressFill: { height: 8, borderRadius: 4, backgroundColor: "#3A3A3A" },
  progressLabel: { fontSize: 13, letterSpacing: 1, color: "#999", fontWeight: "600", marginTop: 8 },

  metrics: { marginTop: 34 },
  metric: { paddingTop: 20, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E6E6E6" },
  metricHeadLeft: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  metricLabel: { fontSize: 15, fontWeight: "600", color: "#555", fontFamily: SERIF },
  metricValueHead: { fontSize: 18, fontWeight: "700", color: "#1A1A1A", fontFamily: SERIF },
  metricEmpty: { fontSize: 15, color: "#BBB", fontStyle: "italic", fontFamily: SERIF },
});
