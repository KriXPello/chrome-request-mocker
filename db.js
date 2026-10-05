import { isValidInputValue, resolveInputDefault } from "./inputs.js";
import { relativeDatetimeValue } from "./datetime.js";

const DB_NAME = "local-mock";
const DB_VERSION = 3;
const DIRECTORY_KEY = "config-directory";
const LOGGING_MODES = ["off", "short", "detailed"];

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("handles")) {
        db.createObjectStore("handles");
      }
      if (!db.objectStoreNames.contains("configs")) {
        db.createObjectStore("configs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("inputs")) db.createObjectStore("inputs", { keyPath: ["configId", "inputId"] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(db, stores, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    let abortReason = null;
    const abort = (error) => {
      abortReason = error;
      tx.abort();
    };
    try {
      result = action(tx, abort);
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(abortReason || tx.error);
    tx.onabort = () => reject(abortReason || tx.error || new Error("IndexedDB transaction aborted"));
  });
}

async function withDb(action) {
  const db = await openDb();
  try {
    return await action(db);
  } finally {
    db.close();
  }
}

export function saveDirectoryHandle(handle) {
  return withDb((db) => transaction(db, ["handles"], "readwrite", (tx) =>
    tx.objectStore("handles").put(handle, DIRECTORY_KEY)));
}

export function getDirectoryHandle() {
  return withDb((db) => new Promise((resolve, reject) => {
    const request = db.transaction("handles", "readonly").objectStore("handles").get(DIRECTORY_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  }));
}

export function clearDirectoryHandle() {
  return withDb((db) => transaction(db, ["handles"], "readwrite", (tx) =>
    tx.objectStore("handles").delete(DIRECTORY_KEY)));
}

export function getLoggingMode() {
  return withDb((db) => new Promise((resolve, reject) => {
    const request = db.transaction("meta", "readonly").objectStore("meta").get("logging");
    request.onsuccess = () => {
      const mode = request.result?.mode;
      if (LOGGING_MODES.includes(mode)) {
        resolve(mode);
        return;
      }
      resolve("short");
    };
    request.onerror = () => reject(request.error);
  }));
}

export function setLoggingMode(mode) {
  if (!LOGGING_MODES.includes(mode)) throw new Error("Invalid request logging mode.");
  return withDb((db) => transaction(db, ["meta"], "readwrite", (tx) =>
    tx.objectStore("meta").put({ key: "logging", mode })));
}

export function getAllConfigs() {
  return withDb((db) => new Promise((resolve, reject) => {
    const request = db.transaction("configs", "readonly").objectStore("configs").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  }));
}

export function getConfig(id) {
  return withDb((db) => new Promise((resolve, reject) => {
    const request = db.transaction("configs", "readonly").objectStore("configs").get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  }));
}

export function getConfigInputs(id) {
  return withDb((db) => new Promise((resolve, reject) => {
    const range = IDBKeyRange.bound([id, ""], [id, "\uffff"]);
    const request = db.transaction("inputs", "readonly").objectStore("inputs").getAll(range);
    request.onsuccess = () => resolve(Object.fromEntries(request.result.map(({ inputId, value }) => [inputId, value])));
    request.onerror = () => reject(request.error);
  }));
}

export function saveConfigInputs(configId, importedAt, descriptors, values, wasIncomplete) {
  return withDb((db) => transaction(db, ["configs", "inputs"], "readwrite", (tx, abort) => {
    const configRequest = tx.objectStore("configs").get(configId);
    const store = tx.objectStore("inputs");
    const range = IDBKeyRange.bound([configId, ""], [configId, "\uffff"]);
    configRequest.onsuccess = () => {
      const currentConfig = configRequest.result;
      const currentDescriptors = currentConfig?.inputs || {};
      if (currentConfig?.importedAt !== importedAt || !sameInputTypes(currentDescriptors, descriptors)) {
        abort(new Error("The config changed while its inputs were being edited. Reopen Inputs and try again."));
        return;
      }
      for (const [inputId, value] of Object.entries(values)) {
        const descriptor = currentDescriptors[inputId];
        if (!descriptor || !isValidInputValue(descriptor.type, value)) {
          abort(new Error(`Invalid value for input "${inputId}".`));
          return;
        }
      }
      store.delete(range);
      for (const [inputId, value] of Object.entries(values)) store.put({ configId, inputId, value });
      if (wasIncomplete || !hasAllInputValues(currentDescriptors, values)) {
        currentConfig.enabled = false;
        tx.objectStore("configs").put(currentConfig);
      }
    };
  }));
}

function sameInputTypes(current, expected) {
  const currentEntries = Object.entries(current);
  const expectedEntries = Object.entries(expected);
  if (currentEntries.length !== expectedEntries.length) return false;
  return expectedEntries.every(([id, descriptor]) =>
    Object.hasOwn(current, id) && current[id]?.type === descriptor.type);
}

function hasAllInputValues(descriptors, values) {
  return Object.entries(descriptors).every(([id, descriptor]) =>
    Object.hasOwn(values, id) && isValidInputValue(descriptor.type, values[id]));
}

export function resetConfigTime(configId, importedAt) {
  return withDb((db) => transaction(db, ["configs", "inputs"], "readwrite", (tx, abort) => {
    const configRequest = tx.objectStore("configs").get(configId);
    const range = IDBKeyRange.bound([configId, ""], [configId, "\uffff"]);
    const inputsRequest = tx.objectStore("inputs").getAll(range);
    let config;
    let rows;
    let configReady = false;
    let rowsReady = false;

    const applyReset = () => {
      if (!configReady || !rowsReady) return;
      if (!config || config.importedAt !== importedAt) {
        abort(new Error("The config changed or was removed. Reopen it and try resetting its time again."));
        return;
      }

      const now = Date.now();
      for (const row of rows) {
        const descriptor = config.inputs?.[row.inputId];
        const value = row.value;
        if (descriptor?.type !== "relative-datetime" || !isValidInputValue(descriptor.type, value)) continue;
        let resolved;
        try {
          resolved = relativeDatetimeValue(value.offsetSeconds, now);
        } catch (error) {
          abort(new Error(`Input "${row.inputId}": ${error.message}`));
          return;
        }
        tx.objectStore("inputs").put({ ...row, value: { ...value, value: resolved } });
      }
    };
    configRequest.onsuccess = () => { config = configRequest.result; configReady = true; applyReset(); };
    inputsRequest.onsuccess = () => { rows = inputsRequest.result; rowsReady = true; applyReset(); };
  }));
}

export function setConfigEnabled(id, enabled) {
  return withDb((db) => transaction(db, ["configs"], "readwrite", (tx) => {
    const store = tx.objectStore("configs");
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) {
        request.result.enabled = Boolean(enabled);
        store.put(request.result);
      }
    };
  }));
}

