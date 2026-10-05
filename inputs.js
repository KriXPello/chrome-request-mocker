import { DATETIME_FORMATS, isValidDatetimeInput, isValidRelativeDatetimeInput, formatDatetimeInput, relativeDatetimeValue } from "./datetime.js";

const INPUT_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;
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
    if (!INPUT_ID_PATTERN.test(id)) {
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

export function normalizeQueryMap(value, namespace, prefix) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${prefix}: queryMap must be an object`);
  }
  const result = Object.create(null);
  const names = new Set();
  for (const [parameter, id] of Object.entries(value)) {
    if (!parameter.trim()) throw new Error(`${prefix}: queryMap parameter names must be non-empty`);
    if (typeof id !== "string" || !INPUT_ID_PATTERN.test(id)) {
      throw new Error(`${prefix}: invalid queryMap variable name for "${parameter}"`);
    }
    if (Object.hasOwn(namespace, id) || names.has(id)) {
      throw new Error(`${prefix}: queryMap variable "${id}" conflicts with another variable`);
    }
    names.add(id);
    result[parameter] = id;
  }
  return result;
}

export function parseTemplate(text, inputs, location) {
  const parts = [];
  let literal = "";
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("$$[[", index)) {
      literal += "$[[";
      index += 4;
      continue;
    }
    if (text.startsWith("$[[", index)) {
      const end = text.indexOf("]]", index + 3);
      if (end < 0) {
        throw new Error(`${location}: malformed template reference`);
      }
      const id = text.slice(index + 3, end);
      if (!INPUT_ID_PATTERN.test(id) || !Object.hasOwn(inputs || {}, id)) {
        throw new Error(`${location}: unknown or invalid template reference "${id}"`);
      }
      if (literal) {
        parts.push({ literal });
      }
      literal = "";
      parts.push({ id });
      index = end + 2;
      continue;
    }
    literal += text[index];
    index += 1;
  }
  if (literal) {
    parts.push({ literal });
  }
  return parts;
}

export function validateTemplate(text, inputs, location) {
  parseTemplate(text, inputs, location);
}

function escapeRegExp(text) {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function globSource(text) {
  let source = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "*") {
      if (text[i + 1] === "*") {
        source += "[\\s\\S]*";
        i += 1;
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  return source;
}

export function compilePattern(text, inputs, values, location) {
  let source = "";
  for (const part of parsePatternParts(text, inputs, location)) {
    if ("id" in part) {
      source += escapeRegExp(String(values[part.id]));
    } else if ("capture" in part) {
      if (part.wildcard) source += "([\\s\\S]*)";
      else source += "([^/]+)";
    } else {
      source += globSource(part.literal);
    }
  }
  return `^${source}$`;
}

export function getPatternParams(text, inputs, location) {
  return parsePatternParts(text, inputs, location).filter((part) => "capture" in part).map((part) => part.capture);
}

function parsePatternParts(text, inputs, location) {
  const result = [];
  const names = new Set();
  for (const part of parseTemplate(text, inputs, location)) {
    if ("id" in part) {
      result.push(part);
      continue;
    }
    let literal = "";
    for (let index = 0; index < part.literal.length;) {
      if (part.literal[index] === "}") throw new Error(`${location}: malformed pattern capture`);
      if (part.literal[index] !== "{") { literal += part.literal[index++]; continue; }
      const end = part.literal.indexOf("}", index + 1);
      if (end < 0) throw new Error(`${location}: malformed pattern capture`);
      const token = part.literal.slice(index + 1, end);
      const wildcard = token.endsWith(":**");
      let id = token;
      if (wildcard) id = token.slice(0, -3);
      if (!INPUT_ID_PATTERN.test(id)) throw new Error(`${location}: invalid pattern capture "${token}"`);
      if (Object.hasOwn(inputs || {}, id)) throw new Error(`${location}: capture "${id}" conflicts with an input`);
      if (names.has(id)) throw new Error(`${location}: capture "${id}" is duplicated`);
      names.add(id);
      if (literal) result.push({ literal });
      literal = "";
      result.push({ capture: id, wildcard });
      index = end + 1;
    }
    if (literal) result.push({ literal });
  }
  return result;
}

export function resolveQuery(text, inputs, values, location) {
  let result = "";
  for (const part of parseTemplate(text, inputs, location)) {
    if ("id" in part) {
      result += String(values[part.id]).replace(/[\\*?+]/g, "\\$&");
    } else {
      result += part.literal;
    }
  }
  return result;
}

export function resolveValue(value, inputs, values, location) {
  if (typeof value === "string") {
    return resolveString(value, inputs, values, location, true);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => resolveValue(item, inputs, values, `${location}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, resolveValue(item, inputs, values, `${location}.${key}`)]));
  }
  return value;
}

