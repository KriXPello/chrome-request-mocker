import { getDirectoryHandle, getConfigsAndSyncMeta, getConfigInputs, saveConfigInputs, setConfigDisplayOrder, setConfigEnabled, setRuleEnabled, setRuleResponseId } from "./db.js";
import { inputReadiness, inputsReady, resolveRuntimeRule } from "./inputs.js";
import { syncConfigsFromDirectory } from "./config-sync.js";

const configsElement = document.querySelector("#configs");
const lastSyncElement = document.querySelector("#last-sync");
const statusElement = document.querySelector("#status");
const syncButton = document.querySelector("#sync");
const reorderButton = document.querySelector("#reorder");
const syncStatusElement = document.querySelector("#sync-status");
const INPUT_DRAFT_PREFIX = "config-input-draft:";
const COLLAPSED_CONFIG_PREFIX = "collapsed-config:";
let directoryHandle = null;
let syncInProgress = false;
let editingConfigId = null;
let inputSaveInProgress = false;
let configOrderUpdateInProgress = false;
let displayedConfigIds = [];
let reorderMode = false;
let renderVersion = 0;
document.querySelector("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
syncButton.addEventListener("click", syncFromFolder);
reorderButton.addEventListener("click", toggleReorderMode);
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
        renderConfig(config, values[index], drafts[index])));
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
  syncButton.disabled = syncInProgress || configOrderUpdateInProgress || editingConfigId !== null;
  reorderButton.disabled = syncInProgress || inputSaveInProgress || configOrderUpdateInProgress
    || editingConfigId !== null || reorderButton.dataset.unavailable === "true";
  configsElement.querySelectorAll(".config").forEach((configElement) => {
    const oldSnapshot = configElement.querySelector(".snapshot-warning") !== null;
    const inputsMissing = configElement.dataset.inputsMissing === "true";
    const editor = configElement.querySelector(".input-editor");
    configElement.querySelectorAll("input, select").forEach((control) => {
      control.disabled = syncInProgress || inputSaveInProgress || configOrderUpdateInProgress || oldSnapshot
        || (inputsMissing && control.classList.contains("config-toggle"))
        || (editingConfigId !== null && !editor?.contains(control));
    });
    configElement.querySelectorAll("button").forEach((button) => {
      button.disabled = syncInProgress || inputSaveInProgress || configOrderUpdateInProgress || oldSnapshot
        || button.dataset.unavailable === "true"
        || (editingConfigId !== null && !editor);
    });
  });
}

