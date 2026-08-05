// TRENDS tab — RAW HRV and resting heart rate over time (no score; that comes later).
// PRESENTATION ONLY: renders the view model from getTrendSeries (src/data/appData) —
// no provider, samples or series.ts here.
//
// Two STACKED charts (HRV over resting HR), each with its OWN auto-scaled y-axis so a
// small-but-real RHR move fills its range instead of vanishing next to HRV's larger
// swing. X-axes are VERTICALLY ALIGNED (same window, same pixel positions) so reading
// down a column compares the same day. Gaps are shown as gaps — never interpolated.
// Loading + error paths exist even though the local generator never errors.

import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { getTrendSeries, type Point, type RangeKey, type TrendSeries } from "@/src/data/appData";

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });
const CHART_W = Dimensions.get("window").width - 48;
const RANGES: RangeKey[] = ["7D", "1M", "1Y", "ALL"];

export default function TrendsScreen() {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<RangeKey>("1M");
  const [data, setData] = useState<TrendSeries | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setData(null);
      setError(null);
      getTrendSeries(range)
        .then((d) => alive && setData(d))
        .catch((e) => alive && setError(String(e)));
      return () => { alive = false; };
    }, [range, reload]),
  );

  const note = resNote(range, data);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }}>
      <Text style={styles.kicker}>TRENDS</Text>

      <View style={styles.selector}>
        {RANGES.map((r) => (
          <Pressable key={r} onPress={() => setRange(r)} style={[styles.rangeBtn, range === r && styles.rangeBtnOn]}>
            <Text style={[styles.rangeText, range === r && styles.rangeTextOn]}>{r}</Text>
          </Pressable>
        ))}
      </View>
      {note && <Text style={styles.note}>{note}</Text>}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.empty}>Couldn't load your trends.</Text>
          <Pressable onPress={() => setReload((n) => n + 1)} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable>
        </View>
      ) : !data ? (
        <ActivityIndicator color="#888" style={{ marginTop: 60 }} />
      ) : !data.hasProfile ? (
        <Text style={styles.empty}>No profile yet. Finish onboarding to begin.</Text>
      ) : (
        <>
          {/* Score on top (the output), then its inputs HRV and resting HR. */}
          <ScoreChart points={data.score.points} refLine={data.score.baseline} provisional={data.score.provisional} />
          <Chart title="Heart rate variability" unit="ms" points={data.hrv.points} baseline={data.hrv.baseline} color="#3E7CB0" />
          <Chart title="Resting heart rate" unit="bpm" points={data.rhr.points} baseline={data.rhr.baseline} color="#C4603C" />
          <DateAxis points={data.rhr.points} />
        </>
      )}
    </ScrollView>
  );
}

function resNote(range: RangeKey, data: TrendSeries | null): string | null {
  if (!data || !data.hasProfile) return null;
  if (data.dropped) return `Only ${data.spanDays} days of history so far — showing daily points until there's enough for ${range === "1Y" ? "weekly" : "monthly"} averages.`;
  if (data.res === "week") return "Weekly averages — longer ranges are smoothed so the shape stays readable. The current week is still filling in (shown faded).";
  if (data.res === "month") return "Monthly averages — longer ranges are smoothed so the shape stays readable. The current month is still filling in (shown faded).";
  return null;
}

