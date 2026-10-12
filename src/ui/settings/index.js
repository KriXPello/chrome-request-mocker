import { getDirectoryHandle, saveDirectoryHandle, getConfigsAndSyncMeta, getLoggingSettings, setLoggingSettings } from "../../storage/db.js";
import { syncConfigsFromDirectory } from "../../sync/sync-from-directory.js";
import { notifyRuntimeConfig } from "../runtime-config.js";

const folderLabel = document.querySelector("#folder");
const lastSyncLabel = document.querySelector("#last-sync");
const countsLabel = document.querySelector("#counts");
const statusLabel = document.querySelector("#status");
const chooseButton = document.querySelector("#choose");
const syncButton = document.querySelector("#sync");
const loggingSelect = document.querySelector("#logging-mode");
const loggingResponseCheckbox = document.querySelector("#logging-response");
let directoryHandle = null;
let syncInProgress = false;
let loggingSettings;
let loggingSaveInProgress = false;

chooseButton.addEventListener("click", chooseFolder);
syncButton.addEventListener("click", syncFromFolder);
loggingSelect.addEventListener("change", changeLoggingSettings);
loggingResponseCheckbox.addEventListener("change", changeLoggingSettings);
setButtonState();
await initialize();

async function initialize() {
  try {
    [directoryHandle, loggingSettings] = await Promise.all([getDirectoryHandle(), getLoggingSettings()]);
    loggingSelect.value = loggingSettings.mode;
    loggingResponseCheckbox.checked = loggingSettings.includeResponse;
    renderFolder();
    await renderMeta();
    if (directoryHandle) setStatus("Folder access is required only to sync configs.", "");
  } catch (error) {
    setStatus(messageOf(error), "error");
  } finally {
    setButtonState();
  }
}

async function chooseFolder() {
  if (syncInProgress) {
    return;
  }

  syncInProgress = true;
  setButtonState();
  try {
    const handle = await window.showDirectoryPicker({
      id: "local-mock-configs",
      mode: "read"
    });
    directoryHandle = handle;
    await saveDirectoryHandle(handle);
    renderFolder();
    await performSync();
  } catch (error) {
    if (error?.name !== "AbortError") {
      setStatus(messageOf(error), "error");
    }
  } finally {
    syncInProgress = false;
    setButtonState();
  }
}

async function changeLoggingSettings() {
  if (loggingSaveInProgress || loggingSettings === undefined) return;
  const settings = { mode: loggingSelect.value, includeResponse: loggingResponseCheckbox.checked };
  loggingSaveInProgress = true;
  setButtonState();
  try {
    await setLoggingSettings(settings);
    loggingSettings = settings;
    await notifyRuntimeConfig();
    setStatus("Request logging updated.", "ok");
  } catch (error) {
    loggingSelect.value = loggingSettings.mode;
    loggingResponseCheckbox.checked = loggingSettings.includeResponse;
    setStatus(messageOf(error), "error");
  } finally {
    loggingSaveInProgress = false;
    setButtonState();
  }
}

async function syncFromFolder() {
  if (syncInProgress) {
    return;
  }
  if (!directoryHandle) {
    setStatus("Choose a config folder first.", "error");
    return;
  }

  syncInProgress = true;
  setButtonState();
  try {
    await performSync();
  } finally {
    syncInProgress = false;
    setButtonState();
  }
}

async function performSync() {
  try {
    await syncConfigsFromDirectory(directoryHandle);
    await notifyRuntimeConfig();
    await renderMeta();
    setStatus("Synced successfully.", "ok");
  } catch (error) {
    setStatus(`Sync failed.\n${messageOf(error)}`, "error");
  }
}

async function renderMeta() {
  const { meta, configs } = await getConfigsAndSyncMeta();
  lastSyncLabel.textContent = meta?.lastSyncAt
    ? new Date(meta.lastSyncAt).toLocaleString()
    : "Never";
  countsLabel.textContent = `${configs.length} configs / ${configs.reduce(
    (sum, config) => sum + config.rules.length,
    0
  )} rules`;
}

function renderFolder() {
  folderLabel.textContent = directoryHandle?.name || "No folder selected";
}

function setButtonState() {
  chooseButton.disabled = syncInProgress;
  syncButton.disabled = syncInProgress || !directoryHandle;
  loggingSelect.disabled = loggingSaveInProgress || loggingSettings === undefined;
  loggingResponseCheckbox.disabled = loggingSelect.disabled || loggingSettings.mode === "off";
}

function setStatus(text, kind) {
  statusLabel.textContent = text;
  statusLabel.className = kind || "";
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
