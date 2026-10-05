import { datetimeInputAsRaw, isValidDatetimeInput, isValidRelativeDatetimeInput, relativeDatetimeValue, formatDatetimeInput } from "./datetime.js";

export function createDatetimeControl(raw, savedValue, name) {
  const element = document.createElement("div");
  element.className = "datetime-control";
  const date = document.createElement("input");
  date.type = "datetime-local";
  date.step = "0.001";
  date.value = raw;
  date.title = "Local time";
  date.setAttribute("aria-label", `${name}: date and time (local)`);
  element.append(date);

  const getRawValue = () => {
    const timestamp = new Date(date.value).getTime();
    if (date.value && Number.isFinite(timestamp)) {
      return datetimeInputAsRaw(new Date(timestamp).toISOString());
    }
    return date.value;
  };
  return {
    element,
    getRawValue,
    setRawValue: (raw) => { date.value = raw; },
    getValue() {
      if (date.validity.badInput) throw new Error(`${name}: enter a valid date and time.`);
      if (date.value === "") return undefined;
      if (isValidDatetimeInput(savedValue) && getRawValue() === datetimeInputAsRaw(savedValue)) return savedValue;
      const value = new Date(date.value);
      if (!Number.isFinite(value.getTime())) throw new Error(`${name}: enter a valid date and time.`);
      return value.toISOString();
    }
  };
}

export function createRelativeDatetimeControl(raw, savedValue, name, format) {
  const element = document.createElement("div");
  element.className = "datetime-control";
  const offsetRow = document.createElement("div");
  offsetRow.className = "datetime-offset";
  const offset = document.createElement("input");
  offset.type = "number";
  offset.step = "any";
  offset.value = raw;
  offset.placeholder = "0";
  offset.title = "Offset in seconds: negative for the past, positive for the future";
  offset.setAttribute("aria-label", `${name}: offset in seconds`);
  const unit = document.createElement("span");
  unit.textContent = "s";
  unit.title = "Seconds";
  offsetRow.append(offset, unit);
  element.append(offsetRow);
  if (isValidRelativeDatetimeInput(savedValue)) {
    const resolved = document.createElement("small");
    resolved.className = "datetime-resolved";
    resolved.textContent = `Saved: ${formatDatetimeInput(savedValue.value, format)}`;
    element.append(resolved);
  }

  return {
    element,
    getRawValue: () => offset.value,
    setRawValue: (raw) => { offset.value = raw; },
    getValue(now) {
      if (offset.validity.badInput || offset.value === "" || !Number.isFinite(Number(offset.value))) {
        throw new Error(`${name}: enter a valid offset in seconds.`);
      }
      const offsetSeconds = Number(offset.value);
      let value;
      if (isValidRelativeDatetimeInput(savedValue) && savedValue.offsetSeconds === offsetSeconds) {
        value = savedValue.value;
      } else {
        value = relativeDatetimeValue(offsetSeconds, now);
      }
      return { offsetSeconds, value };
    }
  };
}
