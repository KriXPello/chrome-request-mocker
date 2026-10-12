import { getConfigsAndSyncMeta } from "../../storage/db.js";
import { createMethodIndicator } from "../controls/method-indicator.js";
import { createRoutingDetails } from "../controls/rule-details.js";
import { initializeSidebarResize } from "./sidebar-resize.js";

const search = document.querySelector("#search");
const navigation = document.querySelector("#navigation");
const status = document.querySelector("#status");
const reloadButton = document.querySelector("#reload");
const responseView = document.querySelector("#response-view");
const emptyState = document.querySelector("#empty-state");
const responseSelect = document.querySelector("#response-select");
const copyButton = document.querySelector("#copy");
const headersButton = document.querySelector("#toggle-headers");
const responseHeaders = document.querySelector("#response-headers");
const routingDetails = document.querySelector("#routing-details");
const openConfigs = new Set();
let configs = [];
let selection = readSelection();
let current = null;
let editor = null;
let displayedRule = null;

initializeSidebarResize({
  layout: document.querySelector(".viewer-layout"),
  sidebar: document.querySelector("#rule-sidebar"),
  handle: document.querySelector("#sidebar-resize"),
  onResize: () => {
    if (editor) editor.refresh();
  }
});

search.addEventListener("input", renderNavigation);
reloadButton.addEventListener("click", loadSnapshot);
headersButton.addEventListener("click", () => {
  responseHeaders.hidden = !responseHeaders.hidden;
  headersButton.setAttribute("aria-expanded", String(!responseHeaders.hidden));
  editor.refresh();
});
responseSelect.addEventListener("change", () => {
  selectResponse(responseSelect.value);
});
window.addEventListener("hashchange", () => {
  selection = readSelection();
  showSelection();
});
document.querySelector("#fold-all").addEventListener("click", () => {
  editor.operation(() => {
    for (let line = 0; line < editor.lineCount(); line++) editor.foldCode({ line, ch: 0 }, null, "fold");
  });
});
document.querySelector("#unfold-all").addEventListener("click", () => {
  editor.operation(() => {
    for (let line = 0; line < editor.lineCount(); line++) editor.foldCode({ line, ch: 0 }, null, "unfold");
  });
});
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(editor.getValue());
    showStatus("Body copied.");
  } catch (error) {
    showStatus(`Copy failed: ${messageOf(error)}`);
  }
});

loadSnapshot();

async function loadSnapshot() {
  reloadButton.disabled = true;
  try {
    const snapshot = await getConfigsAndSyncMeta();
    configs = snapshot.configs;
    let lastSync = "Never";
    if (snapshot.meta?.lastSyncAt) lastSync = new Date(snapshot.meta.lastSyncAt).toLocaleString();
    document.querySelector("#last-sync").textContent = lastSync;
    status.hidden = true;
    showSelection();
  } catch (error) {
    showStatus(`Could not load snapshot: ${messageOf(error)}`);
    if (!current) emptyState.textContent = "Snapshot unavailable. Try reloading.";
  } finally {
    reloadButton.disabled = false;
  }
}

function readSelection() {
  const params = new URLSearchParams(location.hash.slice(1));
  return { configId: params.get("config"), ruleId: params.get("rule"), responseId: params.get("response") };
}

function resolveSelection() {
  let config = configs.find((item) => item.id === selection.configId);
  let rule = config?.rules.find((item) => item.id === selection.ruleId);
  if (!rule) {
    if (selection.ruleId) showStatus("The requested rule is no longer available. Showing the first available rule.");
    config = configs.find((item) => item.rules.length > 0);
    rule = config?.rules[0];
    selection.responseId = null;
  }
  if (!rule) return null;
  let responses;
  if (Array.isArray(rule.responses)) {
    responses = rule.responses;
  } else {
    responses = [rule.response];
  }
  const response = responses.find((item) => item.id === selection.responseId)
    || responses.find((item) => item.id === rule.selectedResponseId) || responses[0];
  selection = { configId: config.id, ruleId: rule.id, responseId: response.id || null };
  return { config, rule, responses, response };
}

function showSelection(pushHistory = false) {
  const previous = current;
  current = resolveSelection();
  const params = new URLSearchParams();
  if (current) {
    params.set("config", selection.configId);
    params.set("rule", selection.ruleId);
    if (selection.responseId) params.set("response", selection.responseId);
    openConfigs.add(selection.configId);
  }
  const url = `${location.pathname}#${params}`;
  if (pushHistory) {
    history.pushState(null, "", url);
  } else {
    history.replaceState(null, "", url);
  }
  if (!previous || !current || previous.rule !== current.rule) renderNavigation();
  renderResponse();
}

