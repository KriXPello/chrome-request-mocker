import { formatDatetimeInput } from "./datetime.js";
import { compilePattern, getPatternParams } from "./url-pattern.js";
import { parseTemplate } from "./templates.js";

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
