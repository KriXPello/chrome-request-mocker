export const DATETIME_FORMATS = new Set(["iso", "timestamp-ms", "timestamp-s"]);

export function relativeDatetimeValue(offsetSeconds, now) {
  const date = new Date(now + offsetSeconds * 1000);
  if (!Number.isFinite(offsetSeconds) || !Number.isFinite(date.getTime())) {
    throw new Error("Time offset must produce a valid date.");
  }
  return date.toISOString();
}

export function isValidDatetimeInput(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function isValidRelativeDatetimeInput(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && isValidDatetimeInput(value.value)
    && typeof value.offsetSeconds === "number" && Number.isFinite(value.offsetSeconds));
}

export function formatDatetimeInput(value, format = "iso") {
  switch (format) {
    case "iso": return value;
    case "timestamp-ms": return Date.parse(value);
    case "timestamp-s": return Math.floor(Date.parse(value) / 1000);
    default: throw new Error("Unsupported datetime format.");
  }
}

export function datetimeInputAsRaw(value) {
  if (!isValidDatetimeInput(value)) {
    return "";
  }
  const date = new Date(value);
  const local = new Date(0);
  local.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  local.setUTCHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  return local.toISOString().slice(0, -1);
}
