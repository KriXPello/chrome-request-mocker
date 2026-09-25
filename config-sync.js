import { replaceConfigsAfterSync } from "./db.js";

export async function syncConfigsFromDirectory(directoryHandle) {
  const permission = await directoryHandle.queryPermission({ mode: "read" });
  if (permission !== "granted") {
    const requested = await directoryHandle.requestPermission({ mode: "read" });
    if (requested !== "granted") {
      throw new Error("Folder access was not granted.");
    }
  }

  const configs = await readConfigs(directoryHandle);
  const importedAt = Date.now();
  const ruleCount = configs.reduce((sum, config) => sum + config.rules.length, 0);
  for (const config of configs) {
    config.importedAt = importedAt;
  }
  const meta = {
    key: "sync",
    lastSyncAt: importedAt,
    folderName: directoryHandle.name,
    configCount: configs.length,
    ruleCount
  };
  await replaceConfigsAfterSync(configs, meta);
  return { configs, meta };
}

async function readConfigs(directoryHandle) {
  const files = [];
  for await (const entry of directoryHandle.values()) {
    if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".json")) {
      files.push(entry);
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  const configs = [];
  const configFiles = new Map();
  for (const entry of files) {
    const file = await entry.getFile();
    let value;
    try {
      value = JSON.parse(await file.text());
    } catch (error) {
      throw new Error(`${entry.name}: ${messageOf(error)}`);
    }
    const config = validateConfig(value, entry.name);
    if (configFiles.has(config.id)) {
      throw new Error(`Duplicate config id "${config.id}":\n${configFiles.get(config.id)}\n${entry.name}`);
    }
    configFiles.set(config.id, entry.name);
    configs.push({
      ...config,
      formatVersion: 3,
      sourceFile: entry.name,
      fileLastModified: file.lastModified,
      importedAt: 0
    });
  }
  return configs;
}

function validateConfig(value, filename) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(filename, "top level must be an object");
  if (typeof value.id !== "string" || !value.id.trim()) fail(filename, "id must be a non-empty string");
  if ("name" in value && typeof value.name !== "string") fail(filename, "name must be a string");
  if (!Array.isArray(value.rules)) fail(filename, '"rules" must be an array');
  const ids = new Set();
  const rules = value.rules.map((rule, index) => {
    const prefix = `${filename}: rules[${index}]`;
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) fail(prefix, "must be an object");
    if (typeof rule.id !== "string" || !rule.id.trim()) fail(prefix, "id must be a non-empty string");
    if (ids.has(rule.id)) fail(prefix, `id "${rule.id}" is duplicated`);
    ids.add(rule.id);
    if ("name" in rule && typeof rule.name !== "string") fail(prefix, "name must be a string");
    if (typeof rule.pattern !== "string" || !rule.pattern) fail(prefix, "pattern must be a non-empty string");
    if (("response" in rule) === ("responses" in rule)) fail(prefix, "exactly one of response or responses is required");
    let response;
    if ("responses" in rule) {
      if (!Array.isArray(rule.responses) || rule.responses.length === 0) fail(prefix, "responses must be a non-empty array");
      const responseIds = new Set();
      response = rule.responses.map((item, responseIndex) => {
        const responsePrefix = `${prefix}: responses[${responseIndex}]`;
        if (!isPlainObject(item)) fail(responsePrefix, "must be an object");
        if (typeof item.id !== "string" || !item.id.trim()) fail(responsePrefix, "id must be a non-empty string");
        if (responseIds.has(item.id)) fail(responsePrefix, `id "${item.id}" is duplicated`);
        responseIds.add(item.id);
        if (!("body" in item)) fail(responsePrefix, "body is required");
        return normalizeResponse(item, responsePrefix, true, item.id);
      });
    } else {
      if (!isPlainObject(rule.response)) fail(prefix, "response must be an object");
      if (!("body" in rule.response)) fail(prefix, "response.body is required");
      response = normalizeResponse(rule.response, prefix);
    }
    const query = normalizeQuery(rule.query, prefix);
    const routes = normalizeRoutes(rule.routes, response, query, prefix);
    const delay = "delay" in rule ? rule.delay : 0;
    if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0) fail(prefix, "delay must be a finite number >= 0");
    let methods;
    if ("methods" in rule) {
      if (!Array.isArray(rule.methods) || rule.methods.length === 0) fail(prefix, "methods must be a non-empty array");
      methods = [];
      for (const method of rule.methods) {
        if (typeof method !== "string" || !method || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(method)) fail(prefix, "methods must contain valid HTTP method tokens");
        const normalized = method.toUpperCase();
        if (!methods.includes(normalized)) methods.push(normalized);
      }
    }
    return { id: rule.id, ...(typeof rule.name === "string" ? { name: rule.name } : {}), pattern: rule.pattern,
      ...(methods ? { methods } : {}), delay, ...(query ? { query } : {}),
      ...(routes ? { routes } : {}), ...(Array.isArray(response) ? { responses: response } : { response }) };
  });
  return { id: value.id, ...(typeof value.name === "string" ? { name: value.name } : {}), rules };
}

