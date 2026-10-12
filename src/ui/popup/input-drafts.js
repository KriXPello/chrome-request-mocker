import { datetimeInputAsRaw, isValidRelativeDatetimeInput } from "../../config/datetime.js";

const INPUT_DRAFT_PREFIX = "config-input-draft:";

export function readInputDraft(config, savedValues) {
  const key = inputDraftKey(config.id);
  let record;
  try {
    record = JSON.parse(localStorage.getItem(key));
  } catch {
    localStorage.removeItem(key);
    return null;
  }
  if (!record || !Array.isArray(record.fields)) {
    localStorage.removeItem(key);
    return null;
  }

  const rows = new Map();
  for (const row of record.fields) {
    if (row && typeof row.id === "string" && typeof row.type === "string" && typeof row.raw === "string") {
      rows.set(row.id, row);
    }
  }

  const values = Object.create(null);
  let hasCompatibleField = false;
  for (const [id, descriptor] of Object.entries(config.inputs || {})) {
    const row = rows.get(id);
    if (row?.type === descriptor.type) {
      values[id] = row.raw;
      hasCompatibleField = true;
    } else {
      values[id] = storedInputAsRaw(descriptor, savedValues[id]);
    }
  }
  if (!hasCompatibleField || !inputDraftDiffers(config, savedValues, values)) {
    localStorage.removeItem(key);
    return null;
  }
  return values;
}

export function storeInputDraft(config, savedValues, rawValues) {
  if (!inputDraftDiffers(config, savedValues, rawValues)) {
    clearInputDraft(config.id);
    return false;
  }
  const fields = Object.entries(config.inputs).map(([id, descriptor]) => ({
    id,
    type: descriptor.type,
    raw: rawValues[id]
  }));
  localStorage.setItem(inputDraftKey(config.id), JSON.stringify({ fields }));
  return true;
}

function inputDraftDiffers(config, savedValues, rawValues) {
  return Object.entries(config.inputs).some(([id, descriptor]) =>
    rawValues[id] !== storedInputAsRaw(descriptor, savedValues[id]));
}

export function storedInputAsRaw(descriptor, value) {
  if (descriptor.type === "datetime") return datetimeInputAsRaw(value);
  if (descriptor.type === "relative-datetime") {
    if (isValidRelativeDatetimeInput(value)) return String(value.offsetSeconds);
    return "0";
  }
  if (descriptor.type === "boolean") {
    return typeof value === "boolean" ? String(value) : "";
  }
  if (descriptor.type === "number") {
    return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  }
  return typeof value === "string" ? value : "";
}

export function clearInputDraft(configId) {
  localStorage.removeItem(inputDraftKey(configId));
}

export function cleanupInputDrafts(configIds) {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(INPUT_DRAFT_PREFIX) && !configIds.has(key.slice(INPUT_DRAFT_PREFIX.length))) {
      localStorage.removeItem(key);
    }
  }
}

function inputDraftKey(configId) {
  return `${INPUT_DRAFT_PREFIX}${configId}`;
}