function renderNavigation() {
  const query = search.value.trim().toLowerCase();
  const groups = [];
  for (const config of configs) {
    const configMatches = `${config.name || ""} ${config.id} ${config.sourceFile}`.toLowerCase().includes(query);
    const rules = config.rules.filter((rule) => configMatches
      || `${rule.name || ""} ${rule.id} ${rule.pattern}`.toLowerCase().includes(query));
    if (!rules.length) continue;
    const group = document.createElement("details");
    group.className = "config-group";
    group.open = Boolean(query) || openConfigs.has(config.id);
    group.addEventListener("toggle", () => {
      if (search.value.trim()) return;
      if (group.open) {
        openConfigs.add(config.id);
      } else {
        openConfigs.delete(config.id);
      }
    });
    const summary = document.createElement("summary");
    const label = document.createElement("span");
    label.className = "config-label";
    label.textContent = config.name || config.id;
    summary.append(label);
    if (!config.enabled) summary.append(disabledBadge());
    group.append(summary);
    const list = document.createElement("div");
    list.className = "rule-list";
    for (const rule of rules) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rule-choice";
      button.dataset.configId = config.id;
      button.dataset.ruleId = rule.id;
      if (config.id === selection.configId && rule.id === selection.ruleId) button.setAttribute("aria-current", "true");
      const title = document.createElement("span");
      title.className = "rule-label";
      title.textContent = rule.name || rule.id;
      const description = document.createElement("small");
      description.className = "rule-description";
      description.textContent = rule.pattern;
      button.append(createMethodIndicator(rule.methods), title);
      if (!rule.enabled) button.append(disabledBadge());
      button.append(description);
      button.addEventListener("click", () => {
        selection = { configId: config.id, ruleId: rule.id, responseId: null };
        showSelection(true);
        const selected = navigation.querySelector('[aria-current="true"]');
        selected.focus({ preventScroll: true });
      });
      list.append(button);
    }
    group.append(list);
    groups.push(group);
  }
  navigation.replaceChildren(...groups);
  if (!groups.length) {
    const message = document.createElement("p");
    message.className = "navigation-empty";
    message.textContent = "No rules found.";
    navigation.append(message);
  }
}

function disabledBadge() {
  const badge = document.createElement("span");
  badge.className = "state-badge";
  badge.textContent = "Off";
  return badge;
}

function selectResponse(responseId) {
  if (selection.responseId === responseId) return;
  selection.responseId = responseId;
  showSelection(true);
}

function renderRule(config, rule, responses) {
  document.title = `${rule.name || rule.id} — Response viewer`;
  document.querySelector("#rule-title").textContent = `${config.name || config.id} / ${rule.name || rule.id}`;
  const methodBadges = document.querySelector("#rule-method-badges");
  methodBadges.replaceChildren();
  let methods = ["ALL"];
  if (rule.methods) methods = rule.methods;
  for (const method of methods) {
    const badge = document.createElement("span");
    badge.className = "method-badge";
    badge.dataset.method = method;
    badge.textContent = method;
    methodBadges.append(badge);
  }
  const states = [];
  if (!config.enabled) states.push("Config off");
  if (!rule.enabled) states.push("Rule off");
  if ((config.formatVersion ?? 0) < 3) states.push("Outdated snapshot — Sync required");
  const ruleInfo = document.querySelector("#rule-info");
  ruleInfo.textContent = states.join(" · ");
  ruleInfo.hidden = states.length === 0;
  document.querySelector("#rule-pattern").textContent = rule.pattern;
  document.querySelector("#source").textContent = config.sourceFile;
  document.querySelector("#routing-note").hidden = !rule.routes;
  const sameRoutingRule = routingDetails.dataset.configId === config.id && routingDetails.dataset.ruleId === rule.id;
  let routesOpen = false;
  if (sameRoutingRule && routingDetails.firstElementChild) routesOpen = routingDetails.firstElementChild.open;
  routingDetails.replaceChildren();
  routingDetails.dataset.configId = config.id;
  routingDetails.dataset.ruleId = rule.id;
  if (rule.routes) {
    const details = createRoutingDetails(rule, { onSelectResponse: selectResponse });
    details.open = routesOpen;
    details.addEventListener("toggle", () => {
      if (editor) editor.refresh();
    });
    routingDetails.append(details);
  }
  document.querySelector("#variant-field").hidden = !Array.isArray(rule.responses);
  responseSelect.replaceChildren();
  if (Array.isArray(rule.responses)) {
    for (const item of responses) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name || item.id;
      responseSelect.append(option);
    }
  }
}

function renderResponse() {
  responseView.hidden = !current;
  emptyState.hidden = Boolean(current);
  if (!current) {
    emptyState.textContent = "No rules to view. Import configs using Sync in the popup.";
    return;
  }
  const { config, rule, responses, response } = current;
  if (displayedRule !== rule) {
    renderRule(config, rule, responses);
    displayedRule = rule;
  }
  if (Array.isArray(rule.responses)) responseSelect.value = response.id;
  const responseStatus = document.querySelector("#response-status");
  responseStatus.textContent = `${response.status} ${response.statusText}`.trim();
  responseStatus.dataset.statusClass = String(Math.floor(response.status / 100));
  const delay = response.delay ?? rule.delay ?? 0;
  let delayText;
  if (typeof delay === "number") {
    delayText = `${delay} ms`;
  } else {
    delayText = `${delay.min}–${delay.max} ms (random)`;
  }
  document.querySelector("#response-delay").textContent = delayText;
  responseHeaders.textContent = JSON.stringify(response.headers, null, 2);
  if (!editor) {
    editor = window.CodeMirror(document.querySelector("#editor"), {
      mode: "application/json",
      readOnly: true,
      lineNumbers: true,
      foldGutter: true,
      gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
      viewportMargin: 10
    });
  }
  editor.operation(() => {
    editor.setValue(JSON.stringify(response.body, null, 2));
    editor.clearHistory();
    editor.scrollTo(0, 0);
    editor.refresh();
  });
}

function showStatus(message) {
  status.textContent = message;
  status.hidden = false;
}

function messageOf(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
