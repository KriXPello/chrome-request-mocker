const DB_NAME = "local-mock";
const DB_VERSION = 2;
const DIRECTORY_KEY = "config-directory";

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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(db, stores, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    try {
      result = action(tx);
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
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

export function setRuleResponseIndex(configId, ruleId, selectedResponseIndex) {
  return withDb((db) => transaction(db, ["configs"], "readwrite", (tx) => {
    const store = tx.objectStore("configs");
    const request = store.get(configId);
    request.onsuccess = () => {
      const config = request.result;
      const rule = config?.rules?.find((item) => item.id === ruleId);
      if (rule && Array.isArray(rule.response)) {
        rule.selectedResponseIndex = selectedResponseIndex;
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
    configsRequest.onsuccess = () => { configs = configsRequest.result || []; };
    metaRequest.onsuccess = () => { meta = metaRequest.result ?? null; };
    tx.oncomplete = () => resolve({ configs, meta });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  }));
}

export function replaceConfigsAfterSync(configs, meta) {
  return withDb((db) => transaction(db, ["configs", "meta"], "readwrite", (tx) => {
    const configsStore = tx.objectStore("configs");
    const metaStore = tx.objectStore("meta");
    const oldRequest = configsStore.getAll();
    oldRequest.onsuccess = () => {
      const old = new Map(oldRequest.result.map((config) => [config.id, config]));
      configsStore.clear();
      for (const config of configs) {
        const previous = old.get(config.id);
        const oldRules = new Map((previous?.rules || []).map((rule) => [rule.id, rule]));
        configsStore.put({ ...config, enabled: previous ? Boolean(previous.enabled) : false,
          rules: config.rules.map((rule) => {
            const oldRule = oldRules.get(rule.id);
            const selectedResponseIndex = Array.isArray(rule.response) && oldRule
              && Number.isInteger(oldRule.selectedResponseIndex)
              && oldRule.selectedResponseIndex >= 0
              && oldRule.selectedResponseIndex < rule.response.length
              ? oldRule.selectedResponseIndex : 0;
            return { ...rule, enabled: oldRule ? Boolean(oldRule.enabled) : true,
              ...(Array.isArray(rule.response) ? { selectedResponseIndex } : {}) };
          }) });
      }
      metaStore.put(meta);
    };
  }));
}
