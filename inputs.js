const INPUT_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const INPUT_TYPES = new Set(["string", "number", "boolean"]);

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
      if (!["name", "type", "masked"].includes(key)) {
        throw new Error(`${prefix}: unknown field inputs.${id}.${key}`);
      }
    }
    if ("name" in descriptor && (typeof descriptor.name !== "string" || !descriptor.name.trim())) {
      throw new Error(`${prefix}: inputs.${id}.name must be non-empty`);
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
  }
  return result;
}

export function parseTemplate(text, inputs, location) {
  const parts = [];
  let literal = "";
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("$${", index)) {
      literal += "${";
      index += 3;
      continue;
    }
    if (text.startsWith("${", index)) {
      const end = text.indexOf("}", index + 2);
      if (end < 0) {
        throw new Error(`${location}: malformed input placeholder`);
      }
      const id = text.slice(index + 2, end);
      if (!INPUT_ID_PATTERN.test(id) || !Object.hasOwn(inputs || {}, id)) {
        throw new Error(`${location}: unknown or invalid input "${id}"`);
      }
      if (literal) {
        parts.push({ literal });
      }
      literal = "";
      parts.push({ id });
      index = end + 1;
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
  for (const part of parseTemplate(text, inputs, location)) {
    if ("id" in part) {
      source += escapeRegExp(String(values[part.id]));
    } else {
      source += globSource(part.literal);
    }
  }
  return `^${source}$`;
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
  const resolved = structuredClone(rule);
  resolved.matcherSource = compilePattern(rule.pattern, descriptors, values, `rule ${rule.id}.pattern`);
  resolveQueryGroups(resolved.query, descriptors, values, `rule ${rule.id}.query`);
  resolved.routes?.forEach((route, index) => {
    resolveQueryGroups(route.query, descriptors, values, `rule ${rule.id}.routes[${index}].query`);
  });
  const responses = resolved.responses || [resolved.response];
  responses.forEach((response, index) => {
    const responseLocation = resolved.responses ? `responses[${index}]` : "response";
    response.body = resolveValue(response.body, descriptors, values, `rule ${rule.id}.${responseLocation}.body`);
    for (const [name, value] of Object.entries(response.headers)) {
      const location = `rule ${rule.id}.${responseLocation}.headers.${name}`;
      const resolvedValue = resolveString(value, descriptors, values, location);
      if (!isValidHttpText(resolvedValue)) {
        throw new Error(`${location}: invalid resolved HTTP header value`);
      }
      response.headers[name] = resolvedValue;
    }
  });
  return resolved;
}

function resolveQueryGroups(query, descriptors, values, location) {
  if (!query) {
    return;
  }
  for (const group of query) {
    for (const key of Object.keys(group)) {
      group[key] = group[key].map((value) => resolveQuery(value, descriptors, values, `${location}.${key}`));
    }
  }
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
    if (descriptor.type === "boolean" && typeof value === "boolean") {
      ready += 1;
    } else if (descriptor.type === "number" && typeof value === "number" && Number.isFinite(value)) {
      ready += 1;
    } else if (descriptor.type === "string" && typeof value === "string" && value.length > 0) {
      ready += 1;
    }
  }
  return { ready, total: entries.length, missing: entries.length - ready };
}
