// TRENDS tab — RAW HRV and resting heart rate over time (no score; that comes later).
// Available from day 1: real data, nothing that can be wrong — this is what carries
// the learning period.
//
// Two STACKED charts (HRV over resting HR), each with its OWN auto-scaled y-axis so a
// small-but-real RHR move fills its range instead of vanishing next to HRV's larger
// swing. X-axes are VERTICALLY ALIGNED (same window, same pixel positions) so reading
// down a column compares the same day. Gaps are shown as gaps — never interpolated.
//
// Deterministic + range-independent generation means any range is computed on demand;
// no database.

import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { REGISTRY } from "@/src/mock/registry";
import { buildProvider } from "@/src/providers/buildProvider";
import { asyncStorageAdapter } from "@/src/storage/asyncStorage";
import { loadOnboarding } from "@/src/storage/onboardingStore";
import { bucketize, baselineMedian, dailyMeans, resolveRes, windowDays, type Point, type RangeKey } from "@/src/trends/series";

const DAY = 86_400_000;
const HRV = REGISTRY.HeartRateVariabilitySDNN.identifier;
const RHR = REGISTRY.RestingHeartRate.identifier;
const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });
const CHART_W = Dimensions.get("window").width - 48;
const RANGES: RangeKey[] = ["7D", "1M", "1Y", "ALL"];

interface TrendData {
  hasProfile: boolean;
  spanDays: number;
  res: "day" | "week" | "month";
  hrv: Point[];
  rhr: Point[];
  hrvBase: number | null;
  rhrBase: number | null;
  dropped: boolean; // resolution dropped to daily because history is short
}

async function loadTrends(range: RangeKey): Promise<TrendData> {
  const profile = await loadOnboarding(asyncStorageAdapter);
  const empty: TrendData = { hasProfile: false, spanDays: 0, res: "day", hrv: [], rhr: [], hrvBase: null, rhrBase: null, dropped: false };
  if (!profile) return empty;

  const now = Date.now();
  const startMs = Date.parse(profile.startDate);
  const spanDays = Math.max(1, Math.floor((now - startMs) / DAY));
  const win = windowDays(range);
  const fromMs = win == null ? startMs : Math.max(startMs, now - win * DAY);

  const provider = buildProvider(profile, { now: () => now });
  const [hrvS, rhrS] = await Promise.all([
    provider.queryQuantitySamples(HRV, { from: new Date(fromMs), to: new Date(now + DAY) }),
    provider.queryQuantitySamples(RHR, { from: new Date(fromMs), to: new Date(now + DAY) }),
  ]);
  const hd = dailyMeans(hrvS), rd = dailyMeans(rhrS);
  const fromDay = Math.floor(fromMs / DAY), toDay = Math.floor(now / DAY);

  const res = resolveRes(range, spanDays);
  const dropped = (range === "1Y" || range === "ALL") && res === "day";
  const showBaseline = range === "7D" || range === "1M"; // a single 28d median isn't representative over long windows
  return {
    hasProfile: true, spanDays, res,
    hrv: bucketize(hd, fromDay, toDay, res),
    rhr: bucketize(rd, fromDay, toDay, res),
    hrvBase: showBaseline ? baselineMedian(hd, toDay) : null,
    rhrBase: showBaseline ? baselineMedian(rd, toDay) : null,
    dropped,
  };
}

export default function TrendsScreen() {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<RangeKey>("1M");
  const [data, setData] = useState<TrendData | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setData(null);
      loadTrends(range).then((d) => alive && setData(d));
      return () => { alive = false; };
    }, [range]),
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

      {!data ? (
        <ActivityIndicator color="#888" style={{ marginTop: 60 }} />
      ) : !data.hasProfile ? (
        <Text style={styles.empty}>No profile yet. Finish onboarding to begin.</Text>
      ) : (
        <>
          <Chart title="Heart rate variability" unit="ms" points={data.hrv} baseline={data.hrvBase} color="#3E7CB0" />
          <Chart title="Resting heart rate" unit="bpm" points={data.rhr} baseline={data.rhrBase} color="#C4603C" />
          <DateAxis points={data.rhr} />
        </>
      )}
    </ScrollView>
  );
}

function resNote(range: RangeKey, data: TrendData | null): string | null {
  if (!data || !data.hasProfile) return null;
  if (data.dropped) return `Only ${data.spanDays} days of history so far — showing daily points until there's enough for ${range === "1Y" ? "weekly" : "monthly"} averages.`;
  if (data.res === "week") return "Weekly averages — longer ranges are smoothed so the shape stays readable. The current week is still filling in (shown faded).";
  if (data.res === "month") return "Monthly averages — longer ranges are smoothed so the shape stays readable. The current month is still filling in (shown faded).";
  return null;
}

const CHART_H = 150;
const PAD = { l: 42, r: 14, t: 12, b: 10 };

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
  chartBlock: { marginTop: 26 },
  chartTitle: { fontSize: 15, fontWeight: "600", color: "#333", marginBottom: 6, fontFamily: SERIF },
  chartUnit: { color: "#AAA", fontWeight: "400" },
  axisLabel: { fontSize: 10, color: "#AAA" },
  noData: { alignItems: "center", justifyContent: "center", backgroundColor: "#FAFAFA", borderRadius: 8 },
  noDataText: { color: "#BBB", fontSize: 13, fontStyle: "italic", fontFamily: SERIF },
});
