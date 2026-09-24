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
    const active = configs.filter((config) => config.enabled).sort((a, b) =>
      a.sourceFile.localeCompare(b.sourceFile));
    const rules = [];
    for (const config of active) {
      for (const rule of config.rules) {
        if (rule.enabled) {
          const runtimeRule = { ...rule };
          if (config.formatVersion === 2 && Array.isArray(rule.response)) {
            const index = Number.isInteger(rule.selectedResponseIndex)
              && rule.selectedResponseIndex >= 0
              && rule.selectedResponseIndex < rule.response.length
              ? rule.selectedResponseIndex : 0;
            runtimeRule.response = { ...rule.response[index] };
            delete runtimeRule.response.name;
          }
          delete runtimeRule.selectedResponseIndex;
          rules.push({ ...runtimeRule, responseFormatVersion: config.formatVersion ?? 1,
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