function fail(filename, message) { throw new Error(`${filename}: ${message}`); }

function normalizeResponse(value, prefix, allowName = false, responseId = null) {
  const status = "status" in value ? value.status : 200;
  if (!Number.isInteger(status) || status < 200 || status > 599) fail(prefix, "response.status must be an integer from 200 through 599");
  const statusText = "statusText" in value ? value.statusText : "";
  if (typeof statusText !== "string" || !isValidHttpText(statusText)) fail(prefix, "response.statusText must be a valid HTTP status text");
  if ("headers" in value && !isPlainObject(value.headers)) fail(prefix, "response.headers must be an object");
  const headers = { "Content-Type": "application/json" };
  for (const [name, headerValue] of Object.entries(value.headers || {})) {
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) fail(prefix, `invalid response header name "${name}"`);
    if (typeof headerValue !== "string" || !isValidHttpText(headerValue)) fail(prefix, `invalid response header value for "${name}"`);
    const previous = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
    if (previous) delete headers[previous];
    headers[name] = headerValue;
  }
  if ([204, 205, 304].includes(status) && value.body !== null) fail(prefix, `response.body must be null for status ${status}`);
  if (allowName && "name" in value && (typeof value.name !== "string" || !value.name.trim())) {
    fail(prefix, "name must be a non-empty string");
  }
  return { ...(responseId ? { id: responseId } : {}), body: value.body, headers, status, statusText,
    ...(allowName && typeof value.name === "string" ? { name: value.name } : {}) };
}

function normalizeQuery(value, prefix) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0) fail(prefix, "query must be a non-empty array");
  return value.map((alternative, index) => {
    const queryPrefix = `${prefix}: query[${index}]`;
    if (!isPlainObject(alternative) || Object.keys(alternative).length === 0) fail(queryPrefix, "must be a non-empty object");
    const result = {};
    for (const [name, configured] of Object.entries(alternative)) {
      if (!name.trim()) fail(queryPrefix, "parameter names must be non-empty strings");
      const values = Array.isArray(configured) ? configured : [configured];
      if (values.length === 0 || values.some((item) => typeof item !== "string")) fail(queryPrefix, `query parameter "${name}" must be a string or non-empty string array`);
      for (const item of values) validateGlob(item, queryPrefix);
      Object.defineProperty(result, name, {
        value: values,
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return result;
  });
}

function validateGlob(value, prefix) {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\") {
      const next = value[index + 1];
      if (!next || !"*?+\\".includes(next)) fail(prefix, "query wildcard contains an invalid escape");
      index += 1;
    }
  }
}

function normalizeRoutes(value, responses, query, prefix) {
  if (value === undefined) return null;
  if (!Array.isArray(responses)) fail(prefix, "routes requires responses");
  if (query) fail(prefix, "query and routes cannot be used together");
  if (value.length === 0) fail(prefix, "routes must be a non-empty array");
  const ids = new Set(responses.map((item) => item.id));
  let fallback = false;
  return value.map((route, index) => {
    const routePrefix = `${prefix}: routes[${index}]`;
    if (!isPlainObject(route) || typeof route.responseId !== "string" || !ids.has(route.responseId)) fail(routePrefix, "responseId must reference a response");
    const routeQuery = normalizeQuery(route.query, routePrefix);
    if (!routeQuery) {
      if (fallback || index !== value.length - 1) fail(routePrefix, "only one query-less fallback is allowed and it must be last");
      fallback = true;
    }
    return { ...(routeQuery ? { query: routeQuery } : {}), responseId: route.responseId };
  });
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidHttpText(value) {
  return [...value].every((char) => {
    const code = char.charCodeAt(0);
    return code === 9 || (code >= 32 && code <= 126) || (code >= 128 && code <= 255);
  });
}

function messageOf(error) { return error instanceof Error ? error.message : String(error); }
