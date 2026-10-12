export const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;

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
      if (!VARIABLE_NAME_PATTERN.test(id) || !Object.hasOwn(inputs || {}, id)) {
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
