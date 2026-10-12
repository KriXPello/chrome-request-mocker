import { DATETIME_FORMATS, isValidDatetimeInput, isValidRelativeDatetimeInput, relativeDatetimeValue } from "./datetime.js";
import { VARIABLE_NAME_PATTERN } from "./templates.js";

const INPUT_TYPES = new Set(["string", "number", "boolean", "datetime", "relative-datetime"]);

export function normalizeInputs(value, prefix) {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${prefix}: inputs must be an object`);
  }

  const result = Object.create(null);
  for (const [id, descriptor] of Object.entries(value)) {
    if (!VARIABLE_NAME_PATTERN.test(id)) {
      throw new Error(`${prefix}: invalid input id "${id}"`);
    }
    if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
      throw new Error(`${prefix}: inputs.${id} must be an object`);
    }
    for (const key of Object.keys(descriptor)) {
      if (!["name", "description", "type", "masked", "format", "default"].includes(key)) {
        throw new Error(`${prefix}: unknown field inputs.${id}.${key}`);
      }
    }
    if ("name" in descriptor && (typeof descriptor.name !== "string" || !descriptor.name.trim())) {
      throw new Error(`${prefix}: inputs.${id}.name must be non-empty`);
    }
    if ("description" in descriptor && typeof descriptor.description !== "string") {
      throw new Error(`${prefix}: inputs.${id}.description must be a string`);
    }
    const type = descriptor.type ?? "string";
    if (!INPUT_TYPES.has(type)) {
      throw new Error(`${prefix}: invalid type for inputs.${id}`);
    }
    const masked = descriptor.masked ?? false;
    if (typeof masked !== "boolean" || ("masked" in descriptor && type !== "string")) {
      throw new Error(`${prefix}: masked is only valid for string inputs`);
    }
    result[id] = { name: descriptor.name ?? id, type, masked };
    if (type === "datetime" || type === "relative-datetime") {
      let format = "iso";
      if ("format" in descriptor) format = descriptor.format;
      if (!DATETIME_FORMATS.has(format)) {
        throw new Error(`${prefix}: invalid format for inputs.${id}`);
      }
      result[id].format = format;
    } else if ("format" in descriptor) {
      throw new Error(`${prefix}: format is only valid for datetime and relative-datetime inputs`);
    }
    if ("description" in descriptor) result[id].description = descriptor.description;
    if ("default" in descriptor) {
      result[id].default = descriptor.default;
      try {
        resolveInputDefault(result[id], Date.now());
      } catch (error) {
        throw new Error(`${prefix}: inputs.${id}.default: ${error.message}`);
      }
    }
  }
  return result;
}

export function resolveInputDefault(descriptor, now) {
  if (!Object.hasOwn(descriptor, "default")) return undefined;
  let value = descriptor.default;
  if (descriptor.type === "relative-datetime") {
    value = { offsetSeconds: descriptor.default, value: relativeDatetimeValue(descriptor.default, now) };
  }
  if (!isValidInputValue(descriptor.type, value)) {
    throw new Error(`must be a valid ${descriptor.type} value`);
  }
  return value;
}

export function inputsReady(inputs, values) {
  const readiness = inputReadiness(inputs, values);
  return readiness.ready === readiness.total;
}

export function inputReadiness(inputs, values) {
  const entries = Object.entries(inputs || {});
  let ready = 0;
  for (const [id, descriptor] of entries) {
    const value = values?.[id];
    if (isValidInputValue(descriptor.type, value)) ready += 1;
  }
  return { ready, total: entries.length, missing: entries.length - ready };
}

export function isValidInputValue(type, value) {
  switch (type) {
    case "boolean": return typeof value === "boolean";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "string": return typeof value === "string" && value.length > 0;
    case "datetime": return isValidDatetimeInput(value);
    case "relative-datetime": return isValidRelativeDatetimeInput(value);
    default: return false;
  }
}
