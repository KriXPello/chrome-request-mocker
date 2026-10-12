import { createMethodIndicator } from "../controls/method-indicator.js";
import { createQueryDetails } from "../controls/rule-details.js";

export function createRuleRow(rule, { oldSnapshot, syncInProgress, formatVersion, onToggle, onSelectResponse, onViewResponse }) {
  const row = document.createElement("div");
  row.className = "rule";
  row.append(createMethodIndicator(rule.methods));
  const main = document.createElement("label");
  main.className = "rule-main";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = rule.enabled;
  input.disabled = syncInProgress || oldSnapshot;
  input.addEventListener("change", () => onToggle(input));
  const text = document.createElement("span");
  text.className = "rule-name";
  text.textContent = rule.name || rule.id;
  const pattern = document.createElement("small");
  pattern.className = "rule-pattern";
  pattern.textContent = rule.pattern;
  main.append(input, text);
  row.append(main);
  const actions = document.createElement("span");
  actions.className = "rule-actions";
  if (formatVersion === 3 && Array.isArray(rule.responses) && !rule.routes) {
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
    select.addEventListener("change", () => onSelectResponse(select));
    actions.append(select);
  }
  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "rule-view-button";
  viewButton.title = "View response";
  viewButton.setAttribute("aria-label", `View response for ${rule.name || rule.id}`);
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.7");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M14 3h7v7M21 3l-10 10M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5");
  icon.append(path);
  viewButton.append(icon);
  viewButton.addEventListener("click", () => onViewResponse());
  actions.append(viewButton);
  row.append(actions);
  row.append(pattern);
  if (rule.query) {
    row.append(createQueryDetails(rule.query));
  }
  if (formatVersion === 3 && Array.isArray(rule.responses) && rule.routes) {
    row.append(createRoutedResponseList(rule, onViewResponse));
  }
  return row;
}

function createRoutedResponseList(rule, onViewResponse) {
  const details = document.createElement("details");
  details.className = "rule-details routed-response-details";
  const summary = document.createElement("summary");
  summary.textContent = `Automatic · ${rule.routes.length} routes`;
  details.append(summary);
  const list = document.createElement("ul");
  list.className = "routed-response-list";
  for (const response of rule.responses) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "route-response-button routed-response-button";
    const name = response.name || response.id;
    button.title = `View response: ${name}`;
    button.setAttribute("aria-label", `View response: ${name}`);
    const label = document.createElement("span");
    label.className = "routed-response-label";
    label.textContent = name;
    const indicator = document.createElement("span");
    indicator.className = "routed-response-icon";
    indicator.setAttribute("aria-hidden", "true");
    indicator.textContent = "↗";
    button.append(label, indicator);
    button.addEventListener("click", () => onViewResponse(response.id));
    item.append(button);
    list.append(item);
  }
  details.append(list);
  return details;
}
