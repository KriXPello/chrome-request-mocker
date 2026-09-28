import { getConfigsAndSyncMeta } from "./db.js";

let runtimeRevision = 0;
let updateQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "GET_RUNTIME_CONFIG") {
    return loadRuntimeConfig().then((payload) => ({ ...payload, revision: runtimeRevision }));
  }

  if (message?.type === "RUNTIME_CONFIG_UPDATED") {
    updateQueue = updateQueue.then(broadcastRuntimeConfig, broadcastRuntimeConfig);
    return updateQueue;
  }

  return undefined;
});

function broadcastRuntimeConfig() {
  runtimeRevision += 1;
  return loadRuntimeConfig().then(async (payload) => {
    const message = { type: "RUNTIME_CONFIG_UPDATE", payload, revision: runtimeRevision };
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({});
    } catch (error) {
      console.warn("Could not enumerate tabs for runtime config update.", error);
      return { ok: false };
    }
    await Promise.allSettled(tabs.filter((tab) => tab.id !== undefined).map((tab) =>
      sendRuntimeUpdate(tab.id, message)));
    return { ok: true };
  });
}

async function sendRuntimeUpdate(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // A tab can disappear or reject extension messaging while the update is sent.
  }
}

async function loadRuntimeConfig() {
  try {
    const { configs, meta } = await getConfigsAndSyncMeta();
    const active = configs.filter((config) => config.enabled && config.formatVersion === 3).sort((a, b) =>
      a.sourceFile.localeCompare(b.sourceFile));
    const rules = [];
    for (const config of active) {
      for (const rule of config.rules) {
        if (rule.enabled) {
          const runtimeRule = { ...rule };
          if (Array.isArray(rule.responses) && !rule.routes) {
            const selected = rule.responses.find((response) => response.id === rule.selectedResponseId) || rule.responses[0];
            runtimeRule.response = { ...selected };
            delete runtimeRule.response.id;
            delete runtimeRule.response.name;
            delete runtimeRule.responses;
            delete runtimeRule.selectedResponseId;
          }
          rules.push({ ...runtimeRule, responseFormatVersion: 3,
            configId: config.id, ruleId: rule.id });
        }
      }
    }
    return { ok: true, config: { rules }, activeConfigCount: active.length,
      activeRuleCount: rules.length, lastSyncAt: meta?.lastSyncAt ?? null };
  } catch (error) {
    return { ok: false, code: "database-error", error: error instanceof Error ? error.message : String(error) };
  }
}
