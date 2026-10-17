import { getDirectoryHandle, getConfigsAndSyncMeta, getConfigInputs, saveConfigInputs, resetConfigTime, setConfigDisplayOrder, setConfigEnabled, setRuleEnabled, setRuleResponseId, toggleAllConfigs } from "../../storage/db.js";
import { inputsReady } from "../../config/inputs.js";
import { resolveRuntimeRule } from "../../config/runtime-rule.js";
import { syncConfigsFromDirectory } from "../../sync/sync-from-directory.js";
import { notifyRuntimeConfig } from "../runtime-config.js";
import { readInputDraft, cleanupInputDrafts, clearInputDraft } from "./input-drafts.js";
import { collectInputValues } from "./input-editor.js";
import { createConfigCard, COLLAPSED_CONFIG_PREFIX } from "./config-card.js";
import { formatDate } from "./format-date.js";
import { initializeSiteAccess } from "./site-access.js";

const mainElement = document.querySelector("main");
const configsElement = document.querySelector("#configs");
const lastSyncElement = document.querySelector("#last-sync");
const statusElement = document.querySelector("#status");
const syncButton = document.querySelector("#sync");
const reorderButton = document.querySelector("#reorder");
const toggleAllButton = document.querySelector("#toggle-all");
const collapseAllButton = document.querySelector("#collapse-all");
const syncStatusElement = document.querySelector("#sync-status");
const SCROLL_POSITION_KEY = "popup-scroll-top";
let directoryHandle = null;
let syncInProgress = false;
let editingConfigId = null;
let inputSaveInProgress = false;
let configOrderUpdateInProgress = false;
let configToggleInProgress = false;
let displayedConfigIds = [];
let reorderMode = false;
let renderVersion = 0;
document.querySelector("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
syncButton.addEventListener("click", syncFromFolder);
reorderButton.addEventListener("click", toggleReorderMode);
toggleAllButton.addEventListener("click", toggleConfigs);
collapseAllButton.addEventListener("click", toggleCollapsedConfigs);
initializeSiteAccess();
await initialize();

async function initialize() {
  try {
    directoryHandle = await getDirectoryHandle();
    syncButton.hidden = !directoryHandle;
    await render();
    mainElement.scrollTop = Number(localStorage.getItem(SCROLL_POSITION_KEY));
    mainElement.addEventListener("scrollend", saveScrollPosition);
    window.addEventListener("pagehide", saveScrollPosition);
  } catch (error) {
    statusElement.textContent = error instanceof Error ? error.message : String(error);
  }
}

function saveScrollPosition() {
  localStorage.setItem(SCROLL_POSITION_KEY, String(mainElement.scrollTop));
}

async function render() {
  const version = ++renderVersion;
  try {
    const { configs, meta } = await getConfigsAndSyncMeta();
    if (version !== renderVersion) return;
    let lastSync = "Never";
    if (meta?.lastSyncAt) {
      lastSync = formatDate(meta.lastSyncAt);
    }
    lastSyncElement.textContent = `Last sync: ${lastSync}`;
    displayedConfigIds = configs.map((config) => config.id);
    cleanupCollapsedConfigs(new Set(displayedConfigIds));
    reorderButton.dataset.unavailable = String(configs.length < 2 && !reorderMode);
    if (reorderMode) {
      configsElement.replaceChildren(...configs.map((config, index) =>
        renderConfigOrderRow(config, index, configs.length)));
    } else {
      const values = await Promise.all(configs.map((config) => getConfigInputs(config.id)));
      if (version !== renderVersion) return;
      cleanupInputDrafts(new Set(configs.map((config) => config.id)));
      const drafts = configs.map((config, index) => readInputDraft(config, values[index]));
      configsElement.replaceChildren(...configs.map((config, index) =>
        createConfigCard(config, values[index], drafts[index], {
          syncInProgress,
          editingConfigId,
          onCollapseChange: setInteractionState,
          onToggle: (checkbox) => updateConfig(config, checkbox),
          onEditInputs: () => {
            if (editingConfigId !== null) return;
            editingConfigId = config.id;
            render();
          },
          onCancelInputs: () => {
            clearInputDraft(config.id);
            editingConfigId = null;
            render();
          },
          onSaveInputs: (controls, inputsMissing) => commitInputDraft(config, controls, inputsMissing),
          onResetTime: () => resetTime(config),
          onToggleRule: (rule, checkbox) => updateRule(config, rule, checkbox),
          onSelectResponse: (rule, select) => updateResponse(config, rule, select),
          onViewResponse: (rule, responseId) => openResponseViewer(config, rule, responseId),
          onError: showError
        })));
    }
    setInteractionState();
    const hasOldSnapshot = configs.some((config) => (config.formatVersion ?? 0) < 3);
    if (hasOldSnapshot) {
      setSyncStatus("This snapshot is outdated. Sync the configuration to use it.", "error");
    }
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
    await notifyRuntimeConfig();
    await render();
    setSyncStatus("Synced successfully. Changes apply to open pages.", "success");
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
  syncButton.disabled = syncInProgress || inputSaveInProgress || configToggleInProgress || configOrderUpdateInProgress || editingConfigId !== null;
  reorderButton.disabled = syncInProgress || inputSaveInProgress || configToggleInProgress || configOrderUpdateInProgress
    || editingConfigId !== null || reorderButton.dataset.unavailable === "true";
  if (reorderMode) {
    toggleAllButton.disabled = true;
    collapseAllButton.disabled = true;
  } else {
    const configs = [...configsElement.querySelectorAll(".config")];
    const readyConfigs = configs.filter((element) => element.dataset.inputsMissing === "false"
      && !element.querySelector(".snapshot-warning"));
    const anyEnabled = readyConfigs.some((element) => element.querySelector(".config-toggle").checked);
    toggleAllButton.textContent = anyEnabled ? "Disable all" : "Enable all";
    toggleAllButton.disabled = syncInProgress || inputSaveInProgress || configToggleInProgress
      || configOrderUpdateInProgress || editingConfigId !== null || readyConfigs.length === 0;
    collapseAllButton.textContent = configs.some((element) => element.open) ? "Collapse all" : "Expand all";
    collapseAllButton.disabled = syncInProgress || inputSaveInProgress || configToggleInProgress
      || configOrderUpdateInProgress || editingConfigId !== null || configs.length === 0;
  }
  configsElement.querySelectorAll(".config").forEach((configElement) => {
    const oldSnapshot = configElement.querySelector(".snapshot-warning") !== null;
    const inputsMissing = configElement.dataset.inputsMissing === "true";
    const editor = configElement.querySelector(".input-editor");
    configElement.querySelectorAll("input, select").forEach((control) => {
      control.disabled = syncInProgress || inputSaveInProgress || configToggleInProgress || configOrderUpdateInProgress || oldSnapshot
        || (inputsMissing && control.classList.contains("config-toggle"))
        || (editingConfigId !== null && !editor?.contains(control));
    });
    configElement.querySelectorAll("button").forEach((button) => {
      if (button.matches(".rule-view-button, .route-response-button")) return;
      button.disabled = syncInProgress || inputSaveInProgress || configToggleInProgress || configOrderUpdateInProgress || oldSnapshot
        || button.dataset.unavailable === "true"
        || (editingConfigId !== null && !editor);
    });
  });
}

async function openResponseViewer(config, rule, responseId = rule.selectedResponseId) {
  const selection = new URLSearchParams({ config: config.id, rule: rule.id });
  if (responseId) selection.set("response", responseId);
  try {
    await chrome.tabs.create({ url: `${chrome.runtime.getURL("src/ui/viewer/index.html")}#${selection}` });
  } catch (error) {
    showError(error);
  }
}

function renderConfigOrderRow(config, index, configCount) {
  const row = document.createElement("div");
  row.className = "config config-order-row";
  const title = document.createElement("span");
  title.className = "config-order-title";
  title.textContent = config.name || config.id;
  const actions = document.createElement("span");
  actions.className = "config-header-actions";
  actions.append(makeOrderAction("↑", `Move ${config.name || config.id} up`, index === 0,
    () => moveConfig(config.id, -1)));
  actions.append(makeOrderAction("↓", `Move ${config.name || config.id} down`, index === configCount - 1,
    () => moveConfig(config.id, 1)));
  row.append(title, actions);
  return row;
}

function toggleReorderMode() {
  if (syncInProgress || inputSaveInProgress || configToggleInProgress
    || configOrderUpdateInProgress || editingConfigId !== null) return;
  reorderMode = !reorderMode;
  reorderButton.textContent = reorderMode ? "Done" : "Reorder";
  reorderButton.setAttribute("aria-pressed", String(reorderMode));
  render();
}

function toggleCollapsedConfigs() {
  if (collapseAllButton.disabled) return;
  const configs = [...configsElement.querySelectorAll(".config")];
  const expand = !configs.some((element) => element.open);
  for (const element of configs) {
    const key = `${COLLAPSED_CONFIG_PREFIX}${element.dataset.configId}`;
    element.open = expand;
    if (expand) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, "true");
    }
  }
  setInteractionState();
}

