import { getDirectoryHandle, saveDirectoryHandle, getConfigsAndSyncMeta, getLoggingMode, setLoggingMode } from "./db.js";
import { syncConfigsFromDirectory } from "./config-sync.js";

const folderLabel = document.querySelector("#folder");
const lastSyncLabel = document.querySelector("#last-sync");
const countsLabel = document.querySelector("#counts");
const statusLabel = document.querySelector("#status");
const chooseButton = document.querySelector("#choose");
const syncButton = document.querySelector("#sync");
const loggingSelect = document.querySelector("#logging-mode");
let directoryHandle = null;
let syncInProgress = false;
let loggingMode;
let loggingSaveInProgress = false;

chooseButton.addEventListener("click", chooseFolder);
syncButton.addEventListener("click", syncFromFolder);
loggingSelect.addEventListener("change", changeLoggingMode);
setButtonState();
await initialize();

async function initialize() {
  try {
    [directoryHandle, loggingMode] = await Promise.all([getDirectoryHandle(), getLoggingMode()]);
    loggingSelect.value = loggingMode;
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

async function changeLoggingMode() {
  if (loggingSaveInProgress || loggingMode === undefined) return;
  const mode = loggingSelect.value;
  loggingSaveInProgress = true;
  setButtonState();
  try {
    await setLoggingMode(mode);
    loggingMode = mode;
    await notifyRuntimeConfig();
    setStatus("Request logging updated.", "ok");
  } catch (error) {
    loggingSelect.value = loggingMode;
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

async function notifyRuntimeConfig() {
  try {
    await chrome.runtime.sendMessage({ type: "RUNTIME_CONFIG_UPDATED" });
  } catch (error) {
    console.warn("Runtime config notification failed after saving.", error);
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
  loggingSelect.disabled = loggingSaveInProgress || loggingMode === undefined;
}

function setStatus(text, kind) {
  statusLabel.textContent = text;
  statusLabel.className = kind || "";
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