function renderConfig(config, values = {}, draftValues = null) {
  const oldSnapshot = (config.formatVersion ?? 0) < 3;
  const readiness = inputReadiness(config.inputs, values);
  const inputsMissing = readiness.missing > 0;
  const wrapper = document.createElement("details");
  wrapper.className = "config";
  wrapper.dataset.inputsMissing = String(inputsMissing);
  const collapsedKey = `${COLLAPSED_CONFIG_PREFIX}${config.id}`;
  wrapper.open = localStorage.getItem(collapsedKey) !== "true";
  const summary = document.createElement("summary");
  summary.addEventListener("click", (event) => {
    if (event.target.closest("button, input, select")) return;
    event.preventDefault();
    wrapper.open = !wrapper.open;
    if (wrapper.open) {
      localStorage.removeItem(collapsedKey);
    } else {
      localStorage.setItem(collapsedKey, "true");
    }
  });
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "config-toggle";
  checkbox.checked = config.enabled && !inputsMissing;
  checkbox.disabled = syncInProgress || oldSnapshot || inputsMissing;
  if (inputsMissing) {
    checkbox.title = "Fill in all inputs before enabling this config.";
  }
  checkbox.addEventListener("click", (event) => event.stopPropagation());
  checkbox.addEventListener("change", () => updateConfig(config, checkbox));
  const title = document.createElement("span");
  title.textContent = ` ${config.name || config.id}`;
  summary.append(checkbox, title);
  const actions = document.createElement("span");
  actions.className = "config-header-actions";
  if (editingConfigId === config.id) {
    const draftIndicator = document.createElement("span");
    draftIndicator.className = "input-draft-indicator";
    draftIndicator.textContent = "Unsaved";
    draftIndicator.hidden = draftValues === null;
    actions.append(draftIndicator);
    actions.append(makeEditorAction("Save", () => commitInputDraft(config, editorControls, inputsMissing)));
    actions.append(makeEditorAction("Cancel", () => {
      clearInputDraft(config.id);
      editingConfigId = null;
      render();
    }));
  } else {
    if (config.inputs && Object.keys(config.inputs).length) {
      const editButton = document.createElement("button");
      editButton.type = "button";
      if (draftValues) {
        editButton.className = "inputs-button unsaved";
        editButton.textContent = "Inputs · Unsaved";
      } else {
        editButton.className = `inputs-button ${readiness.missing ? "missing" : ""}`;
        editButton.textContent = readiness.missing ? `Inputs · ${readiness.missing} missing` : `Inputs ${readiness.ready}/${readiness.total}`;
      }
      editButton.disabled = syncInProgress || editingConfigId !== null;
      editButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (editingConfigId !== null) return;
        editingConfigId = config.id;
        render();
      });
      actions.append(editButton);
    }
  }
  actions.addEventListener("click", (event) => { if (event.target.closest("button")) event.stopPropagation(); });
  summary.append(actions);
  wrapper.append(summary);
  if (oldSnapshot) {
    const warning = document.createElement("div");
    warning.className = "snapshot-warning";
    warning.textContent = "Outdated snapshot — Sync required";
    wrapper.append(warning);
  }
  let editorControls = null;
  if (editingConfigId === config.id) {
    const draftIndicator = summary.querySelector(".input-draft-indicator");
    const editor = createInputEditor(config, values, draftValues, (controls) => {
      try {
        const hasDraft = storeInputDraft(config, values, collectRawInputValues(config, controls));
        draftIndicator.hidden = !hasDraft;
        draftIndicator.textContent = "Unsaved";
        draftIndicator.classList.remove("error");
      } catch (error) {
        draftIndicator.hidden = false;
        draftIndicator.textContent = "Draft not saved";
        draftIndicator.classList.add("error");
        showError(error);
      }
    });
    editorControls = editor.controls;
    wrapper.append(editor.element);
    return wrapper;
  }
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
    input.disabled = syncInProgress || oldSnapshot;
    input.addEventListener("change", () => updateRule(config, rule, input));
    const text = document.createElement("span");
    text.className = "rule-name";
    text.textContent = rule.name || rule.id;
    const pattern = document.createElement("small");
    pattern.className = "rule-pattern";
    pattern.textContent = rule.pattern;
    main.append(input, text);
    row.append(main);
    if (config.formatVersion === 3 && Array.isArray(rule.responses) && !rule.routes) {
      const select = document.createElement("select");
      select.className = "response-select";
      select.disabled = syncInProgress;
      select.setAttribute("aria-label", `Response for ${rule.name || rule.id}`);
      const selectedId = rule.selectedResponseId || rule.responses[0].id;
      rule.responses.forEach((response) => {
        const option = document.createElement("option");
        option.value = response.id;
        option.textContent = response.name || response.id;
        select.append(option);
      });
      select.value = selectedId;
      select.addEventListener("change", () => updateResponse(config, rule, select));
      row.append(select);
    }
    row.append(pattern);
    if (rule.query) {
      row.append(renderQueryDetails(rule.query));
    }
    if (config.formatVersion === 3 && Array.isArray(rule.responses) && rule.routes) {
      row.append(renderRoutingDetails(rule));
    }
    rules.append(row);
  }
  wrapper.append(rules);
  return wrapper;
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
  if (syncInProgress || inputSaveInProgress || configOrderUpdateInProgress || editingConfigId !== null) return;
  reorderMode = !reorderMode;
  reorderButton.textContent = reorderMode ? "Done" : "Reorder";
  reorderButton.setAttribute("aria-pressed", String(reorderMode));
  render();
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
  if (!reorderMode || syncInProgress || inputSaveInProgress || configOrderUpdateInProgress || editingConfigId !== null) return;
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