export function toggleAllConfigs() {
  return withDb((db) => transaction(db, ["configs", "inputs"], "readwrite", (tx) => {
    const configStore = tx.objectStore("configs");
    const configRequest = configStore.getAll();
    const inputRequest = tx.objectStore("inputs").getAll();
    let configs;
    let inputRows;
    const applyToggle = () => {
      if (!configs || !inputRows) return;
      const valuesByConfig = new Map();
      for (const { configId, inputId, value } of inputRows) {
        if (!valuesByConfig.has(configId)) valuesByConfig.set(configId, Object.create(null));
        valuesByConfig.get(configId)[inputId] = value;
      }
      const eligibleIds = new Set(configs.filter((config) =>
        config.formatVersion === 3 && hasAllInputValues(config.inputs || {}, valuesByConfig.get(config.id) || {}))
        .map((config) => config.id));
      const enable = !configs.some((config) => config.enabled && eligibleIds.has(config.id));
      for (const config of configs) {
        config.enabled = enable && eligibleIds.has(config.id);
        configStore.put(config);
      }
    };
    configRequest.onsuccess = () => { configs = configRequest.result; applyToggle(); };
    inputRequest.onsuccess = () => { inputRows = inputRequest.result; applyToggle(); };
  }));
}

export function setConfigDisplayOrder(configIds) {
  return withDb((db) => transaction(db, ["configs"], "readwrite", (tx, abort) => {
    const store = tx.objectStore("configs");
    const request = store.getAll();
    request.onsuccess = () => {
      const configs = request.result || [];
      const requestedIds = new Set(configIds);
      const hasEveryConfig = configs.length === configIds.length
        && requestedIds.size === configIds.length
        && configs.every((config) => requestedIds.has(config.id));
      if (!hasEveryConfig) {
        abort(new Error("The config list changed while it was being reordered. Try again."));
        return;
      }
      const configsById = new Map(configs.map((config) => [config.id, config]));
      configIds.forEach((id, displayOrder) => {
        const config = configsById.get(id);
        config.displayOrder = displayOrder;
        store.put(config);
      });
    };
  }));
}

export function setRuleEnabled(configId, ruleId, enabled) {
  return withDb((db) => transaction(db, ["configs"], "readwrite", (tx) => {
    const store = tx.objectStore("configs");
    const request = store.get(configId);
    request.onsuccess = () => {
      const config = request.result;
      const rule = config?.rules?.find((item) => item.id === ruleId);
      if (rule) {
        rule.enabled = Boolean(enabled);
        store.put(config);
      }
    };
  }));
}

export function setRuleResponseId(configId, ruleId, selectedResponseId) {
  return withDb((db) => transaction(db, ["configs"], "readwrite", (tx) => {
    const store = tx.objectStore("configs");
    const request = store.get(configId);
    request.onsuccess = () => {
      const config = request.result;
      const rule = config?.rules?.find((item) => item.id === ruleId);
      if (rule && Array.isArray(rule.responses) && rule.responses.some((response) => response.id === selectedResponseId)) {
        rule.selectedResponseId = selectedResponseId;
        store.put(config);
      }
    };
  }));
}

export function getSyncMeta() {
  return withDb((db) => new Promise((resolve, reject) => {
    const request = db.transaction("meta", "readonly").objectStore("meta").get("sync");
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  }));
}