async function toggleConfigs() {
  if (toggleAllButton.disabled) return;
  configToggleInProgress = true;
  setInteractionState();
  try {
    await toggleAllConfigs();
    await notifyRuntimeConfig();
    await render();
  } catch (error) {
    showError(error);
  } finally {
    configToggleInProgress = false;
    setInteractionState();
  }
}

function makeOrderAction(text, label, unavailable, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "config-order-button";
  button.textContent = text;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.dataset.unavailable = String(unavailable);
  button.disabled = unavailable;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  });
  return button;
}

async function moveConfig(configId, offset) {
  if (!reorderMode || syncInProgress || inputSaveInProgress || configToggleInProgress
    || configOrderUpdateInProgress || editingConfigId !== null) return;
  const currentIndex = displayedConfigIds.indexOf(configId);
  const targetIndex = currentIndex + offset;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= displayedConfigIds.length) return;

  const nextOrder = [...displayedConfigIds];
  [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];
  configOrderUpdateInProgress = true;
  setInteractionState();
  try {
    await setConfigDisplayOrder(nextOrder);
    await render();
  } catch (error) {
    showError(error);
  } finally {
    configOrderUpdateInProgress = false;
    setInteractionState();
  }
}

function cleanupCollapsedConfigs(configIds) {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(COLLAPSED_CONFIG_PREFIX) && !configIds.has(key.slice(COLLAPSED_CONFIG_PREFIX.length))) {
      localStorage.removeItem(key);
    }
  }
}

