import { loadRuntimeConfig } from "./runtime-config.js";

let runtimeRevision = 0;
let updateQueue = Promise.resolve();

refreshActionBadge().catch((error) => {
  console.warn("Could not update the Chrome Request Mocker badge.", error);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "GET_RUNTIME_CONFIG") {
    return refreshActionBadge().then((payload) => ({ ...payload, revision: runtimeRevision }));
  }

  if (message?.type === "RUNTIME_CONFIG_UPDATED") {
    updateQueue = updateQueue.then(broadcastRuntimeConfig, broadcastRuntimeConfig);
    return updateQueue;
  }

  return undefined;
});

function broadcastRuntimeConfig() {
  runtimeRevision += 1;
  return refreshActionBadge().then(async (payload) => {
    const message = { type: "RUNTIME_CONFIG_UPDATE", payload, revision: runtimeRevision };
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
