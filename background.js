import { getConfigsAndSyncMeta } from "./db.js";

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "GET_RUNTIME_CONFIG") {
    return undefined;
  }

  return loadRuntimeConfig();
});

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