async function resetTime(config) {
  if (syncInProgress || inputSaveInProgress || configToggleInProgress || configOrderUpdateInProgress || editingConfigId !== null) return;
  inputSaveInProgress = true;
  setInteractionState();
  try {
    await resetConfigTime(config.id, config.importedAt);
    await notifyRuntimeConfig();
    await render();
  } catch (error) {
    showError(error);
  } finally {
    inputSaveInProgress = false;
    setInteractionState();
  }
}

async function commitInputDraft(config, controls, wasIncomplete) {
  if (inputSaveInProgress) return;
  inputSaveInProgress = true;
  setInteractionState();
  try {
    const values = collectInputValues(config, controls);
    if (inputsReady(config.inputs, values)) {
      for (const rule of config.rules) resolveRuntimeRule(rule, config.inputs, values);
    }
    await saveConfigInputs(config.id, config.importedAt, config.inputs, values, wasIncomplete);
    clearInputDraft(config.id);
    await notifyRuntimeConfig();
    editingConfigId = null;
    await render();
  } catch (error) {
    showError(error);
  } finally {
    inputSaveInProgress = false;
    setInteractionState();
  }
}

async function updateResponse(config, rule, select) {
  if (syncInProgress) return;
  const previous = rule.selectedResponseId || rule.responses[0].id;
  const selectedResponseId = select.value;
  select.disabled = true;
  try {
    await setRuleResponseId(config.id, rule.id, selectedResponseId);
    rule.selectedResponseId = selectedResponseId;
    await notifyRuntimeConfig();
  } catch (error) {
    select.value = previous;
    showError(error);
  } finally {
    select.disabled = syncInProgress;
  }
}

async function updateConfig(config, checkbox) {
  if (syncInProgress || configToggleInProgress) return;
  const previous = !checkbox.checked;
  configToggleInProgress = true;
  setInteractionState();
  try {
    await setConfigEnabled(config.id, checkbox.checked);
    await notifyRuntimeConfig();
  } catch (error) {
    checkbox.checked = previous;
    showError(error);
  } finally {
    configToggleInProgress = false;
    setInteractionState();
  }
}

async function updateRule(config, rule, checkbox) {
  if (syncInProgress) return;
  const previous = !checkbox.checked;
  checkbox.disabled = true;
  try {
    await setRuleEnabled(config.id, rule.id, checkbox.checked);
    await notifyRuntimeConfig();
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
