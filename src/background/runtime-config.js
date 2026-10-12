import { getConfigsAndSyncMeta, getConfigInputs, getLoggingMode } from "../storage/db.js";
import { inputsReady } from "../config/inputs.js";
import { resolveRuntimeRule } from "../config/runtime-rule.js";

export async function loadRuntimeConfig() {
  try {
    const [{ configs, meta }, loggingMode] = await Promise.all([getConfigsAndSyncMeta(), getLoggingMode()]);
    const candidates = configs.filter((config) => config.enabled && config.formatVersion === 3).sort((a, b) =>
      a.sourceFile.localeCompare(b.sourceFile));
    const active = [];
    const rules = [];
    for (const config of candidates) {
      const values = await getConfigInputs(config.id);
      if (!inputsReady(config.inputs, values)) continue;
      active.push(config);
      for (const rule of config.rules) {
        if (rule.enabled) {
          try {
            let runtimeSource = rule;
            if (Array.isArray(rule.responses) && !rule.routes) {
              const selected = rule.responses.find((response) => response.id === rule.selectedResponseId)
                || rule.responses[0];
              runtimeSource = { ...rule, response: selected };
              delete runtimeSource.responses;
              delete runtimeSource.selectedResponseId;
            }
            const runtimeRule = resolveRuntimeRule(runtimeSource, config.inputs || {}, values);
            rules.push({ ...runtimeRule, responseFormatVersion: 3, configId: config.id, ruleId: rule.id });
          } catch (error) {
            console.warn(`[Chrome Request Mocker] Skipping ${config.id}/${rule.id}:`, error);
          }
        }
      }
    }
    return { ok: true, config: { rules, loggingMode }, activeConfigCount: active.length,
      activeRuleCount: rules.length, lastSyncAt: meta?.lastSyncAt ?? null };
  } catch (error) {
    return { ok: false, code: "database-error", error: error instanceof Error ? error.message : String(error) };
  }
}
