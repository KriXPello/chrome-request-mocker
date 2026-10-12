import { inputReadiness } from "../../config/inputs.js";
import { isValidRelativeDatetimeInput } from "../../config/datetime.js";
import { createInputEditor, collectRawInputValues } from "./input-editor.js";
import { storeInputDraft } from "./input-drafts.js";
import { createRuleRow } from "./rule-row.js";
import { formatDate } from "./format-date.js";

export const COLLAPSED_CONFIG_PREFIX = "collapsed-config:";

export function createConfigCard(config, values = {}, draftValues = null, options) {
  const { syncInProgress, editingConfigId, onCollapseChange, onToggle, onEditInputs,
    onCancelInputs, onSaveInputs, onResetTime, onToggleRule, onSelectResponse, onViewResponse, onError } = options;
  const oldSnapshot = (config.formatVersion ?? 0) < 3;
  const readiness = inputReadiness(config.inputs, values);
  const inputsMissing = readiness.missing > 0;
  const wrapper = document.createElement("details");
  wrapper.className = "config";
  wrapper.dataset.configId = config.id;
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
    onCollapseChange();
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
  checkbox.addEventListener("change", () => onToggle(checkbox));
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
    actions.append(makeEditorAction("Save", () => onSaveInputs(editorControls, inputsMissing), syncInProgress));
    actions.append(makeEditorAction("Cancel", onCancelInputs, syncInProgress));
  } else if (config.inputs && Object.keys(config.inputs).length) {
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
      onEditInputs();
    });
    const hasRelativeTime = Object.entries(config.inputs).some(([id, descriptor]) =>
      descriptor.type === "relative-datetime" && isValidRelativeDatetimeInput(values[id]));
    if (hasRelativeTime) {
      const resetButton = document.createElement("button");
      resetButton.type = "button";
      resetButton.className = "reset-time-button";
      resetButton.title = "Refresh relative time";
      resetButton.setAttribute("aria-label", "Refresh relative time");
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "1.7");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M3 10a9 9 0 1 1 1.4 7M3 5v5h5M12 7v5l3 2");
      icon.append(path);
      resetButton.append(icon);
      resetButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onResetTime();
      });
      actions.append(resetButton);
    }
    actions.append(editButton);
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
        onError(error);
      }
    }, onError);
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
    rules.append(createRuleRow(rule, {
      oldSnapshot,
      syncInProgress,
      formatVersion: config.formatVersion,
      onToggle: (checkbox) => onToggleRule(rule, checkbox),
      onSelectResponse: (select) => onSelectResponse(rule, select),
      onViewResponse: (responseId) => onViewResponse(rule, responseId)
    }));
  }
  wrapper.append(rules);
  return wrapper;
}

function makeEditorAction(text, action, syncInProgress) {
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