const CHART_H = 150;
const PAD = { l: 42, r: 14, t: 12, b: 10 };
const SPECTRUM = ["#3E9E5B", "#63A84C", "#8CB03F", "#B2A63A", "#CE8B39", "#D96F3C", "#D8523E", "#C43C2E"];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// The INFLAMMATION SCORE chart. Unlike HRV/RHR it uses a FIXED 0-5 scale with the heat
// spectrum drawn faintly behind the line — so a given height means a given level (the
// same visual language as the Today tab; auto-scaling would make a calm week look
// dramatic). Reference line is the 3.0 elevated threshold, not a baseline median (the
// score is already a deviation measure). Empty before day 15, shown anyway with a note
// so the layout doesn't jump. Same x-mapping as the other charts, so columns align.
function ScoreChart({ points, refLine, provisional }: { points: Point[]; refLine: number | null; provisional: boolean }) {
  const present = points.filter((p): p is Point & { value: number } => p.value != null);
  const plotW = CHART_W - PAD.l - PAD.r, plotH = CHART_H - PAD.t - PAD.b;
  const n = points.length;
  const X = (i: number) => PAD.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const Y = (v: number) => PAD.t + (1 - clamp(v, 0, 5) / 5) * plotH; // FIXED 0-5 axis

  // Break at gaps (learning days / wear); a partial-bucket segment is dashed + lighter.
  const connect = present.length >= 4;
  const segs: { d: string; dashed: boolean }[] = [];
  if (connect) {
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k], b = points[k + 1];
      if (a.value == null || b.value == null) continue;
      segs.push({ d: `${X(a.i)},${Y(a.value)} ${X(b.i)},${Y(b.value)}`, dashed: a.partial || b.partial });
    }
  }

  return (
    <View style={styles.chartBlock}>
      <Text style={styles.chartTitle}>Inflammation score <Text style={styles.chartUnit}>(0–5)</Text></Text>
      <Svg width={CHART_W} height={CHART_H}>
        {/* faint heat bands: green (calm) at the bottom, red (hot) at the top */}
        {SPECTRUM.map((c, k) => (
          <Rect key={k} x={PAD.l} y={PAD.t + (1 - (k + 1) / SPECTRUM.length) * plotH} width={plotW} height={plotH / SPECTRUM.length + 0.5} fill={c} opacity={0.12} />
        ))}
        {refLine != null && <Line x1={PAD.l} x2={CHART_W - PAD.r} y1={Y(refLine)} y2={Y(refLine)} stroke="#8A8A8A" strokeDasharray="3 3" strokeWidth={1} />}
        {refLine != null && <SvgText x={CHART_W - PAD.r} y={Y(refLine) - 4} fontSize={9} fill="#7A7A7A" textAnchor="end">elevated {refLine.toFixed(1)}</SvgText>}
        {segs.map((s, i) => <Polyline key={i} points={s.d} fill="none" stroke="#333" strokeWidth={2} strokeDasharray={s.dashed ? "4 3" : undefined} opacity={s.dashed ? 0.5 : 1} />)}
        {present.map((p) => <Circle key={p.i} cx={X(p.i)} cy={Y(p.value)} r={connect ? 1.6 : 3} fill="#333" opacity={p.partial ? 0.45 : 1} />)}
        {present.length === 0 && <SvgText x={PAD.l + plotW / 2} y={PAD.t + plotH / 2 + 4} fontSize={13} fill="#888" textAnchor="middle">Your score starts on day 15.</SvgText>}
      </Svg>
      {provisional && <Text style={styles.scoreNote}>Lighter, dashed line = provisional score — lower confidence until day 28.</Text>}
    </View>
  );
}