export function resolveRuntimeRule(rule, descriptors, values) {
  values = Object.fromEntries(Object.entries(values).map(([id, value]) => {
    switch (descriptors[id]?.type) {
      case "datetime": return [id, formatDatetimeInput(value, descriptors[id].format)];
      case "relative-datetime": return [id, formatDatetimeInput(value.value, descriptors[id].format)];
      default: return [id, value];
    }
  }));
  const resolved = structuredClone(rule);
  resolved.matcherSource = compilePattern(rule.pattern, descriptors, values, `rule ${rule.id}.pattern`);
  const captures = getPatternParams(rule.pattern, descriptors, `rule ${rule.id}.pattern`);
  resolved.patternParams = captures;
  const runtimeNames = new Set([...captures, ...Object.values(rule.queryMap || {})]);
  const namespace = { ...(descriptors || {}), ...Object.fromEntries([...runtimeNames].map((id) => [id, true])) };
  const valueTemplates = [];
  const prepareText = (text, path, { query = false, header = false, exactTyped = false } = {}) => {
    const location = `rule ${rule.id}.${path.join(".")}`;
    const parts = parseTemplate(text, namespace, location);
    if (exactTyped && parts.length === 1 && "id" in parts[0] && !runtimeNames.has(parts[0].id)) return values[parts[0].id];
    const runtimeParts = [];
    let partial = "";
    for (const part of parts) {
      if ("literal" in part) {
        runtimeParts.push(part);
        partial += part.literal;
      } else if (runtimeNames.has(part.id)) {
        runtimeParts.push({ id: part.id });
      } else {
        let literal = String(values[part.id]);
        if (query) literal = literal.replace(/[\\*?+]/g, "\\$&");
        runtimeParts.push({ literal });
        partial += literal;
      }
    }
    if (runtimeParts.some((part) => "id" in part)) valueTemplates.push({ path, parts: runtimeParts, query, header, exactTyped });
    if (header && !isValidHttpText(partial)) throw new Error(`${location}: invalid resolved HTTP header value`);
    return partial;
  };
  const prepareConditions = (groups, path) => groups?.map((group, groupIndex) =>
    Object.fromEntries(Object.entries(group).map(([key, patterns]) => [key,
      patterns.map((text, index) => prepareText(text, [...path, groupIndex, key, index], { query: true }))
    ])));
  const prepareBody = (value, path) => {
    if (typeof value === "string") return prepareText(value, path, { exactTyped: true });
    if (Array.isArray(value)) return value.map((item, index) => prepareBody(item, [...path, index]));
    if (value && typeof value === "object") {
      const entries = Object.entries(value).map(([key, item]) => [key, prepareBody(item, [...path, key])]);
      return Object.fromEntries(entries);
    }
    return value;
  };
  resolved.query = prepareConditions(rule.query, ["query"]);
  resolved.routes?.forEach((route, index) => {
    route.query = prepareConditions(rule.routes[index].query, ["routes", index, "query"]);
    route.params = prepareConditions(rule.routes[index].params, ["routes", index, "params"]);
  });
  const responses = resolved.responses || [resolved.response];
  responses.forEach((response, index) => {
    let path = ["response"];
    if (resolved.responses) path = ["responses", index];
    response.body = prepareBody(response.body, [...path, "body"]);
    for (const [name, value] of Object.entries(response.headers)) {
      response.headers[name] = prepareText(value, [...path, "headers", name], { header: true });
    }
  });
  if (valueTemplates.length) resolved.valueTemplates = valueTemplates;
  return resolved;
}

function isValidHttpText(value) {
  return [...value].every((char) => {
    const code = char.charCodeAt(0);
    return code === 9 || (code >= 32 && code <= 126) || (code >= 128 && code <= 255);
  });
}

export function resolveString(text, inputs, values, location, exactTyped = false) {
  const parts = parseTemplate(text, inputs, location);
  if (exactTyped && parts.length === 1 && "id" in parts[0]) {
    return values[parts[0].id];
  }

  let result = "";
  for (const part of parts) {
    if ("id" in part) {
      result += String(values[part.id]);
    } else {
      result += part.literal;
    }
  }
  return result;
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
