import { parseTemplate, VARIABLE_NAME_PATTERN } from "./templates.js";

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
      if (!VARIABLE_NAME_PATTERN.test(id)) throw new Error(`${location}: invalid pattern capture "${token}"`);
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