export function getConfigsAndSyncMeta() {
  return withDb((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(["configs", "meta"], "readonly");
    const configsRequest = tx.objectStore("configs").getAll();
    const metaRequest = tx.objectStore("meta").get("sync");
    let configs;
    let meta;
    configsRequest.onsuccess = () => { configs = sortConfigsForDisplay(configsRequest.result || []); };
    metaRequest.onsuccess = () => { meta = metaRequest.result ?? null; };
    tx.oncomplete = () => resolve({ configs, meta });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  }));
}

export function replaceConfigsAfterSync(configs, meta) {
  return withDb((db) => transaction(db, ["configs", "meta", "inputs"], "readwrite", (tx, abort) => {
    const configsStore = tx.objectStore("configs");
    const metaStore = tx.objectStore("meta");
    const inputStore = tx.objectStore("inputs");
    const oldRequest = configsStore.getAll();
    const storedInputs = inputStore.getAll();
    let oldConfigs;
    let inputRows;
    const applyReplacement = () => {
      if (!oldConfigs || !inputRows) return;
      const old = new Map(oldConfigs.map((config) => [config.id, config]));
      const previousDisplayOrder = new Map(sortConfigsForDisplay(oldConfigs)
        .map((config, index) => [config.id, index]));
      const configsInDisplayOrder = [...configs].sort((left, right) => {
        const leftOrder = previousDisplayOrder.get(left.id);
        const rightOrder = previousDisplayOrder.get(right.id);
        if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
        if (leftOrder !== undefined) return -1;
        if (rightOrder !== undefined) return 1;
        return compareConfigSource(left, right);
      });
      const storedValues = new Map(inputRows.map((item) => [`${item.configId}\0${item.inputId}`, item.value]));
      const retainedInputs = new Set();
      const defaultsAt = Date.now();
      configsStore.clear();
      for (const [displayOrder, config] of configsInDisplayOrder.entries()) {
        const previous = old.get(config.id);
        const oldRules = new Map((previous?.rules || []).map((rule) => [rule.id, rule]));
        const previousInputsComplete = Object.entries(previous?.inputs || {}).every(([inputId, descriptor]) => {
          const key = `${config.id}\0${inputId}`;
          return storedValues.has(key) && isValidInputValue(descriptor.type, storedValues.get(key));
        });
        const values = Object.create(null);
        for (const [inputId, descriptor] of Object.entries(config.inputs || {})) {
          const previousDescriptor = previous?.inputs?.[inputId];
          const key = `${config.id}\0${inputId}`;
          const stored = storedValues.get(key);
          if (previousDescriptor?.type === descriptor.type && isValidInputValue(descriptor.type, stored)) {
            values[inputId] = stored;
            retainedInputs.add(key);
            continue;
          }
          let value;
          try {
            value = resolveInputDefault(descriptor, defaultsAt);
          } catch (error) {
            abort(new Error(`Input "${inputId}": ${error.message}`));
            return;
          }
          if (value !== undefined) {
            values[inputId] = value;
            retainedInputs.add(key);
            inputStore.put({ configId: config.id, inputId, value });
          }
        }
        const inputsComplete = hasAllInputValues(config.inputs || {}, values);
        const enabled = Boolean(previous?.enabled) && previousInputsComplete && inputsComplete;
        configsStore.put({ ...config, enabled, displayOrder,
          rules: config.rules.map((rule) => {
            const oldRule = oldRules.get(rule.id);
            const selectedResponseId = Array.isArray(rule.responses) && oldRule
              && rule.responses.some((response) => response.id === oldRule.selectedResponseId)
              ? oldRule.selectedResponseId : (Array.isArray(rule.responses) ? rule.responses[0].id : null);
            return { ...rule, enabled: oldRule ? Boolean(oldRule.enabled) : true,
              ...(Array.isArray(rule.responses) && !rule.routes ? { selectedResponseId } : {}) };
          }) });
      }
      metaStore.put(meta);
      for (const item of inputRows) if (!retainedInputs.has(`${item.configId}\0${item.inputId}`)) inputStore.delete([item.configId, item.inputId]);
    };
    oldRequest.onsuccess = () => { oldConfigs = oldRequest.result; applyReplacement(); };
    storedInputs.onsuccess = () => { inputRows = storedInputs.result; applyReplacement(); };
  }));
}

function sortConfigsForDisplay(configs) {
  return [...configs].sort((left, right) => {
    const leftHasOrder = Number.isInteger(left.displayOrder) && left.displayOrder >= 0;
    const rightHasOrder = Number.isInteger(right.displayOrder) && right.displayOrder >= 0;
    if (leftHasOrder && rightHasOrder && left.displayOrder !== right.displayOrder) {
      return left.displayOrder - right.displayOrder;
    }
    if (leftHasOrder !== rightHasOrder) return leftHasOrder ? -1 : 1;
    return compareConfigSource(left, right);
  });
}

function compareConfigSource(left, right) {
  const bySource = left.sourceFile.localeCompare(right.sourceFile);
  if (bySource !== 0) return bySource;
  return left.id.localeCompare(right.id);
}
