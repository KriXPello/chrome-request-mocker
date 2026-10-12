export function createRoutingDetails(rule, { onSelectResponse } = {}) {
  const details = document.createElement("details");
  details.className = "rule-details route-details";
  const summary = document.createElement("summary");
  summary.textContent = `Automatic · ${rule.routes.length} routes`;
  details.append(summary);

  const table = document.createElement("table");
  table.className = "routes-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Conditions", "Response"]) {
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
    if (route.params || route.query) {
      for (const [label, groups] of [["Params", route.params], ["Query", route.query]]) {
        if (!groups) continue;
        const section = document.createElement("div");
        section.className = "route-condition-section";
        const heading = document.createElement("div");
        heading.className = "route-condition-label";
        heading.textContent = label;
        const conditions = document.createElement("div");
        conditions.className = "condition-groups";
        appendConditionGroups(conditions, groups);
        section.append(heading, conditions);
        conditionsCell.append(section);
      }
    } else {
      const fallback = document.createElement("div");
      fallback.className = "route-fallback";
      fallback.textContent = "[fallback]";
      conditionsCell.append(fallback);
    }

    const responseCell = document.createElement("td");
    responseCell.className = "route-response";
    const response = responses.get(route.responseId);
    const responseName = response?.name || route.responseId;
    if (onSelectResponse) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "route-response-button";
      button.textContent = responseName;
      button.title = `View response: ${responseName}`;
      button.addEventListener("click", () => onSelectResponse(route.responseId));
      responseCell.append(button);
    } else {
      responseCell.textContent = responseName;
    }
    routeRow.append(conditionsCell, responseCell);
    body.append(routeRow);
  }
  table.append(body);
  details.append(table);
  return details;
}

export function createQueryDetails(query) {
  const details = document.createElement("details");
  details.className = "rule-details query-details";
  const summary = document.createElement("summary");
  summary.textContent = "Query";
  details.append(summary);
  const groups = document.createElement("div");
  groups.className = "query-groups condition-groups";
  appendConditionGroups(groups, query);
  details.append(groups);
  return details;
}

function appendConditionGroups(container, groups) {
  for (const [index, alternative] of groups.entries()) {
    if (index > 0) {
      const separator = document.createElement("div");
      separator.className = "condition-or";
      separator.textContent = "OR";
      container.append(separator);
    }
    const group = document.createElement("dl");
    group.className = "query-condition-group";
    group.title = "All conditions in this group must match (AND).";
    for (const [name, values] of Object.entries(alternative)) {
      const condition = document.createElement("div");
      condition.className = "query-condition";
      const parameter = document.createElement("dt");
      parameter.className = "condition-name";
      parameter.textContent = name;
      const patterns = document.createElement("dd");
      patterns.className = "condition-values";
      patterns.title = "Any listed value may match.";
      for (const value of values) {
        const pattern = document.createElement("span");
        pattern.className = "condition-value";
        pattern.textContent = displayConditionValue(value);
        patterns.append(pattern);
      }
      condition.append(parameter, patterns);
      group.append(condition);
    }
    container.append(group);
  }
}

function displayConditionValue(value) {
  return value === "" ? '""' : value;
}
