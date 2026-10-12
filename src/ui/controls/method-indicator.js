export function createMethodIndicator(methods) {
  const indicator = document.createElement("span");
  indicator.className = "rule-methods";
  let indicatedMethods = [""];
  let tooltip = "All methods";
  if (methods) {
    indicatedMethods = methods;
    tooltip = `Methods: ${methods.join(", ")}`;
  }
  indicator.title = tooltip;
  indicator.setAttribute("role", "img");
  indicator.setAttribute("aria-label", tooltip);
  for (const method of indicatedMethods) {
    const segment = document.createElement("span");
    segment.className = "rule-method-segment";
    segment.dataset.method = method;
    indicator.append(segment);
  }
  return indicator;
}
