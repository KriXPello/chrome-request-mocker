import { resolveInputDefault } from "../../config/inputs.js";
import { datetimeInputAsRaw } from "../../config/datetime.js";
import { createDatetimeControl, createRelativeDatetimeControl } from "../controls/datetime-control.js";
import { storedInputAsRaw } from "./input-drafts.js";

export function createInputEditor(config, values, draftValues, onChange, onError) {
  const element = document.createElement("div");
  element.className = "input-editor";
  const controls = Object.create(null);
  for (const [id, descriptor] of Object.entries(config.inputs)) {
    const label = document.createElement("label");
    const heading = document.createElement("span");
    heading.className = "input-heading";
    const title = document.createElement("span");
    title.className = "input-title";
    const name = document.createElement("span");
    name.textContent = descriptor.name || id;
    title.append(name);
    if (descriptor.description) {
      const help = document.createElement("button");
      help.type = "button";
      help.className = "input-help";
      help.textContent = "?";
      help.title = descriptor.description;
      help.setAttribute("aria-label", descriptor.description);
      title.append(help);
    }
    heading.append(title);
    const metadata = document.createElement("small");
    metadata.className = "input-meta";
    metadata.textContent = descriptor.type;
    heading.append(metadata);
    label.append(heading);
    const hasDraft = draftValues !== null;
    const value = hasDraft ? draftValues[id] : values[id];
    const control = createInputControl(id, descriptor, value, label, hasDraft, values[id]);
    controls[id] = control;
    if (Object.hasOwn(descriptor, "default")) {
      let defaultText = String(descriptor.default);
      if (descriptor.masked) defaultText = "••••••••";
      metadata.textContent = `${descriptor.type}, default: ${defaultText}`;

      const resetButton = document.createElement("button");
      resetButton.type = "button";
      resetButton.className = "input-reset-default";
      resetButton.title = "Reset to default";
      resetButton.setAttribute("aria-label", `Reset ${descriptor.name || id} to default`);
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "1.8");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M3 11a9 9 0 1 1 2.64 6.36M3 4v7h7");
      icon.append(path);
      resetButton.append(icon);
      resetButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          const defaultValue = resolveInputDefault(descriptor, Date.now());
          control.setRawValue(storedInputAsRaw(descriptor, defaultValue));
          onChange(controls);
        } catch (error) {
          onError(error);
        }
      });
      label.append(resetButton);
    }
    label.addEventListener("input", () => onChange(controls));
    label.addEventListener("change", () => onChange(controls));
    element.append(label);
  }
  return { element, controls };
}

function createInputControl(id, descriptor, value, label, valueIsRaw, savedValue) {
  const name = descriptor.name || id;
  if (descriptor.type === "datetime") {
    label.className = "datetime-input";
    let raw = datetimeInputAsRaw(value);
    if (valueIsRaw) raw = value;
    const control = createDatetimeControl(raw, savedValue, name);
    label.append(control.element);
    return control;
  }
  if (descriptor.type === "relative-datetime") {
    label.className = "datetime-input";
    let raw = storedInputAsRaw(descriptor, value);
    if (valueIsRaw) raw = value;
    const control = createRelativeDatetimeControl(raw, savedValue, name, descriptor.format);
    label.append(control.element);
    return control;
  }
  if (descriptor.type === "boolean") {
    const select = document.createElement("select");
    for (const [optionValue, text] of [["", "Not set"], ["true", "true"], ["false", "false"]]) {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = text;
      select.append(option);
    }
    select.value = "";
    if (valueIsRaw) select.value = value;
    else if (typeof value === "boolean") select.value = String(value);
    label.append(select);
    return {
      element: select,
      getRawValue: () => select.value,
      setRawValue: (raw) => { select.value = raw; },
      getValue() {
        if (select.value === "") return undefined;
        return select.value === "true";
      }
    };
  }

  if (descriptor.type === "number") {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = value ?? "";
    label.append(input);
    return {
      element: input,
      getRawValue: () => input.value,
      setRawValue: (raw) => { input.value = raw; },
      getValue() {
        if (input.validity.badInput) throw new Error(`${name}: enter a valid finite number.`);
        if (input.value === "") return undefined;
        const number = Number(input.value);
        if (!Number.isFinite(number)) throw new Error(`${name}: enter a valid finite number.`);
        return number;
      }
    };
  }
  const input = document.createElement("input");
  input.type = "text";
  input.value = value ?? "";
  if (descriptor.masked) {
    input.type = "password";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "Show";
    toggle.addEventListener("click", () => {
      if (input.type === "password") {
        input.type = "text";
        toggle.textContent = "Hide";
      } else {
        input.type = "password";
        toggle.textContent = "Show";
      }
    });
    label.append(input, toggle);
  } else {
    label.append(input);
  }
  return {
    element: input,
    getRawValue: () => input.value,
    setRawValue: (raw) => { input.value = raw; },
    getValue() {
      if (input.value === "") return undefined;
      return input.value;
    }
  };
}

export function collectRawInputValues(config, controls) {
  const values = Object.create(null);
  for (const id of Object.keys(config.inputs)) {
    values[id] = controls[id].getRawValue();
  }
  return values;
}

export function collectInputValues(config, controls) {
  const values = Object.create(null);
  const now = Date.now();
  for (const id of Object.keys(config.inputs)) {
    const value = controls[id].getValue(now);
    if (value !== undefined) values[id] = value;
  }
  return values;
}
