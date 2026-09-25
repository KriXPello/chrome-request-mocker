import { getDirectoryHandle, getConfigsAndSyncMeta, setConfigEnabled, setRuleEnabled, setRuleResponseId } from "./db.js";
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
  configsElement.querySelectorAll(".config").forEach((configElement) => {
    const oldSnapshot = configElement.querySelector(".snapshot-warning") !== null;
    configElement.querySelectorAll("input, select").forEach((control) => { control.disabled = syncInProgress || oldSnapshot; });
  });
}

function renderConfig(config) {
  const oldSnapshot = (config.formatVersion ?? 0) < 3;
  const wrapper = document.createElement("details");
  wrapper.className = "config";
  wrapper.open = true;
  const summary = document.createElement("summary");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = config.enabled;
  checkbox.disabled = syncInProgress || oldSnapshot;
  checkbox.addEventListener("click", (event) => event.stopPropagation());
  checkbox.addEventListener("change", () => updateConfig(config, checkbox));
  summary.append(checkbox, document.createTextNode(` ${config.name || config.id}`));
  wrapper.append(summary);
  if (oldSnapshot) {
    const warning = document.createElement("div");
    warning.className = "snapshot-warning";
    warning.textContent = "Outdated snapshot — Sync required";
    wrapper.append(warning);
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
