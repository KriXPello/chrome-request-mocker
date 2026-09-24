import { getDirectoryHandle, saveDirectoryHandle, getConfigsAndSyncMeta } from "./db.js";
import { syncConfigsFromDirectory } from "./config-sync.js";

const folderLabel = document.querySelector("#folder");
const lastSyncLabel = document.querySelector("#last-sync");
const countsLabel = document.querySelector("#counts");
const statusLabel = document.querySelector("#status");
const chooseButton = document.querySelector("#choose");
const syncButton = document.querySelector("#sync");
let directoryHandle = null;
let syncInProgress = false;

chooseButton.addEventListener("click", chooseFolder);
syncButton.addEventListener("click", syncFromFolder);
setButtonState();
await initialize();

async function initialize() {
  try {
    directoryHandle = await getDirectoryHandle();
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
}

function setStatus(text, kind) {
  statusLabel.textContent = text;
  statusLabel.className = kind || "";
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
