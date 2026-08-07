// The TODAY tab — the daily check-in. PRESENTATION ONLY: it renders the view model
// from getDailyStory (src/data/appData) and never touches the provider, samples,
// score.ts or series.ts. Three states driven by the model's `status`:
//   learning     no score; "Learning your baseline", progress, N OF 14 DAYS
//   provisional  score + a "Provisional" banner (left rule) above it
//   full         score only
// Each metric row shows a chart of the model's deviation-or-raw series (fit to the
// data width; gaps read as gaps). Loading + error paths exist even though the local
// generator never errors — they're needed once this is a network call.

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { getDailyStory, type DailyStory, type MetricRow } from "@/src/data/appData";

const round = (n: number) => Math.round(n);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });
const CHART_W = Dimensions.get("window").width - 48; // screen minus the 24px page padding
const DEV_H = 82;

const SPECTRUM = ["#3E9E5B", "#63A84C", "#8CB03F", "#B2A63A", "#CE8B39", "#D96F3C", "#D8523E", "#C43C2E"];
// Presentation, keyed by the model's identifiers — kept in the screen (client theming;
// UI copy stays localizable here rather than behind the data boundary).
const ICON: Record<MetricRow["key"], keyof typeof MaterialCommunityIcons.glyphMap> = { hrv: "pulse", rhr: "heart-outline" };
const METRIC_COLOR: Record<MetricRow["key"], string> = { hrv: "#3E7CB0", rhr: "#C4603C" };
const EMPTY_COPY: Record<MetricRow["key"], string> = { hrv: "No readings yet", rhr: "First reading arrives tonight" };
const WORD_COLOR: Record<string, string> = { Calm: "#3E9E5B", Steady: "#B07A3C", Warming: "#DE8A3A", Elevated: "#E05A45", "Running hot": "#C43C2E" };

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const [story, setStory] = useState<DailyStory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setStory(null);
      setError(null);
      getDailyStory()
        .then((s) => alive && setStory(s))
        .catch((e) => alive && setError(String(e)));
      return () => { alive = false; };
    }, [reload]),
  );

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Couldn't load your day.</Text>
          <Pressable onPress={() => setReload((n) => n + 1)} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : !story ? (
        <View style={styles.center}><ActivityIndicator color="#C43C2E" /></View>
      ) : (
        <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }}>
          <Body story={story} />
        </ScrollView>
      )}
      {/* Opaque cover over the status-bar strip so scrolled content can't collide with it. */}
      <View style={[styles.statusCover, { height: insets.top }]} />
    </View>
  );
}

function Body({ story }: { story: DailyStory }) {
  const { status, daysOfHistory, score, metrics, hasProfile } = story;
  return (
    <>
      {!hasProfile ? (
        <Text style={styles.muted}>No profile yet. Finish onboarding to begin.</Text>
      ) : status === "learning" ? (
        <Learning days={daysOfHistory} />
      ) : (
        <>
          {status === "provisional" && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                <Text style={styles.bannerLead}>Provisional. </Text>
                Day {daysOfHistory} of monitoring. Your score is shown with low confidence while data is limited — 28 days gives a much steadier picture.
              </Text>
            </View>
          )}
          {score ? <Score score={score} /> : <Text style={styles.muted}>Gathering enough readings to score…</Text>}
        </>
      )}

      <View style={styles.metrics}>
        {metrics.map((row) => <Metric key={row.key} row={row} />)}
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

function Score({ score }: { score: NonNullable<DailyStory["score"]> }) {
  const tickPct = clamp((score.heat / 5) * 100, 1, 99);
  return (
    <View>
      <Text style={styles.kicker}>TODAY · THREE-DAY AVERAGE</Text>
      <Text style={[styles.word, { color: WORD_COLOR[score.word] }]}>{score.word}</Text>
      <Text style={styles.outOf}>{score.heat.toFixed(1)} out of 5</Text>
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
      <Text style={styles.sentence}>{score.sentence}</Text>
    </View>
  );
}

// DEVIATION mode centres on a zero (baseline) line; RAW mode autoscales to the values
// (no zero line — 0 isn't meaningful for raw HRV/HR). x is fit to the data span; >=2
// points -> line; 1 point -> dot; 0 -> nothing (header shows the value).
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

function Metric({ row }: { row: MetricRow }) {
  // Header is just label + raw value, left-aligned above the full-width chart. The
  // chart plots DEVIATION (its zero line is the baseline), so above/below reads visually.
  const valueStr = row.value != null ? `${round(row.value)} ${row.unit}` : null;
  return (
    <View style={styles.metric}>
      <View style={styles.metricHeadLeft}>
        <MaterialCommunityIcons name={ICON[row.key]} size={16} color="#666" style={{ marginRight: 7 }} />
        <Text style={styles.metricLabel}>{row.label}</Text>
      </View>
      <Text style={valueStr == null ? styles.metricEmpty : styles.metricValueHead}>{valueStr ?? EMPTY_COPY[row.key]}</Text>
      <MetricChart points={row.series} mode={row.mode} color={METRIC_COLOR[row.key]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statusCover: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "#FFFFFF" },
  muted: { fontSize: 15, color: "#888", marginVertical: 24, fontFamily: SERIF },
  retry: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: "#F0F0F0" },
  retryText: { fontSize: 15, fontWeight: "600", color: "#444", fontFamily: SERIF },
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
  progressFill: { height: 8, borderRadius: 4, backgroundColor: "#3A3A3A" },
  progressLabel: { fontSize: 13, letterSpacing: 1, color: "#999", fontWeight: "600", marginTop: 8 },

  metrics: { marginTop: 34 },
  metric: { paddingTop: 20, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E6E6E6" },
  metricHeadLeft: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  metricLabel: { fontSize: 15, fontWeight: "600", color: "#555", fontFamily: SERIF },
  metricValueHead: { fontSize: 18, fontWeight: "700", color: "#1A1A1A", fontFamily: SERIF },
  metricEmpty: { fontSize: 15, color: "#BBB", fontStyle: "italic", fontFamily: SERIF },
});
