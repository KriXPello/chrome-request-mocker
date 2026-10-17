import { loadRuntimeConfig } from "./runtime-config.js";
import { syncSiteScripts } from "./site-access.js";
import { hasSiteAccess } from "../site-access.js";

let runtimeRevision = 0;
let updateQueue = Promise.resolve();

refreshActionBadge().catch((error) => {
  console.warn("Could not update the Chrome Request Mocker badge.", error);
});

chrome.permissions.onAdded.addListener(updateSiteAccess);
chrome.permissions.onRemoved.addListener(updateSiteAccess);
updateSiteAccess();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let result;
  if (message?.type === "GET_RUNTIME_CONFIG") {
    result = getRuntimeConfig(sender);
  } else if (message?.type === "RUNTIME_CONFIG_UPDATED") {
    result = queueUpdate(broadcastRuntimeConfig);
  } else if (message?.type === "SITE_ACCESS_UPDATED") {
    result = queueUpdate(synchronizeSiteAccess);
  } else {
    return undefined;
  }
  result.then(sendResponse, (error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

function queueUpdate(update) {
  updateQueue = updateQueue.then(update, update);
  return updateQueue;
}

function updateSiteAccess() {
  queueUpdate(synchronizeSiteAccess).catch((error) => {
    console.warn("Could not update site access.", error);
  });
}

async function synchronizeSiteAccess() {
  try {
    await syncSiteScripts();
  } finally {
    await broadcastRuntimeConfig();
  }
  return { ok: true };
}

async function getRuntimeConfig(sender) {
  const denied = { ok: true, config: { rules: [], logging: { mode: "off", includeResponse: false } } };
  if (!await hasSiteAccess(sender)) return denied;
  const payload = await loadRuntimeConfig();
  // Access can be revoked while the saved configuration is being loaded.
  if (!await hasSiteAccess(sender)) return denied;
  return payload;
}

function broadcastRuntimeConfig() {
  runtimeRevision += 1;
  return refreshActionBadge().then(async () => {
    // Each frame requests its own snapshot so unauthorized frames never receive config data.
    const message = { type: "RUNTIME_CONFIG_UPDATE", revision: runtimeRevision };
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({});
    } catch (error) {
      console.warn("Could not enumerate tabs for runtime config update.", error);
      return { ok: false };
    }
    await Promise.allSettled(tabs.filter((tab) => tab.id !== undefined).map((tab) =>
      sendRuntimeUpdate(tab.id, message)));
    return { ok: true };
  });
}

async function refreshActionBadge() {
  const payload = await loadRuntimeConfig();
  const count = payload.ok ? payload.activeConfigCount : 0;
  let text = "";
  if (count > 999) {
    text = "999+";
  } else if (count > 0) {
    text = String(count);
  }
  let title = "Chrome Request Mocker — no active configs";
  if (count === 1) {
    title = "Chrome Request Mocker — 1 active config";
  } else if (count > 1) {
    title = `Chrome Request Mocker — ${count} active configs`;
  }
  try {
    await Promise.all([
      chrome.action.setBadgeText({ text }),
      chrome.action.setBadgeBackgroundColor({ color: "#4f6f8f" }),
      chrome.action.setBadgeTextColor({ color: "#ffffff" }),
      chrome.action.setTitle({ title })
    ]);
  } catch (error) {
    console.warn("Could not update the Chrome Request Mocker badge.", error);
  }
  return payload;
}

async function sendRuntimeUpdate(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // A tab can disappear or reject extension messaging while the update is sent.
  }
}