function makeEditorAction(text, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.disabled = syncInProgress;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  });
  return button;
}

function readInputDraft(config, savedValues) {
  const key = inputDraftKey(config.id);
  let record;
  try {
    record = JSON.parse(localStorage.getItem(key));
  } catch {
    localStorage.removeItem(key);
    return null;
  }
  if (!record || !Array.isArray(record.fields)) {
    localStorage.removeItem(key);
    return null;
  }

  const rows = new Map();
  for (const row of record.fields) {
    if (row && typeof row.id === "string" && typeof row.type === "string" && typeof row.raw === "string") {
      rows.set(row.id, row);
    }
  }

  const values = Object.create(null);
  let hasCompatibleField = false;
  for (const [id, descriptor] of Object.entries(config.inputs || {})) {
    const row = rows.get(id);
    if (row?.type === descriptor.type) {
      values[id] = row.raw;
      hasCompatibleField = true;
    } else {
      values[id] = storedInputAsRaw(descriptor, savedValues[id]);
    }
  }
  if (!hasCompatibleField || !inputDraftDiffers(config, savedValues, values)) {
    localStorage.removeItem(key);
    return null;
  }
  return values;
}

function storeInputDraft(config, savedValues, rawValues) {
  if (!inputDraftDiffers(config, savedValues, rawValues)) {
    clearInputDraft(config.id);
    return false;
  }
  const fields = Object.entries(config.inputs).map(([id, descriptor]) => ({
    id,
    type: descriptor.type,
    raw: rawValues[id]
  }));
  localStorage.setItem(inputDraftKey(config.id), JSON.stringify({ fields }));
  return true;
}

function inputDraftDiffers(config, savedValues, rawValues) {
  return Object.entries(config.inputs).some(([id, descriptor]) =>
    rawValues[id] !== storedInputAsRaw(descriptor, savedValues[id]));
}

function storedInputAsRaw(descriptor, value) {
  if (descriptor.type === "boolean") {
    return typeof value === "boolean" ? String(value) : "";
  }
  if (descriptor.type === "number") {
    return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  }
  return typeof value === "string" ? value : "";
}

function clearInputDraft(configId) {
  localStorage.removeItem(inputDraftKey(configId));
}

function cleanupInputDrafts(configIds) {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(INPUT_DRAFT_PREFIX) && !configIds.has(key.slice(INPUT_DRAFT_PREFIX.length))) {
      localStorage.removeItem(key);
    }
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

function inputDraftKey(configId) {
  return `${INPUT_DRAFT_PREFIX}${configId}`;
}

function createInputEditor(config, values, draftValues, onChange) {
  const element = document.createElement("div");
  element.className = "input-editor";
  const controls = Object.create(null);
  for (const [id, descriptor] of Object.entries(config.inputs)) {
    const label = document.createElement("label");
    const title = document.createElement("span");
    title.textContent = descriptor.name || id;
    label.append(title);
    const hasDraft = draftValues !== null;
    const value = hasDraft ? draftValues[id] : values[id];
    const control = createInputControl(id, descriptor, value, label, hasDraft);
    controls[id] = control;
    control.addEventListener(control instanceof HTMLSelectElement ? "change" : "input", () => onChange(controls));
    element.append(label);
  }
  return { element, controls };
}

