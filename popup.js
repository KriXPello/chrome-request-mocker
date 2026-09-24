import { getDirectoryHandle, getConfigsAndSyncMeta, setConfigEnabled, setRuleEnabled } from "./db.js";
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
    lastSyncElement.textContent = `Last sync: ${meta?.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleString() : "Never"}`;
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
  configsElement.querySelectorAll("input").forEach((input) => { input.disabled = syncInProgress; });
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
    input.disabled = syncInProgress;
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
