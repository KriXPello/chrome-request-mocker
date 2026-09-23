import { getConfigsAndSyncMeta, setConfigEnabled, setRuleEnabled } from "./db.js";

const configsElement = document.querySelector("#configs");
const lastSyncElement = document.querySelector("#last-sync");
const statusElement = document.querySelector("#status");
document.querySelector("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
await render();

async function render() {
  try {
    const { configs, meta } = await getConfigsAndSyncMeta();
    lastSyncElement.textContent = `Last sync: ${meta?.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleString() : "Never"}`;
    configs.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));
    configsElement.replaceChildren(...configs.map(renderConfig));
    const ruleCount = configs.reduce((count, config) => count + config.rules.length, 0);
    statusElement.textContent = `${configs.length} config${configs.length === 1 ? "" : "s"} / ${ruleCount} rule${ruleCount === 1 ? "" : "s"}`;
    if (!configs.length) statusElement.textContent = "No configs yet. Open Settings to sync a folder.";
  } catch (error) {
    statusElement.textContent = error instanceof Error ? error.message : String(error);
  }
}

function renderConfig(config) {
  const wrapper = document.createElement("details");
  wrapper.open = true;
  const summary = document.createElement("summary");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = config.enabled;
  checkbox.addEventListener("click", (event) => event.stopPropagation());
  checkbox.addEventListener("change", () => updateConfig(config, checkbox));
  summary.append(checkbox, document.createTextNode(` ${config.name || config.id}`));
  wrapper.append(summary);
  const source = document.createElement("div");
  source.className = "source";
  source.textContent = `${config.sourceFile} · Modified: ${new Date(config.fileLastModified).toLocaleString()}`;
  wrapper.append(source);
  const rules = document.createElement("div");
  rules.className = "rules";
  for (const rule of config.rules) {
    const row = document.createElement("label");
    row.className = "rule";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = rule.enabled;
    input.addEventListener("change", () => updateRule(config, rule, input));
    const text = document.createElement("span");
    text.append(document.createTextNode(rule.name || rule.id));
    const pattern = document.createElement("small");
    pattern.textContent = rule.pattern;
    text.append(pattern);
    row.append(input, text);
    rules.append(row);
  }
  wrapper.append(rules);
  return wrapper;
}

async function updateConfig(config, checkbox) {
  const previous = !checkbox.checked;
  checkbox.disabled = true;
  try {
    await setConfigEnabled(config.id, checkbox.checked);
  } catch (error) {
    checkbox.checked = previous;
    showError(error);
  } finally {
    checkbox.disabled = false;
  }
}

async function updateRule(config, rule, checkbox) {
  const previous = !checkbox.checked;
  checkbox.disabled = true;
  try {
    await setRuleEnabled(config.id, rule.id, checkbox.checked);
  } catch (error) {
    checkbox.checked = previous;
    showError(error);
  } finally {
    checkbox.disabled = false;
  }
}

function showError(error) {
  statusElement.textContent = `Could not save setting: ${error instanceof Error ? error.message : String(error)}`;
}