function createInputControl(id, descriptor, value, label, valueIsRaw) {
  if (descriptor.type === "boolean") {
    const select = document.createElement("select");
    for (const [optionValue, text] of [["", "Not set"], ["true", "true"], ["false", "false"]]) {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = text;
      select.append(option);
    }
    select.value = valueIsRaw ? value : typeof value === "boolean" ? String(value) : "";
    label.append(select);
    return select;
  }

  const input = document.createElement("input");
  input.type = descriptor.type === "number" ? "number" : descriptor.masked ? "password" : "text";
  input.value = value ?? "";
  if (descriptor.type === "number") input.step = "any";
  label.append(input);
  if (descriptor.masked) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "Show";
    toggle.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
      toggle.textContent = input.type === "password" ? "Show" : "Hide";
    });
    label.append(toggle);
  }
  return input;
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

function collectRawInputValues(config, controls) {
  const values = Object.create(null);
  for (const id of Object.keys(config.inputs)) {
    values[id] = controls[id].value;
  }
  return values;
}

function collectInputValues(config, controls) {
  const values = Object.create(null);
  for (const [id, descriptor] of Object.entries(config.inputs)) {
    const control = controls[id];
    const label = descriptor.name || id;
    const raw = control.value;
    if (descriptor.type === "string") {
      if (raw !== "") values[id] = raw;
    } else if (descriptor.type === "number") {
      if (control.validity.badInput) throw new Error(`${label}: enter a valid finite number.`);
      if (raw !== "") {
        const number = Number(raw);
        if (!Number.isFinite(number)) throw new Error(`${label}: enter a valid finite number.`);
        values[id] = number;
      }
    } else if (raw !== "") {
      values[id] = raw === "true";
    }
  }
  return values;
}

function renderRoutingDetails(rule) {
  const details = document.createElement("details");
  details.className = "rule-details route-details";
  const summary = document.createElement("summary");
  summary.textContent = `Automatic · ${rule.routes.length} routes`;
  details.append(summary);

  const table = document.createElement("table");
  table.className = "routes-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Query", "Response"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);
  table.append(head);

  const responses = new Map(rule.responses.map((response) => [response.id, response]));
  const body = document.createElement("tbody");
  for (const route of rule.routes) {
    const routeRow = document.createElement("tr");
    const conditionsCell = document.createElement("td");
    conditionsCell.className = "route-conditions";
    if (route.query) {
      appendQueryGroups(conditionsCell, route.query);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "query-condition-group route-fallback";
      fallback.textContent = "[fallback]";
      conditionsCell.append(fallback);
    }

    const responseCell = document.createElement("td");
    responseCell.className = "route-response";
    const response = responses.get(route.responseId);
    responseCell.textContent = response?.name || route.responseId;
    routeRow.append(conditionsCell, responseCell);
    body.append(routeRow);
  }
  table.append(body);
  details.append(table);
  return details;
}

function renderQueryDetails(query) {
  const details = document.createElement("details");
  details.className = "rule-details query-details";
  const summary = document.createElement("summary");
  summary.textContent = "Query";
  details.append(summary);
  const groups = document.createElement("div");
  groups.className = "query-groups";
  appendQueryGroups(groups, query);
  details.append(groups);
  return details;
}

function appendQueryGroups(container, query) {
  for (const alternative of query) {
    const group = document.createElement("div");
    group.className = "query-condition-group";
    for (const [name, values] of Object.entries(alternative)) {
      const condition = document.createElement("div");
      condition.className = "query-condition";
      condition.textContent = `${name}: ${values.map(displayQueryValue).join(" | ")}`;
      group.append(condition);
    }
    container.append(group);
  }
}

function displayQueryValue(value) {
  return value === "" ? '""' : value;
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
  if (syncInProgress) return;
  const previous = !checkbox.checked;
  checkbox.disabled = true;
  try {
    await setConfigEnabled(config.id, checkbox.checked);
    await notifyRuntimeConfig();
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

async function notifyRuntimeConfig() {
  try {
    await chrome.runtime.sendMessage({ type: "RUNTIME_CONFIG_UPDATED" });
  } catch (error) {
    console.warn("Runtime config notification failed after saving.", error);
  }
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
