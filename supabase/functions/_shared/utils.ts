import { createHash } from "node:crypto";

const QLIK_DATE_BASE_UTC_MS = Date.UTC(1899, 11, 30);

interface QlikCellLike {
  qText?: unknown;
  qNum?: unknown;
  qIsNull?: unknown;
}

function asCellLike(value: unknown): QlikCellLike | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if ("qText" in candidate || "qNum" in candidate || "qIsNull" in candidate) {
    return candidate as QlikCellLike;
  }
  return null;
}

function getCellText(value: unknown): string | null {
  const cell = asCellLike(value);
  if (!cell) {
    if (typeof value === "string") return value.trim() || null;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    return null;
  }

  if (cell.qIsNull === true) return null;
  if (typeof cell.qText === "string") {
    const t = cell.qText.trim();
    return t.length ? t : null;
  }
  if (typeof cell.qNum === "number" && Number.isFinite(cell.qNum)) return String(cell.qNum);
  return null;
}

function getCellNum(value: unknown): number | null {
  const cell = asCellLike(value);
  if (cell) {
    if (cell.qIsNull === true) return null;
    if (typeof cell.qNum === "number" && Number.isFinite(cell.qNum)) return cell.qNum;
    if (typeof cell.qText === "string") {
      const parsed = Number(cell.qText.replace(/,/g, "").trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeColumnName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function toText(value: unknown): string {
  const result = getCellText(value);
  return result ?? "";
}

export function toNullableText(value: unknown): string | null {
  return getCellText(value);
}

export function toNumber(value: unknown): number | null {
  return getCellNum(value);
}

export function toNumberPreferText(value: unknown): number | null {
  const text = getCellText(value);
  if (text) {
    const parsed = Number(text.replace(/,/g, "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }

  return getCellNum(value);
}

export function toInteger(value: unknown): number | null {
  const n = getCellNum(value);
  if (n === null) return null;
  return Math.trunc(n);
}

export function toBoolean(value: unknown): boolean | null {
  const n = getCellNum(value);
  if (n !== null) {
    if (n === 1) return true;
    if (n === 0) return false;
  }

  const t = getCellText(value);
  if (!t) return null;
  const normalized = t.trim().toLowerCase();
  if (["true", "t", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "f", "no", "n", "0"].includes(normalized)) return false;
  return null;
}

function qlikNumToDate(num: number): Date {
  return new Date(QLIK_DATE_BASE_UTC_MS + num * 86400000);
}

export function toDate(value: unknown): string | null {
  const t = getCellText(value);
  if (t) {
    const parsed = new Date(t);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  const n = getCellNum(value);
  if (n === null) return null;
  return qlikNumToDate(Math.trunc(n)).toISOString().slice(0, 10);
}

export function toTimestamp(value: unknown): string | null {
  const t = getCellText(value);
  if (t) {
    const parsed = new Date(t);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const n = getCellNum(value);
  if (n === null) return null;
  return qlikNumToDate(n).toISOString();
}

export interface DepartmentEventInstant {
  eventAt: string;
  eventDate: string;
}

function padNumber(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function millisecondsFromFraction(fraction: string | undefined): number {
  if (!fraction) return 0;
  return Number(fraction.padEnd(3, "0").slice(0, 3));
}

function hourFromClock(hour: number, ampm: string | undefined): number | null {
  if (!ampm) return hour;
  if (hour < 1 || hour > 12) return null;
  const marker = ampm.toUpperCase();
  if (marker === "AM") return hour === 12 ? 0 : hour;
  if (marker === "PM") return hour === 12 ? 12 : hour + 12;
  return null;
}

// Wall-clock text is stored as UTC. `new Date("10/29/2026 11:48:56 AM")`
// follows the runtime timezone, so the same Qlik cell would hash to a
// different key in Phoenix than it would in the UTC sync runtime, and an
// evening time could move event_date to the next day.
function formatUtcWallClock(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): DepartmentEventInstant | null {
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59 ||
    millisecond < 0 ||
    millisecond > 999
  ) {
    return null;
  }

  const eventDate = `${padNumber(year, 4)}-${padNumber(month, 2)}-${padNumber(day, 2)}`;
  const eventAt = `${eventDate}T${padNumber(hour, 2)}:${padNumber(minute, 2)}:${padNumber(second, 2)}.${padNumber(millisecond, 3)}Z`;
  const parsed = new Date(eventAt);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== eventAt) return null;
  return { eventAt, eventDate };
}

function instantFromWallClock(text: string): DepartmentEventInstant | null {
  const us = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:\s*([AaPp][Mm]))?)?$/,
  );
  if (us) {
    const hour = us[4] === undefined ? 0 : hourFromClock(Number(us[4]), us[8]);
    if (hour === null) return null;
    return formatUtcWallClock(
      Number(us[3]),
      Number(us[1]),
      Number(us[2]),
      hour,
      us[5] === undefined ? 0 : Number(us[5]),
      us[6] === undefined ? 0 : Number(us[6]),
      millisecondsFromFraction(us[7]),
    );
  }

  const iso = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/,
  );
  if (!iso) return null;
  if (iso[8]) {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    const eventAt = parsed.toISOString();
    return { eventAt, eventDate: eventAt.slice(0, 10) };
  }
  return formatUtcWallClock(
    Number(iso[1]),
    Number(iso[2]),
    Number(iso[3]),
    iso[4] === undefined ? 0 : Number(iso[4]),
    iso[5] === undefined ? 0 : Number(iso[5]),
    iso[6] === undefined ? 0 : Number(iso[6]),
    millisecondsFromFraction(iso[7]),
  );
}

function clockFromQlikSerial(num: number): {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
} | null {
  const match = qlikNumToDate(num)
    .toISOString()
    .match(/T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3]),
    millisecond: Number(match[4]),
  };
}

// Department event identity. A Date cell that includes a time, such as
// "10/29/2026 11:48:56 AM", wins over the Qlik serial. Date-only text keeps
// that calendar date and, when the serial has a fractional day, the serial's
// time of day. event_date is the calendar date of event_at.
export function departmentEventTimestamp(value: unknown): DepartmentEventInstant | null {
  const text = getCellText(value);
  const fromText = text ? instantFromWallClock(text) : null;
  const textHasTime = Boolean(text && /(?:T|[ ])\d{1,2}:\d{2}/.test(text));
  if (fromText && textHasTime) return fromText;

  const numeric = getCellNum(value);
  if (fromText && numeric !== null && !Number.isInteger(numeric)) {
    const clock = clockFromQlikSerial(numeric);
    if (clock) {
      const [year, month, day] = fromText.eventDate.split("-").map(Number);
      const withSerialTime = formatUtcWallClock(
        year ?? 0,
        month ?? 0,
        day ?? 0,
        clock.hour,
        clock.minute,
        clock.second,
        clock.millisecond,
      );
      if (withSerialTime) return withSerialTime;
    }
  }
  if (fromText) return fromText;
  if (numeric === null) return null;

  const eventAt = qlikNumToDate(numeric).toISOString();
  return {
    eventAt,
    eventDate: qlikNumToDate(Math.trunc(numeric)).toISOString().slice(0, 10),
  };
}

export function toTextArray(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const out = value.map((v) => String(v).trim()).filter(Boolean);
    return out.length ? out : null;
  }

  const t = getCellText(value);
  if (!t) return null;

  if (t.startsWith("[") && t.endsWith("]")) {
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) {
        const out = parsed.map((v) => String(v).trim()).filter(Boolean);
        return out.length ? out : null;
      }
    } catch {
      // Fall through to delimited parsing.
    }
  }

  const items = t
    .split(/[;,|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return items.length ? items : null;
}

function stableStringify(input: unknown): string {
  if (input === null || typeof input !== "object") return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map((i) => stableStringify(i)).join(",")}]`;

  const entries = Object.entries(input as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);

  return `{${entries.join(",")}}`;
}

export function stableHash(input: unknown): string {
  const h = createHash("sha256");
  h.update(stableStringify(input));
  return h.digest("hex");
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
