// Apple Health export XML serializer — a thin layer over the generator core.
//
// OFFLINE USE ONLY. This exists so synthetic output can be run through
// data-parsing/summarize_health_export.py and diffed against the real export, and
// as training-data input later. The APP MUST NEVER read this file: the real
// HealthKit binding returns objects, never a parsed export, so a runtime XML path
// is a code path that doesn't exist in production.
//
// Emits the same shape as a real export.xml Record. Dates use Apple's
// "YYYY-MM-DD HH:MM:SS +0000" wall-clock format (UTC here); the summarizer reads
// only the first 19 chars, so the offset is cosmetic.

import type { GenSample } from "./generate";

const two = (n: number) => String(n).padStart(2, "0");

/** Apple export date format, in UTC. */
export function appleDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ` +
    `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} +0000`;
}

const DEVICE = "&lt;&lt;HKDevice: 0x0&gt;, name:Apple Watch, manufacturer:Apple, model:Watch, hardware:MockWatch, software:1.0&gt;";

/** One <Record .../> line for a quantity sample (the only kind emitted yet). */
export function recordLine(s: GenSample): string {
  const unit = s.unit ? ` unit="${s.unit}"` : "";
  return `  <Record type="${s.identifier}" sourceName="${s.sourceName}" sourceVersion="1.0"` +
    ` device="${DEVICE}"${unit} creationDate="${appleDate(s.creationMs)}"` +
    ` startDate="${appleDate(s.startMs)}" endDate="${appleDate(s.endMs)}" value="${s.value}"/>\n`;
}

export function exportHeader(exportDateMs: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<HealthData locale="en_US">\n` +
    ` <ExportDate value="${appleDate(exportDateMs)}"/>\n`;
}

export const exportFooter = (): string => `</HealthData>\n`;
