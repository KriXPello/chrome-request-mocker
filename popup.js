import { getDirectoryHandle, getConfigsAndSyncMeta, setConfigEnabled, setRuleEnabled, setRuleResponseIndex } from "./db.js";
import { syncConfigsFromDirectory } from "./config-sync.js";

const configsElement = document.querySelector("#configs");
const lastSyncElement = document.querySelector("#last-sync");
const statusElement = document.querySelector("#status");
const syncButton = document.querySelector("#sync");
const syncStatusElement = document.querySelector("#sync-status");
let directoryHandle = null;
let syncInProgress = false;
document.querySelector("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
syncButton.addEventListener("click", syncFromFolder);
await initialize();

async function initialize() {
  try {
    directoryHandle = await getDirectoryHandle();
    syncButton.hidden = !directoryHandle;
    await render();
  } catch (error) {
    statusElement.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function render() {
  try {
    const { configs, meta } = await getConfigsAndSyncMeta();
    let lastSync = "Never";
    if (meta?.lastSyncAt) {
      lastSync = formatDate(meta.lastSyncAt);
    }
    lastSyncElement.textContent = `Last sync: ${lastSync}`;
    configs.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));
    configsElement.replaceChildren(...configs.map(renderConfig));
    setInteractionState();
    const ruleCount = configs.reduce((count, config) => count + config.rules.length, 0);
    statusElement.textContent = `${configs.length} config${configs.length === 1 ? "" : "s"} / ${ruleCount} rule${ruleCount === 1 ? "" : "s"}`;
    if (!configs.length) {
      if (directoryHandle) {
        statusElement.textContent = "No configs yet. Click Sync to import them.";
      } else {
        statusElement.textContent = "No configs yet. Open Settings to choose a folder.";
      }
    }
  } catch (error) {
    statusElement.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function syncFromFolder() {
  if (syncInProgress || !directoryHandle) return;
  syncInProgress = true;
  syncButton.textContent = "Syncing…";
  syncButton.disabled = true;
  setInteractionState();
  setSyncStatus("Syncing configs…", "progress");
  try {
    await syncConfigsFromDirectory(directoryHandle);
    await render();
    setSyncStatus("Synced successfully. Reload the page to apply changes.", "success");
  } catch (error) {
    setSyncStatus(`Sync failed.\n${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    syncInProgress = false;
    syncButton.textContent = "Sync";
    syncButton.disabled = false;
    setInteractionState();
  }
}

function setInteractionState() {
  configsElement.querySelectorAll("input, select").forEach((control) => { control.disabled = syncInProgress; });
}

function renderConfig(config) {
  const wrapper = document.createElement("details");
  wrapper.open = true;
  const summary = document.createElement("summary");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = config.enabled;
  checkbox.disabled = syncInProgress;
  checkbox.addEventListener("click", (event) => event.stopPropagation());
  checkbox.addEventListener("change", () => updateConfig(config, checkbox));
  summary.append(checkbox, document.createTextNode(` ${config.name || config.id}`));
  wrapper.append(summary);
  const source = document.createElement("div");
  source.className = "source";
  source.textContent = `${config.sourceFile} · Modified: ${formatDate(config.fileLastModified)}`;
  wrapper.append(source);
  const rules = document.createElement("div");
  rules.className = "rules";
  for (const rule of config.rules) {
    const row = document.createElement("div");
    row.className = "rule";
    const main = document.createElement("label");
    main.className = "rule-main";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = rule.enabled;
    input.disabled = syncInProgress;
    input.addEventListener("change", () => updateRule(config, rule, input));
    const text = document.createElement("span");
    text.className = "rule-name";
    text.textContent = rule.name || rule.id;
    const pattern = document.createElement("small");
    pattern.className = "rule-pattern";
    pattern.textContent = rule.pattern;
    main.append(input, text);
    row.append(main);
    if (config.formatVersion === 2 && Array.isArray(rule.response) && rule.response.length > 1) {
      const select = document.createElement("select");
      select.className = "response-select";
      select.disabled = syncInProgress;
      select.setAttribute("aria-label", `Response for ${rule.name || rule.id}`);
      const selectedIndex = Number.isInteger(rule.selectedResponseIndex)
        && rule.selectedResponseIndex >= 0 && rule.selectedResponseIndex < rule.response.length
        ? rule.selectedResponseIndex : 0;
      rule.response.forEach((response, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = response.name || `Response ${index + 1}`;
        select.append(option);
      });
      select.value = String(selectedIndex);
      select.addEventListener("change", () => updateResponse(config, rule, select));
      row.append(select);
    }
    row.append(pattern);
    rules.append(row);
  }
  wrapper.append(rules);
  return wrapper;
}

async function updateResponse(config, rule, select) {
  if (syncInProgress) return;
  const previous = rule.selectedResponseIndex ?? 0;
  const selectedResponseIndex = Number(select.value);
  select.disabled = true;
  try {
    await setRuleResponseIndex(config.id, rule.id, selectedResponseIndex);
    rule.selectedResponseIndex = selectedResponseIndex;
  } catch (error) {
    select.value = String(previous);
    showError(error);
  } finally {
    select.disabled = syncInProgress;
  }
}

async function updateConfig(config, checkbox) {
  if (syncInProgress) return;
  const previous = !checkbox.checked;
  checkbox.disabled = true;
  try {
    await setConfigEnabled(config.id, checkbox.checked);
  } catch (error) {
    checkbox.checked = previous;
    showError(error);
  } finally {
    checkbox.disabled = syncInProgress;
  }
}

async function updateRule(config, rule, checkbox) {
  if (syncInProgress) return;
  const previous = !checkbox.checked;
  checkbox.disabled = true;
  try {
    await setRuleEnabled(config.id, rule.id, checkbox.checked);
  } catch (error) {
    checkbox.checked = previous;
    showError(error);
  } finally {
    checkbox.disabled = syncInProgress;
  }
}

function showError(error) {
  statusElement.textContent = `Could not save setting: ${error instanceof Error ? error.message : String(error)}`;
}

function setSyncStatus(message, kind) {
  syncStatusElement.textContent = message;
  syncStatusElement.className = `sync-status ${kind}`;
  syncStatusElement.hidden = false;
}

function formatDate(value) {
  const date = new Date(value);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