// LINE, not bar — deliberate:
//  - these are absolute values on a meaningful non-zero baseline (resting HR ~57);
//    bars from zero waste most of the height, and bars from the baseline would mislead.
//  - lines handle the gaps we build in — the line breaks where wear data is missing;
//    bars would need a separate absent-bar convention.
//  - matches Apple Health / Oura / Garmin, so it reads as familiar.
// Accepted counter-argument: at monthly resolution each point is a discrete bucket and
// a connecting line implies smooth movement that didn't happen.
function Chart({ title, unit, points, baseline, color }: { title: string; unit: string; points: Point[]; baseline: number | null; color: string }) {
  const present = points.filter((p): p is Point & { value: number } => p.value != null);
  const plotW = CHART_W - PAD.l - PAD.r, plotH = CHART_H - PAD.t - PAD.b;
  const fmt = (n: number) => `${Math.round(n)}`;

  if (present.length === 0) {
    return (
      <View style={styles.chartBlock}>
        <Text style={styles.chartTitle}>{title}</Text>
        <View style={[styles.noData, { width: CHART_W, height: CHART_H }]}><Text style={styles.noDataText}>No readings in this range</Text></View>
      </View>
    );
  }

  const ys = present.map((p) => p.value);
  if (baseline != null) ys.push(baseline);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.14; lo -= padY; hi += padY;
  const n = points.length;
  const X = (i: number) => PAD.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const Y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * plotH;

  // Connect consecutive present buckets; break at gaps (null). Only connect with >=4
  // points, so 2-3 points don't imply a trend. A segment touching a PARTIAL bucket (an
  // incomplete week/month — fewer days, noisier) is drawn dashed + lighter.
  const connect = present.length >= 4;
  const segs: { d: string; dashed: boolean }[] = [];
  if (connect) {
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k], b = points[k + 1];
      if (a.value == null || b.value == null) continue; // gap -> break the line
      segs.push({ d: `${X(a.i)},${Y(a.value)} ${X(b.i)},${Y(b.value)}`, dashed: a.partial || b.partial });
    }
  }

  return (
    <View style={styles.chartBlock}>
      <Text style={styles.chartTitle}>{title} <Text style={styles.chartUnit}>({unit})</Text></Text>
      <Svg width={CHART_W} height={CHART_H}>
        {baseline != null && (
          <>
            <Line x1={PAD.l} x2={CHART_W - PAD.r} y1={Y(baseline)} y2={Y(baseline)} stroke="#CFCFCF" strokeDasharray="3 3" strokeWidth={1} />
            <SvgText x={CHART_W - PAD.r} y={Y(baseline) - 4} fontSize={9} fill="#B0B0B0" textAnchor="end">baseline {fmt(baseline)}</SvgText>
          </>
        )}
        <SvgText x={PAD.l - 6} y={Y(hi) + 3} fontSize={10} fill="#AAA" textAnchor="end">{fmt(hi)}</SvgText>
        <SvgText x={PAD.l - 6} y={Y(lo) + 3} fontSize={10} fill="#AAA" textAnchor="end">{fmt(lo)}</SvgText>
        {segs.map((s, i) => <Polyline key={i} points={s.d} fill="none" stroke={color} strokeWidth={2} strokeDasharray={s.dashed ? "4 3" : undefined} opacity={s.dashed ? 0.5 : 1} />)}
        {present.map((p) => <Circle key={p.i} cx={X(p.i)} cy={Y(p.value)} r={connect ? 1.6 : 3} fill={color} opacity={p.partial ? 0.45 : 1} />)}
      </Svg>
    </View>
  );
}

// Shared date axis under the bottom chart — same x mapping, so columns line up.
function DateAxis({ points }: { points: Point[] }) {
  if (points.length === 0) return null;
  const n = points.length;
  const label = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const idxs = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  return (
    <View style={{ width: CHART_W, height: 16 }}>
      {idxs.map((i) => {
        const anchor = i === 0 ? "flex-start" : i === n - 1 ? "flex-end" : "center";
        return (
          <View key={i} style={{ position: "absolute", left: 0, right: 0, top: 0, alignItems: anchor, paddingHorizontal: 0 }}>
            <Text style={[styles.axisLabel, { marginLeft: anchor === "flex-start" ? PAD.l - 10 : 0, marginRight: anchor === "flex-end" ? PAD.r : 0 }]}>{label(points[i].t)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  kicker: { fontSize: 13, letterSpacing: 2, color: "#9A9A9A", fontWeight: "600", marginBottom: 16 },
  selector: { flexDirection: "row", gap: 8 },
  rangeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: "#F2F2F2", alignItems: "center" },
  rangeBtnOn: { backgroundColor: "#222" },
  rangeText: { fontSize: 13, fontWeight: "700", color: "#666", letterSpacing: 1 },
  rangeTextOn: { color: "#fff" },
  note: { fontSize: 12, color: "#999", marginTop: 10, lineHeight: 17, fontFamily: SERIF },
  empty: { fontSize: 15, color: "#888", marginTop: 40, fontFamily: SERIF },
  errorBox: { marginTop: 40, alignItems: "center" },
  retry: { marginTop: 14, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: "#F0F0F0" },
  retryText: { fontSize: 15, fontWeight: "600", color: "#444", fontFamily: SERIF },
  chartBlock: { marginTop: 26 },
  chartTitle: { fontSize: 15, fontWeight: "600", color: "#333", marginBottom: 6, fontFamily: SERIF },
  chartUnit: { color: "#AAA", fontWeight: "400" },
  scoreNote: { fontSize: 11, color: "#999", marginTop: 4, fontStyle: "italic", fontFamily: SERIF },
  axisLabel: { fontSize: 10, color: "#AAA" },
  noData: { alignItems: "center", justifyContent: "center", backgroundColor: "#FAFAFA", borderRadius: 8 },
  noDataText: { color: "#BBB", fontSize: 13, fontStyle: "italic", fontFamily: SERIF },
});
